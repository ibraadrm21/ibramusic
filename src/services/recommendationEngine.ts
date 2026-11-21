import type { Track } from "./musicApi";
import { searchTracks, getArtistTracks, fetchDeezerApi, getRelatedTracks, getArtistsFromTrack } from "./musicApi";

import { normalizeSearch, trackTitleArtistKey } from "./catalog";

// Dynamic similar artists cache (in-memory)
const similarArtistsCache = new Map<string, string[]>();

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
    const searchData = await fetchDeezerApi(searchUrl);
    const artists = searchData.data || [];
    if (artists.length === 0) {
      throw new Error(`Artist "${artistName}" not found on Deezer`);
    }

    const artistId = artists[0].id;
    
    // Step 2: Fetch related/similar artists
    const relatedUrl = `https://api.deezer.com/artist/${artistId}/related`;
    const relatedData = await fetchDeezerApi(relatedUrl);
    const relatedList = relatedData?.data || [];
    
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

export async function getHomeRecommendations(recent: Track[], excluded: ReadonlySet<string>): Promise<Track[]> {
  const history = recent.slice(0, 50);
  const seen = new Set([...excluded, ...history.map(trackTitleArtistKey)]);
  const leadArtist = (track: Track) => track.artists?.[0]?.name || getArtistsFromTrack(track)[0].name;
  const artists = new Map<string, { name: string; weight: number; track: Track }>();
  history.forEach((track, index) => {
    const name = leadArtist(track);
    const key = normalizeSearch(name);
    if (!track.artist) return;
    const previous = artists.get(key);
    const weight = 1 + (50 - index) / 50;
    artists.set(key, previous ? { ...previous, weight: previous.weight + weight } : { name, weight, track });
  });
  const seeds = [...artists.values()].sort((a, b) => b.weight - a.weight).slice(0, 6);
  const songSeeds = new Map<string, Track>();
  for (const track of [...history.slice(0, 2), ...seeds.map(seed => seed.track), ...history]) {
    songSeeds.set(trackTitleArtistKey(track), track);
    if (songSeeds.size === 4) break;
  }
  const relatedPools = Promise.all([...songSeeds.values()].map(track => getRelatedTracks(track).catch(() => [])));
  const artistPools = Promise.all(seeds.map(async seed => {
    const [original, similar] = await Promise.all([
      searchTracks(seed.name).catch(() => []),
      getSimilarArtistsDynamic(seed.name).catch(() => []),
    ]);
    const nearby = similar.find(name => !artists.has(normalizeSearch(name)))
      ?? RELATED_ARTISTS_BY_GENRE[normalizeSearch(seed.name)]?.artists.find(name => !artists.has(normalizeSearch(name)));
    const related = nearby ? await searchTracks(nearby).catch(() => []) : [];
    const matches = (tracks: Track[], name: string) => tracks.filter(track =>
      normalizeSearch(leadArtist(track)) === normalizeSearch(name));
    return [matches(original, seed.name), nearby ? matches(related, nearby) : []];
  }));
  const [songResults, artistResults] = await Promise.all([relatedPools, artistPools]);
  const pools = [...songResults, ...artistResults.flat()];
  if (history.length === 0) pools.push(await fetchFallbackPool());

  const recommendations: Track[] = [];
  const artistCounts = new Map<string, number>();
  const candidates = pools.map(pool => pool.filter(track => track.id && track.title && track.artist && !seen.has(trackTitleArtistKey(track))));
  const rounds = Math.max(0, ...candidates.map(pool => pool.length));
  for (let index = 0; index < rounds && recommendations.length < 36; index++) {
    for (const pool of candidates) {
      const track = pool[index];
      if (!track) continue;
      const key = trackTitleArtistKey(track);
      const artist = normalizeSearch(leadArtist(track));
      const count = artistCounts.get(artist) ?? 0;
      if (seen.has(key) || count >= 6) continue;
      seen.add(key);
      artistCounts.set(artist, count + 1);
      recommendations.push(track);
      if (recommendations.length === 36) break;
    }
  }
  return recommendations;
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
