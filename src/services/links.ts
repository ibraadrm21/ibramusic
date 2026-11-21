import type { Album, Artist, Track } from "./musicApi";

export function buildShareLink(key: "playlistId" | "track" | "artist" | "album", id: string, title?: string, name?: string, position?: number) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(key, id);
  if (title) url.searchParams.set("title", title);
  if (name) url.searchParams.set("artistName", name);
  if (position && position > 0) url.searchParams.set("t", String(Math.floor(position)));
  return url;
}

export async function resolveSharedTrack(id: string, title?: string, name?: string): Promise<Track | null> {
  if (!id || id.startsWith("local-")) return null;
  const { searchTracks, resolveTidalTrackById } = await import("./musicApi");
  if (/^yt-[\w-]{11}$/.test(id)) {
    return (await searchTracks("https://www.youtube.com/watch?v=" + id.slice(3)))[0] ?? null;
  }
  if (title && name) {
    const matches = await searchTracks(title + " " + name);
    const exact = matches.find(track => track.id === id);
    if (exact) return exact;
  }
  return /^[0-9]+$/.test(id) ? resolveTidalTrackById(id) : null;
}

export function readMediaRoute(params: URLSearchParams): { artist?: Artist; album?: Album } {
  const id = params.get("artist") ?? params.get("album");
  if (!id || id.length > 200) return {};
  const title = params.get("title")?.slice(0, 180) ?? "";
  if (!title) return {};
  if (params.has("artist")) return { artist: { id, name: title, thumbnail: "" } };
  return { album: { id, title, artist: params.get("artistName")?.slice(0, 180) ?? "", thumbnail: "" } };
}
