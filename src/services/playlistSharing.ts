import { supabase } from "./supabaseClient";
import type { Track } from "./musicApi";

export interface SharedPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  cover_url: string;
  revision: number;
  is_owner: boolean;
  can_edit: boolean;
  modified_by: string | null;
}

export type Visibility = "private" | "link" | "public";

export const shareTable = "ibramusic_playlist_shares";

export function shareableTracks(tracks: Track[]) {
  return tracks.filter(track => !track.id.startsWith("local-")).map(track => ({ ...track, audioUrl: "" }));
}

export function sharedPlaylistUrl(token: string): URL {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("share", token);
  return url;
}

export async function loadSharedPlaylist(token: string): Promise<SharedPlaylist> {
  const result = await supabase.rpc("ibramusic_read_share", { token });
  if (result.error || !result.data) throw new Error("La lista no está disponible o no tienes acceso.");
  return result.data as SharedPlaylist;
}

export async function updateSharedPlaylist(row: SharedPlaylist, name: string, tracks: Track[]) {
  const { data, error } = await supabase.rpc("ibramusic_edit_share", {
    token: row.id, expected_revision: row.revision, next_name: name.trim(), next_tracks: shareableTracks(tracks),
  });
  if (error) throw new Error("No se pudo guardar. Recarga la lista si alguien más la cambió.");
  return data as number;
}
