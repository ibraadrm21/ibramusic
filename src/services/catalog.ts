import type { Track } from "./musicApi";

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function trackTitleArtistKey(track: Pick<Track, "title" | "artist">): string {
  const title = normalizeSearch(track.title).replace(/\s+/g, " ");
  const artist = normalizeSearch(track.artist).replace(/\s+/g, " ").replace(/\s*,\s*/g, ",");
  return JSON.stringify([title, artist]);
}

export function rankTracks(tracks: Track[], query: string): Track[] {
  const normalized = normalizeSearch(query);
  const tokens = normalized.split(/\s+/);
  const score = (track: Track) => {
    const title = normalizeSearch(track.title);
    const artist = normalizeSearch(track.artist);
    const combined = title + " " + artist;
    if (combined === normalized || artist + " " + title === normalized) return 5;
    if (title === normalized) return 4;
    if (artist === normalized) return 3;
    return tokens.every(term => combined.includes(term)) ? 2 : 0;
  };

  const seenIds = new Set<string>();
  const recordings = new Map<string, number[]>();
  return [...tracks].sort((a, b) => score(b) - score(a)).filter(track => {
    if (seenIds.has(track.id)) return false;
    seenIds.add(track.id);
    if (!track.duration || track.id.startsWith("local-")) return true;
    const key = JSON.stringify([normalizeSearch(track.title), normalizeSearch(track.artist), track.isExplicit]);
    const lengths = recordings.get(key) ?? [];
    if (lengths.some(length => Math.abs(length - track.duration) <= 2)) return false;
    recordings.set(key, [...lengths, track.duration]);
    return true;
  });
}

const tracks: [string, string, string, number][] = [
  ["FGBhQbmPwH8", "One More Time", "Daft Punk", 320],
  ["HyHNuVaZJ-k", "Feel Good Inc.", "Gorillaz", 222],
  ["djV11Xbc914", "Take On Me", "a-ha", 225],
  ["4NRXx6U8ABQ", "Blinding Lights", "The Weeknd", 200],
];

export const starterTracks: Track[] = tracks.map(([id, title, artist, duration]) => ({
  id: "yt-" + id,
  title,
  artist,
  duration,
  thumbnail: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg",
  youtubeUrl: "https://www.youtube.com/watch?v=" + id,
  audioUrl: "",
}));
