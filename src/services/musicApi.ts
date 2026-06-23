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

export async function searchTracks(query: string): Promise<Track[]> {
  if (!query.trim()) return MOCK_LIBRARY;

  // Regex to match YouTube video URLs (standard, mobile, shorts, y2u.be, etc.)
  const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
  const ytMatch = query.match(ytRegex);
  if (ytMatch) {
    const videoId = ytMatch[1];
    try {
      console.log(`Resolving direct YouTube link for videoId: ${videoId}`);
      const yt = await getYoutubeClient();
      const info = await yt.getBasicInfo(videoId);
      
      const title = info.basic_info.title || "YouTube Track";
      const artist = info.basic_info.author || "YouTube Channel";
      const duration = info.basic_info.duration || 180;
      const thumbnail = info.basic_info.thumbnail?.[0]?.url || "";
      
      const track: Track = {
        id: `yt-${videoId}`,
        title,
        artist,
        duration,
        thumbnail,
        audioUrl: "",
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`
      };
      return [track];
    } catch (err) {
      console.error("Failed to resolve direct YouTube search:", err);
    }
  }

  let retries = 3;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?s=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl);
      if (!response.ok) {
        throw new Error(`Monochrome search failed: ${response.status}`);
      }
      const data = await response.json();
      const items = data.data?.items || [];
      
      return items.map((item: any) => {
        // Upgrade cover UUID to TIDAL image URL
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
          audioUrl: "" // Resolved dynamically during playback
        };
      });
    } catch (e) {
      console.error(`Error with Monochrome host ${baseUrl}, trying fallback...`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}


export async function searchAlbums(query: string): Promise<Album[]> {
  if (!query.trim()) return [];
  let retries = 3;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?al=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl);
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
      console.error(`Error with Monochrome host ${baseUrl}, trying fallback...`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function searchArtists(query: string): Promise<Artist[]> {
  if (!query.trim()) return [];
  let retries = 3;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/search/?a=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl);
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

      // Try fetching Spotify images if authenticated
      const token = localStorage.getItem("ibrastream_spotify_token");
      if (token && mapped.length > 0) {
        try {
          const updated = await Promise.all(mapped.map(async (artist: Artist) => {
            try {
              const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`, {
                headers: { "Authorization": `Bearer ${token}` }
              });
              if (res.status === 401) {
                localStorage.removeItem("ibrastream_spotify_token");
                return artist;
              }
              if (res.ok) {
                const sData = await res.json();
                const spotifyArtist = sData.artists?.items?.[0];
                if (spotifyArtist) {
                  return {
                    ...artist,
                    id: spotifyArtist.id, // Spotify ID
                    thumbnail: spotifyArtist.images && spotifyArtist.images.length > 0 ? spotifyArtist.images[0].url : artist.thumbnail
                  };
                }
              }
            } catch (err) {
              console.warn("Failed to fetch Spotify image for artist:", artist.name, err);
            }
            return artist;
          }));
          return updated;
        } catch (e) {
          console.warn("Error resolving Spotify artist pictures:", e);
        }
      }

      return mapped;
    } catch (e) {
      console.error(`Error with Monochrome host ${baseUrl}, trying fallback...`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function getAlbumTracks(albumId: string): Promise<Track[]> {
  let retries = 3;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/album/?id=${albumId}`;
      const response = await fetch(searchUrl);
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
      console.error(`Error with Monochrome host ${baseUrl}, trying fallback...`, e);
      switchToNextInstance();
      retries--;
    }
  }
  return [];
}

export async function getArtistTracks(artistId: string): Promise<Track[]> {
  let retries = 3;
  while (retries > 0) {
    const baseUrl = getApiBaseUrl();
    try {
      const searchUrl = `${baseUrl}/artist/?f=${artistId}`;
      const response = await fetch(searchUrl);
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
      console.error(`Error with Monochrome host ${baseUrl}, trying fallback...`, e);
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

const resolveUrl = (url: string): string => {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  if (!isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '') {
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

const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs: number = 8000) => {
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

const sharedCustomFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : (input && (input as any).href) ? (input as any).href : String(input));
  
  // 1. Resolve relative URLs (e.g. /youtubei/v1/player) or localhost-resolved URLs back to absolute youtube.com URLs
  if (url.startsWith("http://localhost") || url.startsWith("https://localhost") || url.startsWith("http://127.0.0.1") || url.startsWith("https://127.0.0.1")) {
    url = url.replace(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/, "https://www.youtube.com");
  } else if (url.startsWith("/")) {
    url = `https://www.youtube.com${url}`;
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
    // 2. Parse JSON bodies case-insensitively so CapacitorHttp can serialize them natively
    let dataPayload = body;
    const getHeader = (headersMap: any, name: string): string | undefined => {
      if (!headersMap) return undefined;
      const lowerName = name.toLowerCase();
      for (const key of Object.keys(headersMap)) {
        if (key.toLowerCase() === lowerName) {
          return headersMap[key];
        }
      }
      return undefined;
    };
    const contentType = getHeader(headers, 'content-type');
    if (typeof body === 'string' && contentType?.includes('application/json')) {
      try {
        dataPayload = JSON.parse(body);
      } catch (e) {}
    }

    // Set correct User-Agent matching the request's target client type to prevent 404/403 errors on YouTube
    if (url.includes("youtubei.googleapis.com") || url.includes("youtube.com")) {
      const isIOSClient = (typeof body === 'string' && body.includes('"clientName":"IOS"')) || 
                          (dataPayload && dataPayload.context && dataPayload.context.client && dataPayload.context.client.clientName === 'IOS');
      if (isIOSClient) {
        headers["User-Agent"] = "com.google.ios.youtube/20.11.6 (iPhone10,4; U; CPU iOS 16_7_7 like Mac OS X)";
      } else {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      }
    }

    const { CapacitorHttp } = await import('@capacitor/core');
    const response = await CapacitorHttp.request({
      url,
      method,
      headers,
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

    // Mock the read-only response.url property so library error handlers print the failing URL
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
      client_type: 'IOS' as any,
      fetch: sharedCustomFetch
    });
  }
  return youtubeClientPromise;
};

// Separate WEB client for playlist browsing (ANDROID_VR does not support playlist page)
const getYoutubeWebClient = (): Promise<Innertube> => {
  if (!youtubeWebClientPromise) {
    youtubeWebClientPromise = Innertube.create({ fetch: sharedCustomFetch });
  }
  return youtubeWebClientPromise;
};

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



// Helper to perform native-first requests to bypass CORS and auto-patching issues on Android
export async function fetchNative(url: string, options: any = {}) {
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

export async function getYouTubeVideoId(track: Track, signal?: AbortSignal): Promise<string> {
  if (track.id.startsWith("yt-")) {
    return track.id.substring(3);
  }
  const lowercaseTitle = track.title.toLowerCase();
  const lowercaseArtist = track.artist.toLowerCase();
  if (
    (lowercaseTitle.includes("soleao") || lowercaseTitle.includes("soleado")) &&
    lowercaseArtist.includes("myke towers")
  ) {
    console.log(`[Override] Returning correct videoId JgqsAvvwZAQ for Myke Towers - Soleao`);
    return "JgqsAvvwZAQ";
  }
  if (
    lowercaseTitle.includes("negocio") &&
    lowercaseArtist.includes("atb norte")
  ) {
    console.log(`[Override] Returning correct videoId 9RNoiWDlD_U for ATB NORTE - Negocio`);
    return "9RNoiWDlD_U";
  }
  
  const cleanTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  const query = `${track.artist} ${cleanTitle}`;

  // Robust fallback to public Piped API search
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

export async function getYouTubeAudioStream(videoId: string): Promise<string> {
  // 1. Try resolving direct YouTube stream via Innertube first
  try {
    console.log("Resolving direct YouTube stream URL via Innertube...");
    const yt = await getYoutubeClient();
    const info = await yt.getInfo(videoId);
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    const streamUrl = format?.decipher((yt.session as any).actions?.session?.signature_timestamp) || format?.url;
    if (streamUrl) {
      console.log("Successfully resolved direct Innertube stream URL.");
      return streamUrl;
    }
  } catch (e) {
    console.warn("Direct Innertube resolution failed:", e);
  }

  // 2. Fallback to Cobalt API which gets the stream via direct YouTube URL
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
          connectTimeout: 3000,
          readTimeout: 3000,
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
        const timeoutId = setTimeout(() => controller.abort(), 3000);
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
        console.log(`[Downloader] Cobalt successfully resolved stream: ${responseData.url}`);
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
      const res = await fetchWithTimeout(searchUrl, {
        headers: {
          'Referer': 'https://piped.video/',
          'Origin': 'https://piped.video'
        }
      }, 10000);
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


