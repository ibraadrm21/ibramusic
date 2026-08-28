import { Innertube } from 'youtubei.js'; // Used for Android stream fallback
import { Capacitor } from '@capacitor/core';

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
}

export interface Artist {
  id: string;
  name: string;
  thumbnail: string;
  popularity?: number;
  description?: string;
  monthlyListeners?: number;
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
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  if (!isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '') {
    if (url.startsWith("https://api.deezer.com")) {
      return url.replace("https://api.deezer.com", "/api-deezer");
    }
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
  
  // 1. Resolve relative URLs (e.g. /youtubei/v1/player) or localhost-resolved URLs back to absolute youtube.com/googleapis URLs
  if (url.startsWith("http://localhost") || url.startsWith("https://localhost") || url.startsWith("http://127.0.0.1") || url.startsWith("https://127.0.0.1")) {
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

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
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

  if (isNative) {
    const normalizedHeaders: Record<string, string> = {};
    if (headers) {
      for (const [key, val] of Object.entries(headers)) {
        normalizedHeaders[key.toLowerCase()] = val;
      }
    }

    let dataPayload = body;
    const contentType = normalizedHeaders['content-type'];
    if (typeof body === 'string' && contentType?.includes('application/json')) {
      try {
        dataPayload = JSON.parse(body);
      } catch (e) {}
    }

    if (url.includes("youtubei.googleapis.com") || url.includes("youtube.com")) {
      const isIOSClient = (typeof body === 'string' && body.includes('"clientName":"IOS"')) || 
                          (dataPayload && dataPayload.context && dataPayload.context.client && dataPayload.context.client.clientName === 'IOS');
      const isAndroidMusic = (typeof body === 'string' && body.includes('"clientName":"ANDROID_MUSIC"')) || 
                             (dataPayload && dataPayload.context && dataPayload.context.client && dataPayload.context.client.clientName === 'ANDROID_MUSIC');
      if (isIOSClient) {
        normalizedHeaders["user-agent"] = "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)";
      } else if (isAndroidMusic) {
        normalizedHeaders["user-agent"] = "com.google.android.apps.youtube.music/7.02.52 (Linux; U; Android 12L; Build/SQ3A.220605.009.A1) gzip";
      } else {
        normalizedHeaders["user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      }
    }

    const { CapacitorHttp } = await import('@capacitor/core');
    const response = await CapacitorHttp.request({
      url,
      method,
      headers: normalizedHeaders,
      data: dataPayload,
      responseType: 'text'
    });

    const responseHeaders = new Headers();
    if (response.headers) {
      for (const [key, val] of Object.entries(response.headers)) {
        responseHeaders.set(key, val as string);
      }
    }

    const responseInstance = new Response(
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      {
        status: response.status,
        headers: responseHeaders
      }
    );

    Object.defineProperty(responseInstance, 'url', {
      value: url,
      writable: false,
      configurable: true,
      enumerable: true
    });

    return responseInstance;
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

export const getYoutubeClient = (): Promise<Innertube> => {
  if (!youtubeClientPromise) {
    youtubeClientPromise = Innertube.create({
      fetch: sharedCustomFetch
    });
  }
  return youtubeClientPromise;
};

export const getYoutubeWebClient = (): Promise<Innertube> => {
  if (!youtubeWebClientPromise) {
    youtubeWebClientPromise = Innertube.create({ fetch: sharedCustomFetch });
  }
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

  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  if (isNative) {
    const { CapacitorHttp } = await import('@capacitor/core');
    const headers = options.headers || {};
    let dataPayload = options.body;
    if (typeof options.body === 'string') {
      try {
        dataPayload = JSON.parse(options.body);
      } catch (e) {}
    }
    const timeout = options.timeout || 4000;
    const response = await CapacitorHttp.request({
      url,
      method: options.method || 'GET',
      headers,
      data: dataPayload,
      responseType: 'text',
      connectTimeout: timeout,
      readTimeout: timeout
    });
    const responseHeaders = new Headers();
    if (response.headers) {
      for (const [key, val] of Object.entries(response.headers)) {
        responseHeaders.set(key, val as string);
      }
    }
    const res = new Response(
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
      {
        status: response.status,
        headers: responseHeaders
      }
    );
    Object.defineProperty(res, 'url', { value: url });
    return res;
  } else {
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
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
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
      return items.map((item: any) => {
        const coverUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || item.album?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
        return {
          id: String(item.id),
          title: item.title || item.title_short || "Unknown Title",
          artist: item.artist?.name || "Unknown Artist",
          artistId: String(item.artist?.id || ""),
          artists: item.artist ? [{ id: String(item.artist.id), name: item.artist.name }] : [],
          albumName: item.album?.title || "",
          albumId: String(item.album?.id || ""),
          duration: item.duration || 180,
          thumbnail: coverUrl,
          audioUrl: item.preview || ""
        };
      });
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
        return parsedTracks;
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
        return itunesData.results.map((r: any) => ({
          id: `itunes-${r.trackId}`,
          title: r.trackName || "Unknown Title",
          artist: r.artistName || "Unknown Artist",
          artistId: String(r.artistId || ""),
          albumName: r.collectionName || "",
          albumId: String(r.collectionId || ""),
          duration: Math.round((r.trackTimeMillis || 180000) / 1000),
          thumbnail: r.artworkUrl100 ? r.artworkUrl100.replace("100x100bb", "600x600bb") : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
          audioUrl: r.previewUrl || ""
        }));
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
      const items = albumData?.tracks?.data || [];
      const coverUrl = albumData?.cover_xl || albumData?.cover_big || albumData?.cover_medium || albumData?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
      const albumTitle = albumData?.title || "";
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) => ({
          id: String(item.id),
          title: item.title || item.title_short || "Unknown Title",
          artist: item.artist?.name || albumData?.artist?.name || "Unknown Artist",
          artistId: String(item.artist?.id || albumData?.artist?.id || ""),
          artists: item.artist ? [{ id: String(item.artist.id), name: item.artist.name }] : [],
          albumName: albumTitle,
          albumId: String(albumId),
          duration: item.duration || 180,
          thumbnail: coverUrl,
          audioUrl: item.preview || ""
        }));
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

export async function getArtistTracks(artistId: string): Promise<Track[]> {
  if (!artistId) return [];

  // Tier 1: If Deezer artist (numeric ID)
  if (/^\d+$/.test(artistId)) {
    try {
      const data = await fetchDeezerApi(`https://api.deezer.com/artist/${artistId}/top?limit=50`);
      const items = data?.data || [];
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) => {
          const coverUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || item.album?.cover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
          return {
            id: String(item.id),
            title: item.title || item.title_short || "Unknown Title",
            artist: item.artist?.name || "Unknown Artist",
            artistId: String(item.artist?.id || artistId),
            artists: item.artist ? [{ id: String(item.artist.id), name: item.artist.name }] : [],
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
  if (artistId.startsWith("UC")) {
    try {
      const yt = await getYoutubeClient();
      const artistData = await (yt.music as any).getArtist(artistId);
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

export async function getYouTubeVideoId(track: Track, signal?: AbortSignal): Promise<string> {
  if (track.id.startsWith("yt-")) {
    return track.id.substring(3);
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(track.id)) {
    return track.id;
  }
  if (track.youtubeUrl) {
    const ytUrlMatch = track.youtubeUrl.match(/(?:youtu\.be\/|(?:youtube\.com|music\.youtube\.com|m\.youtube\.com)\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/i) || track.youtubeUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
    if (ytUrlMatch) {
      return ytUrlMatch[1];
    }
  }
  
  const cleanTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  const query = `${track.artist} ${cleanTitle}`;

  // 1. Fast resolution via Innertube YouTube Music
  try {
    const yt = await getYoutubeClient();
    const searchRes = await yt.music.search(query, { type: 'song' });
    const firstSong = searchRes.songs?.contents?.[0];
    if (firstSong && firstSong.id) {
      console.log(`[getYouTubeVideoId] Resolved videoId via Innertube: ${firstSong.title} (${firstSong.id})`);
      return firstSong.id;
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
        const streamItem = items.find((item: any) => item.type === "stream" || item.url);
        if (streamItem) {
          const videoIdMatch = streamItem.url?.match(/[?&]v=([^&]+)/) || streamItem.url?.match(/v=([^&]+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : streamItem.url?.replace("/watch?v=", "");
          if (videoId) {
            console.log(`Resolved videoId via Piped API ${baseUrl}: ${streamItem.title} (${videoId})`);
            return videoId;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      console.warn(`Piped search fallback ${baseUrl} failed:`, e);
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
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  for (const endpoint of cobaltEndpoints) {
    try {
      console.log(`[Downloader] Attempting stream resolution via Cobalt: ${endpoint}...`);
      let responseData: any = null;

      if (isNative) {
        const { CapacitorHttp } = await import('@capacitor/core');
        const response = await CapacitorHttp.request({
          url: endpoint,
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://cobalt.tools',
            'Referer': 'https://cobalt.tools/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          connectTimeout: 6000,
          readTimeout: 6000,
          data: {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            downloadMode: 'audio',
            audioFormat: 'mp3'
          }
        });
        if (response.status === 200 && response.data) {
          responseData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        }
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
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
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

export interface LyricsData {
  syncedLyrics?: string;
  plainLyrics?: string;
}

const lyricsCache = new Map<string, LyricsData>();

export async function getLyricsForTrack(track: Track): Promise<LyricsData> {
  const cacheKey = track.id;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  const trackTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .trim();

  // 1. Try with duration (most accurate)
  const urlWithDuration = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(track.artist)}&duration=${Math.floor(track.duration)}`;
  try {
    const res = await fetch(urlWithDuration);
    if (res.ok) {
      const data = await res.json();
      const lyricsData = { syncedLyrics: data.syncedLyrics, plainLyrics: data.plainLyrics };
      lyricsCache.set(cacheKey, lyricsData);
      return lyricsData;
    }
  } catch (e) {
    console.warn("Failed exact duration lyrics match:", e);
  }

  // 2. Try without duration (lenient match)
  const urlWithoutDuration = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackTitle)}&artist_name=${encodeURIComponent(track.artist)}`;
  try {
    const res = await fetch(urlWithoutDuration);
    if (res.ok) {
      const data = await res.json();
      const lyricsData = { syncedLyrics: data.syncedLyrics, plainLyrics: data.plainLyrics };
      lyricsCache.set(cacheKey, lyricsData);
      return lyricsData;
    }
  } catch (e) {
    console.warn("Failed exact title/artist lyrics match:", e);
  }

  // 3. Try search fallback (most lenient)
  const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(track.artist + " " + trackTitle)}`;
  try {
    const res = await fetch(searchUrl);
    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const bestMatch = results.find(r => r.syncedLyrics) || results[0];
        const lyricsData = { syncedLyrics: bestMatch.syncedLyrics, plainLyrics: bestMatch.plainLyrics };
        lyricsCache.set(cacheKey, lyricsData);
        return lyricsData;
      }
    }
  } catch (e) {
    console.warn("Failed search query lyrics match:", e);
  }

  throw new Error("Lyrics not found");
}


