import type { Track } from "./musicApi";
import { searchTracks, getArtistTracks } from "./musicApi";

// Cache for seed tracks to avoid repeated API requests on every render
let fallbackSeedCache: Track[] = [];

// Seed keywords for diverse popular music
const POPULAR_SEEDS = ["The Weeknd", "Taylor Swift", "Daft Punk", "Billie Eilish", "Bruno Mars", "Coldplay"];

// Spotify-style genre mapping for cross-artist recommendations
const RELATED_ARTISTS_BY_GENRE: Record<string, { genre: string; artists: string[] }> = {
  "paulo londra": { genre: "latino / trap", artists: ["bizarrap", "duki", "tiago pzk", "quevedo", "lit killah", "trueno"] },
  "simple plan": { genre: "pop punk", artists: ["blink-182", "good charlotte", "sum 41", "all time low", "green day"] },
  "coldplay": { genre: "alternative rock", artists: ["onerepublic", "imagine dragons", "keane", "the fray", "muse"] },
  "the weeknd": { genre: "r&b / synthpop", artists: ["drake", "post malone", "frank ocean", "khalid", "travis scott"] },
  "taylor swift": { genre: "pop", artists: ["olivia rodrigo", "selena gomez", "sabrina carpenter", "ariana grande", "ed sheeran"] },
  "daft punk": { genre: "electronic", artists: ["justice", "disclosure", "chemical brothers", "deadmau5", "calvin harris"] },
  "billie eilish": { genre: "indie pop", artists: ["lorde", "lana del rey", "clairo", "phoebe bridgers", "finneas"] },
  "bruno mars": { genre: "funk / pop", artists: ["anderson .paak", "mark ronson", "justin timberlake", "the weeknd"] },
  "nemzzz": { genre: "uk drill / rap", artists: ["central cee", "dave", "knucks", "aitch", "russ millions"] },
  "britney spears": { genre: "dance pop", artists: ["christina aguilera", "madonna", "lady gaga", "kylie minogue"] },
};

/**
 * Fetches default popular tracks to use when the user has no favorites yet.
 */
async function getFallbackSeeds(): Promise<Track[]> {
  if (fallbackSeedCache.length > 0) {
    return fallbackSeedCache;
  }

  try {
    // Pick 2 random seeds to search in parallel to keep loading fast
    const shuffledSeeds = [...POPULAR_SEEDS].sort(() => 0.5 - Math.random());
    const selectedSeeds = shuffledSeeds.slice(0, 2);

    const results = await Promise.all(
      selectedSeeds.map(seed => searchTracks(seed).catch(() => []))
    );

    const merged = results.flat();
    if (merged.length > 0) {
      fallbackSeedCache = merged;
      return fallbackSeedCache;
    }
  } catch (e) {
    console.error("Failed to fetch fallback seeds", e);
  }

  return [];
}

/**
 * Computes personalized recommendations for the main page.
 * Incorporates favorite artists, currently playing track, and related artists of similar genres.
 */
export async function getHomeRecommendations(favorites: Track[], currentTrack?: Track | null): Promise<Track[]> {
  if (favorites.length === 0 && !currentTrack) {
    const seeds = await getFallbackSeeds();
    // Return a shuffled selection of popular tracks
    return [...seeds].sort(() => 0.5 - Math.random()).slice(0, 10);
  }

  try {
    // 1. Profile user tastes: count favorite artists
    const artistCounts: Record<string, { count: number; id?: string }> = {};
    favorites.forEach(track => {
      const name = track.artist;
      if (!artistCounts[name]) {
        artistCounts[name] = { count: 0, id: track.artistId };
      }
      artistCounts[name].count += 1;
    });

    // If there's a currently playing track, give its artist additional weight to drive real-time context
    if (currentTrack) {
      const name = currentTrack.artist;
      if (!artistCounts[name]) {
        artistCounts[name] = { count: 0, id: currentTrack.artistId };
      }
      artistCounts[name].count += 2; // Artificial boost for real-time relevance
    }

    // Sort artists by frequency
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3); // Top 3 artists

    // 2. Expand seed pool with related artists of the same genre
    const relatedArtistSeeds: string[] = [];
    topArtists.forEach(([name]) => {
      const match = RELATED_ARTISTS_BY_GENRE[name.toLowerCase()];
      if (match) {
        // Take 2 random related artists from the same genre
        const shuffled = [...match.artists].sort(() => 0.5 - Math.random());
        relatedArtistSeeds.push(...shuffled.slice(0, 2));
      }
    });

    const recommendationPoolPromises: Promise<Track[]>[] = [];

    // Fetch tracks for top artists
    topArtists.forEach(([name, info]) => {
      if (info.id) {
        recommendationPoolPromises.push(getArtistTracks(info.id).catch(() => []));
      } else {
        recommendationPoolPromises.push(searchTracks(name).catch(() => []));
      }
    });

    // Fetch tracks for related artists (same genre)
    relatedArtistSeeds.forEach(name => {
      recommendationPoolPromises.push(searchTracks(name).catch(() => []));
    });

    // Also search the currently playing track title or a random favorited track name
    const seedTrack = currentTrack || favorites[Math.floor(Math.random() * favorites.length)];
    if (seedTrack) {
      recommendationPoolPromises.push(searchTracks(seedTrack.title).catch(() => []));
    }

    const pools = await Promise.all(recommendationPoolPromises);
    const candidateTracks = pools.flat();

    // 3. Score candidates
    const favoriteIds = new Set(favorites.map(f => f.id));
    const scoredCandidates: { track: Track; score: number }[] = [];
    const seenIds = new Set<string>();

    candidateTracks.forEach(track => {
      // Exclude already favorited songs, the currently playing song, and duplicates
      if (favoriteIds.has(track.id) || (currentTrack && track.id === currentTrack.id) || seenIds.has(track.id)) {
        return;
      }
      seenIds.add(track.id);

      let score = 0;

      // Score based on artist match
      if (artistCounts[track.artist]) {
        score += artistCounts[track.artist].count * 15; // Higher preference for top/current artists
      }

      // Score based on related artist match (same genre)
      const lowercaseArtist = track.artist.toLowerCase();
      const hasRelatedArtistMatch = topArtists.some(([name]) => {
        const match = RELATED_ARTISTS_BY_GENRE[name.toLowerCase()];
        return match && match.artists.some(r => r.toLowerCase() === lowercaseArtist);
      });
      if (hasRelatedArtistMatch) {
        score += 12; // Cross-artist genre match
      }

      // Score based on album matching
      const hasMatchingAlbum = favorites.some(f => f.albumName && f.albumName === track.albumName) || 
                               (currentTrack && currentTrack.albumName === track.albumName);
      if (hasMatchingAlbum) {
        score += 8;
      }

      // Add a slight serendipity factor (random weight)
      score += Math.random() * 10;

      // Add plays weight if available
      if (track.plays) {
        const numPlays = parseFloat(track.plays);
        if (!isNaN(numPlays)) {
          score += numPlays / 50;
        }
      }

      scoredCandidates.push({ track, score });
    });

    // Sort by score and return top 12
    const sorted = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .map(item => item.track);

    if (sorted.length < 5) {
      // Add some fallback seeds if pool is too small
      const seeds = await getFallbackSeeds();
      const extra = seeds.filter(s => !favoriteIds.has(s.id) && (!currentTrack || s.id !== currentTrack.id) && !seenIds.has(s.id));
      return [...sorted, ...extra].slice(0, 10);
    }

    return sorted.slice(0, 12);
  } catch (e) {
    console.error("Failed to generate personalized recommendations", e);
    const seeds = await getFallbackSeeds();
    return seeds.slice(0, 10);
  }
}

/**
 * Computes recommendations related specifically to the user's active search query.
 * Recommends related artists of the same genre.
 */
export async function getSearchRecommendations(query: string, searchResults: Track[]): Promise<Track[]> {
  if (!query.trim() || searchResults.length === 0) {
    return [];
  }

  try {
    const firstResult = searchResults[0];
    const poolPromises: Promise<Track[]>[] = [];

    // Seed 1: Fetch tracks from the primary artist in search results
    if (firstResult.artistId) {
      poolPromises.push(getArtistTracks(firstResult.artistId).catch(() => []));
    } else {
      poolPromises.push(searchTracks(firstResult.artist).catch(() => []));
    }

    // Seed 2: Search for related artists in same genre if mapped, otherwise default popular
    const searchArtistName = firstResult.artist.toLowerCase();
    const match = RELATED_ARTISTS_BY_GENRE[searchArtistName];
    if (match) {
      // Pick 2 random related artists of same genre
      const shuffled = [...match.artists].sort(() => 0.5 - Math.random());
      shuffled.slice(0, 2).forEach(artist => {
        poolPromises.push(searchTracks(artist).catch(() => []));
      });
    } else {
      poolPromises.push(searchTracks(`${firstResult.artist} popular`).catch(() => []));
    }

    const pools = await Promise.all(poolPromises);
    const candidates = pools.flat();

    const searchResultIds = new Set(searchResults.map(r => r.id));
    const seenIds = new Set<string>();
    const recommendations: Track[] = [];

    candidates.forEach(track => {
      // Exclude tracks already present in search results, the artist itself, and duplicates
      if (searchResultIds.has(track.id) || seenIds.has(track.id) || track.artist.toLowerCase() === searchArtistName) {
        return;
      }
      seenIds.add(track.id);
      recommendations.push(track);
    });

    // Shuffle and pick top 6 related recommendations
    return recommendations.sort(() => 0.5 - Math.random()).slice(0, 6);
  } catch (e) {
    console.error("Failed to fetch search recommendations", e);
    return [];
  }
}
