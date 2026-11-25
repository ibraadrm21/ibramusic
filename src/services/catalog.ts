import type { Album, Artist, Track } from "./musicApi";

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

export function artistMatches(name: string, _id: string | undefined, artist: Artist) {
  return Boolean(name.trim() && artist.name.trim()) && normalizeSearch(name) === normalizeSearch(artist.name);
}

export function profileTracks(tracks: Track[], artist: Artist) {
  return rankTracks(tracks.filter(track => track.id && track.title && (
    artistMatches(track.artist, track.artistId, artist)
    || track.artists?.some(credit => artistMatches(credit.name, credit.id, artist))
    || track.artist.split(/\s*,\s*|\s+(?:&|feat\.?|ft\.?|x)\s+/i).some(name => artistMatches(name, undefined, artist))
  )), "");
}

export function profileReleases(albums: Album[], artist: Artist) {
  const releases: Album[] = [];
  for (const album of albums) {
    if (!album.id || !album.title || !artistMatches(album.artist, album.artistId, artist)) continue;
    const title = normalizeSearch(album.title).replace(/\s+/g, " ");
    const index = releases.findIndex(previous => previous.id === album.id || (
      normalizeSearch(previous.title).replace(/\s+/g, " ") === title
      && (!previous.releaseType || !album.releaseType || previous.releaseType === album.releaseType)
      && (!previous.releaseDate || !album.releaseDate || previous.releaseDate === album.releaseDate)
      && (!previous.numberOfTracks || !album.numberOfTracks || previous.numberOfTracks === album.numberOfTracks)
    ));
    if (index < 0) releases.push(album);
    else if (!releases[index].releaseType && album.releaseType) releases[index] = album;
  }
  return releases.sort((a, b) => (Date.parse(b.releaseDate ?? "") || 0) - (Date.parse(a.releaseDate ?? "") || 0));
}
