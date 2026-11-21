import type { Playlist } from "./librarySync";
import type { Track } from "./musicApi";

const cleanLine = (value: string) => value.replace(/[\r\n]+/g, " ");

function publicUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function exportTrack(track: Track): Track {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    albumName: track.albumName,
    albumId: track.albumId,
    duration: track.duration,
    thumbnail: publicUrl(track.thumbnail),
    youtubeUrl: publicUrl(track.youtubeUrl) || undefined,
    spotifyUrl: publicUrl(track.spotifyUrl) || undefined,
    isExplicit: track.isExplicit,
    audioUrl: "",
  };
}

export function downloadFile(name: string, data: string | Blob, type = "application/json") {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = Array.from(name.replace(/[\\/:*?"<>|]/g, "-"), char => char.charCodeAt(0) < 32 ? "-" : char).join("").slice(0, 120);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function exportPlaylist(playlist: Playlist, format: "json" | "csv" | "m3u") {
  const tracks = playlist.tracks.map(exportTrack);
  if (format === "json") {
    downloadFile(playlist.name + ".json", JSON.stringify({ schema: "ibramusic.playlist.v1", name: playlist.name, tracks }, null, 2));
  } else if (format === "csv") {
    const cell = (value: string) => '"' + cleanLine(value).replace(/^\s*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
    const lines = tracks.map(track => [track.title, track.artist, track.albumName || "", track.youtubeUrl || track.spotifyUrl || ""].map(cell).join(","));
    downloadFile(playlist.name + ".csv", ["Title,Artist,Album,URL", ...lines].join("\r\n"), "text/csv;charset=utf-8");
  } else {
    const lines = tracks.flatMap(track => {
      const url = track.youtubeUrl || track.spotifyUrl;
      return url ? ["#EXTINF:" + Math.round(track.duration) + "," + cleanLine(track.artist + " - " + track.title), url] : [];
    });
    downloadFile(playlist.name + ".m3u", ["#EXTM3U", ...lines].join("\n"), "audio/x-mpegurl");
  }
}

export function parsePlaylistBackup(content: string): { name: string; tracks: Track[] } | null {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || !("schema" in value) || value.schema !== "ibramusic.playlist.v1") return null;
  if (!("name" in value) || typeof value.name !== "string" || !("tracks" in value) || !Array.isArray(value.tracks)) {
    throw new Error("La copia de la lista no tiene el formato esperado.");
  }
  const tracks = value.tracks.map((track: Partial<Track>) => {
    if (!track || typeof track.id !== "string" || typeof track.title !== "string" || typeof track.artist !== "string" || !Number.isFinite(track.duration)) {
      throw new Error("La copia contiene una pista no válida.");
    }
    if (!track.id || track.id.length > 300) throw new Error("La copia contiene un identificador no válido.");
    return exportTrack({ ...track, duration: Math.max(0, track.duration!), audioUrl: "" } as Track);
  });
  return { name: value.name, tracks };
}
