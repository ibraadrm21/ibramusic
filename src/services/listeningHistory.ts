import type { ListeningStats } from "./librarySync";
import type { Track } from "./musicApi";

export interface ListeningEntry {
  id: string;
  at: number;
  track: Track;
  seconds: number;
  completed: boolean;
}

export const LISTENING_HISTORY_KEY = "ibrastream_listening_events";
export const BACKLOG_LIMIT = 5000;

export function statsFor(entries: ListeningEntry[]): ListeningStats {
  const stats: ListeningStats = { totalSeconds: 0, tracks: {}, artists: {} };
  for (const entry of entries) {
    const track = entry.track;
    const artist = track.artist || "Artista desconocido";
    const trackStats = stats.tracks[track.id] ??= { track, seconds: 0, count: 0 };
    const artistStats = stats.artists[artist] ??= { name: artist, thumbnail: track.thumbnail, seconds: 0, count: 0 };
    stats.totalSeconds += entry.seconds;
    trackStats.seconds += entry.seconds;
    artistStats.seconds += entry.seconds;
    if (entry.completed) {
      trackStats.count++;
      artistStats.count++;
    }
  }
  return stats;
}

export function localDate(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}
