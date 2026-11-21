import type { Innertube } from "youtubei.js";

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  artists?: { id: string; name: string }[];
  albumName?: string;
  albumId?: string;
  duration: number; // in seconds
  thumbnail: string;
  audioUrl: string;
  spotifyUrl?: string;
  youtubeUrl?: string;
  plays?: string;
  dateAdded?: string;
  isUserAdded?: boolean;
  isExplicit?: boolean;
  hasDualVersions?: boolean;
}

export interface Artist {
  id: string;
  name: string;
  thumbnail: string;
  popularity?: number;
  description?: string;
  monthlyListeners?: number;
}

/**
 * Extracts and splits multi-artist strings (e.g. "Beny Jr, El Guincho" or "Feid & Young Miko")
 * into individual Artist objects, keeping existing IDs if provided.
 */
export function getArtistsFromTrack(track: {
  artist: string;
  artistId?: string;
  artists?: { id: string; name: string }[];
  thumbnail?: string;
}): { id: string; name: string }[] {
  // If track already has structured artists with multiple entries, return them
  if (track.artists && track.artists.length > 1) {
    return track.artists.map(a => ({ id: a.id || `artist-${encodeURIComponent(a.name.trim())}`, name: a.name.trim() }));
  }

  const rawArtist = track.artist || "";
  // Check if artist string contains multiple names separated by comma, '&', ' feat. ', ' ft. ', ' with ', ' x '
  const splitRegex = /(?:\s*,\s*|\s+&\s+|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+|\s+x\s+)/i;
  const parts = rawArtist.split(splitRegex).map(p => p.trim()).filter(Boolean);

  if (parts.length <= 1) {
    return [
      {
        id: track.artistId || (track.artists?.[0]?.id) || `artist-${encodeURIComponent(rawArtist || "Unknown Artist")}`,
        name: rawArtist || "Unknown Artist"
      }
    ];
  }

  // Multi-artist track detected!
  return parts.map((name, idx) => {
    // If the first part matches track.artists[0], preserve that ID
    let id = "";
    if (idx === 0 && track.artistId) {
      id = track.artistId;
    } else if (track.artists && track.artists[idx]?.id) {
      id = track.artists[idx].id;
    } else {
      id = `artist-${encodeURIComponent(name.toLowerCase())}`;
    }
    return { id, name };
  });
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  thumbnail: string;
  releaseDate?: string;
  numberOfTracks?: number;
}

// Empty library of mock tracks
export const MOCK_LIBRARY: Track[] = [];

// Fallback list of Monochrome API nodes (Tidal search proxies)
// Updated to working instances (tested 2026-06-14)
const MONOCHROME_HOSTS = [
  "https://monochrome-api.samidy.com",
  "https://us-west.monochrome.tf",
  "https://eu-central.monochrome.tf",
  "https://api.monochrome.tf",
];

let currentHostIndex = 0;

export const getApiBaseUrl = (): string => {
  const custom = localStorage.getItem("ibrastream_api_url");
  if (custom) return custom;
  return MONOCHROME_HOSTS[currentHostIndex];
};

export const setApiBaseUrl = (url: string) => {
  localStorage.setItem("ibrastream_api_url", url);
};

export const switchToNextInstance = () => {
  currentHostIndex = (currentHostIndex + 1) % MONOCHROME_HOSTS.length;
  console.log(`Switched to Monochrome host: ${getApiBaseUrl()}`);
  return getApiBaseUrl();
};

export const resolveUrl = (url: string): string => {
  const isNative = false;
  if (!isNative && typeof window !== 'undefined') {
    if (url.startsWith("https://api.spicylyrics.org")) {
      return url.replace("https://api.spicylyrics.org", "/api-spicylyrics");
    }
    if (url.startsWith("https://api.deezer.com")) {
      return url.replace("https://api.deezer.com", "/api-deezer");
    }
    // Only local dev Vite proxies these endpoints
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '') {
      if (url.startsWith("https://pipedapi.kavin.rocks")) {
        return url.replace("https://pipedapi.kavin.rocks", "/api-piped-kavin");
      }
      if (url.startsWith("https://api.piped.yt")) {
        return url.replace("https://api.piped.yt", "/api-piped-yt");
      }
      if (url.startsWith("https://pipedapi.moe.xyz")) {
        return url.replace("https://pipedapi.moe.xyz", "/api-piped-moe");
      }
      if (url.startsWith("https://pipedapi.lvk.li")) {
        return url.replace("https://pipedapi.lvk.li", "/api-piped-lvk");
      }
      if (url.startsWith("https://api.piped.private.coffee")) {
        return url.replace("https://api.piped.private.coffee", "/api-piped-private-coffee");
      }
      if (url.startsWith("https://inv.tux.pizza")) {
        return url.replace("https://inv.tux.pizza", "/api-invidious-tux");
      }
      if (url.startsWith("https://invidious.jing.rocks")) {
        return url.replace("https://invidious.jing.rocks", "/api-invidious-jing");
      }
      if (url.startsWith("https://inv.thepixora.com")) {
        return url.replace("https://inv.thepixora.com", "/api-invidious-pixora");
      }
      if (url.startsWith("https://invidious.privacydev.net")) {
        return url.replace("https://invidious.privacydev.net", "/api-invidious-privacydev");
      }
    }
  }
  return url;
};

export const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs: number = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  let abortHandler: (() => void) | null = null;
  if (options.signal) {
    abortHandler = () => {
      controller.abort();
      clearTimeout(id);
    };
    options.signal.addEventListener("abort", abortHandler);
  }

  const targetUrl = resolveUrl(url);

  try {
    const response = await fetch(targetUrl, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (options.signal && abortHandler) {
      options.signal.removeEventListener("abort", abortHandler);
    }
    return response;
  } catch (err) {
    clearTimeout(id);
    if (options.signal && abortHandler) {
      options.signal.removeEventListener("abort", abortHandler);
    }
    throw err;
  }
};

let youtubeClientPromise: Promise<Innertube> | null = null;
let youtubeWebClientPromise: Promise<Innertube> | null = null;

export const sharedCustomFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : (input && (input as any).href) ? (input as any).href : String(input));
  
  // 1. Resolve relative URLs (e.g. /youtubei/v1/player) or origin-resolved URLs back to absolute youtube.com/googleapis URLs
  if (typeof window !== 'undefined' && url.startsWith(window.location.origin)) {
    const path = url.slice(window.location.origin.length);
    if (path.startsWith("/youtubei/v1/")) {
      url = `https://youtubei.googleapis.com${path}`;
    } else if (path.startsWith("/youtube-com")) {
      url = path.replace("/youtube-com", "https://www.youtube.com");
    } else if (path.startsWith("/youtubei-googleapis")) {
      url = path.replace("/youtubei-googleapis", "https://youtubei.googleapis.com");
    } else {
      url = `https://www.youtube.com${path}`;
    }
  } else if (url.startsWith("http://localhost") || url.startsWith("https://localhost") || url.startsWith("http://127.0.0.1") || url.startsWith("https://127.0.0.1")) {
    if (url.includes("/youtubei/v1/")) {
      url = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, "https://youtubei.googleapis.com");
    } else {
      url = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, "https://www.youtube.com");
    }
  } else if (url.startsWith("/")) {
    if (url.startsWith("/youtubei/v1/")) {
      url = `https://youtubei.googleapis.com${url}`;
    } else {
      url = `https://www.youtube.com${url}`;
    }
  }

  const isNative = false;
  if (!isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '') {
    if (url.startsWith("https://www.youtube.com")) {
      url = url.replace("https://www.youtube.com", "/youtube-com");
    } else if (url.startsWith("https://youtubei.googleapis.com")) {
      url = url.replace("https://youtubei.googleapis.com", "/youtubei-googleapis");
    }
  }

  let method = "GET";
  let headers: Record<string, string> = {};
  let body: any = null;

  if (input instanceof Request) {
    method = input.method;
    for (const [key, val] of input.headers.entries()) {
      headers[key] = val;
    }
    if (method !== "GET" && method !== "HEAD") {
      body = await input.clone().text();
    }
  }

  if (init) {
    if (init.method) method = init.method;
    if (init.headers) {
      const initHeaders = new Headers(init.headers as any);
      for (const [key, val] of initHeaders.entries()) {
        headers[key] = val;
      }
    }
    if (init.body !== undefined) {
      body = init.body;
    }
  }

  const upperMethod = method.toUpperCase();
  if (upperMethod === "GET" || upperMethod === "HEAD") {
    body = null;
  }

  return fetch(url, {
    method,
    headers,
    body
  } as any);
};

function createYoutubeClient(): Promise<Innertube> {
  return import("youtubei.js").then(({ Innertube, Log }) => {
    Log.setLevel(Log.Level.ERROR);
    return Innertube.create({ fetch: sharedCustomFetch });
  });
}

export const getYoutubeClient = (): Promise<Innertube> => {
  youtubeClientPromise ??= createYoutubeClient().catch(error => {
    youtubeClientPromise = null;
    throw error;
  });
  return youtubeClientPromise;
};

export const getYoutubeWebClient = (): Promise<Innertube> => {
  youtubeWebClientPromise ??= createYoutubeClient().catch(error => {
    youtubeWebClientPromise = null;
    throw error;
  });
  return youtubeWebClientPromise;
};

// Helper to perform native-first requests to bypass CORS and auto-patching issues on Android
export async function fetchNative(url: string, options: any = {}) {
  const isFlutter = typeof window !== 'undefined' && (window as any).FlutterPlayerChannel !== undefined;
  if (isFlutter) {
    return new Promise<Response>((resolve, reject) => {
      const id = Math.floor(Math.random() * 1000000);
      const pendingFetch = (window as any)._pendingFetches || {};
      (window as any)._pendingFetches = pendingFetch;
      pendingFetch[id] = { resolve, reject };

      if (!(window as any).onFlutterHttpFetchResponse) {
        (window as any).onFlutterHttpFetchResponse = (respId: number, status: number, bodyStr: string, headersJson: any) => {
          const handler = (window as any)._pendingFetches?.[respId];
          if (handler) {
            delete (window as any)._pendingFetches[respId];
            const responseHeaders = new Headers();
            if (headersJson) {
              for (const [key, val] of Object.entries(headersJson)) {
                responseHeaders.set(key, val as string);
              }
            }
            const res = new Response(bodyStr, {
              status,
              headers: responseHeaders
            });
            Object.defineProperty(res, 'url', { value: url });
            handler.resolve(res);
          }
        };
      }

      (window as any).FlutterPlayerChannel.postMessage(JSON.stringify({
        action: 'httpFetch',
        id,
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body
      }));
    });
  }

  // Native capacitor bypass for Web
  {
    if (options.timeout) {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), options.timeout);
      try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    }
    return fetch(url, options);
  }
}

export async function fetchDeezerApi(url: string): Promise<any> {
  const isNative = false;
  if (isNative) {
    try {
      const res = await fetchNative(url, { timeout: 5000 });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("fetchNative failed for Deezer API:", e);
    }
  }

  try {
    const targetUrl = resolveUrl(url);
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Direct Deezer fetch failed, trying CORS proxies...", e);
  }

  const proxies = [
    (target: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(target)}`,
    (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
    (target: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`
  ];

  for (const getProxyUrl of proxies) {
    try {
      const proxyUrl = getProxyUrl(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        if (proxyUrl.includes("allorigins")) {
          const json = await res.json();
          if (json && json.contents) return JSON.parse(json.contents);
        } else {
          return await res.json();
        }
      }
    } catch (e) {
      console.warn(`Proxy failed for Deezer ${url}:`, e);
    }
  }

  return null;
}

export function tagDualVersionTracks(tracks: Track[]): Track[] {
  if (!tracks || tracks.length === 0) return tracks;

  const normalizeStr = (s: string) =>
    s
      .toLowerCase()
      .replace(/\(feat\..*?\)/gi, "")
      .replace(/\[feat\..*?\]/gi, "")
      .replace(/\(with.*?\)/gi, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .replace(/[^a-z0-9]/g, "");

  // Group tracks by normalized artist and clean title
  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const normTitle = normalizeStr(track.title);
    const normArtist = normalizeStr(track.artist);
    if (!normTitle) continue;
    const key = `${normArtist}__${normTitle}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(track);
  }

  // Find keys that have both explicit and clean tracks
  const dualKeys = new Set<string>();
  groups.forEach((groupTracks, key) => {
    const hasExplicit = groupTracks.some((t) => t.isExplicit === true);
    const hasClean = groupTracks.some((t) => !t.isExplicit);
    if (hasExplicit && hasClean) {
      dualKeys.add(key);
    }
  });

  return tracks.map((track) => {
    const normTitle = normalizeStr(track.title);
    const normArtist = normalizeStr(track.artist);
    const key = `${normArtist}__${normTitle}`;
    if (dualKeys.has(key)) {
      return { ...track, hasDualVersions: true };
    }
    return track;
  });
}

const dualVersionsCache = new Map<string, boolean>();

export function isTrackCandidateExplicit(song: any): boolean {
  if (!song) return false;
  const tl = (song.title || song.name || "").toLowerCase();
  if (
    tl.includes("explicit") ||
    tl.includes("(explicit)") ||
    tl.includes("[explicit]") ||
    tl.includes("dirty") ||
    tl.includes("(dirty)") ||
    tl.includes("[dirty]") ||
    tl.includes("uncensored") ||
    tl.includes("(uncensored)") ||
    tl.includes("[uncensored]") ||
    tl.includes("parental advisory") ||
    tl.includes("unrated")
  ) {
    return true;
  }
  if (Array.isArray(song.badges)) {
    return song.badges.some((b: any) =>
      b?.icon_type === "MUSIC_EXPLICIT_BADGE" ||
      b?.accessibility?.accessibility_data?.label?.toLowerCase() === "explicit" ||
      b?.label?.toLowerCase() === "explicit"
    );
  }
  if (song.is_explicit || song.explicit) {
    return true;
  }
  return false;
}

export function isTrackCandidateClean(song: any): boolean {
  if (!song) return false;
  const tl = (song.title || song.name || "").toLowerCase();
  if (
    tl.includes("clean") ||
    tl.includes("(clean)") ||
    tl.includes("[clean]") ||
    tl.includes("radio edit") ||
    tl.includes("censored") ||
    tl.includes("(censored)") ||
    tl.includes("[censored]") ||
    tl.includes("edited") ||
    tl.includes("(edited)") ||
    tl.includes("[edited]")
  ) {
    return true;
  }
  return false;
}

export async function checkTrackDualVersions(track: Track): Promise<boolean> {
  if (track.hasDualVersions !== undefined) {
    return track.hasDualVersions;
  }

  const cacheKey = `${track.artist} - ${track.title}`.toLowerCase();
  if (dualVersionsCache.has(cacheKey)) {
    return dualVersionsCache.get(cacheKey)!;
  }

  try {
    const yt = await getYoutubeClient();
    const cleanTitle = track.title
      .replace(/\(feat\..*?\)/i, "")
      .replace(/\[feat\..*?\]/i, "")
      .replace(/\(with.*?\)/i, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\[.*?\]/g, "")
      .trim();

    const query = `${track.artist} ${cleanTitle}`.trim();
    const searchRes = await yt.music.search(query, { type: 'song' });
    const songs = searchRes.songs?.contents || [];

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanT = norm(cleanTitle);

    const matches = songs.filter((s: any) => {
      const st = norm((s.title || '').replace(/\(.*?\)|\[.*?\]/g, ''));
      return st === cleanT || st.includes(cleanT) || cleanT.includes(st);
    });

    const hasExplicit = matches.some((s: any) => isTrackCandidateExplicit(s));
    const hasClean = matches.some((s: any) => isTrackCandidateClean(s));

    const isDual = hasExplicit && hasClean;
    dualVersionsCache.set(cacheKey, isDual);
    return isDual;
  } catch (err) {
    console.warn("[checkTrackDualVersions] Failed to check dual versions:", err);
    dualVersionsCache.set(cacheKey, false);
    return false;
  }
}

export async function searchTracks(query: string): Promise<Track[]> {
  if (!query.trim()) return MOCK_LIBRARY;

  const cleanQuery = query.trim();

  // YouTube Playlist Link Detection
  const ytPlaylistMatch = cleanQuery.match(/(?:youtube\.com|music\.youtube\.com)\/.*[?&]list=([a-zA-Z0-9_-]+)/i);
  if (ytPlaylistMatch && (!cleanQuery.includes("v=") || cleanQuery.includes("/playlist?"))) {
    const playlistId = ytPlaylistMatch[1];
    try {
      console.log(`Resolving direct YouTube playlist link for playlistId: ${playlistId}`);
      const tracks = await getPublicPlaylistTracks(playlistId);
      if (tracks && tracks.length > 0) {
        return tracks;
      }
    } catch (err) {
      console.error("Failed to resolve direct YouTube playlist search:", err);
    }
  }

  // YouTube Video Link Detection (standard, mobile, music, shorts, live, embed, youtu.be, etc.)
  const ytRegex = /(?:youtu\.be\/|(?:youtube\.com|music\.youtube\.com|m\.youtube\.com)\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i;
  const ytParamMatch = cleanQuery.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  const ytMatch = cleanQuery.match(ytRegex) || (cleanQuery.includes("youtu") ? ytParamMatch : null);

  if (ytMatch) {
    const videoId = ytMatch[1];
    console.log(`Resolving direct YouTube link for videoId: ${videoId}`);
    let title = "YouTube Track";
    let artist = "YouTube Channel";
    let duration = 180;
    let thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    let resolved = false;

    // Tier 1: YouTube Innertube
    try {
      const yt = await getYoutubeClient();
      const info = await yt.getBasicInfo(videoId);
      if (info?.basic_info) {
        title = info.basic_info.title || title;
        artist = info.basic_info.author || artist;
        duration = info.basic_info.duration || duration;
        if (info.basic_info.thumbnail?.[0]?.url) {
          thumbnail = info.basic_info.thumbnail[0].url;
        }
        resolved = true;
      }
    } catch (err) {
      console.warn("Innertube getBasicInfo failed, attempting YouTube oEmbed fallback:", err);
    }

    // Tier 2: YouTube oEmbed API fallback
    if (!resolved) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
        const res = await fetchNative(oembedUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.title) title = data.title;
          if (data.author_name) artist = data.author_name;
          if (data.thumbnail_url) thumbnail = data.thumbnail_url;
          resolved = true;
        }
      } catch (err) {
        console.warn("YouTube oEmbed fallback failed, attempting Piped fallback:", err);
      }
    }

    // Tier 3: Piped API fallback
    if (!resolved) {
      const PIPED_HOSTS = [
        "https://pipedapi.kavin.rocks",
        "https://api.piped.video",
        "https://pipedapi.drgns.space"
      ];
      for (const host of PIPED_HOSTS) {
        try {
          const res = await fetchNative(`${host}/streams/${videoId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.title) title = data.title;
            if (data.uploader) artist = data.uploader;
            if (data.duration) duration = data.duration;
            if (data.thumbnailUrl) thumbnail = data.thumbnailUrl;
            resolved = true;
            break;
          }
        } catch (e) {
          // ignore host failure
        }
      }
    }

    const track: Track = {
      id: `yt-${videoId}`,
      title,
      artist,
      duration,
      thumbnail,
      audioUrl: "",
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      isUserAdded: true
    };

    return [track];
  }

  // SoundCloud Link Detection
  if (cleanQuery.includes("soundcloud.com/")) {
    try {
      const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(cleanQuery)}`);
      if (res.ok) {
        const data = await res.json();
        const title = data.title || "SoundCloud Track";
        const artist = data.author_name || "SoundCloud Artist";
        const thumbnail = data.thumbnail_url || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";

        const track: Track = {
          id: `sc-${Date.now()}`,
          title,
          artist,
          duration: 180,
          thumbnail,
          audioUrl: "",
          youtubeUrl: ""
        };
        return [track];
      }
    } catch (err) {
      console.error("Failed to resolve SoundCloud link via oEmbed:", err);
    }
  }

  // Tier 1: Deezer API (Primary: 100% official HD studio cover art and metadata)
  try {
    const deezerData = await fetchDeezerApi(`https://api.deezer.com/search?q=${encodeURIComponent(cleanQuery)}&limit=30`);
    const items = deezerData?.data || [];
    if (Array.isArray(items) && items.length > 0) {
      const tracks: Track[] = items.map((item: any) => {
        const coverUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || item.album?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        const artistName = item.artist?.name || "Unknown Artist";
        const artistId = String(item.artist?.id || "");
        return {
          id: String(item.id),
          title: item.title || item.title_short || "Unknown Title",
          artist: artistName,
          artistId,
          artists: getArtistsFromTrack({ artist: artistName, artistId }),
          albumName: item.album?.title || "",
          albumId: String(item.album?.id || ""),
          duration: item.duration || 180,
          thumbnail: coverUrl,
          audioUrl: item.preview || "",
          isExplicit: Boolean(item.explicit_lyrics || item.explicit_content_lyrics === 1)
        };
      });
      return tagDualVersionTracks(tracks);
    }
  } catch (err) {
    console.warn("[searchTracks] Deezer primary search failed, trying YouTube Music fallback:", err);
  }

  // Tier 2: YouTube Music search via Innertube
  try {
    const yt = await getYoutubeClient();
    const searchRes = await yt.music.search(cleanQuery, { type: 'song' });
    const songs = searchRes.songs?.contents || [];
    if (Array.isArray(songs) && songs.length > 0) {
      const parsedTracks: Track[] = songs.map((song: any) => {
        const id = song.id || song.endpoint?.payload?.videoId || "";
        const title = typeof song.title === "string" ? song.title : (song.title?.text || song.title?.runs?.[0]?.text || "Unknown Title");
        const artistName = Array.isArray(song.artists)
          ? song.artists.map((a: any) => a.name || a.text || "").filter(Boolean).join(", ")
          : (song.artists?.[0]?.name || song.author?.name || "Unknown Artist");
        const artistId = song.artists?.[0]?.channel_id || song.artists?.[0]?.id || "";
        const artistsList = Array.isArray(song.artists)
          ? song.artists.map((a: any) => ({ id: a.channel_id || a.id || "", name: a.name || a.text || "" }))
          : [];
        const albumName = song.album?.name || song.album?.title || "";
        const albumId = song.album?.id || "";
        let duration = 180;
        if (typeof song.duration === "number") {
          duration = song.duration;
        } else if (song.duration?.seconds) {
          duration = song.duration.seconds;
        } else if (song.duration?.text) {
          const parts = song.duration.text.split(":").map(Number);
          duration = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        let thumbnail = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        const thumbs = song.thumbnail?.contents || song.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const bestThumb = thumbs.reduce((prev: any, cur: any) => ((cur.width || 0) > (prev.width || 0) ? cur : prev), thumbs[0]);
          let url = bestThumb?.url || thumbs[0]?.url;
          if (url) {
            if (url.includes("googleusercontent.com")) {
              url = url.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
            }
            thumbnail = url;
          }
        }

        return {
          id: id || `yt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          title,
          artist: artistName,
          artistId,
          artists: artistsList,
          albumName,
          albumId,
          duration,
          thumbnail,
          audioUrl: "",
          youtubeUrl: id ? `https://www.youtube.com/watch?v=${id}` : undefined
        };
      }).filter((t: Track) => Boolean(t.id && t.title));

      if (parsedTracks.length > 0) {
        return tagDualVersionTracks(parsedTracks);
      }
    }
  } catch (err) {
    console.warn("[searchTracks] Innertube YouTube Music search failed, trying iTunes fallback:", err);
  }

  // Tier 3: iTunes Search API fallback
  try {
    const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=25`);
    if (itunesRes.ok) {
      const itunesData = await itunesRes.json();
      if (Array.isArray(itunesData.results) && itunesData.results.length > 0) {
        const itunesTracks: Track[] = itunesData.results.map((r: any) => ({
          id: `itunes-${r.trackId}`,
          title: r.trackName || "Unknown Title",
          artist: r.artistName || "Unknown Artist",
          artistId: String(r.artistId || ""),
          albumName: r.collectionName || "",
          albumId: String(r.collectionId || ""),
          duration: Math.round((r.trackTimeMillis || 180000) / 1000),
          thumbnail: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "600x600bb") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
          audioUrl: r.previewUrl || "",
          isExplicit: r.trackExplicitness === "explicit" || r.collectionExplicitness === "explicit"
        }));
        return tagDualVersionTracks(itunesTracks);
      }
    }
  } catch (err) {
    console.warn("[searchTracks] iTunes search failed:", err);
  }

  // Tier 4: Monochrome host fallback (if any instance is operational)
  let retries = 2;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?s=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        throw new Error(`Monochrome search failed: ${response.status}`);
      }
      const data = await response.json();
      const items = data.data?.items || [];
      
      return items.map((item: any) => {
        let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        if (item.album?.cover) {
          const pathUuid = item.album.cover.replace(/-/g, "/");
          coverUrl = `https://resources.tidal.com/images/${pathUuid}/640x640.jpg`;
        }

        let artistName = item.artist?.name || item.artists?.[0]?.name || "Unknown Artist";
        const artistsList = Array.isArray(item.artists)
          ? item.artists.map((a: any) => ({ id: String(a.id), name: a.name }))
          : [];
        if (Array.isArray(item.artists) && item.artists.length > 0) {
          artistName = item.artists.map((a: any) => a.name).join(", ");
        }
        const artistId = String(item.artist?.id || item.artists?.[0]?.id || "");
        const albumName = item.album?.title || item.album?.name || "";
        const albumId = String(item.album?.id || "");

        return {
          id: String(item.id),
          title: item.title || "Unknown Title",
          artist: artistName,
          artistId,
          artists: artistsList,
          albumName,
          albumId,
          duration: item.duration || 180,
          thumbnail: coverUrl,
          audioUrl: ""
        };
      });
    } catch (e) {
      console.warn(`Monochrome search fallback failed for ${baseUrl}:`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function searchAlbums(query: string): Promise<Album[]> {
  if (!query.trim()) return [];
  const cleanQuery = query.trim();

  // Tier 1: Deezer API (100% HD album covers)
  try {
    const data = await fetchDeezerApi(`https://api.deezer.com/search/album?q=${encodeURIComponent(cleanQuery)}&limit=25`);
    const items = data?.data || [];
    if (Array.isArray(items) && items.length > 0) {
      return items.map((item: any) => ({
        id: String(item.id),
        title: item.title || "Unknown Album",
        artist: item.artist?.name || "Unknown Artist",
        artistId: String(item.artist?.id || ""),
        thumbnail: item.cover_xl || item.cover_big || item.cover_medium || item.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
        releaseDate: item.release_date,
        numberOfTracks: item.nb_tracks
      }));
    }
  } catch (err) {
    console.warn("[searchAlbums] Deezer album search failed, trying Innertube fallback:", err);
  }

  // Tier 2: YouTube Music via Innertube
  try {
    const yt = await getYoutubeClient();
    const searchRes = await yt.music.search(cleanQuery, { type: 'album' });
    const albums = searchRes.albums?.contents || [];
    if (Array.isArray(albums) && albums.length > 0) {
      const mappedAlbums: Album[] = albums.map((al: any) => {
        let cover = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        const thumbs = al.thumbnail?.contents || al.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const bestThumb = thumbs.reduce((prev: any, cur: any) => ((cur.width || 0) > (prev.width || 0) ? cur : prev), thumbs[0]);
          let url = bestThumb?.url || thumbs[0]?.url;
          if (url) {
            if (url.includes("googleusercontent.com")) {
              url = url.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
            }
            cover = url;
          }
        }
        const artistName = al.author?.name || al.artists?.[0]?.name || al.artist?.name || (typeof al.author === 'string' ? al.author : "Unknown Artist");
        const artistId = al.author?.channel_id || al.artists?.[0]?.id || "";
        return {
          id: al.id || al.browseId || `yt-album-${Date.now()}`,
          title: al.title || "Unknown Album",
          artist: artistName,
          artistId,
          thumbnail: cover,
          releaseDate: al.year || undefined
        };
      }).filter((a: Album) => Boolean(a.id && a.title));

      if (mappedAlbums.length > 0) {
        return mappedAlbums;
      }
    }
  } catch (err) {
    console.warn("[searchAlbums] Innertube album search failed, trying Monochrome fallback:", err);
  }

  // Tier 3: Monochrome fallback
  let retries = 2;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?al=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        throw new Error(`Monochrome album search failed: ${response.status}`);
      }
      const data = await response.json();
      const items = data.data?.albums?.items || data.albums?.items || [];
      
      return items.map((item: any) => {
        let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        if (item.cover) {
          const pathUuid = item.cover.replace(/-/g, "/");
          coverUrl = `https://resources.tidal.com/images/${pathUuid}/640x640.jpg`;
        }
        
        const artistName = item.artist?.name || item.artists?.[0]?.name || "Unknown Artist";
        const artistId = String(item.artist?.id || item.artists?.[0]?.id || "");

        return {
          id: String(item.id),
          title: item.title || "Unknown Album",
          artist: artistName,
          artistId,
          thumbnail: coverUrl,
          releaseDate: item.releaseDate,
          numberOfTracks: item.numberOfTracks
        };
      });
    } catch (e) {
      console.warn(`Monochrome album search fallback failed for ${baseUrl}:`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function searchArtists(query: string): Promise<Artist[]> {
  if (!query.trim()) return [];
  const cleanQuery = query.trim();

  // Tier 1: Deezer API (100% HD artist portraits)
  try {
    const data = await fetchDeezerApi(`https://api.deezer.com/search/artist?q=${encodeURIComponent(cleanQuery)}&limit=25`);
    const items = data?.data || [];
    if (Array.isArray(items) && items.length > 0) {
      return items.map((item: any) => ({
        id: String(item.id),
        name: item.name || "Unknown Artist",
        thumbnail: item.picture_xl || item.picture_big || item.picture_medium || item.picture || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
        popularity: item.nb_fan
      }));
    }
  } catch (err) {
    console.warn("[searchArtists] Deezer artist search failed, trying Innertube fallback:", err);
  }

  // Tier 2: YouTube Music via Innertube
  try {
    const yt = await getYoutubeClient();
    const searchRes = await yt.music.search(cleanQuery, { type: 'artist' });
    const artists = searchRes.artists?.contents || [];
    if (Array.isArray(artists) && artists.length > 0) {
      const mappedArtists: Artist[] = artists.map((ar: any) => {
        let pic = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        const thumbs = ar.thumbnail?.contents || ar.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const bestThumb = thumbs.reduce((prev: any, cur: any) => ((cur.width || 0) > (prev.width || 0) ? cur : prev), thumbs[0]);
          let url = bestThumb?.url || thumbs[0]?.url;
          if (url) {
            if (url.includes("googleusercontent.com")) {
              url = url.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
            }
            pic = url;
          }
        }
        const name = typeof ar.name === "string" ? ar.name : (ar.title?.text || ar.name?.text || "Unknown Artist");
        return {
          id: ar.id || ar.browseId || `yt-artist-${Date.now()}`,
          name,
          thumbnail: pic
        };
      }).filter((a: Artist) => Boolean(a.id && a.name));

      if (mappedArtists.length > 0) {
        return mappedArtists;
      }
    }
  } catch (err) {
    console.warn("[searchArtists] Innertube artist search failed, trying Monochrome fallback:", err);
  }

  // Tier 3: Monochrome fallback
  let retries = 2;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?a=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        throw new Error(`Monochrome artist search failed: ${response.status}`);
      }
      const data = await response.json();
      const items = data.data?.artists?.items || data.artists?.items || [];
      
      const mapped = items.map((item: any) => {
        let picUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        if (item.picture) {
          const pathUuid = item.picture.replace(/-/g, "/");
          picUrl = `https://resources.tidal.com/images/${pathUuid}/750x500.jpg`;
        }

        return {
          id: String(item.id),
          name: item.name || "Unknown Artist",
          thumbnail: picUrl,
          popularity: item.popularity
        };
      });

      return mapped;
    } catch (e) {
      console.warn(`Monochrome artist search fallback failed for ${baseUrl}:`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  if (!albumId) return [];

  // Tier 1: If Deezer album (numeric ID)
  if (/^\d+$/.test(albumId)) {
    try {
      const albumData = await fetchDeezerApi(`https://api.deezer.com/album/${albumId}`);
      let items = albumData?.tracks?.data || [];
      const totalExpected = albumData?.nb_tracks || items.length;

      // If album has more tracks than the 25 returned in album detail, or has a next page, fetch via /album/:id/tracks
      if (totalExpected > items.length || albumData?.tracks?.next) {
        try {
          const allTracksRes = await fetchDeezerApi(`https://api.deezer.com/album/${albumId}/tracks?limit=300`);
          if (allTracksRes?.data && Array.isArray(allTracksRes.data) && allTracksRes.data.length > 0) {
            items = allTracksRes.data;

            // In the rare case an album has > 300 tracks and has a next page
            let nextUrl = allTracksRes.next;
            let pageCount = 0;
            while (nextUrl && pageCount < 3) {
              const nextPageRes = await fetchDeezerApi(nextUrl);
              if (nextPageRes?.data && Array.isArray(nextPageRes.data) && nextPageRes.data.length > 0) {
                items = [...items, ...nextPageRes.data];
                nextUrl = nextPageRes.next;
                pageCount++;
              } else {
                break;
              }
            }
          }
        } catch (tracksErr) {
          console.warn("[getAlbumTracks] Deezer /tracks?limit=300 failed, using default items:", tracksErr);
        }
      }

      const coverUrl = albumData?.cover_xl || albumData?.cover_big || albumData?.cover_medium || albumData?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
      const albumTitle = albumData?.title || "";
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) => {
          const trackArtist = item.artist?.name || albumData?.artist?.name || "Unknown Artist";
          const trackArtistId = String(item.artist?.id || albumData?.artist?.id || "");
          return {
            id: String(item.id),
            title: item.title || item.title_short || "Unknown Title",
            artist: trackArtist,
            artistId: trackArtistId,
            artists: getArtistsFromTrack({ artist: trackArtist, artistId: trackArtistId }),
            albumName: albumTitle,
            albumId: String(albumId),
            duration: item.duration || 180,
            thumbnail: coverUrl,
            audioUrl: item.preview || "",
            isExplicit: Boolean(item.explicit_lyrics || item.explicit_content_lyrics === 1)
          };
        });
      }
    } catch (e) {
      console.warn("[getAlbumTracks] Deezer album tracks failed:", e);
    }
  }

  // Tier 2: If YouTube Music album (MPREb... or OLAK5uy... or PL...)
  if (albumId.startsWith("MPREb") || albumId.startsWith("OLAK5uy_") || albumId.startsWith("VL") || albumId.startsWith("PL")) {
    try {
      const yt = await getYoutubeClient();
      const albumData = await (yt.music as any).getAlbum(albumId);
      const items = albumData?.contents || [];
      if (Array.isArray(items) && items.length > 0) {
        let cover = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        const thumbs = albumData.header?.thumbnail?.contents || albumData.header?.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          const bestThumb = thumbs.reduce((prev: any, cur: any) => ((cur.width || 0) > (prev.width || 0) ? cur : prev), thumbs[0]);
          let url = bestThumb?.url || thumbs[0]?.url;
          if (url) {
            if (url.includes("googleusercontent.com")) {
              url = url.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
            }
            cover = url;
          }
        }
        const albumName = albumData.title || albumData.header?.title?.text || "";
        const defaultArtist = albumData.artists?.[0]?.name || albumData.header?.author?.name || "Unknown Artist";

        return items.map((item: any) => {
          const id = item.id || item.video_id || "";
          const title = typeof item.title === "string" ? item.title : (item.title?.text || item.title?.runs?.[0]?.text || "Unknown Title");
          let duration = 180;
          if (typeof item.duration === "number") duration = item.duration;
          else if (item.duration?.seconds) duration = item.duration.seconds;
          else if (item.duration?.text) {
            const parts = item.duration.text.split(":").map(Number);
            duration = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
          const artist = Array.isArray(item.artists) ? item.artists.map((a: any) => a.name).join(", ") : defaultArtist;
          return {
            id,
            title,
            artist,
            albumName,
            albumId,
            duration,
            thumbnail: cover,
            audioUrl: "",
            youtubeUrl: id ? `https://www.youtube.com/watch?v=${id}` : undefined
          };
        }).filter((t: Track) => Boolean(t.id && t.title));
      }
    } catch (e) {
      console.warn("[getAlbumTracks] Innertube album failed, trying playlist fallback:", e);
      try {
        const tracks = await getPublicPlaylistTracks(albumId);
        if (tracks.length > 0) return tracks;
      } catch (err) {}
    }
  }

  // Tier 3: Monochrome fallback
  let retries = 2;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/album/?id=${albumId}`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        throw new Error(`Monochrome album tracks failed: ${response.status}`);
      }
      const data = await response.json();
      const items = data.data?.items || data.items || [];
      
      return items.map((item: any) => {
        const u = item.item || item;
        let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        if (u.album?.cover) {
          const pathUuid = u.album.cover.replace(/-/g, "/");
          coverUrl = `https://resources.tidal.com/images/${pathUuid}/640x640.jpg`;
        }

        let artistName = u.artist?.name || u.artists?.[0]?.name || "Unknown Artist";
        const artistsList = Array.isArray(u.artists)
          ? u.artists.map((a: any) => ({ id: String(a.id), name: a.name }))
          : [];
        if (Array.isArray(u.artists) && u.artists.length > 0) {
          artistName = u.artists.map((a: any) => a.name).join(", ");
        }
        const artistId = String(u.artist?.id || u.artists?.[0]?.id || "");
        const albumName = u.album?.title || u.album?.name || "";
        const albumIdVal = String(u.album?.id || albumId);

        return {
          id: String(u.id),
          title: u.title || "Unknown Title",
          artist: artistName,
          artistId,
          artists: artistsList,
          albumName,
          albumId: albumIdVal,
          duration: u.duration || 180,
          thumbnail: coverUrl,
          audioUrl: ""
        };
      });
    } catch (e) {
      console.warn(`Monochrome album tracks fallback failed for ${baseUrl}:`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function getArtistTracks(artistId: string, artistNameHint?: string): Promise<Track[]> {
  if (!artistId && !artistNameHint) return [];

  // If artistId is not numeric and not a YouTube channel (e.g. "artist-el%20guincho" or artist name), resolve real ID first!
  let resolvedId = artistId;
  if (!/^\d+$/.test(resolvedId) && !resolvedId.startsWith("UC")) {
    const searchName = artistNameHint || (resolvedId.startsWith("artist-") ? decodeURIComponent(resolvedId.replace("artist-", "")) : resolvedId);
    if (searchName) {
      try {
        const found = await searchArtists(searchName);
        if (found && found.length > 0) {
          const exact = found.find(a => a.name.toLowerCase() === searchName.toLowerCase()) || found[0];
          if (exact && exact.id) {
            resolvedId = exact.id;
          }
        }
      } catch (err) {
        console.warn("[getArtistTracks] Failed to resolve artist ID from name:", searchName, err);
      }
    }
  }

  // Tier 1: If Deezer artist (numeric ID)
  if (/^\d+$/.test(resolvedId)) {
    try {
      const data = await fetchDeezerApi(`https://api.deezer.com/artist/${resolvedId}/top?limit=50`);
      const items = data?.data || [];
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) => {
          const coverUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || item.album?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
          const trackArtist = item.artist?.name || "Unknown Artist";
          const trackArtistId = String(item.artist?.id || resolvedId);
          return {
            id: String(item.id),
            title: item.title || item.title_short || "Unknown Title",
            artist: trackArtist,
            artistId: trackArtistId,
            artists: getArtistsFromTrack({ artist: trackArtist, artistId: trackArtistId }),
            albumName: item.album?.title || "",
            albumId: String(item.album?.id || ""),
            duration: item.duration || 180,
            thumbnail: coverUrl,
            audioUrl: item.preview || ""
          };
        });
      }
    } catch (e) {
      console.warn("[getArtistTracks] Deezer artist top tracks failed:", e);
    }
  }

  // Tier 2: If YouTube Channel (starts with UC...)
  if (resolvedId.startsWith("UC")) {
    try {
      const yt = await getYoutubeClient();
      const artistData = await (yt.music as any).getArtist(resolvedId);
      const songSection = artistData.sections?.find((s: any) => s.type === "MusicShelf" || s.title?.text?.toLowerCase()?.includes("song") || s.title?.toLowerCase()?.includes("song"));
      const items = songSection?.contents || [];
      if (Array.isArray(items) && items.length > 0) {
        const artistName = artistData.header?.title?.text || artistData.name || "Unknown Artist";
        return items.map((item: any) => {
          const id = item.id || item.video_id || "";
          const title = typeof item.title === "string" ? item.title : (item.title?.text || "Unknown Title");
          let duration = 180;
          if (typeof item.duration === "number") duration = item.duration;
          else if (item.duration?.seconds) duration = item.duration.seconds;
          else if (item.duration?.text) {
            const parts = item.duration.text.split(":").map(Number);
            duration = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
          let thumbnail = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
          const thumbs = item.thumbnail?.contents || item.thumbnails;
          if (Array.isArray(thumbs) && thumbs.length > 0) {
            const bestThumb = thumbs.reduce((prev: any, cur: any) => ((cur.width || 0) > (prev.width || 0) ? cur : prev), thumbs[0]);
            let url = bestThumb?.url || thumbs[0]?.url;
            if (url) {
              if (url.includes("googleusercontent.com")) {
                url = url.replace(/=w\d+-h\d+.*$/, "=w544-h544-l90-rj");
              }
              thumbnail = url;
            }
          }
          return {
            id,
            title,
            artist: artistName,
            artistId,
            albumName: item.album?.name || "",
            duration,
            thumbnail,
            audioUrl: "",
            youtubeUrl: id ? `https://www.youtube.com/watch?v=${id}` : undefined
          };
        }).filter((t: Track) => Boolean(t.id && t.title));
      }
    } catch (e) {
      console.warn("[getArtistTracks] Innertube getArtist failed:", e);
    }
  }

  // Tier 3: Monochrome fallback
  let retries = 2;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/artist/?f=${artistId}`;
      const response = await fetch(searchUrl, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        throw new Error(`Monochrome artist tracks failed: ${response.status}`);
      }
      const data = await response.json();
      const tracks = data.tracks || [];
      
      return tracks.map((track: any) => {
        let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        if (track.album?.cover) {
          const pathUuid = track.album.cover.replace(/-/g, "/");
          coverUrl = `https://resources.tidal.com/images/${pathUuid}/640x640.jpg`;
        }

        let artistName = track.artist?.name || track.artists?.[0]?.name || "Unknown Artist";
        const artistsList = Array.isArray(track.artists)
          ? track.artists.map((a: any) => ({ id: String(a.id), name: a.name }))
          : [];
        if (Array.isArray(track.artists) && track.artists.length > 0) {
          artistName = track.artists.map((a: any) => a.name).join(", ");
        }
        const artistIdVal = String(track.artist?.id || track.artists?.[0]?.id || artistId);
        const albumName = track.album?.title || track.album?.name || "";
        const albumId = String(track.album?.id || "");

        return {
          id: String(track.id),
          title: track.title || "Unknown Title",
          artist: artistName,
          artistId: artistIdVal,
          artists: artistsList,
          albumName,
          albumId,
          duration: track.duration || 180,
          thumbnail: coverUrl,
          audioUrl: ""
        };
      });
    } catch (e) {
      console.warn(`Monochrome artist tracks fallback failed for ${baseUrl}:`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export interface SpotifyArtistStats {
  monthlyListeners?: number;
  biography?: string;
  topTracks?: Array<{
    id: string;
    name: string;
    streamCount: number;
  }>;
}

const artistStatsCache: Record<string, SpotifyArtistStats> = {};
const albumStatsCache: Record<string, any> = {};
let rapidApiRateLimitedUntil = 0;

export async function getSpotifyArtistStats(artistName: string): Promise<SpotifyArtistStats | null> {
  const cacheKey = artistName.trim().toLowerCase();
  if (artistStatsCache[cacheKey]) {
    return artistStatsCache[cacheKey];
  }

  if (Date.now() < rapidApiRateLimitedUntil) {
    return null;
  }

  const apiKey = "8f40ce19b2msh37d06bd15f363b3p1602fbjsnef935dd66d83";
  const apiHost = "spotify-statistics-and-stream-count.p.rapidapi.com";
  
  try {
    const searchRes = await fetch(`https://spotify-statistics-and-stream-count.p.rapidapi.com/search?q=${encodeURIComponent(artistName)}`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost
      }
    });

    if (searchRes.status === 429) {
      console.warn("Spotify RapidAPI rate limit hit. Pausing requests for 5 minutes.");
      rapidApiRateLimitedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const artistItem = searchData.artists?.items?.[0] || searchData.topResults?.artists?.[0];
    if (!artistItem || !artistItem.id) return null;
    
    const detailRes = await fetch(`https://spotify-statistics-and-stream-count.p.rapidapi.com/artist/${artistItem.id}`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost
      }
    });

    if (detailRes.status === 429) {
      console.warn("Spotify RapidAPI rate limit hit. Pausing requests for 5 minutes.");
      rapidApiRateLimitedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }

    if (!detailRes.ok) return null;
    const detailData = await detailRes.json();
    
    const statsResult: SpotifyArtistStats = {
      monthlyListeners: detailData.monthlyListeners,
      biography: detailData.biography,
      topTracks: detailData.topTracks || []
    };

    artistStatsCache[cacheKey] = statsResult;
    return statsResult;
  } catch (err) {
    console.warn("Failed to fetch Spotify artist stats:", err);
    return null;
  }
}

export async function getSpotifyAlbumStats(albumTitle: string, artistName: string): Promise<any | null> {
  const cacheKey = `${artistName.trim()} - ${albumTitle.trim()}`.toLowerCase();
  if (albumStatsCache[cacheKey]) {
    return albumStatsCache[cacheKey];
  }

  if (Date.now() < rapidApiRateLimitedUntil) {
    return null;
  }

  const apiKey = "8f40ce19b2msh37d06bd15f363b3p1602fbjsnef935dd66d83";
  const apiHost = "spotify-statistics-and-stream-count.p.rapidapi.com";
  
  try {
    const query = `${artistName} ${albumTitle}`;
    const searchRes = await fetch(`https://spotify-statistics-and-stream-count.p.rapidapi.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost
      }
    });

    if (searchRes.status === 429) {
      console.warn("Spotify RapidAPI rate limit hit. Pausing requests for 5 minutes.");
      rapidApiRateLimitedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }

    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const albumItem = searchData.albums?.items?.[0] || searchData.topResults?.albums?.[0];
    if (!albumItem || !albumItem.id) return null;
    
    const detailRes = await fetch(`https://spotify-statistics-and-stream-count.p.rapidapi.com/album/${albumItem.id}`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost
      }
    });

    if (detailRes.status === 429) {
      console.warn("Spotify RapidAPI rate limit hit. Pausing requests for 5 minutes.");
      rapidApiRateLimitedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }

    const detailData = detailRes.ok ? await detailRes.json() : null;
    if (detailData) {
      albumStatsCache[cacheKey] = detailData;
    }
    return detailData;
  } catch (err) {
    console.warn("Failed to fetch Spotify album stats:", err);
    return null;
  }
}

export async function getRelatedTracks(track: Track): Promise<Track[]> {
  const videoId = await getYouTubeVideoId(track);
  const youtube = await getYoutubeClient();
  const panel = await youtube.music.getUpNext(videoId, true);
  return panel.contents.flatMap(item => {
    if (!("video_id" in item) || item.video_id === videoId) return [];
    const artists = item.artists?.map(artist => ({ id: artist.channel_id ?? "", name: artist.name }));
    const artist = artists?.map(entry => entry.name).join(", ") || item.author;
    if (!item.video_id || !item.title.text || !artist) return [];
    const thumbnail = item.thumbnail.reduce<(typeof item.thumbnail)[number] | undefined>((best, current) =>
      !best || current.width > best.width ? current : best, undefined)?.url;
    return [{
      id: item.video_id, title: item.title.text, artist, artists, artistId: artists?.[0]?.id,
      albumName: item.album?.name, albumId: item.album?.id, duration: item.duration?.seconds || 180,
      thumbnail: thumbnail || "https://i.ytimg.com/vi/" + item.video_id + "/hqdefault.jpg",
      audioUrl: "", isExplicit: isTrackCandidateExplicit({ title: item.title.text, badges: item.badges }) || undefined,
    }];
  });
}

export async function getYouTubeVideoId(track: Track, signal?: AbortSignal, excludeVideoIds?: string[], lockVersion = false): Promise<string> {
  const excluded = new Set(excludeVideoIds || []);

  // If user explicitly requests explicit or clean, adjust search query and selection
  const isExplicitRequested = track.isExplicit === true;
  const isExplicitStrict = track.isExplicit !== undefined;
  const matchesVersion = (candidate: unknown) => !lockVersion || !(isExplicitRequested
    ? isTrackCandidateClean(candidate)
    : isTrackCandidateExplicit(candidate));

  if (track.id.startsWith("yt-")) {
    const rawId = track.id.substring(3);
    if (!excluded.has(rawId) && !isExplicitStrict) return rawId;
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(track.id)) {
    if (!excluded.has(track.id) && !isExplicitStrict) return track.id;
  }
  if (track.youtubeUrl && !isExplicitStrict) {
    const ytUrlMatch = track.youtubeUrl.match(/(?:youtu\.be\/|(?:youtube\.com|music\.youtube\.com|m\.youtube\.com)\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i) || track.youtubeUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    if (ytUrlMatch && !excluded.has(ytUrlMatch[1])) {
      return ytUrlMatch[1];
    }
  }

  const cleanTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .replace(/\(.*?\)/g, "")
    .trim();

  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const reqTitleNorm = norm(cleanTitle);
  const reqArtistNorm = norm(track.artist);

  // Helper to pick best song candidate based on title/artist matching and explicit preference
  const pickBestCandidate = (candidates: any[], minScore: number = 0) => {
    if (!candidates || candidates.length === 0) return null;
    const available = candidates.filter(c => {
      if (!c || !matchesVersion(c)) return false;
      const id = c.id || c.videoId;
      return !id || !excluded.has(id);
    });
    if (available.length === 0) return null;

    const scored = available.map(song => {
      const candTitle = (song.title || song.name || "");
      const candTitleNorm = norm(candTitle.replace(/\(.*?\)|\[.*?\]/g, ""));
      const candTitleLower = candTitle.toLowerCase();
      const candArtists = Array.isArray(song.artists)
        ? song.artists.map((a: any) => norm(a.name || "")).join(" ")
        : norm(song.author || song.uploaderName || "");

      let score = 0;

      // 1. Title match (0 to 100 points)
      if (candTitleNorm === reqTitleNorm) {
        score += 100;
      } else if (candTitleNorm.includes(reqTitleNorm) || reqTitleNorm.includes(candTitleNorm)) {
        score += 70;
      } else {
        score -= 150;
      }

      // 2. Artist match (-60 to +40 points)
      if (candArtists && reqArtistNorm) {
        if (candArtists.includes(reqArtistNorm) || reqArtistNorm.includes(candArtists)) {
          score += 40;
        } else {
          score -= 60;
        }
      }

      // 3. Penalize live, cover, karaoke, instrumental unless original title asked for it
      const isLiveOrCover = candTitleLower.includes("live") || candTitleLower.includes("en vivo") ||
                            candTitleLower.includes("cover") || candTitleLower.includes("karaoke") ||
                            candTitleLower.includes("tribute") || candTitleLower.includes("instrumental");
      const requestedLiveOrCover = reqTitleNorm.includes("live") || reqTitleNorm.includes("cover") || reqTitleNorm.includes("karaoke");
      if (isLiveOrCover && !requestedLiveOrCover) {
        score -= 60;
      }

      // 4. Explicit vs Clean scoring
      const isExp = isTrackCandidateExplicit(song);
      const isCln = isTrackCandidateClean(song);

      if (isExplicitStrict) {
        if (isExplicitRequested) {
          if (isExp) score += 60;
          if (isCln) score -= 100;
        } else {
          if (isCln) score += 60;
          if (isExp) score -= 100;
        }
      }

      return { song, score };
    });

    scored.sort((a, b) => b.score - a.score);
    if (scored[0] && scored[0].score >= minScore) {
      return scored[0].song;
    }
    return minScore === 0 ? (scored[0]?.song || available[0]) : null;
  };

  const primaryQuery = `${track.artist} ${cleanTitle}`.trim();
  const explicitQuery = `${track.artist} ${cleanTitle} explicit`.trim();
  const cleanQuery = `${track.artist} ${cleanTitle} clean`.trim();
  const primarySearchQuery = isExplicitStrict
    ? (isExplicitRequested ? explicitQuery : cleanQuery)
    : primaryQuery;
  const query = primarySearchQuery;

  // 1. Fast resolution via Innertube YouTube Music
  try {
    const yt = await getYoutubeClient();
    let searchRes = await yt.music.search(primarySearchQuery, { type: 'song' });
    let contents = searchRes.songs?.contents || [];

    let chosen = pickBestCandidate(contents, 50);

    // If explicit/clean query didn't find candidate, or if requested explicit but found candidate wasn't explicit,
    // search complementary queries
    if (isExplicitStrict && isExplicitRequested && (!chosen || !isTrackCandidateExplicit(chosen))) {
      try {
        const fallbackRes = await yt.music.search(primaryQuery, { type: 'song' });
        const fallbackContents = fallbackRes.songs?.contents || [];
        const fallbackChosen = pickBestCandidate(fallbackContents, 50);
        if (fallbackChosen) {
          if (!chosen || isTrackCandidateExplicit(fallbackChosen)) {
            chosen = fallbackChosen;
          }
        }
      } catch {}
    } else if (isExplicitStrict && !isExplicitRequested && (!chosen || isTrackCandidateExplicit(chosen))) {
      try {
        const fallbackRes = await yt.music.search(primaryQuery, { type: 'song' });
        const fallbackContents = fallbackRes.songs?.contents || [];
        const fallbackChosen = pickBestCandidate(fallbackContents, 50);
        if (fallbackChosen && !isTrackCandidateExplicit(fallbackChosen)) {
          chosen = fallbackChosen;
        }
      } catch {}
    }

    // If no candidate was chosen from YouTube Music (or all were excluded / mismatched), fall back to YouTube video search
    if (!chosen || !chosen.id) {
      try {
        const ytVideoRes = await yt.search(primarySearchQuery, { type: 'video' });
        const videoCandidates = (ytVideoRes.videos || []).filter((v: any) => v.id && !excluded.has(v.id) && matchesVersion({ title: v.title?.text }));
        if (videoCandidates.length > 0) {
          const scoredVideos = videoCandidates.map((v: any) => {
            const vTitle = v.title?.text || "";
            const vTitleNorm = norm(vTitle.replace(/\(.*?\)|\[.*?\]/g, ""));
            const vAuthor = norm(v.author?.name || "");
            let score = 0;
            if (vTitleNorm.includes(reqTitleNorm)) score += 100;
            if (vTitleNorm.includes(reqArtistNorm) || vAuthor.includes(reqArtistNorm)) score += 50;
            return { video: v, score, vTitle };
          });
          scoredVideos.sort((a, b) => b.score - a.score);
          if (scoredVideos[0] && scoredVideos[0].score >= 80) {
            chosen = { id: scoredVideos[0].video.id, title: scoredVideos[0].vTitle };
          }
        }
      } catch {}
    }

    if (chosen && chosen.id) {
      console.log(`[getYouTubeVideoId] Resolved videoId via Innertube: ${chosen.title} (${chosen.id}) [explicitRequested: ${isExplicitRequested}, isExplicitResult: ${isTrackCandidateExplicit(chosen)}]`);
      return chosen.id;
    }
  } catch (err) {
    console.warn("[getYouTubeVideoId] Innertube resolution failed, trying Piped fallback:", err);
  }

  // 2. Fallback to public Piped API search
  const PIPED_HOSTS = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.lvk.li",
    "https://api.piped.yt"
  ];

  for (const baseUrl of PIPED_HOSTS) {
    try {
      console.log(`Searching video ID for "${query}" via Piped API: ${baseUrl}...`);
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const searchResponse = await fetchNative(searchUrl, { 
        signal,
        headers: {
          'Referer': 'https://piped.video/',
          'Origin': 'https://piped.video'
        }
      });
      if (!searchResponse.ok) continue;
      const searchData = await searchResponse.json();
      const items = searchData.items || searchData.relatedStreams || [];
      if (Array.isArray(items) && items.length > 0) {
        const streamItems = items.filter((item: any) => item.type === "stream" || item.url);
        if (streamItems.length > 0) {
          const chosen = pickBestCandidate(streamItems, 40);
          const videoIdMatch = chosen?.url?.match(/[?&]v=([^&]+)/) || chosen?.url?.match(/v=([^&]+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : chosen?.url?.replace("/watch?v=", "");
          if (videoId && !excluded.has(videoId)) {
            console.log(`Resolved videoId via Piped API ${baseUrl}: ${chosen.title} (${videoId})`);
            return videoId;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      console.warn(`Piped search fallback ${baseUrl} failed:`, e);
    }
  }

  // 3. Fallback to public Invidious instances
  const INVIDIOUS_HOSTS = [
    "https://inv.tux.pizza",
    "https://invidious.jing.rocks",
    "https://inv.thepixora.com",
    "https://invidious.privacydev.net"
  ];

  for (const invHost of INVIDIOUS_HOSTS) {
    try {
      console.log(`Searching video ID for "${query}" via Invidious: ${invHost}...`);
      const invUrl = `${invHost}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const invRes = await fetchWithTimeout(invUrl, { signal }, 5000);
      if (!invRes.ok) continue;
      const invData = await invRes.json();
      if (Array.isArray(invData) && invData.length > 0) {
        const first = invData.find((v: any) => {
          const vid = v.videoId || v.id;
          return vid && !excluded.has(vid) && matchesVersion(v);
        });
        const vid = first?.videoId || first?.id;
        if (vid) {
          console.log(`Resolved videoId via Invidious ${invHost}: ${first.title} (${vid})`);
          return vid;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      console.warn(`Invidious search fallback ${invHost} failed:`, e);
    }
  }

  throw new Error("Failed to retrieve video ID for this track.");
}

let cachedCobaltHosts: string[] = [];
let lastCobaltFetchTime = 0;

async function getHealthyCobaltHosts(): Promise<string[]> {
  const now = Date.now();
  if (cachedCobaltHosts.length > 0 && (now - lastCobaltFetchTime < 1000 * 60 * 15)) {
    return cachedCobaltHosts;
  }
  try {
    const res = await fetchNative("https://cobalt.directory/api/working?type=api");
    if (res.ok) {
      const data = await res.json();
      const hosts = data.data?.youtube || [];
      if (Array.isArray(hosts) && hosts.length > 0) {
        const formatted = hosts.map((h: string) => h.endsWith("/") ? h : h + "/");
        cachedCobaltHosts = formatted;
        lastCobaltFetchTime = now;
        return formatted;
      }
    }
  } catch (e) {
    console.warn("Failed to fetch dynamic Cobalt instances list:", e);
  }
  return [
    "https://api.qwkuns.me/",
    "https://cobaltapi.squair.xyz/",
    "https://rue-cobalt.xenon.zone/",
    "https://apicobalt.mgytr.top/",
    "https://fox.kittycat.boo/",
    "https://api.cobalt.tools/"
  ];
}


export async function getMonochromeAudioStream(trackOrQuery: Track | string): Promise<string | null> {
  const query = typeof trackOrQuery === 'string'
    ? trackOrQuery
    : `${trackOrQuery.artist} ${trackOrQuery.title}`.trim();

  if (!query) return null;

  const baseUrl = getApiBaseUrl();
  try {
    console.log(`[Monochrome] Resolving audio stream for "${query}" via ${baseUrl}...`);
    const searchUrl = `${baseUrl}/search/?s=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(5000) });
    if (!searchRes.ok) throw new Error(`Monochrome search failed: ${searchRes.status}`);

    const data = await searchRes.json();
    const items = data.data?.items || data.items || [];
    if (!items || items.length === 0) {
      console.warn(`[Monochrome] No tracks found for "${query}"`);
      return null;
    }

    const firstMatch = items[0];
    const trackId = firstMatch.id;
    if (!trackId) return null;

    const trackRes = await fetch(`${baseUrl}/track/?id=${trackId}`, { signal: AbortSignal.timeout(6000) });
    if (!trackRes.ok) throw new Error(`Monochrome track lookup failed: ${trackRes.status}`);

    const trackData = await trackRes.json();
    if (!trackData.data?.manifest) {
      return null;
    }

    const xml = typeof atob === 'function'
      ? atob(trackData.data.manifest)
      : typeof (globalThis as any).Buffer !== 'undefined'
      ? (globalThis as any).Buffer.from(trackData.data.manifest, 'base64').toString('utf8')
      : "";

    // Extract initialization and media URLs from DASH manifest
    if (xml && xml.includes('initialization="') && xml.includes('media="')) {
      const mediaTemplate = xml.split('media="')[1].split('"')[0].replace(/&amp;/g, '&');

      // Fetch init chunk and first segment to form an instant high-quality audio stream/blob or return direct media link
      const seg1Url = mediaTemplate.replace('$Number$', '1');
      console.log(`[Monochrome] Successfully resolved Tidal stream segments for ${trackId}`);
      return seg1Url;
    }

    return null;
  } catch (err) {
    console.warn(`[Monochrome] Stream resolution error for "${query}":`, err);
    return null;
  }
}

export async function getYouTubeAudioStream(videoId: string): Promise<string> {
  // 1. Try resolving direct YouTube stream via Innertube first
  try {
    console.log("Resolving direct YouTube stream URL via Innertube...");
    const yt = await getYoutubeClient();
    const info = await yt.getBasicInfo(videoId);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    const streamUrl = await format?.decipher(yt.session.player) || format?.url;
    if (streamUrl) {
      console.log("Successfully resolved direct Innertube stream URL.");
      return streamUrl;
    }
  } catch (e) {
    console.warn("Direct Innertube resolution failed:", e);
  }

  // 2. Fallback to Piped API streams endpoint (highly optimized for streaming and ExoPlayer range requests)
  const PIPED_HOSTS = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.lvk.li",
    "https://api.piped.yt"
  ];
  for (const baseUrl of PIPED_HOSTS) {
    try {
      console.log(`[Downloader] Attempting Piped stream: ${baseUrl}/streams/${videoId}...`);
      const response = await fetchNative(`${baseUrl}/streams/${videoId}`);
      if (response.ok) {
        const data = await response.json();
        const streams = data.audioStreams || [];
        if (streams.length > 0) {
          // Find best stream (M4A or high bitrate)
          const bestStream = streams.find((s: any) => s.mimeType?.includes("audio/mp4")) || streams[0];
          if (bestStream && bestStream.url) {
            console.log(`[Downloader] Piped resolved stream successfully: ${bestStream.url}`);
            return bestStream.url;
          }
        } else {
          console.warn(`[Downloader] Piped stream returned empty audioStreams list for ${baseUrl}`);
        }
      } else {
        console.warn(`[Downloader] Piped endpoint ${baseUrl} returned non-ok status: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[Downloader] Piped endpoint ${baseUrl} failed:`, err);
    }
  }

  // 3. Fallback to Cobalt API as last resort (meant for single file downloads, rate-limits range requests)
  let cobaltEndpoints: string[] = [];
  try {
    cobaltEndpoints = await getHealthyCobaltHosts();
  } catch (err) {
    console.warn("Failed to get healthy Cobalt hosts, falling back:", err);
    cobaltEndpoints = [
      "https://api.qwkuns.me/",
      "https://cobaltapi.squair.xyz/",
      "https://rue-cobalt.xenon.zone/",
      "https://apicobalt.mgytr.top/",
      "https://fox.kittycat.boo/",
      "https://api.cobalt.tools/"
    ];
  }

  for (const endpoint of cobaltEndpoints) {
    try {
      console.log(`[Downloader] Attempting stream resolution via Cobalt: ${endpoint}...`);
      let responseData: any = null;

      if (false) {
        // Disabled native capacitor branch for web
      } else {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'Origin': 'https://cobalt.tools',
              'Referer': 'https://cobalt.tools/'
            },
            body: JSON.stringify({
              url: `https://www.youtube.com/watch?v=${videoId}`,
              downloadMode: 'audio',
              audioFormat: 'mp3'
            })
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            responseData = await response.json();
          }
        } catch (err) {
          clearTimeout(timeoutId);
          throw err;
        }
      }

      if (responseData && responseData.url) {
        console.log(`[Downloader] Cobalt resolved stream successfully: ${responseData.url}`);
        return responseData.url;
      }
    } catch (err) {
      console.warn(`[Downloader] Cobalt endpoint ${endpoint} failed:`, err);
    }
  }

  throw new Error("Failed to retrieve audio stream URL.");
}

export async function resolveTidalTrackById(trackId: string): Promise<Track | null> {
  try {
    const isNative = false;
    let url = `https://tidal.com/track/${trackId}`;
    if (!isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      url = `/api-tidal-track/track/${trackId}`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch Tidal page");
    const html = await res.text();

    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
    if (!titleMatch) throw new Error("Could not parse og:title from Tidal page");

    const fullTitle = titleMatch[1];
    const parts = fullTitle.split(" - ");
    let artist = "Unknown Artist";
    let title = fullTitle;

    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(" - ").trim();
    }

    const tracks = await searchTracks(`${artist} ${title}`);
    if (tracks.length > 0) {
      const exactMatch = tracks.find(t => t.id === trackId) || tracks[0];
      return exactMatch;
    }

    let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
    const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
    if (imageMatch) {
      coverUrl = imageMatch[1];
    }

    return {
      id: trackId,
      title,
      artist,
      thumbnail: coverUrl,
      audioUrl: "",
      duration: 180
    };
  } catch (err) {
    console.error("resolveTidalTrackById failed:", err);
    return null;
  }
}

const PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.private.coffee",
  "https://pipedapi.lvk.li",
  "https://api.piped.yt"
];

export async function searchPublicPlaylists(query: string): Promise<any[]> {
  if (!query.trim()) return [];
  for (const baseUrl of PIPED_HOSTS) {
    try {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=playlists`;
      const res = await fetchNative(searchUrl, {
        headers: {
          'Referer': 'https://piped.video/',
          'Origin': 'https://piped.video'
        }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items || [];
      if (Array.isArray(items) && items.length > 0) {
        const playlists = items
          .filter((item: any) => item.type === "playlist")
          .map((item: any) => {
            // URL can be "/playlist?list=ID" or "?list=ID&..."
            const playlistIdMatch = item.url?.match(/[?&]list=([^&]+)/);
            const playlistId = playlistIdMatch ? playlistIdMatch[1] : null;
            if (!playlistId) return null;
            return {
              playlist_id: playlistId,
              name: item.name || "YouTube Playlist",
              cover_url: item.thumbnail || "",
              tracks: [],
              is_youtube: true,
              videosCount: item.videos || 0,
              uploader: item.uploaderName || ""
            };
          })
          .filter(Boolean);
        if (playlists.length > 0) return playlists;
      }
    } catch (e) {
      console.warn(`Piped playlist search failed on ${baseUrl}:`, e);
    }
  }
  return [];
}

export async function getPublicPlaylistTracks(playlistId: string): Promise<Track[]> {
  // --- Primary: Innertube (same client used for audio, bypasses CORS) ---
  try {
    console.log(`[getPublicPlaylistTracks] Trying Innertube WEB client for playlist ${playlistId}...`);
    const yt = await getYoutubeWebClient();
    const playlist = await (yt as any).getPlaylist(playlistId);
    const items: any[] = playlist?.videos?.as?.() ?? playlist?.videos ?? [];
    
    if (items.length > 0) {
      console.log(`[getPublicPlaylistTracks] Innertube returned ${items.length} tracks`);
      return items
        .map((item: any) => {
          const id = item.id || item.video_id || "";
          if (!id) return null;
          const title =
            typeof item.title === "string" ? item.title :
            item.title?.text ?? item.title?.toString?.() ?? "Unknown Title";
          const artist =
            typeof item.author === "string" ? item.author :
            item.author?.name ?? item.author?.text ?? "Unknown Artist";
          const duration =
            typeof item.duration === "number" ? item.duration :
            item.duration?.seconds ?? item.duration?.text
              ? (() => {
                  const parts = (item.duration.text as string).split(":").map(Number);
                  return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
                })()
              : 180;
          const thumbnails: any[] =
            Array.isArray(item.thumbnails) ? item.thumbnails :
            item.thumbnail?.contents ?? item.thumbnail ?? [];
          const thumbnail =
            thumbnails.length > 0
              ? (thumbnails[thumbnails.length - 1]?.url ?? thumbnails[0]?.url ?? "")
              : "";
          return { id, title, artist, duration, thumbnail, audioUrl: "" };
        })
        .filter(Boolean) as Track[];
    }
  } catch (e) {
    console.warn("[getPublicPlaylistTracks] Innertube failed, trying Piped:", e);
  }

  // --- Fallback: Piped API ---
  const mapStream = (item: any): Track | null => {
    const videoIdMatch = (item.url || "").match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : (item.url || "").replace(/^\/watch\?v=/, "");
    if (!videoId) return null;
    return {
      id: videoId,
      title: item.title || "Unknown Title",
      artist: item.uploaderName || "Unknown Artist",
      duration: item.duration || 180,
      thumbnail: item.thumbnail || "",
      audioUrl: ""
    };
  };

  for (const baseUrl of PIPED_HOSTS) {
    try {
      const playlistUrl = `${baseUrl}/playlists/${playlistId}`;
      console.log(`[getPublicPlaylistTracks] Trying Piped: ${playlistUrl}`);
      const res = await fetchWithTimeout(playlistUrl, {
        headers: { 'Referer': 'https://piped.video/', 'Origin': 'https://piped.video' }
      }, 12000);
      if (!res.ok) {
        console.warn(`[getPublicPlaylistTracks] Piped ${baseUrl} returned ${res.status}`);
        continue;
      }
      const data = await res.json();
      console.log(`[getPublicPlaylistTracks] Piped ${baseUrl} response keys:`, Object.keys(data));
      const relatedStreams: any[] = data.relatedStreams || data.videos || data.tracks || [];
      if (relatedStreams.length === 0) {
        console.warn(`[getPublicPlaylistTracks] Piped ${baseUrl} returned empty streams`);
        continue;
      }
      const tracks = relatedStreams.map(mapStream).filter(Boolean) as Track[];
      console.log(`[getPublicPlaylistTracks] Piped returned ${tracks.length} tracks`);
      return tracks;
    } catch (e) {
      console.warn(`[getPublicPlaylistTracks] Piped ${baseUrl} error:`, e);
    }
  }

  console.error(`[getPublicPlaylistTracks] All sources failed for playlist ${playlistId}`);
  return [];
}

export type LyricsProvider = "spicylyrics" | "lrcred" | "lrclib";

export interface LyricsData {
  syncedLyrics?: string;
  rawLrc?: string;
  plainLyrics?: string;
  provider?: LyricsProvider;
  hasWordSync?: boolean;
}

const lyricsCache = new Map<string, LyricsData>();
let lrclibCooldownUntil = 0;

export const clearLyricsCache = () => {
  lyricsCache.clear();
};

const SPICY_LYRICS_API_KEY = "sl_sk_LgwL03MKCVLiCTqti1X50IjRsI2CATjC_U7wOT4NoKk";

function formatLrcTag(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
}

function formatWordTag(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `<${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}>`;
}

/**
 * Fetches word-by-word / line synced lyrics from Spicy Lyrics API
 */
async function fetchSpicyLyrics(track: Track, trackTitle: string): Promise<LyricsData | null> {
  const headers = {
    'Authorization': `Bearer ${SPICY_LYRICS_API_KEY}`,
    'Accept': 'application/json'
  };

  try {
    // 1. Search matching track ID on Spicy Lyrics
    let spotifyTrackId: string | null = null;

    // Check if track.id itself is a 22-char Spotify ID
    if (/^[a-zA-Z0-9]{22}$/.test(track.id)) {
      spotifyTrackId = track.id;
    } else if (track.spotifyUrl) {
      const match = track.spotifyUrl.match(/track\/([a-zA-Z0-9]{22})/i);
      if (match) spotifyTrackId = match[1];
    }

    if (!spotifyTrackId) {
      let searchUrl = `https://api.spicylyrics.org/v1/tracks/search?title=${encodeURIComponent(trackTitle)}&artist=${encodeURIComponent(track.artist)}`;
      if (track.duration && track.duration > 0) {
        searchUrl += `&duration=${Math.round(track.duration)}`;
      }

      const searchRes = await fetch(resolveUrl(searchUrl), { headers });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results: any[] = searchData.Body?.results || [];
        if (results.length > 0) {
          spotifyTrackId = results[0]?.id || null;
        }
      }
    }

    if (!spotifyTrackId) return null;

    // 2. Fetch lyrics by track ID
    const lyricsUrl = resolveUrl(`https://api.spicylyrics.org/v1/lyrics/${spotifyTrackId}`);
    const lyricsRes = await fetch(lyricsUrl, { headers });
    if (!lyricsRes.ok) return null;

    const lyricsData = await lyricsRes.json();
    const body = lyricsData.Body;
    if (!body || !Array.isArray(body.Content) || body.Content.length === 0) {
      return null;
    }

    const content: any[] = body.Content;
    const rawLrcLines: string[] = [];
    const plainLines: string[] = [];
    let hasWordSync = false;

    for (const item of content) {
      if (item.Type === "Vocal") {
        if (item.Lead && Array.isArray(item.Lead.Syllables) && item.Lead.Syllables.length > 0) {
          hasWordSync = true;
          const lineStartSec = item.Lead.StartTime ?? 0;
          const lineTag = formatLrcTag(lineStartSec);

          // Group syllables into full words so spaces between words are properly preserved
          const words: { text: string; startTime: number; endTime: number }[] = [];
          let curWord: { text: string; startTime: number; endTime: number } | null = null;

          for (const s of item.Lead.Syllables) {
            if (!curWord) {
              curWord = {
                text: s.Text,
                startTime: s.StartTime ?? 0,
                endTime: s.EndTime ?? 0
              };
            } else {
              curWord.text += s.Text;
              curWord.endTime = s.EndTime ?? curWord.endTime;
            }
            if (!s.IsPartOfWord) {
              words.push(curWord);
              curWord = null;
            }
          }
          if (curWord) words.push(curWord);

          const wordTags = words.map(w => `${formatWordTag(w.startTime)}${w.text}`).join(" ");
          rawLrcLines.push(`${lineTag} ${wordTags}`);
          plainLines.push(words.map(w => w.text).join(" "));
        } else if (item.Text) {
          const lineStartSec = item.StartTime ?? 0;
          const lineTag = formatLrcTag(lineStartSec);
          rawLrcLines.push(`${lineTag} ${item.Text}`);
          plainLines.push(item.Text);
        }
      }
    }

    if (rawLrcLines.length === 0) return null;

    const rawLrc = rawLrcLines.join("\n");
    const cleanedSynced = rawLrc
      .split("\n")
      .map(line => line.replace(/<\d+:\d+(?:\.\d+)?>/g, " ").replace(/\s{2,}/g, " ").trim())
      .join("\n");

    return {
      syncedLyrics: cleanedSynced,
      rawLrc,
      plainLyrics: plainLines.join("\n").trim() || undefined,
      provider: "spicylyrics",
      hasWordSync
    };
  } catch (err) {
    console.warn("[SpicyLyrics] Failed to fetch lyrics:", err);
    return null;
  }
}

async function fetchLrcRedLyrics(track: Track, trackTitle: string): Promise<LyricsData | null> {
  const query = `${track.artist} ${trackTitle}`.trim();
  const headers = {
    'User-Agent': 'ibramusic/1.1.7 (https://github.com/ibramusic; contact@ibramusic.local)',
    'X-Client-ID': 'ibramusic/1.1.7'
  };

  try {
    const searchUrl = `https://lrc.red/search.json?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const hits: any[] = data?.hits || [];
    if (!Array.isArray(hits) || hits.length === 0) return null;

    // Pick best hit matching artist, title, and duration
    const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetTitleNorm = norm(trackTitle);
    const targetArtistNorm = norm(track.artist);

    const scoredHits = hits.map((hit: any) => {
      let score = 0;
      const hitTitleNorm = norm(hit.title || "");
      const hitArtistNorm = norm(hit.artist || "");

      if (hitTitleNorm === targetTitleNorm) score += 50;
      else if (hitTitleNorm.includes(targetTitleNorm) || targetTitleNorm.includes(hitTitleNorm)) score += 20;

      if (hitArtistNorm === targetArtistNorm) score += 40;
      else if (hitArtistNorm.includes(targetArtistNorm) || targetArtistNorm.includes(hitArtistNorm)) score += 15;

      if (track.duration && hit.duration) {
        const diff = Math.abs(hit.duration - track.duration);
        if (diff <= 3) score += 30;
        else if (diff <= 8) score += 15;
        else if (diff > 30) score -= 40;
      }

      return { hit, score };
    });

    scoredHits.sort((a, b) => b.score - a.score);
    const topHits = scoredHits.slice(0, 4).map(s => s.hit);
    if (topHits.length === 0) return null;

    let rawLrc = "";

    // Iterate through top hits to find one with word-level sync (<mm:ss.xx>)
    for (const hit of topHits) {
      if (!hit || !hit.isrc) continue;
      const lrcUrl = `https://lrc.red/s/${hit.isrc}.lrc`;
      try {
        const lrcRes = await fetch(lrcUrl, { headers });
        if (lrcRes.ok) {
          const text = await lrcRes.text();
          if (text && text.trim()) {
            rawLrc = text;
            if (text.includes("<")) {
              // Priority: found word-by-word synced LRC!
              break;
            }
          }
        }
      } catch {}
    }

    if (!rawLrc || !rawLrc.trim()) return null;

    // Clean word-level timestamp tags <mm:ss.xx> while preserving line timestamps [mm:ss.xx]
    // Crucial: replace tags with a space " " to prevent words from being glued together
    const cleanedSynced = rawLrc
      .split("\n")
      .map(line => line.replace(/<\d+:\d+(?:\.\d+)?>/g, " ").replace(/\s{2,}/g, " ").trim())
      .join("\n");

    // Generate plain lyrics by removing timestamps and header metadata
    const plain = cleanedSynced
      .replace(/\[(ti|ar|al|length|by|offset):.*?\]/gi, "")
      .replace(/\[\d+:\d+(?:\.\d+)?\]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    return {
      syncedLyrics: cleanedSynced,
      rawLrc,
      plainLyrics: plain || undefined,
      provider: "lrcred",
      hasWordSync: rawLrc.includes("<")
    };
  } catch (err) {
    console.warn("[lrc.red] Failed to fetch lyrics:", err);
    return null;
  }
}

async function fetchLrclibLyrics(track: Track, trackTitle: string): Promise<LyricsData | null> {
  const headers = {
    'Lrclib-Client': 'ibramusic (https://github.com/ibramusic)',
    'X-User-Agent': 'ibramusic v1.1.7'
  };

  const handleLrclibResponse = async (res: Response): Promise<{ data?: LyricsData; stopWaterfall?: boolean }> => {
    if (res.ok) {
      try {
        const json = await res.json();
        if (json && (json.syncedLyrics || json.plainLyrics)) {
          return { data: { syncedLyrics: json.syncedLyrics || undefined, rawLrc: json.syncedLyrics || undefined, plainLyrics: json.plainLyrics || undefined, provider: "lrclib", hasWordSync: false } };
        }
      } catch {
        // Ignore JSON parse errors
      }
    } else if (res.status === 503 || res.status === 429) {
      console.warn(`[LRCLIB] ${res.status === 503 ? 'Server busy (503)' : 'Rate limited (429)'}. Cooling down for 20s.`);
      lrclibCooldownUntil = Date.now() + 20000;
      return { stopWaterfall: true };
    }
    return {};
  };

  try {
    // 1. Try with duration (most accurate)
    if (track.duration && track.duration > 0) {
      const urlWithDuration = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(track.artist)}&duration=${Math.floor(track.duration)}`;
      try {
        const res = await fetch(urlWithDuration, { headers });
        const outcome = await handleLrclibResponse(res);
        if (outcome.data) return outcome.data;
        if (outcome.stopWaterfall) return null;
      } catch {}
    }

    // 2. Try without duration (lenient match)
    if (Date.now() >= lrclibCooldownUntil) {
      const urlWithoutDuration = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(track.artist)}`;
      try {
        const res = await fetch(urlWithoutDuration, { headers });
        const outcome = await handleLrclibResponse(res);
        if (outcome.data) return outcome.data;
        if (outcome.stopWaterfall) return null;
      } catch {}
    }

    // 3. Try search fallback (only if not cooling down)
    if (Date.now() >= lrclibCooldownUntil) {
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(track.artist + " " + trackTitle)}`;
      try {
        const res = await fetch(searchUrl, { headers });
        if (res.ok) {
          const results = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const bestMatch = results.find((r: any) => r.syncedLyrics) || results[0];
            return {
              syncedLyrics: bestMatch.syncedLyrics || undefined,
              rawLrc: bestMatch.syncedLyrics || undefined,
              plainLyrics: bestMatch.plainLyrics || undefined,
              provider: "lrclib",
              hasWordSync: false
            };
          }
        } else if (res.status === 503 || res.status === 429) {
          lrclibCooldownUntil = Date.now() + 20000;
        }
      } catch {}
    }
  } catch (err) {
    console.warn("[LRCLIB] Failed to fetch lyrics:", err);
  }

  return null;
}

export async function getLyricsForTrack(
  track: Track,
  preferredProvider?: LyricsProvider,
  preferWordSync?: boolean
): Promise<LyricsData> {
  if (!track || !track.title) {
    return { syncedLyrics: undefined, plainLyrics: undefined };
  }

  let wantWordSync = preferWordSync;
  if (wantWordSync === undefined && typeof window !== "undefined") {
    try {
      const savedWordSync = localStorage.getItem("ibrastream_lyrics_word_by_word");
      wantWordSync = savedWordSync !== "false";
    } catch {}
  }

  let provider: LyricsProvider = preferredProvider || "spicylyrics";
  if (!preferredProvider && typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem("ibrastream_lyrics_provider");
      if (saved === "spicylyrics" || saved === "lrcred" || saved === "lrclib") {
        provider = saved;
      }
    } catch {}
  }

  const cacheKey = `${provider}:${wantWordSync ? "ws:" : ""}${track.id || `${track.artist}-${track.title}`}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  const trackTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .replace(/\(deluxe.*?\)/i, "")
    .replace(/\(remix.*?\)/i, "")
    .trim();

  let result: LyricsData | null = null;

  if (provider === "spicylyrics") {
    // Primary: Spicy Lyrics -> Fallback 1: lrc.red -> Fallback 2: lrclib
    result = await fetchSpicyLyrics(track, trackTitle);
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchLrcRedLyrics(track, trackTitle);
    }
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchLrclibLyrics(track, trackTitle);
    }
  } else if (provider === "lrcred") {
    // Primary: lrc.red -> Fallback 1: Spicy Lyrics -> Fallback 2: lrclib
    result = await fetchLrcRedLyrics(track, trackTitle);
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchSpicyLyrics(track, trackTitle);
    }
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchLrclibLyrics(track, trackTitle);
    }
  } else {
    // Primary: lrclib -> Fallback 1: Spicy Lyrics -> Fallback 2: lrc.red
    result = await fetchLrclibLyrics(track, trackTitle);
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchSpicyLyrics(track, trackTitle);
    }
    if (!result || (!result.syncedLyrics && !result.plainLyrics)) {
      result = await fetchLrcRedLyrics(track, trackTitle);
    }
  }

  const finalData: LyricsData = result && (result.syncedLyrics || result.plainLyrics)
    ? result
    : { syncedLyrics: undefined, plainLyrics: undefined, provider };

  lyricsCache.set(cacheKey, finalData);
  return finalData;
}
