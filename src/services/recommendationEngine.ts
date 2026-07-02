import type { Track } from "./musicApi";
import { searchTracks, getArtistTracks } from "./musicApi";
import { Capacitor, CapacitorHttp } from "@capacitor/core";

// Dynamic similar artists cache (in-memory)
const similarArtistsCache = new Map<string, string[]>();

/**
 * Generic fetch with support for CapacitorHttp (native) and CORS proxy fallbacks (web browser).
 */
async function fetchDeezer(url: string): Promise<any> {
  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({ url });
      if (response.status === 200) {
        return typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      }
    } catch (e) {
      console.warn("CapacitorHttp failed for Deezer API:", e);
    }
  }

  // Try direct fetch first (works if Deezer has permissive CORS or on local builds/extensions)
  try {
    const res = await fetch(url);
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Direct fetch failed for Deezer, trying CORS proxies...", e);
  }

  // CORS Proxy fallbacks for web browsers
  const proxies = [
    (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`
  ];

  for (const getProxyUrl of proxies) {
    try {
      const proxyUrl = getProxyUrl(url);
      const res = await fetch(proxyUrl);
      if (res.ok) {
        if (proxyUrl.includes("allorigins")) {
          const json = await res.json();
          if (json && json.contents) {
            return JSON.parse(json.contents);
          }
        } else {
          return await res.json();
        }
      }
    } catch (e) {
      console.warn(`Proxy fetch failed for Deezer URL: ${url}`, e);
    }
  }

  throw new Error(`Failed to fetch Deezer API: ${url}`);
}

/**
 * Dynamically queries the Deezer API to find similar artists for a given artist name.
 * Uses localStorage and memory cache to prevent rate-limiting and redundant API calls.
 */
export async function getSimilarArtistsDynamic(artistName: string): Promise<string[]> {
  if (!artistName) return [];
  const cleanName = artistName.trim().toLowerCase();

  // 1. Check memory cache
  if (similarArtistsCache.has(cleanName)) {
    return similarArtistsCache.get(cleanName)!;
  }

  // 2. Check localStorage cache
  const localCacheKey = `ibrastream_similar_artists_${cleanName}`;
  try {
    const saved = localStorage.getItem(localCacheKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        similarArtistsCache.set(cleanName, parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to read similar artists cache from localStorage", e);
  }

  try {
    console.log(`[Recommender] Querying Deezer for similar artists of: ${artistName}`);
    
    // Step 1: Search for artist ID
    const searchUrl = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}`;
    const searchData = await fetchDeezer(searchUrl);
    const artists = searchData.data || [];
    if (artists.length === 0) {
      throw new Error(`Artist "${artistName}" not found on Deezer`);
    }

    const artistId = artists[0].id;
    
    // Step 2: Fetch related/similar artists
    const relatedUrl = `https://api.deezer.com/artist/${artistId}/related`;
    const relatedData = await fetchDeezer(relatedUrl);
    const relatedList = relatedData.data || [];
    
    const similarNames = relatedList.map((art: any) => art.name as string).filter(Boolean);
    
    if (similarNames.length > 0) {
      // Save in caches
      similarArtistsCache.set(cleanName, similarNames);
      try {
        localStorage.setItem(localCacheKey, JSON.stringify(similarNames));
      } catch (e) {
        console.warn("Failed to save similar artists to localStorage", e);
      }
      return similarNames;
    }
  } catch (err) {
    console.warn(`[Recommender] Failed dynamic similar artists lookup for "${artistName}":`, err);
  }

  return [];
}


// Expanded popular seeds representing diverse genres (Pop, Rock, Hip-hop, Reggaeton/Latino, Electronic)
const POPULAR_SEEDS = [
  "Bad Bunny", "Feid", "Kendrick Lamar", "Travis Scott", "Drake", "Kanye West",
  "The Weeknd", "Taylor Swift", "Daft Punk", "Billie Eilish", "Dua Lipa", 
  "Olivia Rodrigo", "Coldplay", "Arctic Monkeys", "Tame Impala", "Radiohead",
  "Rosalia", "Myke Towers", "Karol G", "Bizarrap", "Quevedo"
];

// Rich genre mapping for looking up related music
const RELATED_ARTISTS_BY_GENRE: Record<string, { genre: string; artists: string[] }> = {
  "bad bunny": { genre: "reggaeton / trap", artists: ["feid", "rauw alejandro", "myke towers", "karol g", "j balvin", "anuel aa"] },
  "feid": { genre: "reggaeton", artists: ["bad bunny", "rauw alejandro", "mora", "quevedo", "ryan castro"] },
  "rosalia": { genre: "flamenco pop / urban", artists: ["c. tangana", "rauw alejandro", "nathy peluso", "tokischa"] },
  "bizarrap": { genre: "latino / trap", artists: ["duki", "quevedo", "tiago pzk", "lit killah", "trueno", "milo j"] },
  "quevedo": { genre: "latino / reggaeton", artists: ["myke towers", "feid", "saiko", "mora", "bizarrap"] },
  "kendrick lamar": { genre: "conscious hip-hop", artists: ["j. cole", "baby keem", "kanye west", "tyler, the creator", "asap rocky"] },
  "travis scott": { genre: "trap", artists: ["don toliver", "playboi carti", "metro boomin", "lil uzi vert", "future"] },
  "drake": { genre: "hip-hop / pop", artists: ["future", "lil baby", "gunna", "travis scott", "21 savage"] },
  "the weeknd": { genre: "r&b / synthpop", artists: ["drake", "post malone", "frank ocean", "khalid", "travis scott", "sza"] },
  "taylor swift": { genre: "pop / country", artists: ["olivia rodrigo", "sabrina carpenter", "gracie abrams", "selena gomez", "lana del rey"] },
  "daft punk": { genre: "electronic", artists: ["justice", "disclosure", "chemical brothers", "deadmau5", "calvin harris", "gesaffelstein"] },
  "billie eilish": { genre: "indie pop", artists: ["lorde", "lana del rey", "clairo", "phoebe bridgers", "finneas", "girl in red"] },
  "dua lipa": { genre: "dance pop", artists: ["bebe rexha", "rita ora", "miley cyrus", "kylie minogue", "charli xcx"] },
  "olivia rodrigo": { genre: "pop rock / pop", artists: ["conan gray", "sabrina carpenter", "billie eilish", "tate mcrae"] },
  "coldplay": { genre: "alternative rock", artists: ["onerepublic", "imagine dragons", "keane", "the fray", "muse", "u2"] },
  "arctic monkeys": { genre: "indie rock", artists: ["the strokes", "franz ferdinand", "tame impala", "the neighbourhood", "cage the elephant"] },
  "tame impala": { genre: "psychedelic rock / indie", artists: ["mgmt", "foster the people", "unknown mortal orchestra", "pond", "beach house"] }
};

// Internal cache to minimize API calls
let fallbackCache: Track[] = [];

/**
 * Helper to fetch a randomized set of popular fallback tracks.
 */
async function fetchFallbackPool(): Promise<Track[]> {
  if (fallbackCache.length > 0) {
    return fallbackCache;
  }

  try {
    // Select 3 random popular seeds to search in parallel
    const shuffled = [...POPULAR_SEEDS].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    const results = await Promise.all(
      selected.map(artist => searchTracks(artist).catch(() => []))
    );

    const flat = results.flat();
    if (flat.length > 0) {
      fallbackCache = flat;
      return fallbackCache;
    }
  } catch (err) {
    console.error("Failed to load fallback pool:", err);
  }
  return [];
}

/**
 * Computes general recommendations for the Home dashboard.
 * Profiles user favorites, recently played tracks, and current playing track
 * to determine top genres, then pulls recommendations from those genres.
 */
export async function getHomeRecommendations(favorites: Track[], recentlyPlayed: Track[], currentTrack?: Track | null): Promise<Track[]> {
  const allUserHistory = [...favorites, ...recentlyPlayed];
  if (currentTrack) allUserHistory.push(currentTrack);

  // If the user has absolutely no activity/favorites yet, populate with fallback seeds
  if (allUserHistory.length === 0) {
    const fallbackPool = await fetchFallbackPool();
    return [...fallbackPool].sort(() => 0.5 - Math.random()).slice(0, 12);
  }

  try {
    // 1. Profile user tastes by count of artists and genres
    const artistWeights: Record<string, { count: number; id?: string }> = {};
    const genreCounts: Record<string, number> = {};

    favorites.forEach(track => {
      if (!track || !track.artist) return;
      const art = track.artist.toLowerCase();
      artistWeights[art] = { count: (artistWeights[art]?.count || 0) + 3, id: track.artistId }; // High weight for favorites

      // Lookup genre if mapped
      const match = RELATED_ARTISTS_BY_GENRE[art];
      if (match) {
        genreCounts[match.genre] = (genreCounts[match.genre] || 0) + 3;
      }
    });

    recentlyPlayed.forEach(track => {
      if (!track || !track.artist) return;
      const art = track.artist.toLowerCase();
      artistWeights[art] = { count: (artistWeights[art]?.count || 0) + 1, id: track.artistId };

      const match = RELATED_ARTISTS_BY_GENRE[art];
      if (match) {
        genreCounts[match.genre] = (genreCounts[match.genre] || 0) + 1;
      }
    });

    if (currentTrack && currentTrack.artist) {
      const art = currentTrack.artist.toLowerCase();
      artistWeights[art] = { count: (artistWeights[art]?.count || 0) + 4, id: currentTrack.artistId }; // Current track has highest immediate relevance

      const match = RELATED_ARTISTS_BY_GENRE[art];
      if (match) {
        genreCounts[match.genre] = (genreCounts[match.genre] || 0) + 4;
      }
    }

    // Sort to find top user genres
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre);

    // Identify top artists
    const topArtists = Object.entries(artistWeights)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name, info]) => ({ name, id: info.id }));

    // 2. Build recommendations from top genres, top artists, and dynamic similar artists
    const searchQueries: string[] = [];

    // Fetch dynamic similar artists for top artists in parallel
    const dynamicSimilarPools = await Promise.all(
      topArtists.map(art => getSimilarArtistsDynamic(art.name).catch(() => []))
    );

    // Add dynamic similar artists (up to 2 per top artist)
    dynamicSimilarPools.forEach(similarList => {
      if (similarList && similarList.length > 0) {
        const shuffled = [...similarList].sort(() => 0.5 - Math.random());
        shuffled.slice(0, 2).forEach(artist => {
          if (!searchQueries.includes(artist)) {
            searchQueries.push(artist);
          }
        });
      }
    });

    // Add related artists based on top genres
    topGenres.slice(0, 2).forEach(genre => {
      const entry = Object.values(RELATED_ARTISTS_BY_GENRE).find(e => e.genre === genre);
      if (entry) {
        const randomArtist = entry.artists[Math.floor(Math.random() * entry.artists.length)];
        if (!searchQueries.includes(randomArtist)) {
          searchQueries.push(randomArtist);
        }
      }
    });

    // Add top artists
    topArtists.forEach(art => {
      if (!searchQueries.includes(art.name)) {
        searchQueries.push(art.name);
      }
    });

    // Add a couple of popular seeds if the search query list is still small
    while (searchQueries.length < 4) {
      const randomSeed = POPULAR_SEEDS[Math.floor(Math.random() * POPULAR_SEEDS.length)];
      if (!searchQueries.includes(randomSeed)) {
        searchQueries.push(randomSeed);
      }
    }

    // Fetch tracks for all determined queries in parallel
    const pools = await Promise.all(
      searchQueries.map(query => searchTracks(query).catch(() => []))
    );

    const candidates = pools.flat();
    const seenIds = new Set<string>();
    const scoredCandidates: { track: Track; score: number }[] = [];

    const historyIds = new Set(allUserHistory.filter(h => h && h.id).map(h => h.id));

    candidates.forEach(track => {
      if (!track || !track.id || !track.artist) return;
      if (historyIds.has(track.id) || seenIds.has(track.id)) return;
      seenIds.add(track.id);

      let score = 0;
      const trackArtist = track.artist.toLowerCase();

      // Weight 1: Exact favorite/recent artist match
      if (artistWeights[trackArtist]) {
        score += artistWeights[trackArtist].count * 10;
      }

      // Weight 2: Dynamic similar artist match
      const isSimilarToTop = dynamicSimilarPools.some(pool => 
        pool.some(name => name.toLowerCase() === trackArtist)
      );
      if (isSimilarToTop) {
        score += 15;
      }

      // Weight 2: Genre match
      const artistGenreMatch = RELATED_ARTISTS_BY_GENRE[trackArtist];
      if (artistGenreMatch && topGenres.includes(artistGenreMatch.genre)) {
        const index = topGenres.indexOf(artistGenreMatch.genre);
        score += (3 - Math.min(index, 2)) * 12; // Higher score if matching top 1 or top 2 genre
      }

      // Weight 3: Serendipity factor
      score += Math.random() * 8;

      scoredCandidates.push({ track, score });
    });

    const sorted = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .map(item => item.track);

    if (sorted.length < 6) {
      const fallback = await fetchFallbackPool();
      return [...sorted, ...fallback.filter(s => s && s.id && !historyIds.has(s.id))].slice(0, 12);
    }

    return sorted.slice(0, 12);
  } catch (err) {
    console.error("Home recommendation calculation failed:", err);
    const fallback = await fetchFallbackPool();
    return fallback.slice(0, 12);
  }
}

/**
 * Fetch a completely separate pool of tracks for the "Trending Hits" section.
 */
export async function getTrendingRecommendations(favorites: Track[], recentlyPlayed: Track[]): Promise<Track[]> {
  try {
    const fallback = await fetchFallbackPool();
    const historyIds = new Set([...favorites, ...recentlyPlayed].map(h => h.id));
    
    // Mix in popular seeds and shuffle
    const candidates = fallback.filter(track => !historyIds.has(track.id));
    
    // If pool is too small, fetch additional trending artists
    if (candidates.length < 8) {
      const trendingArtist = "Bad Bunny";
      const trendingTracks = await searchTracks(trendingArtist).catch(() => []);
      return [...candidates, ...trendingTracks.filter(t => !historyIds.has(t.id))].slice(0, 8);
    }

    return [...candidates].sort(() => 0.5 - Math.random()).slice(0, 8);
  } catch (err) {
    console.error("Failed to generate trending recommendations:", err);
    return [];
  }
}

/**
 * Computes recommendations related specifically to the user's active search query.
 */
export async function getSearchRecommendations(query: string, searchResults: Track[]): Promise<Track[]> {
  if (!query.trim() || searchResults.length === 0) {
    return [];
  }

  try {
    const firstResult = searchResults[0];
    const poolPromises: Promise<Track[]>[] = [];

    if (firstResult.artistId) {
      poolPromises.push(getArtistTracks(firstResult.artistId).catch(() => []));
    } else {
      poolPromises.push(searchTracks(firstResult.artist).catch(() => []));
    }

    const searchArtistName = firstResult.artist;
    const dynamicSimilar = await getSimilarArtistsDynamic(searchArtistName).catch(() => []);
    
    if (dynamicSimilar.length > 0) {
      const shuffled = [...dynamicSimilar].sort(() => 0.5 - Math.random());
      shuffled.slice(0, 2).forEach(artist => {
        poolPromises.push(searchTracks(artist).catch(() => []));
      });
    } else {
      const match = RELATED_ARTISTS_BY_GENRE[searchArtistName.toLowerCase()];
      if (match) {
        const shuffled = [...match.artists].sort(() => 0.5 - Math.random());
        shuffled.slice(0, 2).forEach(artist => {
          poolPromises.push(searchTracks(artist).catch(() => []));
        });
      } else {
        poolPromises.push(searchTracks(`${firstResult.artist} popular`).catch(() => []));
      }
    }

    const pools = await Promise.all(poolPromises);
    const candidates = pools.flat();

    const searchResultIds = new Set(searchResults.map(r => r.id));
    const seenIds = new Set<string>();
    const recommendations: Track[] = [];

    candidates.forEach(track => {
      if (searchResultIds.has(track.id) || seenIds.has(track.id) || track.artist.toLowerCase() === searchArtistName.toLowerCase()) {
        return;
      }
      seenIds.add(track.id);
      recommendations.push(track);
    });

    return recommendations.sort(() => 0.5 - Math.random()).slice(0, 6);
  } catch (e) {
    console.error("Failed to fetch search recommendations", e);
    return [];
  }
}
