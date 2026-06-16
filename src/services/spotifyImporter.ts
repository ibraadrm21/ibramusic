import { searchTracks, type Track } from "./musicApi";

/**
 * Searches the internal Tidal proxy search engine for a close match by track and artist.
 */
async function findBestEngineMatch(title: string, artist: string): Promise<Track | null> {
  try {
    const cleanTitle = title
      .replace(/\(feat\..*?\)/i, "")
      .replace(/\[feat\..*?\]/i, "")
      .replace(/\(with.*?\)/i, "")
      .replace(/\(.*?\)/g, "")
      .trim();
    const query = `${artist} ${cleanTitle}`;
    const results = await searchTracks(query);
    if (results && results.length > 0) {
      // Find the first result where artist or title matches closely
      const best = results.find(r => {
        const titleMatch = r.title.toLowerCase().includes(cleanTitle.toLowerCase()) || 
                           cleanTitle.toLowerCase().includes(r.title.toLowerCase());
        const artistMatch = r.artist.toLowerCase().includes(artist.toLowerCase()) || 
                            artist.toLowerCase().includes(r.artist.toLowerCase());
        return titleMatch && artistMatch;
      });
      return best || results[0];
    }
  } catch (e) {
    console.warn("Failed to find engine match for:", title, e);
  }
  return null;
}

/**
 * Extracts Spotify tracks and playlist metadata from a public playlist link.
 */
export async function importSpotifyPlaylist(playlistUrl: string): Promise<{ name: string; tracks: Track[] }> {
  // 1. Parse playlist ID from URL
  const match = playlistUrl.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error("Invalid Spotify playlist URL. Please check the link format.");
  }
  const playlistId = match[1];
  const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;

  let html = "";
  let errorMsg = "";

  // Proxy 1: Codetabs proxy (very reliable for fetching raw text from target URL)
  try {
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(embedUrl)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      html = await res.text();
    } else {
      errorMsg = `Codetabs status: ${res.status}`;
    }
  } catch (e: any) {
    console.warn("Codetabs proxy failed, trying AllOrigins...", e);
    errorMsg = e.message;
  }

  // Proxy 2: AllOrigins JSON API (bypasses CORS restrictions by returning JSON contents)
  if (!html) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(embedUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && json.contents) {
          html = json.contents;
        }
      }
    } catch (e: any) {
      console.warn("AllOrigins proxy failed, trying corsproxy.io...", e);
      errorMsg = e.message;
    }
  }

  // Proxy 3: corsproxy.io (direct text fallback proxy)
  if (!html) {
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(embedUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        html = await res.text();
      }
    } catch (e: any) {
      console.warn("corsproxy.io failed...", e);
      errorMsg = e.message;
    }
  }

  if (!html) {
    throw new Error(`Failed to fetch Spotify playlist: ${errorMsg || "Connection blocked by CORS proxies"}`);
  }

  let parsed: { name: string; tracks: Track[] };

  try {
    // 3. Extract JSON state payload
    const jsonMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i) ||
                      html.match(/<script id="initial-state"[^>]*>([\s\S]*?)<\/script>/i) ||
                      html.match(/<script id="session"[^>]*>([\s\S]*?)<\/script>/i);

    if (!jsonMatch) {
      // Fallback: search for any script containing "Spotify" state keys
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
      let m;
      let stateJson = "";
      while ((m = scriptRegex.exec(html)) !== null) {
        const content = m[1];
        if (content.includes("initialState") || content.includes("resource") || content.includes("props")) {
          // Attempt to extract raw JSON block from JavaScript context if next data failed
          const jsonBlockMatch = content.match(/({[\s\S]*})/);
          if (jsonBlockMatch) {
            stateJson = jsonBlockMatch[1];
            break;
          }
        }
      }
      if (!stateJson) {
        throw new Error("Failed to parse Spotify embed state payload. The playlist might be private or restricted.");
      }
      parsed = parseSpotifyJson(JSON.parse(stateJson));
    } else {
      parsed = parseSpotifyJson(JSON.parse(jsonMatch[1]));
    }
  } catch (e: any) {
    console.error("Spotify import error:", e);
    throw new Error(e.message || "Failed to fetch Spotify playlist. Please ensure the playlist is public.");
  }

  // Resolve engine matches to get matching pictures, artists, albums, and likes in parallel (concurrency of 5)
  const matchedTracks: Track[] = [];
  const concurrencyLimit = 5;
  for (let i = 0; i < parsed.tracks.length; i += concurrencyLimit) {
    const chunk = parsed.tracks.slice(i, i + concurrencyLimit);
    const resolvedChunk = await Promise.all(chunk.map(async (track) => {
      const match = await findBestEngineMatch(track.title, track.artist);
      if (match) {
        return {
          ...match,
          id: track.id, // Preserve original Spotify ID
          // Keep Spotify preview audioUrl as fallback if the matched engine track lacks it
          audioUrl: match.audioUrl || track.audioUrl || "",
          dateAdded: track.dateAdded || new Date().toISOString()
        };
      }
      return track;
    }));
    matchedTracks.push(...resolvedChunk);
  }

  return { name: parsed.name, tracks: matchedTracks };
}

/**
 * Recursively inspects the parsed payload to extract playlist name and track objects.
 */
function parseSpotifyJson(obj: any): { name: string; tracks: Track[] } {
  let playlistName = "Imported Spotify Playlist";
  let rawTracks: any[] = [];
  let playlistCover = "";

  function traverse(current: any) {
    if (!current || typeof current !== "object") return;

    // Detect playlist metadata
    if ((current.type === "playlist" || current.type === "album") && typeof current.name === "string") {
      playlistName = current.name;
    }

    // Direct check for Spotify embed trackList structure
    if (current.trackList && Array.isArray(current.trackList)) {
      rawTracks = current.trackList;
      if (current.name || current.title) {
        playlistName = current.name || current.title;
      }
      if (current.coverArt?.sources?.[0]?.url) {
        playlistCover = current.coverArt.sources[0].url;
      }
    }

    // Detect array of tracks (legacy check)
    if (Array.isArray(current) && rawTracks.length === 0) {
      const isTrackArray = current.length > 0 && current.every(item => {
        const t = item?.track || item;
        return t && (typeof t.name === "string" || typeof t.title === "string") && 
               (Array.isArray(t.artists) || Array.isArray(t.artist) || typeof t.subtitle === "string");
      });

      if (isTrackArray && current.length > rawTracks.length) {
        rawTracks = current;
      }
    }

    for (const key in current) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        traverse(current[key]);
      }
    }
  }

  traverse(obj);

  // Map raw tracks to application Track schema
  const tracks: Track[] = rawTracks.map((item, idx) => {
    const t = item.track || item;
    
    // Support title (new) or name (old)
    const title = t.title || t.name || "Unknown Track";
    
    // Support subtitle (new) or artists/artist (old)
    let artistName = "Unknown Artist";
    if (typeof t.subtitle === "string") {
      artistName = t.subtitle;
    } else if (Array.isArray(t.artists)) {
      artistName = t.artists.map((a: any) => a.name).join(", ");
    } else if (t.artist?.name) {
      artistName = t.artist.name;
    }

    // Parse ID from URI or use id
    let id = t.id || `spotify-${idx}-${Date.now()}`;
    if (t.uri && typeof t.uri === "string") {
      const parts = t.uri.split(":");
      if (parts.length > 0) {
        id = parts[parts.length - 1];
      }
    }

    const artistId = Array.isArray(t.artists) && t.artists[0] ? String(t.artists[0].id || "") : "";

    let coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
    if (t.coverArt?.sources?.[0]?.url) {
      coverUrl = t.coverArt.sources[0].url;
    } else if (t.album?.images && t.album.images[0]) {
      coverUrl = t.album.images[0].url;
    } else if (t.images && t.images[0]) {
      coverUrl = t.images[0].url;
    } else if (playlistCover) {
      coverUrl = playlistCover;
    }

    const albumName = t.album?.name || playlistName || "";
    const albumId = t.album?.id || "";
    
    // Support duration (ms - old) or duration (ms - new)
    const durationMs = t.duration_ms || t.duration || 180000;
    const durationSec = Math.floor(durationMs / 1000);

    // Get preview audio URL if available
    const audioUrl = t.audioPreview?.url || t.preview_url || "";

    return {
      id,
      title,
      artist: artistName,
      artistId,
      albumName,
      albumId,
      duration: durationSec,
      thumbnail: coverUrl,
      audioUrl: audioUrl,
      dateAdded: new Date().toISOString()
    };
  });

  return { name: playlistName, tracks };
}

/**
 * Imports a Spotify playlist of any size by querying the official Web API with an OAuth token.
 */
export async function importSpotifyPlaylistWithToken(playlistUrl: string, token: string): Promise<{ name: string; tracks: Track[] }> {
  const match = playlistUrl.match(/playlist[/:]([a-zA-Z0-9]+)/);
  if (!match) {
    throw new Error("Invalid Spotify playlist URL. Please check the link format.");
  }
  const playlistId = match[1];

  let url = `https://api.spotify.com/v1/playlists/${playlistId}`;
  
  // Fetch playlist metadata (name, cover)
  const playlistRes = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (playlistRes.status === 403) {
    throw new Error("Spotify API 403: Since your Spotify app is in Development Mode, you can only import playlists that you own. Please duplicate this playlist to your account first, or request an Extension in the Spotify Developer Dashboard.");
  }
  if (!playlistRes.ok) {
    throw new Error(`Spotify API error: ${playlistRes.status} ${playlistRes.statusText}`);
  }
  const playlistData = await playlistRes.json();
  const playlistName = playlistData.name;
  let playlistCover = playlistData.images?.[0]?.url || "";
  
  // Fetch all tracks with pagination
  let tracksUrl: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;
  let rawTracks: any[] = [];
  
  console.log("[Spotify API] Starting playlist tracks fetch. Playlist ID:", playlistId);
  while (tracksUrl) {
    console.log("[Spotify API] Fetching page:", tracksUrl);
    const res = await fetch(tracksUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) {
      console.error("[Spotify API] Fetch failed with status:", res.status);
      throw new Error(`Spotify API tracks error: ${res.status}`);
    }
    const data = await res.json();
    const pageItems = data.items || [];
    rawTracks.push(...pageItems);
    console.log(`[Spotify API] Fetched ${pageItems.length} tracks. Total tracks so far: ${rawTracks.length}. Next page:`, data.next);
    tracksUrl = data.next;
  }
  
  // Map raw tracks
  const parsedTracks: Track[] = rawTracks
    .filter((item) => !!item.track)
    .map((item, idx) => {
      const t = item.track;
      
      const title = t.name || "Unknown Track";
      const artistName = Array.isArray(t.artists)
        ? t.artists.map((a: any) => a.name).join(", ")
        : "Unknown Artist";
        
      let id = t.id || `spotify-${idx}-${Date.now()}`;
      const artistId = t.artists?.[0]?.id || "";
      
      let coverUrl = t.album?.images?.[0]?.url || playlistCover || "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
      const albumName = t.album?.name || playlistName || "";
      const albumId = t.album?.id || "";
      const durationSec = Math.floor((t.duration_ms || 180000) / 1000);
      const audioUrl = t.preview_url || "";
      
      return {
        id,
        title,
        artist: artistName,
        artistId,
        albumName,
        albumId,
        duration: durationSec,
        thumbnail: coverUrl,
        audioUrl: audioUrl,
        dateAdded: item.added_at || new Date().toISOString()
      };
    });
  
  // Resolve engine matches to get matching pictures, artists, albums, and likes in parallel (concurrency of 5)
  const matchedTracks: Track[] = [];
  const concurrencyLimit = 5;
  for (let i = 0; i < parsedTracks.length; i += concurrencyLimit) {
    const chunk = parsedTracks.slice(i, i + concurrencyLimit);
    const resolvedChunk = await Promise.all(chunk.map(async (track) => {
      const match = await findBestEngineMatch(track.title, track.artist);
      if (match) {
        return {
          ...match,
          id: track.id, // Preserve original Spotify ID
          audioUrl: match.audioUrl || track.audioUrl || "",
          dateAdded: track.dateAdded
        };
      }
      return track;
    }));
    matchedTracks.push(...resolvedChunk);
  }

  return { name: playlistName, tracks: matchedTracks };
}

/**
 * Parses an M3U/M3U8 file or plain text track list into structured objects.
 */
export function parseM3U(content: string): { title: string; artist: string }[] {
  const lines = content.split(/\r?\n/);
  const tracks: { title: string; artist: string }[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (line.startsWith("#EXTINF:")) {
      const commaIdx = line.indexOf(",");
      if (commaIdx !== -1) {
        const info = line.substring(commaIdx + 1).trim();
        const parts = info.split(/\s*-\s*/);
        if (parts.length >= 2) {
          tracks.push({
            artist: parts[0].trim(),
            title: parts.slice(1).join(" - ").trim()
          });
        } else {
          tracks.push({
            artist: "Unknown Artist",
            title: info
          });
        }
      }
    } else if (!line.startsWith("#")) {
      const cleanPath = line.replace(/\\/g, "/");
      const filenameWithExt = cleanPath.substring(cleanPath.lastIndexOf("/") + 1);
      const dotIdx = filenameWithExt.lastIndexOf(".");
      const filename = dotIdx !== -1 ? filenameWithExt.substring(0, dotIdx) : filenameWithExt;
      
      const prevLine = i > 0 ? lines[i - 1].trim() : "";
      if (!prevLine.startsWith("#EXTINF:")) {
        const parts = filename.split(/\s*-\s*/);
        if (parts.length >= 2) {
          tracks.push({
            artist: parts[0].trim(),
            title: parts.slice(1).join(" - ").trim()
          });
        } else if (filename.length > 2) {
          tracks.push({
            artist: "Unknown Artist",
            title: filename
          });
        }
      }
    }
  }
  
  return tracks;
}

/**
 * Simple CSV parser that handles quotes and custom delimiters.
 */
function parseCSVLine(text: string, delimiter: string = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(s => s.replace(/^"|"$/g, "").trim()); // Strip leading/trailing quotes
}

/**
 * Parses a CSV file (e.g. Exportify or SpotifyDown format) into track metadata.
 * Dynamically detects comma, semicolon, or tab delimiters, looks for header rows,
 * and falls back to index 0/1 if headers are not present.
 */
export function parseCSV(content: string): { title: string; artist: string }[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect delimiter: check first line for comma, semicolon, tab
  const firstLine = lines[0];
  let delimiter = ",";
  if (firstLine.includes("\t")) {
    delimiter = "\t";
  } else if (firstLine.includes(";")) {
    delimiter = ";";
  } else if (firstLine.includes(",")) {
    delimiter = ",";
  } else {
    // No common delimiter found, likely not a CSV
    return [];
  }

  const tracks: { title: string; artist: string }[] = [];
  const firstLineParts = parseCSVLine(firstLine, delimiter);

  // Check if first line has header keywords
  const hasHeaders = firstLineParts.some(h => {
    const lh = h.toLowerCase();
    return lh.includes("track") || lh.includes("title") || lh.includes("name") || lh.includes("artist") || lh.includes("uri") || lh.includes("song");
  });

  let trackNameIdx = -1;
  let artistNameIdx = -1;

  if (hasHeaders) {
    trackNameIdx = firstLineParts.findIndex(h => {
      const lh = h.toLowerCase();
      return lh.includes("track name") || lh === "title" || lh === "name" || lh === "song" || lh.includes("song title") || lh.includes("track_name");
    });
    artistNameIdx = firstLineParts.findIndex(h => {
      const lh = h.toLowerCase();
      return lh.includes("artist name") || lh === "artist" || lh.includes("artist(s)") || lh.includes("artist_name");
    });
  }

  // Fallback defaults if headers aren't detected or only partially matched
  const numColumns = firstLineParts.length;
  if (trackNameIdx === -1 && artistNameIdx === -1) {
    if (numColumns >= 2) {
      trackNameIdx = 0;
      artistNameIdx = 1;
    } else {
      trackNameIdx = 0;
    }
  } else if (trackNameIdx === -1) {
    trackNameIdx = artistNameIdx === 0 ? 1 : 0;
  } else if (artistNameIdx === -1) {
    if (numColumns >= 2) {
      artistNameIdx = trackNameIdx === 0 ? 1 : 0;
    }
  }

  const startLine = hasHeaders ? 1 : 0;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    const parts = parseCSVLine(line, delimiter);
    if (parts.length > 0) {
      const title = trackNameIdx !== -1 && parts[trackNameIdx] ? parts[trackNameIdx] : "";
      const artist = artistNameIdx !== -1 && parts[artistNameIdx] ? parts[artistNameIdx] : "Unknown Artist";
      if (title) {
        tracks.push({ title, artist });
      }
    }
  }

  return tracks;
}

/**
 * Resolves tracks from an M3U or CSV content block against our engine and returns a playlist.
 */
export async function importM3UPlaylist(name: string, m3uContent: string): Promise<{ name: string; tracks: Track[] }> {
  // Try CSV parsing first
  let parsedItems = parseCSV(m3uContent);
  
  // If CSV parsing returned no results, fall back to M3U parsing
  if (parsedItems.length === 0) {
    parsedItems = parseM3U(m3uContent);
  }
  
  const tracks: Track[] = [];
  
  const concurrencyLimit = 5;
  for (let i = 0; i < parsedItems.length; i += concurrencyLimit) {
    const chunk = parsedItems.slice(i, i + concurrencyLimit);
    const resolvedChunk = await Promise.all(chunk.map(async (item, idx) => {
      const match = await findBestEngineMatch(item.title, item.artist);
      if (match) {
        return {
          ...match,
          dateAdded: new Date().toISOString()
        };
      }
      return {
        id: `m3u-${i + idx}-${Date.now()}`,
        title: item.title,
        artist: item.artist,
        duration: 180,
        thumbnail: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80",
        audioUrl: "",
        dateAdded: new Date().toISOString()
      };
    }));
    tracks.push(...resolvedChunk);
  }
  
  return { name: name || "Imported Playlist", tracks };
}

/* ─── PKCE OAuth Flow Helpers ───────────────────────────────── */

function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function generateRandomString(length: number = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => chars[x % chars.length])
    .join("");
}

async function generatePKCE() {
  const verifier = generateRandomString(64);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return { verifier, challenge: base64url(digest) };
}

export const SPOTIFY_KEYS = {
  accessToken: "ibrastream_spotify_token",
  tokenExpiry: "ibrastream_spotify_token_expiry",
  refreshToken: "ibrastream_spotify_refresh_token",
  pkceVerifier: "ibrastream_spotify_pkce_verifier",
  authState: "ibrastream_spotify_auth_state",
};

export function clearSpotifyStorage() {
  Object.values(SPOTIFY_KEYS).forEach((k) => localStorage.removeItem(k));
}

function persistToken(data: any): string {
  const token = data.access_token;
  localStorage.setItem(SPOTIFY_KEYS.accessToken, token);
  localStorage.setItem(
    SPOTIFY_KEYS.tokenExpiry,
    String(Date.now() + data.expires_in * 1000)
  );
  if (data.refresh_token) {
    localStorage.setItem(SPOTIFY_KEYS.refreshToken, data.refresh_token);
  }
  return token;
}

export async function initiateSpotifyPKCELogin(clientId: string, redirectUri: string) {
  const state = generateRandomString(16);
  const { verifier, challenge } = await generatePKCE();

  localStorage.setItem(SPOTIFY_KEYS.authState, state);
  localStorage.setItem(SPOTIFY_KEYS.pkceVerifier, verifier);

  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: state,
    scope: "playlist-read-private playlist-read-collaborative",
  });

  window.location.href = `https://accounts.spotify.com/authorize?${query.toString()}`;
}

export async function exchangeCodeForToken(code: string, clientId: string, redirectUri: string): Promise<string> {
  const verifier = localStorage.getItem(SPOTIFY_KEYS.pkceVerifier);
  localStorage.removeItem(SPOTIFY_KEYS.pkceVerifier);

  if (!verifier) {
    throw new Error("Missing PKCE verifier code.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || res.statusText}`);
  }

  const data = await res.json();
  return persistToken(data);
}

export async function refreshSpotifyToken(refreshToken: string, clientId: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    clearSpotifyStorage();
    throw new Error(`Token refresh failed: ${res.statusText}`);
  }

  const data = await res.json();
  return persistToken(data);
}
