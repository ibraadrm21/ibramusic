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
const MONOCHROME_HOSTS = [
  "https://eu-central.monochrome.tf",
  "https://api.monochrome.tf",
  "https://hifi.geeked.wtf"
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
  
  // Primary Piped instances (which support filter=music_songs for YouTube Music matching)
  const PIPED_HOSTS = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.moe.xyz",
    "https://pipedapi.adminforge.de"
  ];

  // Try Piped instances first (YouTube Music song filter)
  for (const baseUrl of PIPED_HOSTS) {
    try {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}&filter=music_songs`;
      const searchResponse = await fetch(searchUrl, { 
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
        // Find stream item
        const streamItem = items.find((item: any) => item.type === "stream" || item.url);
        if (streamItem) {
          const videoIdMatch = streamItem.url?.match(/[?&]v=([^&]+)/) || streamItem.url?.match(/v=([^&]+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : streamItem.url?.replace("/watch?v=", "");
          if (videoId) {
            console.log(`Resolved videoId via Piped YTM ${baseUrl}: ${streamItem.title} (${videoId})`);
            return videoId;
          }
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      console.warn(`Piped host ${baseUrl} failed:`, e);
    }
  }

  // Fallback to Invidious search
  const INVIDIOUS_HOSTS = [
    "https://inv.thepixora.com",
    "https://invidious.privacydev.net"
  ];

  for (const baseUrl of INVIDIOUS_HOSTS) {
    try {
      const searchUrl = `${baseUrl}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const searchResponse = await fetch(searchUrl, { signal });
      if (!searchResponse.ok) continue;
      const searchData = await searchResponse.json();
      if (Array.isArray(searchData) && searchData.length > 0) {
        // Prioritize official track/audio over live performance or remixes
        const video = searchData.find((item: any) => 
          item.title?.toLowerCase().includes("official") || 
          item.title?.toLowerCase().includes("audio") ||
          item.title?.toLowerCase().includes("music video")
        ) || searchData[0];
        
        if (video.videoId) {
          console.log(`Resolved videoId via Invidious fallback ${baseUrl}: ${video.title} (${video.videoId})`);
          return video.videoId;
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw e;
      }
      console.warn(`Invidious host ${baseUrl} failed to search:`, e);
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

export async function getSpotifyArtistStats(artistName: string): Promise<SpotifyArtistStats | null> {
  const apiKey = "8f40ce19b2msh37d06bd15f363b3p1602fbjsnef935dd66d83";
  const apiHost = "spotify-statistics-and-stream-count.p.rapidapi.com";
  
  try {
    const searchRes = await fetch(`https://spotify-statistics-and-stream-count.p.rapidapi.com/search?q=${encodeURIComponent(artistName)}`, {
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost
      }
    });
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
    if (!detailRes.ok) return null;
    const detailData = await detailRes.json();
    
    return {
      monthlyListeners: detailData.monthlyListeners,
      biography: detailData.biography,
      topTracks: detailData.topTracks || []
    };
  } catch (err) {
    console.warn("Failed to fetch Spotify artist stats:", err);
    return null;
  }
}

export async function getSpotifyAlbumStats(albumTitle: string, artistName: string): Promise<any | null> {
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
    return detailRes.ok ? await detailRes.json() : null;
  } catch (err) {
    console.warn("Failed to fetch Spotify album stats:", err);
    return null;
  }
}

