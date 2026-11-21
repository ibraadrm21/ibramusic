import type { Album, Artist, Track } from "./musicApi";

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  coverUrl?: string;
  isPublic?: boolean;
  folder?: string;
}

export interface ThemeSettings {
  theme: "dark" | "bright" | "noir";
  corners: "rounded" | "soft";
  bgColor: string;
  bgImage: string;
}

export interface ListeningStats {
  totalSeconds: number;
  tracks: Record<string, { track: Track; seconds: number; count: number }>;
  artists: Record<string, { name: string; thumbnail: string; seconds: number; count: number }>;
}

export interface Library {
  favorites: Track[];
  playlists: Playlist[];
  savedAlbums?: Album[];
  deletedPlaylists?: Playlist[];
  followedArtists: Artist[];
  themeSettings: ThemeSettings;
  accumulatedStats: ListeningStats;
}

export function equalLibraryData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => equalLibraryData(value, b[index]));
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => equalLibraryData(left[key], right[key]));
}

function mergeList<T extends { id: string }>(
  base: T[], local: T[], remote: T[], mergeItem: (previous: T | undefined, local: T, remote: T) => T,
): T[] {
  const baseItems = new Map(base.map(item => [item.id, item]));
  const localItems = new Map(local.map(item => [item.id, item]));
  const remoteItems = new Map(remote.map(item => [item.id, item]));
  const localOrder = local.filter(item => baseItems.has(item.id)).map(item => item.id);
  const baseOrder = base.filter(item => localItems.has(item.id)).map(item => item.id);
  const preferLocalOrder = base.length > 0 && !equalLibraryData(localOrder, baseOrder);
  const ordered = preferLocalOrder ? [...local, ...remote] : [...remote, ...local];
  const merged = new Map<string, T>();

  for (const { id } of ordered) {
    const previous = baseItems.get(id);
    const here = localItems.get(id);
    const there = remoteItems.get(id);
    if (previous && (!here || !there)) continue;
    const item = here && there ? mergeItem(previous, here, there) : here ?? there;
    if (item) merged.set(id, item);
  }
  return [...merged.values()];
}

function pick<T>(base: T | undefined, local: T, remote: T): T {
  return base !== undefined && !equalLibraryData(base, local) ? local : remote;
}

function mergeRecords<T extends { seconds: number; count: number }>(
  base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries([...new Set([...Object.keys(remote), ...Object.keys(local)])].flatMap(key => {
    const before = base[key];
    const here = local[key];
    const there = remote[key];
    if (before && (!here || !there)) return [];
    if (!here || !there) return [[key, here ?? there]];
    const seconds = before ? there.seconds + here.seconds - before.seconds : Math.max(here.seconds, there.seconds);
    const count = before ? there.count + here.count - before.count : Math.max(here.count, there.count);
    return [[key, { ...there, seconds: Math.max(0, seconds), count: Math.max(0, count) }]];
  }));
}

export function mergeLibrary(base: Partial<Library>, local: Library, remote: Partial<Library>): Library {
  const mergeEntry = <T,>(previous: T | undefined, here: T, there: T) => pick(previous, here, there);
  const stats = remote.accumulatedStats;
  const previousStats = base.accumulatedStats;
  return {
    savedAlbums: remote.savedAlbums ? mergeList(base.savedAlbums ?? [], local.savedAlbums ?? [], remote.savedAlbums, mergeEntry) : local.savedAlbums,
    deletedPlaylists: remote.deletedPlaylists ? mergeList(base.deletedPlaylists ?? [], local.deletedPlaylists ?? [], remote.deletedPlaylists, mergeEntry) : local.deletedPlaylists,
    favorites: remote.favorites ? mergeList(base.favorites ?? [], local.favorites, remote.favorites, mergeEntry) : local.favorites,
    followedArtists: remote.followedArtists ? mergeList(base.followedArtists ?? [], local.followedArtists, remote.followedArtists, mergeEntry) : local.followedArtists,
    playlists: remote.playlists ? mergeList(base.playlists ?? [], local.playlists, remote.playlists, (before, here, there) => ({
      ...there,
      name: pick(before?.name, here.name, there.name),
      coverUrl: before ? pick(before.coverUrl ?? "", here.coverUrl ?? "", there.coverUrl ?? "") : there.coverUrl ?? here.coverUrl,
      folder: before ? pick(before.folder ?? "", here.folder ?? "", there.folder ?? "") : there.folder ?? here.folder,
      isPublic: before ? pick(!!before.isPublic, !!here.isPublic, !!there.isPublic) : there.isPublic,
      tracks: mergeList(before?.tracks ?? [], here.tracks, there.tracks, mergeEntry),
    })) : local.playlists,
    themeSettings: remote.themeSettings ? pick(base.themeSettings, local.themeSettings, remote.themeSettings) : local.themeSettings,
    accumulatedStats: stats ? {
      totalSeconds: Math.max(0, previousStats
        ? stats.totalSeconds + local.accumulatedStats.totalSeconds - previousStats.totalSeconds
        : Math.max(stats.totalSeconds, local.accumulatedStats.totalSeconds)),
      tracks: mergeRecords(previousStats?.tracks ?? {}, local.accumulatedStats.tracks ?? {}, stats.tracks ?? {}),
      artists: mergeRecords(previousStats?.artists ?? {}, local.accumulatedStats.artists ?? {}, stats.artists ?? {}),
    } : local.accumulatedStats,
  };
}
