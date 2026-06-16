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

export async function getYouTubeVideoId(track: Track, signal?: AbortSignal): Promise<string> {
  // Clean query to remove featuring suffixes and parentheses
  const cleanTitle = track.title
    .replace(/\(feat\..*?\)/i, "")
    .replace(/\[feat\..*?\]/i, "")
    .replace(/\(with.*?\)/i, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  const query = `${track.artist} ${cleanTitle}`;
  
  try {
    console.log(`Searching video ID for "${query}" via Innertube Music...`);
    const yt = await getYoutubeClient();
    const search = await yt.music.search(query, { type: 'song' });
    const songs = search.songs?.contents || [];
    if (songs.length > 0 && songs[0].id) {
      console.log(`Resolved videoId via Innertube Music: ${songs[0].title} (${songs[0].id})`);
      return songs[0].id;
    }
  } catch (e) {
    console.warn("Innertube music search failed, trying general search:", e);
  }

  try {
    console.log(`Searching video ID for "${query}" via Innertube general search...`);
    const yt = await getYoutubeClient();
    const search = await yt.search(query, { type: 'video' });
    const videos = search.videos || [];
    if (videos.length > 0 && (videos[0] as any).id) {
      const videoId = (videos[0] as any).id;
      console.log(`Resolved videoId via Innertube general: ${(videos[0] as any).title} (${videoId})`);
      return videoId;
    }
  } catch (e) {
    console.warn("Innertube general search failed:", e);
  }

  // Last-resort fallback to public Piped instances if Innertube search fails
  const PIPED_HOSTS = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.private.coffee",
    "https://pipedapi.lvk.li",
    "https://api.piped.yt"
  ];

  for (const baseUrl of PIPED_HOSTS) {
    try {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const searchResponse = await fetchWithTimeout(searchUrl, { 
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
            console.log(`Resolved videoId via Piped fallback ${baseUrl}: ${streamItem.title} (${videoId})`);
            return videoId;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      console.warn(`Piped fallback ${baseUrl} failed:`, e);
    }
  }

  throw new Error("Failed to retrieve video ID for this track.");
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

export const getYoutubeClient = (): Promise<Innertube> => {
  if (!youtubeClientPromise) {
    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : (input && (input as any).href) ? (input as any).href : String(input));
      
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
      let credentials = undefined;
      let mode = undefined;

      if (input instanceof Request) {
        method = input.method;
        credentials = input.credentials;
        mode = input.mode;
        for (const [key, val] of input.headers.entries()) {
          headers[key] = val;
        }
        if (method !== "GET" && method !== "HEAD") {
          body = await input.clone().text();
        }
      }

      if (init) {
        if (init.method) method = init.method;
        if (init.credentials) credentials = init.credentials;
        if (init.mode) mode = init.mode;

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
        body,
        credentials,
        mode
      } as any);
    };

    youtubeClientPromise = Innertube.create({
      client_type: 'ANDROID_VR' as any,
      fetch: customFetch
    });
  }
  return youtubeClientPromise;
};

export async function getYouTubeAudioStream(videoId: string): Promise<string> {
  try {
    console.log(`Resolving direct audio stream for videoId: ${videoId} via Innertube...`);
    const yt = await getYoutubeClient();
    const info = await yt.getBasicInfo(videoId);
    
    const format = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!format) {
      throw new Error("No suitable audio format found");
    }
    
    let url = await format.decipher(yt.session.player);
    if (!url) {
      throw new Error("Failed to decipher stream URL");
    }
    
    // In local browser development, rewrite googlevideo URLs to route through Vite proxy to avoid CORS/403 Forbidden
    const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
    if (!isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '') {
      const match = url.match(/https:\/\/([^.]+)\.googlevideo\.com\/(.+)/);
      if (match) {
        url = `/googlevideo/${match[1]}/${match[2]}`;
      }
    }
    
    console.log(`Successfully deciphered audio stream for ${videoId}`);
    return url;
  } catch (e: any) {
    console.error(`Failed to get stream from youtubei.js:`, e);
    throw e;
  }
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


