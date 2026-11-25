import { localized, useLanguage } from "./LanguageContext";
import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import type { Track } from "../services/musicApi";
import { getArtistsFromTrack, getYouTubeVideoId } from "../services/musicApi";
import { supabase } from "../services/supabaseClient";
import { StorageService } from "../services/storageService";
import { readTrackVersionPreference, trackVersionId } from "../services/explicitPreferences";
import { downloadService } from "../services/downloadService";
import { measure } from "../services/metrics";
import { createLocalPlayback, equalizerPresets } from "../services/localPlayback";
import { crossfadeVolumes } from "../services/crossfade";
import type { ListeningStats } from "../services/librarySync";
import { BACKLOG_LIMIT, LISTENING_HISTORY_KEY, type ListeningEntry } from "../services/listeningHistory";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}





// Cache for pre-resolved YouTube video IDs and native stream URLs to enable instant loading/playback
const resolutionCache = new Map<string, { videoId: string; streamUrl?: string; timestamp: number }>();
// In-flight resolution promises to prevent redundant duplicate network requests for the same track
const inFlightResolutions = new Map<string, Promise<string>>();

const getResolutionKey = (track: Track): string => {
  const explicitFlag = track.isExplicit === true ? "explicit" : track.isExplicit === false ? "clean" : "default";
  return `v3:${track.id}:${explicitFlag}`;
};

const getCachedResolution = (track: Track): { videoId: string; streamUrl?: string; timestamp: number } | undefined => {
  const key = getResolutionKey(track);
  const found = resolutionCache.get(key);
  if (found && found.videoId) return found;
  return undefined;
};

// Keep cache memory footprint strictly capped at 150 items
const setResolutionCache = (trackOrKey: Track | string, value: { videoId: string; streamUrl?: string; timestamp: number }) => {
  if (resolutionCache.size > 150) {
    const oldestKey = resolutionCache.keys().next().value;
    if (oldestKey) resolutionCache.delete(oldestKey);
  }
  const key = typeof trackOrKey === "string" ? trackOrKey : getResolutionKey(trackOrKey);
  resolutionCache.set(key, value);
};

function withExplicitPreference(track: Track): Track {
  const chosen = readTrackVersionPreference(track.id);
  if (chosen !== undefined) return track.isExplicit === chosen ? track : { ...track, isExplicit: chosen };
  if (track.isExplicit === true) return track;
  if (localStorage.getItem("ibrastream_filter_explicit") === "true") return track.isExplicit === false ? track : { ...track, isExplicit: false };
  const ids = StorageService.getItemSync<string[]>("ibrastream_explicit_tracks")
    ?? StorageService.getItemSync<string[]>("ibrastream_explicit_track_ids");
  return Array.isArray(ids) && (ids.includes(track.id) || ids.includes(trackVersionId(track.id)))
    ? { ...track, isExplicit: true }
    : track;
}

const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;

function trackSourceKey(track: Track): string {
  const version = withExplicitPreference(track).isExplicit === true ? "explicit" : "clean";
  return `ibrastream_track_source_v3:${track.id}:${version}`;
}

function readTrackVideoId(sourceKey: string): string | undefined {
  const saved = StorageService.getItemSync<{ videoId: string }>(sourceKey);
  return typeof saved?.videoId === "string" && videoIdPattern.test(saved.videoId) ? saved.videoId : undefined;
}

function getPreferredTrackVideoId(track: Track): string | undefined {
  const sourceKey = trackSourceKey(track);
  return readTrackVideoId(sourceKey) ?? (
    sourceKey.endsWith(":clean") && readTrackVersionPreference(track.id) === undefined
      ? readTrackVideoId(sourceKey.replace(/:clean$/, ":default"))
      : undefined
  );
}

export const resolveTrackVideoId = async (track: Track, signal?: AbortSignal, excludeVideoIds?: string[], usePreferredSource = true): Promise<string> => {
  if (!track) return "";
  const hasExclusions = Array.isArray(excludeVideoIds) && excludeVideoIds.length > 0;
  const excludedSet = hasExclusions ? new Set(excludeVideoIds) : null;
  const enrichedTrack = withExplicitPreference(track);
  const preferredVideoId = usePreferredSource ? getPreferredTrackVideoId(enrichedTrack) : undefined;
  if (preferredVideoId && !excludedSet?.has(preferredVideoId)) return preferredVideoId;

  // 1. Instant cache hit check (checks both explicit key and plain track id)
  const cached = getCachedResolution(enrichedTrack);
  if (cached && cached.videoId && (!excludedSet || !excludedSet.has(cached.videoId))) {
    return cached.videoId;
  }

  // 2. In-flight check: if already resolving this track, share the existing Promise!
  const chosenVersion = readTrackVersionPreference(track.id) !== undefined;
  const inFlightKey = getResolutionKey(enrichedTrack) + (hasExclusions ? `_ex_${[...excludedSet!].sort().join("_")}` : "");
  if (inFlightResolutions.has(inFlightKey)) {
    try {
      return await inFlightResolutions.get(inFlightKey)!;
    } catch {
      // Fall through on error to retry fresh
    }
  }

  // 3. Initiate resolution
  const promise: Promise<string> = getYouTubeVideoId(enrichedTrack, signal, excludeVideoIds, chosenVersion)
    .then(videoId => {
      if (videoId && inFlightResolutions.get(inFlightKey) === promise && (!excludedSet || !excludedSet.has(videoId))) {
        setResolutionCache(enrichedTrack, { videoId, timestamp: Date.now() });
      }
      return videoId;
    })
    .finally(() => {
      if (inFlightResolutions.get(inFlightKey) === promise) inFlightResolutions.delete(inFlightKey);
    });

  inFlightResolutions.set(inFlightKey, promise);
  return promise;
};

export const invalidateTrackResolution = (trackId: string) => {
  const cleanId = trackId.replace(/^yt-/, "");
  for (const key of Array.from(resolutionCache.keys())) {
    if (
      key === trackId ||
      key === cleanId ||
      key.includes(`:${trackId}:`) ||
      key.includes(`:${cleanId}:`) ||
      key.startsWith(`${trackId}:`) ||
      key.startsWith(`${cleanId}:`)
    ) {
      resolutionCache.delete(key);
    }
  }
  for (const key of Array.from(inFlightResolutions.keys())) {
    if (
      key === trackId ||
      key === cleanId ||
      key.includes(`:${trackId}:`) ||
      key.includes(`:${cleanId}:`)
    ) {
      inFlightResolutions.delete(key);
    }
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("ibrastream_track_resolution_invalidated", { detail: { trackId } }));
  }
};

interface RoomTrackRequest { id: string; track: Track; proposer: string }

interface AudioContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  volume: number;
  isMuted: boolean;
  queue: Track[];
  currentIndex: number;
  isShuffle: boolean;
  isRepeat: "none" | "one" | "all";
  playingPlaylistId: string | null;
  setPlayingPlaylistId: (id: string | null) => void;
  playShuffledPlaylist: (tracks: Track[], playlistId: string) => void;
  restoreQueue: (track: Track, upcoming: Track[], manual: Track[], playlistId: string | null, seconds: number) => void;
  playTrack: (track: Track, newQueue?: Track[], playlistId?: string | null, isRemoteSync?: boolean, startAt?: number, forceOnline?: boolean) => void;
  togglePlay: () => void;
  playbackError: string | null;
  setPlaybackError: (err: string | null) => void;
  privateSession: boolean;
  setPrivateSession: (value: boolean) => void;
  autoplay: boolean;
  setAutoplay: (value: boolean) => void;
  normalizeLocalAudio: boolean;
  setNormalizeLocalAudio: (value: boolean) => void;
  equalizer: number[];
  setEqualizer: (values: number[]) => void;
  smartShuffle: boolean;
  setSmartShuffle: (value: boolean) => void;
  listeningEntries: ListeningEntry[];
  clearListeningHistory: () => void;
  retryPlayback: () => void;
  chooseTrackSource: (track: Track, videoId: string) => void;
  getTrackSourceVideoId: (track: Track) => string | undefined;
  pauseForTrackPreview: () => () => void;
  undoQueue: (() => void) | null;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number, isRemoteSync?: boolean) => void;
  changeVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  clearQueue: () => void;
  clearManualQueue: () => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toast: { message: string; type: "info" | "success" | "error" } | null;
  showToast: (message: string, type?: "info" | "success" | "error") => void;
  userQueue: Track[];
  playlistQueue: Track[];
  playlistIndex: number;
  currentTrackSource: 'playlist' | 'user_queue' | null;
  history: Track[];
  accumulatedStats: ListeningStats;
  setAccumulatedStats: React.Dispatch<React.SetStateAction<ListeningStats>>;
  // Listen Together
  roomId: string | null;
  isHost: boolean;
  isConnected: boolean;
  participants: { id: string; name: string; pfp?: string; isHost?: boolean }[];
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  closeRoom: () => void;
  syncRoom: () => void;
  proposeRoomTrack: (track: Track) => void;
  roomRequests: RoomTrackRequest[];
  answerRoomRequest: (id: string, add: boolean) => void;
  transferRoom: (id: string) => void;
  directRequests: boolean;
  setDirectRequests: (value: boolean) => void;
  updateUserIdentity: (name: string, pfp?: string) => void;
  // Custom Settings & Premium features
  ambientGlowEnabled: boolean;
  setAmbientGlowEnabled: (val: boolean) => void;
  seamlessTransitions: boolean;
  setSeamlessTransitions: (val: boolean) => void;
  seamlessDuration: number;
  setSeamlessDuration: (seconds: number) => void;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  lyricsProvider: "spicylyrics" | "lrcred" | "lrclib";
  setLyricsProvider: (val: "spicylyrics" | "lrcred" | "lrclib") => void;
  lyricsWordByWord: boolean;
  setLyricsWordByWord: (enabled: boolean) => void;
  currentUser: any;
}

interface AudioProgressContextType {
  currentTime: number;
  duration: number;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);
const AudioProgressContext = createContext<AudioProgressContextType | undefined>(undefined);

export const useAudioProgress = () => {
  const context = useContext(AudioProgressContext);
  if (context === undefined) {
    throw new Error("useAudioProgress must be used within an AudioProvider");
  }
  return context;
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language } = useLanguage();
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => {
    const saved = localStorage.getItem("ibrastream_current_track");
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(() => {
    return localStorage.getItem("ibrastream_playing_playlist_id");
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = StorageService.getItemSync<{ id: string; seconds: number }>("ibrastream_resume_position");
    return saved && saved.id === currentTrack?.id && Number.isFinite(saved.seconds) ? Math.max(0, saved.seconds) : 0;
  });
  const [duration, setDuration] = useState(currentTrack?.duration ?? 0);
  const [volume, setVolume] = useState<number>(() => {
    const saved = localStorage.getItem("ibrastream_volume");
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_is_muted");
    return saved === "true";
  });
  const [userQueue, setUserQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_user_queue");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [playlistQueue, setPlaylistQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_playlist_queue");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [originalPlaylistQueue, setOriginalPlaylistQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_original_playlist_queue");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [playlistIndex, setPlaylistIndex] = useState<number>(() => {
    const saved = localStorage.getItem("ibrastream_playlist_index");
    return saved ? parseInt(saved, 10) : -1;
  });
  const [history, setHistory] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_history");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [currentTrackSource, setCurrentTrackSource] = useState<'playlist' | 'user_queue' | null>(() => {
    return (localStorage.getItem("ibrastream_current_track_source") as any) || null;
  });

  const queue = useMemo(() => {
    const q: Track[] = [];
    if (currentTrack) {
      q.push(currentTrack);
    }
    q.push(...userQueue);
    const startIdx = playlistIndex + 1;
    if (startIdx >= 0 && startIdx < playlistQueue.length) {
      q.push(...playlistQueue.slice(startIdx));
    }
    return q;
  }, [currentTrack, userQueue, playlistQueue, playlistIndex]);

  const currentIndex = useMemo(() => {
    return currentTrack ? 0 : -1;
  }, [currentTrack]);
  const [isShuffle, setIsShuffle] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_is_shuffle");
    return saved === "true";
  });
  const [isRepeat, setIsRepeat] = useState<"none" | "one" | "all">(() => {
    const saved = localStorage.getItem("ibrastream_is_repeat");
    return (saved as any) || "none";
  });

  // Listen Together States
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [participants, setParticipants] = useState<{ id: string; name: string; pfp?: string }[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Sync currentUser session details to Listen Together identity
  useEffect(() => {
    if (currentUser) {
      userNameRef.current = currentUser.user_metadata?.username || currentUser.email?.split("@")[0] || "User";
      userPfpRef.current = currentUser.user_metadata?.avatar_url || "";
      clientIdRef.current = currentUser.id;
    } else {
      userNameRef.current = `User-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      userPfpRef.current = "";
      clientIdRef.current = Math.random().toString(36).substring(2, 11);
    }
  }, [currentUser]);


  // Listen Together Refs
  const channelRef = useRef<any>(null);
  const clientIdRef = useRef<string>(Math.random().toString(36).substring(2, 11));
  const userNameRef = useRef<string>(`User-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
  const userPfpRef = useRef<string>("");
  const lastBroadcastRef = useRef<number>(0);
  const updateUserIdentity = React.useCallback((name: string, pfp?: string) => {
    if (name.trim()) userNameRef.current = name.trim();
    if (pfp !== undefined) userPfpRef.current = pfp;

    if (channelRef.current && isConnected) {
      channelRef.current.track({
        name: userNameRef.current,
        pfp: userPfpRef.current,
        joinedAt: Date.now()
      }).catch((err: any) => console.error("Failed to update presence info:", err));
    }
  }, [isConnected]);
  const roomIdRef = useRef<string | null>(null);
  const isHostRef = useRef<boolean>(false);
  const myJoinedAtRef = useRef<number>(Date.now());
  const currentTrackRef = useRef<Track | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const queueRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const isRepeatRef = useRef<"none" | "one" | "all">("none");
  const targetSeekTimeRef = useRef<number | null>(null);

  const userQueueRef = useRef<Track[]>(userQueue);
  const playlistQueueRef = useRef<Track[]>(playlistQueue);
  const playlistIndexRef = useRef<number>(playlistIndex);
  const currentTrackSourceRef = useRef<'playlist' | 'user_queue' | null>(currentTrackSource);

  useEffect(() => { userQueueRef.current = userQueue; }, [userQueue]);
  useEffect(() => { playlistQueueRef.current = playlistQueue; }, [playlistQueue]);
  useEffect(() => { playlistIndexRef.current = playlistIndex; }, [playlistIndex]);
  useEffect(() => { currentTrackSourceRef.current = currentTrackSource; }, [currentTrackSource]);

  useEffect(() => {
    roomIdRef.current = roomId;
    isHostRef.current = isHost;
  }, [roomId, isHost]);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);

  const volumeRef = useRef<number>(volume);
  const isMutedRef = useRef<boolean>(isMuted);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Persist playback settings in localStorage
  useEffect(() => {
    localStorage.setItem("ibrastream_volume", String(volume));
    localStorage.setItem("ibrastream_is_muted", String(isMuted));
    localStorage.setItem("ibrastream_is_shuffle", String(isShuffle));
    localStorage.setItem("ibrastream_is_repeat", isRepeat);
  }, [volume, isMuted, isShuffle, isRepeat]);

  // Persist queue and playing track state safely
  useEffect(() => {
    StorageService.setItemSync("ibrastream_queue", queue);
    StorageService.setItemSync("ibrastream_current_index", currentIndex);
    StorageService.setItemSync("ibrastream_user_queue", userQueue);
    StorageService.setItemSync("ibrastream_playlist_queue", playlistQueue);
    StorageService.setItemSync("ibrastream_original_playlist_queue", originalPlaylistQueue);
    StorageService.setItemSync("ibrastream_playlist_index", playlistIndex);
    StorageService.setItemSync("ibrastream_history", history);
    if (currentTrackSource) {
      StorageService.setItemSync("ibrastream_current_track_source", currentTrackSource);
    } else {
      StorageService.removeItem("ibrastream_current_track_source");
    }
    if (currentTrack) {
      StorageService.setItemSync("ibrastream_current_track", currentTrack);
    } else {
      StorageService.removeItem("ibrastream_current_track");
    }
  }, [queue, currentIndex, currentTrack, userQueue, playlistQueue, originalPlaylistQueue, playlistIndex, history, currentTrackSource]);

  const [accumulatedStats, setAccumulatedStats] = useState<ListeningStats>(() => {
    const saved = localStorage.getItem("ibrastream_accumulated_stats");
    try {
      return saved ? JSON.parse(saved) : { totalSeconds: 0, tracks: {}, artists: {} };
    } catch {
      return { totalSeconds: 0, tracks: {}, artists: {} };
    }
  });

  const [privateSession, setPrivateSession] = useState(() => sessionStorage.getItem("ibrastream_private_session") === "true");
  const [autoplay, setAutoplay] = useState(() => localStorage.getItem("ibrastream_autoplay") === "true");
  const [listeningEntries, setListeningEntries] = useState<ListeningEntry[]>(() => StorageService.getItemSync<ListeningEntry[]>(LISTENING_HISTORY_KEY) ?? []);
  const listeningEntriesRef = useRef(listeningEntries);
  const activeListenRef = useRef<ListeningEntry | null>(null);
  const listeningDirty = useRef(false);
  const positionSample = useRef<{ id: string; seconds: number; at: number } | null>(null);
  const statisticsRef = useRef(accumulatedStats);

  useEffect(() => {
    let active = true;
    void StorageService.getItem<ListeningEntry[]>(LISTENING_HISTORY_KEY).then(saved => {
      if (!active || !Array.isArray(saved) || listeningDirty.current) return;
      listeningEntriesRef.current = saved.slice(-BACKLOG_LIMIT);
      setListeningEntries(listeningEntriesRef.current);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { statisticsRef.current = accumulatedStats; }, [accumulatedStats]);

  function flushListening() {
    if (!listeningDirty.current) return;
    listeningDirty.current = false;
    const items = listeningEntriesRef.current.slice(-BACKLOG_LIMIT);
    listeningEntriesRef.current = items;
    StorageService.setItemSync(LISTENING_HISTORY_KEY, items);
    StorageService.setItemSync("ibrastream_accumulated_stats", statisticsRef.current);
    setListeningEntries([...items]);
    setAccumulatedStats({ ...statisticsRef.current });
  }

  useEffect(() => {
    const timer = window.setInterval(flushListening, 10000);
    window.addEventListener("pagehide", flushListening);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flushListening);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("ibrastream_autoplay", String(autoplay));
  }, [autoplay]);

  useEffect(() => {
    sessionStorage.setItem("ibrastream_private_session", String(privateSession));
    activeListenRef.current = null;
    positionSample.current = null;
  }, [privateSession]);

  function clearListeningHistory() {
    activeListenRef.current = null;
    positionSample.current = null;
    listeningDirty.current = false;
    listeningEntriesRef.current = [];
    statisticsRef.current = { totalSeconds: 0, tracks: {}, artists: {} };
    setListeningEntries([]);
    setAccumulatedStats(statisticsRef.current);
    setHistory([]);
    StorageService.setItemSync(LISTENING_HISTORY_KEY, []);
    StorageService.setItemSync("ibrastream_accumulated_stats", statisticsRef.current);
    void StorageService.removeItem("ibrastream_recently_played");
    window.dispatchEvent(new Event("ibrastream_history_updated"));
  }

  useEffect(() => {
    if (!currentTrack || !isPlaying || privateSession) {
      positionSample.current = null;
      return;
    }

    const previous = positionSample.current;
    const at = Date.now();
    positionSample.current = { id: currentTrack.id, seconds: currentTime, at };
    if (!previous || previous.id !== currentTrack.id) return;
    const elapsed = (at - previous.at) / 1000;
    const advanced = currentTime - previous.seconds;
    if (advanced <= 0 || elapsed > 5 || advanced > elapsed * 2.1 + .3) {
      if (advanced < -5 && currentTime < 2 && previous.seconds > duration - 2) activeListenRef.current = null;
      return;
    }
    const seconds = Math.min(advanced, elapsed);
    if (seconds <= 0) return;

    let entry = activeListenRef.current;
    if (!entry || entry.track.id !== currentTrack.id) {
      entry = { id: crypto.randomUUID(), at, track: currentTrack, seconds: 0, completed: false };
      activeListenRef.current = entry;
      listeningEntriesRef.current.push(entry);
    }
    entry.seconds += seconds;
    listeningDirty.current = true;

    const stats = statisticsRef.current;
    const track = stats.tracks[currentTrack.id] ??= { track: currentTrack, seconds: 0, count: 0 };
    const name = currentTrack.artist || "Artista desconocido";
    const artist = stats.artists[name] ??= { name, thumbnail: currentTrack.thumbnail, seconds: 0, count: 0 };
    track.seconds += seconds;
    artist.seconds += seconds;
    stats.totalSeconds += seconds;
    if (!entry.completed && entry.seconds >= Math.min(duration ? duration / 2 : 30, 30)) {
      entry.completed = true;
      track.count++;
      artist.count++;
    }
  }, [currentTime, currentTrack, duration, isPlaying, privateSession]);

  // Trigger pre-resolution of upcoming songs immediately in background (without aborting on re-render)
  useEffect(() => {
    if (!currentTrack || !isPlaying || !navigator.onLine) return;
    const candidate = getNextUpcomingTrack();
    if (candidate && candidate.track) {
      resolveTrackVideoId(candidate.track).catch(() => {});
    }
    if (queue.length > 2) {
      const secondTrack = queue[2];
      if (secondTrack && (!candidate || secondTrack.id !== candidate.track.id)) {
        resolveTrackVideoId(secondTrack).catch(() => {});
      }
    }
  }, [currentTrack?.id, queue.length, isPlaying]);

  // Settings & Sleep Timer States
  const [ambientGlowEnabled, setAmbientGlowEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_ambient_glow");
    return saved !== "false"; // Default to true
  });
  const [seamlessTransitions, setSeamlessTransitions] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_seamless_transitions");
    return saved !== "false"; // Default to true for Spotify-like experience
  });
  const [seamlessDuration, setSeamlessDuration] = useState<number>(() => {
    const saved = localStorage.getItem("ibrastream_seamless_duration");
    return saved ? parseInt(saved, 10) : 4; // Default 4 seconds crossfade
  });
  const [lyricsProvider, setLyricsProviderState] = useState<"spicylyrics" | "lrcred" | "lrclib">(() => {
    const saved = localStorage.getItem("ibrastream_lyrics_provider");
    return saved === "spicylyrics" || saved === "lrcred" || saved === "lrclib" ? saved : "spicylyrics";
  });

  const setLyricsProvider = (provider: "spicylyrics" | "lrcred" | "lrclib") => {
    setLyricsProviderState(provider);
    localStorage.setItem("ibrastream_lyrics_provider", provider);
    window.dispatchEvent(new CustomEvent("ibrastream_lyrics_provider_changed", { detail: provider }));
  };
  const [lyricsWordByWord, setLyricsWordByWordState] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_lyrics_word_by_word");
    return saved !== "false"; // Default enabled
  });

  const setLyricsWordByWord = (enabled: boolean) => {
    setLyricsWordByWordState(enabled);
    localStorage.setItem("ibrastream_lyrics_word_by_word", String(enabled));
    if (enabled && lyricsProvider !== "spicylyrics" && lyricsProvider !== "lrcred") {
      setLyricsProviderState("spicylyrics");
      localStorage.setItem("ibrastream_lyrics_provider", "spicylyrics");
      window.dispatchEvent(new CustomEvent("ibrastream_lyrics_provider_changed", { detail: "spicylyrics" }));
    }
    window.dispatchEvent(new CustomEvent("ibrastream_lyrics_word_by_word_changed", { detail: enabled }));
  };
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const originalVolumeRef = useRef<number>(volume);

  // Seamless transition refs & state
  const isTransitioningRef = useRef<boolean>(false);
  const seamlessDurationRef = useRef<number>(seamlessDuration);
  const seamlessTransitionsRef = useRef<boolean>(seamlessTransitions);
  useEffect(() => { seamlessDurationRef.current = seamlessDuration; }, [seamlessDuration]);
  useEffect(() => { seamlessTransitionsRef.current = seamlessTransitions; }, [seamlessTransitions]);

  useEffect(() => {
    localStorage.setItem("ibrastream_seamless_transitions", String(seamlessTransitions));
  }, [seamlessTransitions]);

  useEffect(() => {
    localStorage.setItem("ibrastream_seamless_duration", String(seamlessDuration));
  }, [seamlessDuration]);

  useEffect(() => {
    localStorage.setItem("ibrastream_ambient_glow", String(ambientGlowEnabled));
  }, [ambientGlowEnabled]);

  const startSleepTimer = (minutes: number) => {
    originalVolumeRef.current = volume;
    setSleepTimerRemaining(minutes * 60);
    showToast(`Sleep timer set for ${minutes} minutes`, "success");
  };

  const cancelSleepTimer = () => {
    setSleepTimerRemaining(null);
    changeVolume(originalVolumeRef.current);
    showToast(localized(language, "Temporizador cancelado", "Sleep timer cancelled", "Tenporizadorea bertan behera utzi da"), "info");
  };

  useEffect(() => {
    if (sleepTimerRemaining === null) {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
      return;
    }

    if (sleepTimerRemaining <= 0) {
      if (isPlaying) {
        togglePlay();
      }
      setSleepTimerRemaining(null);
      changeVolume(originalVolumeRef.current);
      showToast(localized(language, "El temporizador terminó. Música pausada.", "Sleep timer finished. Music paused.", "Tenporizadorea amaitu da. Musika pausatu da."), "info");
      return;
    }

    sleepTimerRef.current = window.setInterval(() => {
      setSleepTimerRemaining(prev => {
        if (prev === null) return null;
        const nextVal = prev - 1;
        if (nextVal <= 30 && nextVal > 0) {
          const fadeVolume = (nextVal / 30) * originalVolumeRef.current;
          changeVolume(fadeVolume);
        }
        return nextVal;
      });
    }, 1000);

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimerRemaining, isPlaying]);

  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [undoQueue, setUndoQueue] = useState<(() => void) | null>(null);
  const undoQueueTimer = useRef<number | undefined>(undefined);
  const [normalizeLocalAudio, setNormalizeLocalAudio] = useState(() => localStorage.getItem("ibrastream_normalize_local") === "true");
  const [equalizer, setEqualizer] = useState(() => {
    const stored = StorageService.getItemSync<number[]>("ibrastream_equalizer");
    return Array.isArray(stored) && stored.length === equalizerPresets.flat.length
      && stored.every(value => Number.isFinite(value) && Math.abs(value) <= 12) ? stored : equalizerPresets.flat;
  });
  const equalizerRef = useRef(equalizer);
  const [smartShuffle, setSmartShufflePreference] = useState(() => localStorage.getItem("ibrastream_balanced_shuffle") === "true");
  const localDeck = useRef<{ audio: HTMLAudioElement; url: string; player: ReturnType<typeof createLocalPlayback> } | null>(null);
  useEffect(() => {
    localStorage.setItem("ibrastream_normalize_local", String(normalizeLocalAudio));
    if (localDeck.current) void localDeck.current.player.setNormalization(normalizeLocalAudio);
  }, [normalizeLocalAudio]);
  useEffect(() => {
    equalizerRef.current = equalizer;
    StorageService.setItemSync("ibrastream_equalizer", equalizer);
    void localDeck.current?.player.setEqualizer(equalizer);
  }, [equalizer]);
  useEffect(() => {
    localStorage.setItem("ibrastream_balanced_shuffle", String(smartShuffle));
  }, [smartShuffle]);
  const playbackStarted = useRef<number | null>(null);
  const loadedTrackId = useRef<string | null>(null);
  const lastResolvedVideoIdRef = useRef<string | null>(null);
  const failedVideoIdsRef = useRef<Map<string, Set<string>>>(new Map());
  const fallbackRetriesRef = useRef<Map<string, number>>(new Map());
  const playTrackRef = useRef<any>(null);
  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  const resumeSnapshot = useRef<{ id: string; seconds: number } | null>(null);
  const lastResumeSave = useRef(0);
  const lastDuration = useRef(0);

  useEffect(() => {
    const save = () => {
      if (resumeSnapshot.current) StorageService.setItemSync("ibrastream_resume_position", resumeSnapshot.current);
    };
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("pagehide", save);
      clearTimeout(undoQueueTimer.current);
      if (localDeck.current) {
        const prev = localDeck.current;
        localDeck.current = null;
        prev.audio.onerror = null;
        prev.audio.onplaying = null;
        prev.audio.onpause = null;
        prev.audio.onended = null;
        prev.audio.onloadedmetadata = null;
        prev.audio.pause();
        prev.audio.removeAttribute("src");
        prev.audio.load();
        prev.player.dispose();
        URL.revokeObjectURL(prev.url);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentTrack || roomId) return;
    resumeSnapshot.current = { id: currentTrack.id, seconds: currentTime };
    if (Date.now() - lastResumeSave.current >= 5000) {
      lastResumeSave.current = Date.now();
      StorageService.setItemSync("ibrastream_resume_position", resumeSnapshot.current);
    }
  }, [currentTrack?.id, currentTime, roomId]);

  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);

  // YouTube Dual Players for Simultaneous Seamless Crossfade (web/desktop)
  const ytPlayersRef = useRef<[any, any]>([null, null]);
  const activeDeckRef = useRef<0 | 1>(0);
  const ytReadyRef = useRef<boolean>(false);

  // Helper to get active player
  function finishPlaybackMeasurement(metric: "play" | "play_error") {
    if (playbackStarted.current === null) return;
    measure(metric, performance.now() - playbackStarted.current);
    playbackStarted.current = null;
  }

  const getActivePlayer = () => localDeck.current?.player ?? ytPlayersRef.current[activeDeckRef.current];

  // Silent audio hack to keep Media Session alive (web only)
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const progressIntervalRef = useRef<number | null>(null);
  const crossfadeIntervalRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const nextTrackRef = useRef<() => void>(() => {});
  const prevTrackRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => void>(() => {});
  const syncMediaSessionRef = useRef<() => void>(() => {});
  const startSeamlessFadeInRef = useRef<() => void>(() => {});
  const finishCrossfadeNowRef = useRef<(() => void) | null>(null);
  const playbackExpectedRef = useRef<boolean>(false);
  const previewPauseRef = useRef<{ shouldResume: boolean } | null>(null);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
    nextTrackRef.current = nextTrack;
    prevTrackRef.current = prevTrack;
    togglePlayRef.current = togglePlay;
    syncMediaSessionRef.current = syncMediaSession;
    startSeamlessFadeInRef.current = startSeamlessFadeIn;
  });

  // Initialize the main deck on demand. The standby deck is created during pre-cue.
  useEffect(() => {
    

    // Silent audio for Media Session background capability
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silentAudio.loop = true;
    silentAudioRef.current = silentAudio;

    // Create hidden containers for both YT iframes
    const createContainer = (deck: 0 | 1) => {
      const id = `youtube-player-${deck}`;
      let ytDiv = document.getElementById(id);
      if (!ytDiv) {
        ytDiv = document.createElement("div");
        ytDiv.id = id;
        ytDiv.setAttribute("aria-hidden", "true");
        ytDiv.setAttribute(
          "style",
          "position: fixed; top: -9999px; left: -9999px; width: 1px; height: 1px; opacity: 0.001; pointer-events: none; z-index: -9999;"
        );
        document.body.appendChild(ytDiv);
      }
    };

    const createPlayerInstance = (deck: 0 | 1) => {
      createContainer(deck);
      return new window.YT.Player(`youtube-player-${deck}`, {
        height: "1",
        width: "1",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : 'https://www.youtube.com',
        },
        events: {
          onReady: (event: any) => {
            const initialVol = isMutedRef.current ? 0 : (deck === activeDeckRef.current ? volumeRef.current * 100 : 0);
            event.target.setVolume(initialVol);
            const frame = event.target.getIframe?.();
            frame?.setAttribute("tabindex", "-1");
            frame?.setAttribute("aria-hidden", "true");
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
            const state = event.data;
            const isThisActiveDeck = deck === activeDeckRef.current && !localDeck.current;

            if (state === 1) {
              if (isThisActiveDeck) {
                const preview = previewPauseRef.current;
                if (preview) {
                  preview.shouldResume = true;
                  event.target.pauseVideo();
                  setIsPlaying(false);
                  setIsLoading(false);
                  return;
                }
                setIsPlaying(true);
                setIsLoading(false);
                setPlaybackError(null);
                if (currentTrackRef.current) {
                  fallbackRetriesRef.current.delete(currentTrackRef.current.id);
                }
                finishPlaybackMeasurement("play");
                startPollingProgress();
                if (!isTransitioningRef.current) {
                  startSeamlessFadeInRef.current?.();
                }
                if (targetSeekTimeRef.current !== null) {
                  event.target.seekTo(targetSeekTimeRef.current, true);
                  targetSeekTimeRef.current = null;
                }
                silentAudioRef.current?.play().catch(() => {});
              }
            } else if (state === 2) {
              if (isThisActiveDeck && !isTransitioningRef.current) {
                setIsPlaying(false);
                stopPollingProgress();
                silentAudioRef.current?.pause();
              }
            } else if (state === 0) {
              // Ended
              if (isThisActiveDeck) {
                if (isTransitioningRef.current) {
                  // If outgoing track reached the end while crossfade was running (e.g. background tab throttling),
                  // force-finish crossfade now to avoid stalling playback
                  if (finishCrossfadeNowRef.current) {
                    finishCrossfadeNowRef.current();
                  }
                } else {
                  setIsPlaying(false);
                  stopPollingProgress();
                  silentAudioRef.current?.pause();
                  handleTrackEndedRef.current();
                }
              }
            } else if (state === 3) {
              if (isThisActiveDeck) {
                setIsLoading(true);
              }
            }
          },
          onAutoplayBlocked: () => {
            if (deck !== activeDeckRef.current || localDeck.current) return;
            setIsLoading(false);
            setIsPlaying(false);
            setPlaybackError("Pulsa Reproducir para activar el audio en este navegador.");
          },
          onError: async (event: { data: number }) => {
            if (deck !== activeDeckRef.current || localDeck.current) return;
            const currentTrk = currentTrackRef.current;
            const currentVid = lastResolvedVideoIdRef.current;
            console.warn(`[AudioContext] YouTube player error ${event.data} for track: ${currentTrk?.title} (${currentVid})`);

            const preferredVideoId = currentTrk && !roomIdRef.current ? getPreferredTrackVideoId(currentTrk) : undefined;
            if (currentTrk && currentVid && currentVid !== preferredVideoId) {
              const retries = fallbackRetriesRef.current.get(currentTrk.id) || 0;
              if (retries < 2) {
                fallbackRetriesRef.current.set(currentTrk.id, retries + 1);
                let failedSet = failedVideoIdsRef.current.get(getResolutionKey(currentTrk));
                if (!failedSet) {
                  failedSet = new Set();
                  failedVideoIdsRef.current.set(getResolutionKey(currentTrk), failedSet);
                }
                failedSet.add(currentVid);
                invalidateTrackResolution(currentTrk.id);
                console.log(`[AudioContext] Automatically attempting fallback version for ${currentTrk.title} (Attempt ${retries + 1})...`);
                try {
                  await playTrackRef.current?.(currentTrk, undefined, undefined, false, currentTimeRef.current);
                  return;
                } catch (fallbackErr) {
                  console.warn("[AudioContext] Fallback attempt failed:", fallbackErr);
                }
              }
            }

            setIsPlaying(false);
            setIsLoading(false);
            loadedTrackId.current = null;
            playbackExpectedRef.current = false;
            setPlaybackError(event.data === 150 || event.data === 101
              ? "Esta versión tiene restricciones de reproducción. Intenta con otra versión."
              : "No se pudo reproducir la pista.");
            finishPlaybackMeasurement("play_error");
          }
        }
      });
    };

    const initPlayers = () => {
      if (ytReadyRef.current) return;
      ytReadyRef.current = true;
      try {
        ytPlayersRef.current[0] = createPlayerInstance(0);
        ytPlayersRef.current[1] = createPlayerInstance(1);
      } catch (err) {
        console.warn("Failed to initialize dual players:", err);
      }
    };

    // Load YT IFrame API
    if (window.YT && window.YT.Player) {
      initPlayers();
    } else if (!document.getElementById("yt-iframe-api-script")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initPlayers;
    } else {
      window.onYouTubeIframeAPIReady = initPlayers;
    }

    return () => {
      stopPollingProgress();
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      [0, 1].forEach(deck => {
        const p = ytPlayersRef.current[deck];
        if (p && typeof p.destroy === "function") {
          try { p.destroy(); } catch {}
        }
        const el = document.getElementById(`youtube-player-${deck}`);
        if (el) el.remove();
      });
      ytPlayersRef.current = [null, null];
      ytReadyRef.current = false;
      silentAudioRef.current?.pause();
    };
  }, []);

  // Volume sync & ramping helper for Seamless Transitions
  const isFadingInRef = useRef<boolean>(false);
  const fadeInIntervalRef = useRef<any>(null);

  const applyHardwareVolume = (effectiveVolume: number, targetDeck?: 0 | 1) => {
    const targetVol = isMuted ? 0 : Math.max(0, Math.min(1, effectiveVolume));
    localDeck.current?.player.setVolume(targetVol * 100);
    const deck = targetDeck !== undefined ? targetDeck : activeDeckRef.current;
    const player = ytPlayersRef.current[deck];
    if (player && typeof player.setVolume === "function") {
      player.setVolume(targetVol * 100);
    }
  };

  const startSeamlessFadeIn = () => {
    if (fadeInIntervalRef.current) {
      clearInterval(fadeInIntervalRef.current);
      fadeInIntervalRef.current = null;
    }
    isFadingInRef.current = false;
    // Always play at 100% of user-selected volume on direct start
    applyHardwareVolume(volume);
  };

  // Centralized helper to get next track candidate from userQueue or playlistQueue using refs
  const getNextUpcomingTrack = (): { track: Track; source: 'user_queue' | 'playlist'; nextIndex?: number } | null => {
    const uQ = userQueueRef.current;
    if (uQ && uQ.length > 0) {
      return { track: uQ[0], source: 'user_queue' };
    }
    const pQueue = playlistQueueRef.current;
    const pIdx = playlistIndexRef.current;
    const nextIdx = pIdx + 1;
    if (pQueue && nextIdx >= 0 && nextIdx < pQueue.length) {
      return { track: pQueue[nextIdx], source: 'playlist', nextIndex: nextIdx };
    }
    if (isRepeatRef.current === "all" && pQueue && pQueue.length > 0) {
      return { track: pQueue[0], source: 'playlist', nextIndex: 0 };
    }
    return null;
  };

  // Pre-cue ref to remember what track is currently preloaded on the standby deck
  const preCuedTrackIdRef = useRef<string | null>(null);
  const preCuedExplicitRef = useRef<boolean | undefined>(undefined);
  // Track readiness status of the pre-cued deck
  const preCuedReadyRef = useRef<boolean>(false);

  // Pre-cue the standby player ahead of time so the video stream is buffered and ready.
  // Uses cueVideoById which tells YouTube to download & buffer WITHOUT playing,
  // avoiding the mute/play/pause/seek hack that caused audible flashes and re-buffering.
  const preCueStandbyPlayer = async (candidate: { track: Track; source: 'user_queue' | 'playlist'; nextIndex?: number }) => {
    const nextTrackItem = withExplicitPreference(candidate.track);
    if (localDeck.current || downloadService.isTrackDownloaded(nextTrackItem.id)) return;
    if (preCuedTrackIdRef.current === nextTrackItem.id && preCuedReadyRef.current && preCuedExplicitRef.current === nextTrackItem.isExplicit) return;
    preCuedTrackIdRef.current = nextTrackItem.id;
    preCuedExplicitRef.current = nextTrackItem.isExplicit;
    preCuedReadyRef.current = false;
    
    const outgoingDeck = activeDeckRef.current;
    const standbyDeck: 0 | 1 = outgoingDeck === 0 ? 1 : 0;
    const standbyPlayer = ytPlayersRef.current[standbyDeck];
    if (!standbyPlayer || typeof standbyPlayer.loadVideoById !== "function") return;

    try {
      const failed = failedVideoIdsRef.current.get(getResolutionKey(nextTrackItem));
      const nextVideoId = await resolveTrackVideoId(nextTrackItem, undefined, failed && Array.from(failed), !roomIdRef.current);
      if (!nextVideoId || preCuedTrackIdRef.current !== nextTrackItem.id || preCuedExplicitRef.current !== nextTrackItem.isExplicit || activeDeckRef.current !== outgoingDeck) return;

      // Ensure standby player is silent before cueing
      if (typeof standbyPlayer.setVolume === "function") {
        standbyPlayer.setVolume(0);
      }
      if (typeof standbyPlayer.unMute === "function") {
        try { standbyPlayer.unMute(); } catch {}
      }

      if (typeof standbyPlayer.cueVideoById === "function") {
        standbyPlayer.cueVideoById({ videoId: nextVideoId, startSeconds: 0 });
      } else {
        standbyPlayer.loadVideoById({ videoId: nextVideoId, startSeconds: 0 });
        try { standbyPlayer.pauseVideo?.(); } catch {}
      }

      let checkAttempts = 0;
      const warmupInterval = setInterval(() => {
        checkAttempts++;
        if (isTransitioningRef.current || preCuedTrackIdRef.current !== nextTrackItem.id) {
          clearInterval(warmupInterval);
          return;
        }

        try {
          const loadedVid = standbyPlayer.getVideoData?.()?.video_id;
          const state = standbyPlayer.getPlayerState?.();
          // ONLY mark ready when the player has actually loaded nextVideoId!
          if (loadedVid === nextVideoId && (state === 5 || state === 2 || state === -1)) {
            clearInterval(warmupInterval);
            standbyPlayer.setVolume?.(0);
            preCuedReadyRef.current = true;
            return;
          }
          if (loadedVid === nextVideoId && state === 1) {
            clearInterval(warmupInterval);
            standbyPlayer.pauseVideo?.();
            standbyPlayer.setVolume?.(0);
            preCuedReadyRef.current = true;
            return;
          }
        } catch {}

        if (checkAttempts > 50) {
          clearInterval(warmupInterval);
          const loadedVid = standbyPlayer.getVideoData?.()?.video_id;
          if (loadedVid === nextVideoId) {
            standbyPlayer.setVolume?.(0);
            preCuedReadyRef.current = true;
          } else {
            preCuedReadyRef.current = false;
          }
        }
      }, 100);

    } catch (e) {
      console.warn("Standby pre-cue failed:", e);
      preCuedReadyRef.current = false;
    }
  };

  // Simultaneous Crossfade Engine: Fades OUT active player while fading IN standby player concurrently
  const performSimultaneousCrossfade = async (candidate: { track: Track; source: 'user_queue' | 'playlist'; nextIndex?: number }) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const nextTrackItem = withExplicitPreference(candidate.track);
    const operation = abortControllerRef.current;

    try {
      // Instant video ID resolution via multi-key cache / shared in-flight promise
      const failed = failedVideoIdsRef.current.get(getResolutionKey(nextTrackItem));
      const nextVideoId = await resolveTrackVideoId(nextTrackItem, undefined, failed && Array.from(failed), !roomIdRef.current);
      if (operation !== abortControllerRef.current || !isTransitioningRef.current) return;
      if (!nextVideoId || withExplicitPreference(candidate.track).isExplicit !== nextTrackItem.isExplicit) {
        throw new Error("Could not resolve the selected version for crossfade");
      }

      const outgoingDeck = activeDeckRef.current;
      const incomingDeck: 0 | 1 = outgoingDeck === 0 ? 1 : 0;
      const outgoingPlayer = ytPlayersRef.current[outgoingDeck];
      const incomingPlayer = ytPlayersRef.current[incomingDeck];

      if (!incomingPlayer || typeof incomingPlayer.loadVideoById !== "function") {
        nextTrackRef.current();
        isTransitioningRef.current = false;
        return;
      }

      // Ensure incoming player starts muted/silent before starting
      if (typeof incomingPlayer.setVolume === "function") {
        incomingPlayer.setVolume(0);
      }
      if (typeof incomingPlayer.unMute === "function") {
        try { incomingPlayer.unMute(); } catch {}
      }

      const totalCrossfadeMs = Math.max(1000, seamlessDurationRef.current * 1000);
      const startTime = Date.now();

      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
      }

      // Closure to cleanly and immediately finish crossfade handoff (used on completion or fallback)
      let finished = false;
      const completeCrossfade = () => {
        if (finished) return;
        finished = true;
        finishCrossfadeNowRef.current = null;

        if (crossfadeIntervalRef.current) {
          clearInterval(crossfadeIntervalRef.current);
          crossfadeIntervalRef.current = null;
        }

        // Stop and silence outgoing player immediately
        try {
          outgoingPlayer?.pauseVideo?.();
          outgoingPlayer?.setVolume?.(0);
        } catch {}

        // Switch active deck to incoming player and set exactly to user's slider volume
        activeDeckRef.current = incomingDeck;
        try {
          incomingPlayer.playVideo?.();
        } catch {}
        if (typeof incomingPlayer.setVolume === "function") {
          incomingPlayer.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100));
        }

        // Advance queue state seamlessly
        if (currentTrackRef.current) {
          const previous = currentTrackRef.current;
      if (!privateSession) setHistory(items => [...items.slice(-49), previous]);
        }

        if (candidate.source === 'user_queue') {
          const index = userQueueRef.current.findIndex(track => track.id === candidate.track.id);
          const nextUQ = userQueueRef.current.filter((_, position) => position !== index);
          userQueueRef.current = nextUQ;
          setUserQueue(nextUQ);
          currentTrackSourceRef.current = 'user_queue';
          setCurrentTrackSource('user_queue');
        } else {
          const targetIdx = candidate.nextIndex !== undefined ? candidate.nextIndex : 0;
          playlistIndexRef.current = targetIdx;
          setPlaylistIndex(targetIdx);
          currentTrackSourceRef.current = 'playlist';
          setCurrentTrackSource('playlist');
        }

        currentTrackRef.current = nextTrackItem;
        loadedTrackId.current = nextTrackItem.id;
        lastResolvedVideoIdRef.current = nextVideoId;
        setCurrentTrack(nextTrackItem);
        setIsPlaying(true);
        setIsLoading(false);
        setTimeout(() => {
          isTransitioningRef.current = false;
        }, 800);
      };

      // Set finishCrossfadeNowRef IMMEDIATELY so if outgoing track ends while crossfading,
      // onStateChange(0) finishes the transition smoothly instead of aborting!
      finishCrossfadeNowRef.current = completeCrossfade;

      // Start playback on incoming player
      const incomingVid = incomingPlayer.getVideoData?.()?.video_id;
      const isAlreadyCued = preCuedTrackIdRef.current === nextTrackItem.id && preCuedReadyRef.current && incomingVid === nextVideoId;
      if (isAlreadyCued) {
        incomingPlayer.playVideo?.();
      } else {
        incomingPlayer.loadVideoById({
          videoId: nextVideoId,
          startSeconds: 0
        });
      }

      preCuedTrackIdRef.current = null;
      preCuedReadyRef.current = false;

      // Ramp outgoing down while ramping incoming up concurrently
      crossfadeIntervalRef.current = setInterval(() => {
        const { progress, incoming, outgoing } = crossfadeVolumes(
          Date.now() - startTime, totalCrossfadeMs, volumeRef.current, isMutedRef.current,
        );
        outgoingPlayer?.setVolume?.(outgoing);
        incomingPlayer?.setVolume?.(incoming);

        // Check if outgoing track has reached its end (or player ended)
        let outgoingEnded = false;
        try {
          if (outgoingPlayer && typeof outgoingPlayer.getCurrentTime === "function" && typeof outgoingPlayer.getDuration === "function") {
            const outCt = outgoingPlayer.getCurrentTime() || 0;
            const outDur = outgoingPlayer.getDuration() || 0;
            if (outDur > 0 && outCt >= outDur - 0.2) {
              outgoingEnded = true;
            }
          }
          if (outgoingPlayer && typeof outgoingPlayer.getPlayerState === "function") {
            const outState = outgoingPlayer.getPlayerState();
            if (outState === 0) {
              outgoingEnded = true;
            }
          }
        } catch {}

        if (progress >= 1 || outgoingEnded) {
          completeCrossfade();
        }
      }, 50);

    } catch (e) {
      if (operation !== abortControllerRef.current || !isTransitioningRef.current) return;
      console.warn("Simultaneous crossfade error, falling back to standard advance:", e);
      finishCrossfadeNowRef.current = null;
      if (crossfadeIntervalRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
      }
      isTransitioningRef.current = false;
      nextTrackRef.current();
    }
  };

  const startPollingProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      const activePlayer = getActivePlayer();
      if (activePlayer && typeof activePlayer.getCurrentTime === "function") {
        const ct = activePlayer.getCurrentTime() || 0;
        const dur = activePlayer.getDuration() || 0;
        setCurrentTime(ct);
        if (lastDuration.current !== dur) {
          lastDuration.current = dur;
          setDuration(dur);
        }

        // Spotify-style Simultaneous Crossfade & Early Standby Pre-cueing:
        if (
          dur > 10 &&
          !localDeck.current &&
          ct > 0 &&
          !isTransitioningRef.current &&
          !isFadingInRef.current &&
          sleepTimerRemaining === null &&
          isRepeatRef.current !== "one"
        ) {
          const remaining = dur - ct;
          const fadeSecs = seamlessDurationRef.current;
          const candidate = getNextUpcomingTrack();

          // Early Pre-cue: 25 seconds before track ends, buffer standby player completely!
          // Runs for BOTH crossfade and standard playback so the next track is ALWAYS ready with 0 delay!
          if (candidate && remaining <= Math.max(25, fadeSecs + 15) && remaining > fadeSecs) {
            preCueStandbyPlayer(candidate);
          }

          // Trigger crossfade when remaining hits seamlessDuration
          if (seamlessTransitionsRef.current && candidate && !downloadService.isTrackDownloaded(candidate.track.id)) {
            if (remaining <= fadeSecs && remaining > 0.3) {
              performSimultaneousCrossfade(candidate);
            } else if (remaining <= 0.3) {
              performSimultaneousCrossfade(candidate);
            }
          }
        }

        // Broadcast for Listen Together
        if (roomIdRef.current && isHostRef.current && Date.now() - lastBroadcastRef.current > 4000) {
          lastBroadcastRef.current = Date.now();
          broadcastState(ct, true, currentTrackRef.current);
        }
      }
    }, 100);
  };

  const stopPollingProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const showToast = (message: string, type: "info" | "success" | "error" = "info") => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Sync volume to active YT player or Android (always 100% on native/flutter platforms)
  useEffect(() => {
    if (!isFadingInRef.current && !isTransitioningRef.current && sleepTimerRemaining === null) {
      applyHardwareVolume(volume);
    }
  }, [volume, isMuted]);

  const handleTrackEnded = () => {
    if (isRepeatRef.current === "one") {
      const active = getActivePlayer();
      if (active) {
        active.seekTo(0, true);
        active.playVideo();
      }
      setIsPlaying(true);
    } else {
      nextTrackRef.current();
    }
  };

  const shuffleArray = (tracks: Track[], precedingTrack?: Track | null, balance = smartShuffle) => {
    const shuffled = [...tracks];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    if (!balance) return shuffled;

    const artistKey = (track: Track) => (track.artists?.[0]?.name || getArtistsFromTrack(track)[0].name).trim().toLowerCase();
    const buckets = new Map<string, Track[]>();
    for (const track of shuffled) {
      const artist = artistKey(track);
      const bucket = buckets.get(artist) ?? [];
      bucket.push(track);
      buckets.set(artist, bucket);
    }

    let last = precedingTrack ? artistKey(precedingTrack) : undefined;
    const balanced: Track[] = [];
    while (buckets.size > 0) {
      let artist: string | undefined;
      let largest = 0;
      for (const [candidate, bucket] of buckets) {
        if (candidate !== last && bucket.length > largest) {
          artist = candidate;
          largest = bucket.length;
        }
      }
      artist ??= buckets.keys().next().value!;
      const bucket = buckets.get(artist)!;
      balanced.push(bucket.pop()!);
      if (!bucket.length) buckets.delete(artist);
      last = artist;
    }
    return balanced;
  };

  const setSmartShuffle = (enabled: boolean) => {
    setSmartShufflePreference(enabled);
    if (enabled === smartShuffle || !isShuffle || (roomIdRef.current && !isHostRef.current) || isTransitioningRef.current) return;
    const queue = playlistQueueRef.current;
    const start = playlistIndexRef.current + 1;
    const prefix = queue.slice(0, start);
    const preceding = userQueueRef.current.at(-1) ?? currentTrackRef.current;
    const updated = [...prefix, ...shuffleArray(queue.slice(start), preceding, enabled)];
    playlistQueueRef.current = updated;
    setPlaylistQueue(updated);
    preCuedTrackIdRef.current = null;
    preCuedExplicitRef.current = undefined;
    preCuedReadyRef.current = false;
  };

  const playTrack = async (track: Track, newQueue?: Track[], playlistId?: string | null, isRemoteSync?: boolean, startAt = 0, forceOnline = false, startShuffled = false, savedUserQueue?: Track[]) => {
    if (roomIdRef.current && !isHostRef.current && !isRemoteSync) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }

    track = withExplicitPreference(track);
    const savedVideoId = getPreferredTrackVideoId(track);
    const preferredVideoId = roomIdRef.current ? undefined : savedVideoId;

    if (track.id.startsWith("local-") && roomIdRef.current) {
      showToast("Los archivos locales no se pueden reproducir en una sala.", "info");
      return;
    }

    // Keep retries and resumes from consuming another guest play.
    if (!currentUser && !isRemoteSync && currentTrack?.id !== track.id && !track.id.startsWith("local-")) {
      const savedCount = localStorage.getItem("ibrastream_guest_tracks_played");
      const playedCount = savedCount ? parseInt(savedCount, 10) : 0;
      if (playedCount >= 3) {
        showToast(localized(language, "Crea una cuenta para seguir escuchando", "Please create an account to continue listening", "Sortu kontu bat entzuten jarraitzeko"), "error");
        window.dispatchEvent(new Event("ibrastream_force_login"));
        return;
      }
      localStorage.setItem("ibrastream_guest_tracks_played", String(playedCount + 1));
    }

    // Abort previous loading request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    previewPauseRef.current = null;
    setPlaybackError(null);
    playbackStarted.current = performance.now();
    loadedTrackId.current = null;
    lastResolvedVideoIdRef.current = null;
    if (!isRemoteSync) targetSeekTimeRef.current = startAt > 0 ? startAt : null;
    setCurrentTime(isRemoteSync ? targetSeekTimeRef.current ?? 0 : startAt);
    setDuration(track.duration || 0);

    if (playlistId !== undefined && !isRemoteSync) {
      if (savedUserQueue || playlistId !== playingPlaylistId) {
        const next = savedUserQueue ?? [];
        userQueueRef.current = next;
        setUserQueue(next);
      }
      setPlayingPlaylistId(playlistId);
      if (playlistId) {
        localStorage.setItem("ibrastream_playing_playlist_id", playlistId);
      } else {
        localStorage.removeItem("ibrastream_playing_playlist_id");
      }
    }

    if (newQueue && !isRemoteSync) {
      const enrichedQueue = newQueue;

      setOriginalPlaylistQueue(enrichedQueue);
      if (savedUserQueue) setIsShuffle(false);
      if (!savedUserQueue && (isShuffle || startShuffled)) {
        if (startShuffled) setIsShuffle(true);
        const index = enrichedQueue.findIndex(item => item.id === track.id);
        const otherTracks = enrichedQueue.filter((_, position) => position !== index);
        const shuffled = [track, ...shuffleArray(otherTracks, userQueueRef.current.at(-1) ?? track)];
        playlistQueueRef.current = shuffled;
        playlistIndexRef.current = 0;
        setPlaylistQueue(shuffled);
        setPlaylistIndex(0);
      } else {
        playlistQueueRef.current = enrichedQueue;
        const index = enrichedQueue.findIndex(t => t.id === track.id);
        const targetIdx = index !== -1 ? index : 0;
        playlistIndexRef.current = targetIdx;
        setPlaylistQueue(enrichedQueue);
        setPlaylistIndex(targetIdx);
      }
      currentTrackSourceRef.current = 'playlist';
      setCurrentTrackSource('playlist');
    } else if (!isRemoteSync) {
      if (currentTrack && currentTrack.id === track.id) {
        // Same track, do nothing
      } else {
        const userQueueIdx = userQueue.findIndex(t => t.id === track.id);
        if (userQueueIdx !== -1) {
          const nextUQ = userQueue.slice(userQueueIdx + 1);
          userQueueRef.current = nextUQ;
          setUserQueue(nextUQ);
          currentTrackSourceRef.current = 'user_queue';
          setCurrentTrackSource('user_queue');
        } else {
          const playlistIdx = playlistQueue.findIndex(t => t.id === track.id);
          if (playlistIdx !== -1) {
            playlistIndexRef.current = playlistIdx;
            setPlaylistIndex(playlistIdx);
            currentTrackSourceRef.current = 'playlist';
            setCurrentTrackSource('playlist');
          } else {
            playlistQueueRef.current = [track];
            playlistIndexRef.current = 0;
            setPlaylistQueue([track]);
            setPlaylistIndex(0);
            currentTrackSourceRef.current = 'playlist';
            setCurrentTrackSource('playlist');
          }
        }
      }
    }

    playbackExpectedRef.current = true;
    currentTrackRef.current = track;
    setCurrentTrack(track);

    activeListenRef.current = null;
    positionSample.current = null;

    // Add to recently played via StorageService.
    if (!privateSession) try {
      const saved = StorageService.getItemSync<Track[]>("ibrastream_recently_played");
      let recent: Track[] = Array.isArray(saved) ? saved.filter(item => typeof item.title === "string") : [];
      recent = recent.filter(t => t.id !== track.id);
      recent.unshift(track);
      recent = recent.slice(0, 30);
      StorageService.setItemSync("ibrastream_recently_played", recent);
      window.dispatchEvent(new Event("ibrastream_history_updated"));
    } catch (e) {
      console.error("Failed to save to recently played:", e);
    }
    setIsPlaying(false);
    setIsLoading(true);

    // Cancel any in-flight crossfade
    if (crossfadeIntervalRef.current) {
      clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }
    finishCrossfadeNowRef.current = null;
    isTransitioningRef.current = false;

    if (localDeck.current) {
      const previous = localDeck.current;
      localDeck.current = null;
      previous.audio.onerror = null;
      previous.audio.onplaying = null;
      previous.audio.onpause = null;
      previous.audio.onended = null;
      previous.audio.onloadedmetadata = null;
      previous.audio.pause();
      previous.audio.removeAttribute("src");
      previous.audio.load();
      previous.player.dispose();
      URL.revokeObjectURL(previous.url);
      stopPollingProgress();
    }

    const useDownload = !forceOnline && !roomIdRef.current && (!navigator.onLine || (!preferredVideoId && readTrackVersionPreference(track.id) === undefined));
    if (useDownload && downloadService.isTrackDownloaded(track.id)) {
      const url = await downloadService.getLocalUri(track.id);
      if (abortController.signal.aborted) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url) {
        getActivePlayer()?.pauseVideo?.();
        const audio = new Audio();
        const player = createLocalPlayback(audio);
        localDeck.current = { audio, player, url };
        const stillActive = () => localDeck.current?.audio === audio;
        player.setVolume(isMutedRef.current ? 0 : volumeRef.current * 100);
        audio.onloadedmetadata = () => {
          if (stillActive() && startAt) player.seekTo(Math.min(startAt, audio.duration || startAt));
        };
        audio.onplaying = () => {
          if (!stillActive()) return;
          const preview = previewPauseRef.current;
          if (preview) {
            preview.shouldResume = true;
            player.pauseVideo();
            setIsPlaying(false);
            setIsLoading(false);
            return;
          }
          setIsPlaying(true);
          setIsLoading(false);
          setPlaybackError(null);
          finishPlaybackMeasurement("play");
          startPollingProgress();
        };
        audio.onpause = () => {
          if (!stillActive()) return;
          setIsPlaying(false);
          stopPollingProgress();
        };
        audio.onended = () => { if (stillActive()) handleTrackEndedRef.current(); };
        audio.onerror = () => {
          if (!stillActive()) return;
          console.warn("[AudioContext] Local audio error, removing corrupt download and falling back to online playback...");
          const previous = localDeck.current;
          localDeck.current = null;
          if (previous) {
            previous.audio.onerror = null;
            previous.audio.onplaying = null;
            previous.audio.onpause = null;
            previous.audio.onended = null;
            previous.audio.onloadedmetadata = null;
            previous.audio.pause();
            previous.audio.removeAttribute("src");
            previous.audio.load();
            previous.player.dispose();
            URL.revokeObjectURL(previous.url);
          }
          void downloadService.deleteTrack(track.id);
          void playTrackRef.current?.(track, undefined, undefined, false, startAt, true);
        };
        audio.src = url;
        loadedTrackId.current = track.id;
        try {
          await player.playVideo();
          if (stillActive()) {
            void player.setNormalization(normalizeLocalAudio);
            void player.setEqualizer(equalizerRef.current);
          }
        } catch {
          if (stillActive()) {
            console.warn("[AudioContext] Local deck playVideo rejected, falling back to online streaming...");
            const previous = localDeck.current;
            localDeck.current = null;
            if (previous) {
              previous.audio.onerror = null;
              previous.audio.onplaying = null;
              previous.audio.onpause = null;
              previous.audio.onended = null;
              previous.audio.onloadedmetadata = null;
              previous.audio.pause();
              previous.audio.removeAttribute("src");
              previous.audio.load();
              previous.player.dispose();
              URL.revokeObjectURL(previous.url);
            }
            void downloadService.deleteTrack(track.id);
            void playTrackRef.current?.(track, undefined, undefined, false, startAt, true);
          }
        }
        return;
      }
    }

    if (!navigator.onLine || track.id.startsWith("local-")) {
      setIsLoading(false);
      playbackExpectedRef.current = false;
      setPlaybackError("La pista no está disponible en este dispositivo sin conexión.");
      return;
    }

    // Reuse an already buffered standby track when possible.
    const standbyDeck: 0 | 1 = activeDeckRef.current === 0 ? 1 : 0;
    const standbyPlayer = ytPlayersRef.current[standbyDeck];
    const cleanId = track.id.replace(/^yt-/, "");
    const isPreCuedIdMatch = preCuedTrackIdRef.current === track.id || preCuedTrackIdRef.current === cleanId;
    const isExplicitMismatch = track.isExplicit !== preCuedExplicitRef.current;

    const standbyLoadedVid = standbyPlayer?.getVideoData?.()?.video_id;
    const standbyMatchesSource = roomIdRef.current ? !savedVideoId : !preferredVideoId || standbyLoadedVid === preferredVideoId;
    const standbySourceFailed = failedVideoIdsRef.current.get(getResolutionKey(track))?.has(standbyLoadedVid);
    if (!startAt && !isRemoteSync && isPreCuedIdMatch && !isExplicitMismatch && preCuedReadyRef.current && standbyPlayer && typeof standbyPlayer.playVideo === "function" && standbyLoadedVid && standbyMatchesSource && !standbySourceFailed) {
      console.log(`[Zero-Latency Handoff] Playing pre-cued track on standby deck: ${track.title}`);
      const outgoingPlayer = ytPlayersRef.current[activeDeckRef.current];
      try {
        outgoingPlayer?.pauseVideo?.();
        outgoingPlayer?.setVolume?.(0);
      } catch {}

      activeDeckRef.current = standbyDeck;
      if (typeof standbyPlayer.unMute === "function") {
        try { standbyPlayer.unMute(); } catch {}
      }
      if (typeof standbyPlayer.setVolume === "function") {
        standbyPlayer.setVolume(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100));
      }
      loadedTrackId.current = track.id;
      lastResolvedVideoIdRef.current = standbyLoadedVid;
      standbyPlayer.playVideo();
      preCuedTrackIdRef.current = null;
      preCuedExplicitRef.current = undefined;
      preCuedReadyRef.current = false;
      setIsPlaying(true);
      setIsLoading(false);

      if (roomIdRef.current && isHostRef.current) {
        broadcastState(0, true, track, true);
      }
      return;
    }

    // Stop current playing song immediately so user hears silence while loading next song
    [0, 1].forEach(deck => {
      const p = ytPlayersRef.current[deck];
      if (p && typeof p.pauseVideo === "function") {
        try {
          p.pauseVideo();
          if (deck !== activeDeckRef.current) p.setVolume?.(0);
        } catch {}
      }
    });

    // Broadcast immediately if host
    if (roomIdRef.current && isHostRef.current) {
      broadcastState(0, true, track, true);
    }

    try {
      const failed = failedVideoIdsRef.current.get(getResolutionKey(track));
      const excluded = failed && failed.size > 0 ? Array.from(failed) : undefined;
      const videoId = await resolveTrackVideoId(track, abortController.signal, excluded, !roomIdRef.current);
      if (abortController.signal.aborted) return;
      lastResolvedVideoIdRef.current = videoId;
      console.log(`[Playback] Playing track: ${track.title} (${videoId})`);

      // Asynchronously fetch YouTube views count without noisy console warnings
      import("../services/musicApi").then(async ({ getYoutubeClient }) => {
        try {
          const yt = await getYoutubeClient();
          const info = await yt.getBasicInfo(videoId);
          const views = info?.basic_info?.view_count;
          if (views !== undefined && !abortController.signal.aborted) {
            const formatViewCount = (count: number): string => {
              if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
              if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
              if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
              return String(count);
            };
            const playsFormatted = formatViewCount(views);
            track.plays = playsFormatted;
            setCurrentTrack(prev => prev && prev.id === track.id ? { ...prev, plays: playsFormatted } : prev);
          }
        } catch {
          // Ignore YouTube info parsing warnings
        }
      });

      // Web: Load video via YouTube IFrame API

      let activePlayer = getActivePlayer();
      if (!activePlayer || typeof activePlayer.loadVideoById !== "function") {
        for (let attempt = 0; attempt < 10; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (abortController.signal.aborted) return;
          activePlayer = getActivePlayer();
          if (activePlayer && typeof activePlayer.loadVideoById === "function") {
            break;
          }
        }
        if (!activePlayer || typeof activePlayer.loadVideoById !== "function") {
          throw new Error("YouTube Player not fully initialized.");
        }
      }
      loadedTrackId.current = track.id;
      const from = targetSeekTimeRef.current ?? 0;
      if (from > 0) activePlayer.loadVideoById({ videoId, startSeconds: from });
      else activePlayer.loadVideoById(videoId);
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`Playback aborted for track: ${track.title}`);
        return;
      }
      console.error("Play failed:", err);
      playbackExpectedRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
      loadedTrackId.current = null;
      setPlaybackError("No se pudo abrir la fuente de audio. Puedes reintentar o saltar la pista.");
      finishPlaybackMeasurement("play_error");
    }
  };

  const playShuffledPlaylist = (tracks: Track[], playlistId: string) => {
    const track = tracks[Math.floor(Math.random() * tracks.length)];
    if (track) void playTrack(track, tracks, playlistId, false, 0, false, true);
  };

  const restoreQueue = (track: Track, upcoming: Track[], manual: Track[], playlistId: string | null, seconds: number) => {
    void playTrack(track, [track, ...upcoming], playlistId, false, seconds, false, false, manual);
  };

  playTrackRef.current = playTrack;

  function retryPlayback() {
    if (!currentTrack || isLoading || (roomIdRef.current && !isHostRef.current)) return;
    const rejectedVideoId = lastResolvedVideoIdRef.current;
    const preferredVideoId = roomIdRef.current ? undefined : getPreferredTrackVideoId(currentTrack);
    if (rejectedVideoId && rejectedVideoId !== preferredVideoId) {
      let failedSet = failedVideoIdsRef.current.get(getResolutionKey(currentTrack));
      if (!failedSet) {
        failedSet = new Set();
        failedVideoIdsRef.current.set(getResolutionKey(currentTrack), failedSet);
      }
      failedSet.add(rejectedVideoId);
    }
    invalidateTrackResolution(currentTrack.id);
    void playTrack(currentTrack, undefined, undefined, false, currentTime);
  }

  function chooseTrackSource(track: Track, videoId: string) {
    if (roomIdRef.current || track.id.startsWith("local-") || !videoIdPattern.test(videoId)) return;

    const sourceKey = trackSourceKey(track);
    StorageService.setItemSync(sourceKey, { videoId });
    failedVideoIdsRef.current.get(getResolutionKey(track))?.delete(videoId);
    fallbackRetriesRef.current.delete(track.id);
    invalidateTrackResolution(track.id);

    const activeTrack = currentTrackRef.current;
    if (activeTrack && trackSourceKey(activeTrack) === sourceKey) {
      void playTrack(activeTrack, undefined, undefined, false, 0, true);
    }
  }

  function getTrackSourceVideoId(track: Track): string | undefined {
    const activeTrack = currentTrackRef.current;
    if (activeTrack && trackSourceKey(activeTrack) === trackSourceKey(track)) {
      return localDeck.current ? undefined : lastResolvedVideoIdRef.current ?? undefined;
    }
    return getPreferredTrackVideoId(track);
  }

  function pauseForTrackPreview(): () => void {
    if (roomIdRef.current || previewPauseRef.current) return () => {};
    const pause = { shouldResume: isPlayingRef.current };
    const track = currentTrackRef.current;
    const operation = abortControllerRef.current;
    const player = getActivePlayer();
    previewPauseRef.current = pause;

    if (pause.shouldResume) {
      if (isTransitioningRef.current) {
        clearInterval(crossfadeIntervalRef.current);
        crossfadeIntervalRef.current = null;
        finishCrossfadeNowRef.current = null;
        isTransitioningRef.current = false;
        const standby = ytPlayersRef.current[activeDeckRef.current === 0 ? 1 : 0];
        standby?.pauseVideo?.();
        standby?.setVolume?.(0);
        player?.setVolume?.(isMutedRef.current ? 0 : Math.round(volumeRef.current * 100));
      }
      playbackExpectedRef.current = false;
      player?.pauseVideo?.();
      stopPollingProgress();
      isPlayingRef.current = false;
      setIsPlaying(false);
    }

    return () => {
      if (previewPauseRef.current !== pause) return;
      previewPauseRef.current = null;
      if (!pause.shouldResume || roomIdRef.current || operation !== abortControllerRef.current ||
          currentTrackRef.current?.id !== track?.id) return;
      togglePlayRef.current();
    };
  }

  const togglePlay = () => {
    if (previewPauseRef.current) return;
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }

    if (!currentTrack || isLoading) return;
    if (loadedTrackId.current !== currentTrack.id) {
      void playTrack(currentTrack, undefined, undefined, false, currentTime);
      return;
    }

    const nextState = !isPlaying;
    playbackExpectedRef.current = nextState;

    const active = getActivePlayer();
    if (!active) return;
    if (nextState) {
      if (localDeck.current) {
        void localDeck.current.player.playVideo().catch(() => {
          console.warn("[AudioContext] localDeck playVideo rejected, falling back to online stream...");
          const prev = localDeck.current;
          localDeck.current = null;
          if (prev) {
            prev.audio.onerror = null;
            prev.audio.onplaying = null;
            prev.audio.onpause = null;
            prev.audio.onended = null;
            prev.audio.onloadedmetadata = null;
            prev.audio.pause();
            prev.audio.removeAttribute("src");
            prev.audio.load();
            prev.player.dispose();
            URL.revokeObjectURL(prev.url);
          }
          if (currentTrack) {
            void downloadService.deleteTrack(currentTrack.id);
            void playTrack(currentTrack, undefined, undefined, false, currentTime, true);
          }
        });
      } else {
        try {
          const res = active.playVideo?.();
          if (res && typeof res.catch === "function") {
            res.catch(() => {
              setPlaybackError("Haz clic en la página para activar el audio en este navegador.");
            });
          }
        } catch {
          setPlaybackError("Haz clic en la página para activar el audio en este navegador.");
        }
      }
    } else {
      active.pauseVideo?.();
    }

    setIsPlaying(nextState);

    if (roomIdRef.current && isHostRef.current) {
      broadcastState(undefined, nextState, currentTrackRef.current, true);
    }
  };

  const nextTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    
    if (currentTrackRef.current && !privateSession) {
      const track = currentTrackRef.current;
      setHistory(prev => [...prev.slice(-49), track]);
    }

    const candidate = getNextUpcomingTrack();
    if (candidate) {
      if (candidate.source === 'user_queue') {
        const nextUQ = userQueueRef.current.slice(1);
        userQueueRef.current = nextUQ;
        setUserQueue(nextUQ);
        currentTrackSourceRef.current = 'user_queue';
        setCurrentTrackSource('user_queue');
      } else {
        const targetIdx = candidate.nextIndex !== undefined ? candidate.nextIndex : 0;
        playlistIndexRef.current = targetIdx;
        setPlaylistIndex(targetIdx);
        currentTrackSourceRef.current = 'playlist';
        setCurrentTrackSource('playlist');
      }
      playTrack(candidate.track);
    } else {
      playbackExpectedRef.current = false;
      setIsPlaying(false);
      getActivePlayer()?.pauseVideo?.();
      if (autoplay && navigator.onLine && currentTrackRef.current && !roomIdRef.current) {
        const seed = currentTrackRef.current;
        const operation = abortControllerRef.current;
        void import("../services/recommendationEngine").then(({ getSearchRecommendations }) => getSearchRecommendations(seed.artist, [seed])).then(tracks => {
          if (operation !== abortControllerRef.current || roomIdRef.current) return;
          const explicit = localStorage.getItem("ibrastream_filter_explicit") === "true";
          const next = tracks.filter(track => track.id !== seed.id && (!explicit || !track.isExplicit));
          if (next.length) void playTrack(next[0], next, "radio-" + seed.id);
        }).catch(() => {});
      }
    }
  };

  const prevTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    if (currentTime >= 3) {
      seek(0);
      return;
    }
    

    if (history.length > 0) {
      const prevTrk = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));

      if (currentTrack && currentTrackSource === 'user_queue') {
        setUserQueue(prev => [currentTrack, ...prev]);
      }

      if (prevTrk.isUserAdded) {
        setCurrentTrackSource('user_queue');
      } else {
        const pIdx = playlistQueue.findIndex(t => t.id === prevTrk.id);
        if (pIdx !== -1) {
          setPlaylistIndex(pIdx);
        }
        setCurrentTrackSource('playlist');
      }
      playTrack(prevTrk);
    } else {
      seek(0);
    }
  };

  const seek = (time: number, isRemoteSync?: boolean) => {
    if (roomIdRef.current && !isHostRef.current && !isRemoteSync) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    
    
      const active = getActivePlayer();
      if (active && typeof active.seekTo === "function") {
        active.seekTo(time, true);
      }
    
    setCurrentTime(time);

    if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(time, duration)
        });
      } catch {}
    }

    if (roomIdRef.current && isHostRef.current) {
      broadcastState(time, undefined, currentTrackRef.current, true);
    }
  };

  const changeVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    if (clamped > 0) setIsMuted(false);
    
  };

  const toggleMute = () => setIsMuted(prev => !prev);

  const toggleShuffle = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);

    if (nextShuffle) {
      setOriginalPlaylistQueue(playlistQueue);
      let shuffled: Track[];
      if (currentTrack && currentTrackSource === 'playlist') {
        const others = playlistQueue.filter(t => t.id !== currentTrack.id);
        shuffled = [currentTrack, ...shuffleArray(others, userQueueRef.current.at(-1) ?? currentTrack)];
        setPlaylistQueue(shuffled);
        playlistQueueRef.current = shuffled;
        setPlaylistIndex(0);
        playlistIndexRef.current = 0;
      } else {
        shuffled = shuffleArray(playlistQueue, userQueueRef.current.at(-1) ?? currentTrack);
        setPlaylistQueue(shuffled);
        playlistQueueRef.current = shuffled;
        if (currentTrack && currentTrackSource === 'playlist') {
          const idx = shuffled.findIndex(t => t.id === currentTrack.id);
          const targetIdx = idx !== -1 ? idx : 0;
          setPlaylistIndex(targetIdx);
          playlistIndexRef.current = targetIdx;
        }
      }
      showToast(localized(language, "Aleatorio activado", "Shuffle on", "Ausazko modua aktibatuta"), "info");
    } else {
      if (originalPlaylistQueue.length > 0) {
        setPlaylistQueue(originalPlaylistQueue);
        playlistQueueRef.current = originalPlaylistQueue;
        if (currentTrack && currentTrackSource === 'playlist') {
          const idx = originalPlaylistQueue.findIndex(t => t.id === currentTrack.id);
          const targetIdx = idx !== -1 ? idx : 0;
          setPlaylistIndex(targetIdx);
          playlistIndexRef.current = targetIdx;
        }
      }
      showToast(localized(language, "Aleatorio desactivado", "Shuffle off", "Ausazko modua desaktibatuta"), "info");
    }
    // Invalidate any pre-cued standby track so queue change is strictly respected
    preCuedTrackIdRef.current = null;
    preCuedExplicitRef.current = undefined;
    preCuedReadyRef.current = false;
  };

  const toggleRepeat = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    setIsRepeat(prev => {
      const nextState: "none" | "one" | "all" = prev === "none" ? "all" : prev === "all" ? "one" : "none";
      showToast(nextState === "none" ? "Repeat off" : nextState === "all" ? "Repeat playlist" : "Repeat track", "info");
      return nextState;
    });
  };

  const addToQueue = (track: Track) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    if (userQueue.some(t => t.id === track.id)) {
      return;
    }
    const userTrack = { ...track, isUserAdded: true };
    setUserQueue(prev => [...prev, userTrack]);
  };

  const playNext = (track: Track) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    const userTrack = { ...track, isUserAdded: true };
    setUserQueue(prev => {
      const cleaned = prev.filter(t => t.id !== track.id);
      return [userTrack, ...cleaned];
    });
    showToast(`"${track.title}" will play next`, "success");
  };

  function rememberQueue() {
    const snapshot = { userQueue, playlistQueue, originalPlaylistQueue, playlistIndex, playingPlaylistId, history };
    const trackId = currentTrack?.id;
    clearTimeout(undoQueueTimer.current);
    setUndoQueue(() => () => {
      if (currentTrackRef.current?.id === trackId && (!roomIdRef.current || isHostRef.current)) {
        setUserQueue(snapshot.userQueue);
        setPlaylistQueue(snapshot.playlistQueue);
        setOriginalPlaylistQueue(snapshot.originalPlaylistQueue);
        setPlaylistIndex(snapshot.playlistIndex);
        setPlayingPlaylistId(snapshot.playingPlaylistId);
        setHistory(snapshot.history);
        if (snapshot.playingPlaylistId) localStorage.setItem("ibrastream_playing_playlist_id", snapshot.playingPlaylistId);
      }
      setUndoQueue(null);
    });
    undoQueueTimer.current = window.setTimeout(() => setUndoQueue(null), 8000);
  }

  const removeFromQueue = (trackId: string) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    rememberQueue();
    setUserQueue(prev => prev.filter(t => t.id !== trackId));
    setOriginalPlaylistQueue(prev => prev.filter(t => t.id !== trackId));
    setPlaylistQueue(prev => {
      const idx = prev.findIndex(t => t.id === trackId);
      if (idx !== -1 && idx <= playlistIndex && playlistIndex > 0) {
        setPlaylistIndex(playlistIndex - 1);
      }
      return prev.filter(t => t.id !== trackId);
    });
    setHistory(prev => prev.filter(t => t.id !== trackId));
    showToast(localized(language, "Canción quitada de la cola", "Removed track from queue", "Abestia ilaratik kendu da"), "info");
  };

  const clearManualQueue = () => {
    if ((roomIdRef.current && !isHostRef.current) || !userQueueRef.current.length || isTransitioningRef.current) return;
    rememberQueue();
    userQueueRef.current = [];
    setUserQueue([]);
    preCuedTrackIdRef.current = null;
    preCuedReadyRef.current = false;
    showToast(localized(language, "Cola manual vaciada", "Manual queue cleared", "Eskuzko ilara hustu da"), "info");
  };

  const clearQueue = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    rememberQueue();
    setUserQueue([]);
    setPlaylistQueue([]);
    setOriginalPlaylistQueue([]);
    setPlaylistIndex(-1);
    setPlayingPlaylistId(null);
    localStorage.removeItem("ibrastream_playing_playlist_id");
    showToast(localized(language, "Cola vaciada", "Cleared queue", "Ilara hustu da"), "info");
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast(localized(language, "Solo el anfitrión puede usar estos controles", "Controls are disabled for listeners in Listen Together", "Ostalariak bakarrik erabil ditzake kontrol hauek"), "error");
      return;
    }
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;
    if (fromIndex === toIndex) return;

    // Calculate boundary between userQueue and playlistQueue items in the merged upcoming queue
    const startIdx = playlistIndex + 1;
    const userQueueLength = userQueue.length;
    const userQueueStartInQueue = currentTrack ? 1 : 0;
    const userQueueEndInQueue = userQueueStartInQueue + userQueueLength;

    if (fromIndex >= userQueueStartInQueue && fromIndex < userQueueEndInQueue) {
      // Reordering within userQueue
      const fromOffset = fromIndex - userQueueStartInQueue;
      let toOffset = toIndex - userQueueStartInQueue;
      toOffset = Math.max(0, Math.min(userQueueLength - 1, toOffset));

      setUserQueue(prev => {
        const next = [...prev];
        const [moved] = next.splice(fromOffset, 1);
        next.splice(toOffset, 0, moved);
        return next;
      });
    } else if (fromIndex >= userQueueEndInQueue) {
      // Reordering within playlistQueue
      const playlistStartInQueue = userQueueEndInQueue;
      const fromOffset = fromIndex - playlistStartInQueue;
      let toOffset = toIndex - playlistStartInQueue;
      const remainingPlaylistLength = playlistQueue.length - startIdx;
      toOffset = Math.max(0, Math.min(remainingPlaylistLength - 1, toOffset));

      const actualFromIdx = startIdx + fromOffset;
      const actualToIdx = startIdx + toOffset;

      setPlaylistQueue(prev => {
        const next = [...prev];
        const [moved] = next.splice(actualFromIdx, 1);
        next.splice(actualToIdx, 0, moved);
        return next;
      });
      setOriginalPlaylistQueue(prev => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(actualFromIdx, 1);
        next.splice(actualToIdx, 0, moved);
        return next;
      });
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || activeEl?.closest("input, textarea, button, a, select, [contenteditable=true], [role=dialog]")) {
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        togglePlayRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, currentTime - 5));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(Math.min(duration, currentTime + 5));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        changeVolume(volume + 0.1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        changeVolume(volume - 0.1);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      } else if (e.key === "MediaTrackNext" || e.key === "F8") {
        e.preventDefault();
        nextTrackRef.current();
      } else if (e.key === "MediaTrackPrevious" || e.key === "F6") {
        e.preventDefault();
        prevTrackRef.current();
      } else if (e.key === "F7") {
        e.preventDefault();
        togglePlayRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentTime, duration, volume]);

  // Reset standby deck pre-cue if a track's resolution is invalidated (e.g. user toggles Explicit)
  useEffect(() => {
    const onResolutionInvalidated = (e: any) => {
      const tid = e.detail?.trackId;
      if (tid) {
        const cleanTid = tid.replace(/^yt-/, "");
        if (
          preCuedTrackIdRef.current === tid ||
          preCuedTrackIdRef.current === cleanTid ||
          preCuedTrackIdRef.current?.replace(/^yt-/, "") === cleanTid
        ) {
          preCuedTrackIdRef.current = null;
          preCuedExplicitRef.current = undefined;
          preCuedReadyRef.current = false;
        }
      }
    };
    window.addEventListener("ibrastream_track_resolution_invalidated", onResolutionInvalidated);
    return () => window.removeEventListener("ibrastream_track_resolution_invalidated", onResolutionInvalidated);
  }, []);

  const syncMediaSession = () => {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!currentTrack) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    try {
      session.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.albumName || "",
        artwork: currentTrack.thumbnail ? [{ src: currentTrack.thumbnail }] : [],
      });
    } catch {}
    session.playbackState = isPlaying ? "playing" : "paused";
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => { if (!isPlayingRef.current) togglePlayRef.current(); }],
      ["pause", () => { if (isPlayingRef.current) togglePlayRef.current(); }],
      ["nexttrack", () => nextTrackRef.current()],
      ["previoustrack", () => prevTrackRef.current()],
    ];
    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Browser and operating-system support varies by action.
      }
    }
  };

  useEffect(() => {
    syncMediaSession();
    const t1 = setTimeout(syncMediaSession, 300);
    const t2 = setTimeout(syncMediaSession, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
        } catch {}
      }
    };
  }, []);

  // Listen Together
  const [roomRequests, setRoomRequests] = useState<RoomTrackRequest[]>([]);
  const [directRequests, setDirectRequests] = useState(false);
  const directRequestsRef = useRef(false);
  useEffect(() => { directRequestsRef.current = directRequests; }, [directRequests]);
  const liveQueue = useRef(addToQueue);
  useEffect(() => { liveQueue.current = addToQueue; });

  function syncRoom() {
    if (!channelRef.current || isHostRef.current) return;
    void channelRef.current.send({ type: "broadcast", event: "request_state", payload: { requesterId: clientIdRef.current } });
    showToast("Sincronizando con el anfitrión…", "info");
  }

  function proposeRoomTrack(track: Track) {
    if (!channelRef.current || isHostRef.current || track.id.startsWith("local-")) return;
    void channelRef.current.send({
      type: "broadcast",
      event: "track_request",
      payload: { id: crypto.randomUUID(), proposer: userNameRef.current.slice(0, 60), track: {
        id: track.id, title: track.title, artist: track.artist, duration: track.duration,
        thumbnail: track.thumbnail, youtubeUrl: track.youtubeUrl, isExplicit: track.isExplicit, audioUrl: "",
      } },
    }).then((status: string) => showToast(status === "ok" ? "Petición enviada a la sala." : "No se pudo enviar la petición.", status === "ok" ? "success" : "error"));
  }

  function answerRoomRequest(id: string, add: boolean) {
    if (!isHostRef.current) return;
    const item = roomRequests.find(request => request.id === id);
    if (!item) return;
    if (add) addToQueue(item.track);
    setRoomRequests(items => items.filter(request => request.id !== id));
  }

  function transferRoom(id: string) {
    const channel = channelRef.current;
    if (!channel || !isHostRef.current || id === clientIdRef.current || !participants.some(item => item.id === id)) return;
    void channel.send({ type: "broadcast", event: "host_transfer", payload: { id } });
    isHostRef.current = false;
    setIsHost(false);
    void channel.track({ name: userNameRef.current, pfp: userPfpRef.current, joinedAt: myJoinedAtRef.current, isHost: false });
  }

  const leaveRoom = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    roomIdRef.current = null;
    isHostRef.current = false;
    setRoomId(null);
    setIsHost(false);
    setRoomRequests([]);
    setDirectRequests(false);
    setIsConnected(false);
    setParticipants([]);
    showToast("Left Listen Together room", "info");
  };

  const closeRoom = () => {
    if (channelRef.current && isHostRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "room_closed",
        payload: {}
      });
      // Small delay to let the broadcast send before unsubscribing
      setTimeout(() => {
        leaveRoom();
      }, 300);
    } else {
      leaveRoom();
    }
  };

  const createRoom = () => {
    if (!currentUser) {
      showToast("Please login to create a Listen Together room", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    leaveRoom();
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const newRoomId = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join("");
    roomIdRef.current = newRoomId;
    isHostRef.current = true;
    setRoomId(newRoomId);
    setIsHost(true);
    joinChannel(newRoomId);
  };

  const joinRoom = (targetRoomId: string) => {
    if (!currentUser) {
      showToast("Please login to join a Listen Together room", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    if (!targetRoomId.trim()) return;
    leaveRoom();
    const cleanId = targetRoomId.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(cleanId)) {
      showToast("El código de sala debe tener seis caracteres.", "error");
      return;
    }
    roomIdRef.current = cleanId;
    setRoomId(cleanId);
    setIsHost(false);
    joinChannel(cleanId);
  };

  const joinChannel = (roomName: string) => {
    myJoinedAtRef.current = Date.now();
    const channel = supabase.channel(roomName, {
      config: {
        broadcast: { self: false },
        presence: { key: clientIdRef.current }
      }
    });

    channel
      .on("broadcast", { event: "state_change" }, (msg: any) => {
        if (isHostRef.current) return;
        handleRemoteState(msg.payload);
      })
      .on("broadcast", { event: "request_state" }, (_msg: any) => {
        if (!isHostRef.current) return;
        broadcastState(undefined, undefined, currentTrackRef.current, true);
      })
      .on("broadcast", { event: "track_request" }, ({ payload }) => {
        if (!isHostRef.current || roomIdRef.current !== roomName) return;
        const request = payload as RoomTrackRequest;
        const track = request?.track;
        if (!track || typeof request.id !== "string" || typeof request.proposer !== "string" ||
          typeof track.id !== "string" || track.id.length > 150 || track.id.startsWith("local-") ||
          typeof track.title !== "string" || track.title.length > 200 ||
          typeof track.artist !== "string" || track.artist.length > 200) return;
        if (localStorage.getItem("ibrastream_filter_explicit") === "true" && track.isExplicit) return;
        if (directRequestsRef.current) liveQueue.current(track);
        else setRoomRequests(items => [...items.filter(item => item.id !== request.id).slice(-19), request]);
      })
      .on("broadcast", { event: "host_transfer" }, ({ payload }) => {
        if (roomIdRef.current !== roomName || payload.id !== clientIdRef.current) return;
        isHostRef.current = true;
        setIsHost(true);
        void channel.track({ name: userNameRef.current, pfp: userPfpRef.current, joinedAt: myJoinedAtRef.current, isHost: true });
        broadcastState(undefined, undefined, currentTrackRef.current, true);
      })
      .on("broadcast", { event: "room_closed" }, () => {
        if (!isHostRef.current) {
          showToast("Host has closed the room", "info");
          leaveRoom();
        }
      });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: { id: string; name: string; pfp?: string; isHost?: boolean; joinedAt: number }[] = [];
      Object.keys(state).forEach(key => {
        const presences = state[key] as any;
        if (presences && presences.length > 0) {
          const p = presences[presences.length - 1];
          users.push({
            id: key,
            name: p.name || `User ${key.substring(0, 4)}`,
            pfp: p.pfp || "",
            isHost: p.isHost || false,
            joinedAt: p.joinedAt || Date.now()
          });
        }
      });
      setParticipants(users);

      // Check if there is any active host in the presence list
      const hasHost = users.some(u => u.isHost === true);
      
      // If we have other users but no host, promote the oldest listener
      if (users.length > 0 && !hasHost) {
        const sorted = [...users].sort((a, b) => a.joinedAt - b.joinedAt);
        const oldest = sorted[0];
        
        if (oldest.id === clientIdRef.current && !isHostRef.current) {
          showToast("Host left. You are now the host of the room!", "success");
          isHostRef.current = true;
          setIsHost(true);
          // Re-track our presence info indicating we are now the host
          channel.track({
            name: userNameRef.current,
            pfp: userPfpRef.current,
            joinedAt: myJoinedAtRef.current,
            isHost: true
          }).catch((err: any) => console.error("Failed to track host promotion:", err));
          
          // Immediately broadcast current state
          broadcastState(undefined, undefined, currentTrackRef.current, true);
        }
      }
    });

    channel.subscribe((status: string) => {
      if (roomIdRef.current !== roomName) return;
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        const joinTime = myJoinedAtRef.current;
        channel.track({
          name: userNameRef.current,
          pfp: userPfpRef.current,
          joinedAt: joinTime,
          isHost: isHostRef.current
        }).catch(() => {});
        showToast(`Connected to room ${roomName}`, "success");
        if (!isHostRef.current) {
          channel.send({ type: "broadcast", event: "request_state", payload: { requesterId: clientIdRef.current } });
        }
      } else {
        setIsConnected(false);
      }
    });

    channelRef.current = channel;
  };

  const handleRemoteState = async (payload: any) => {
    const { track, isPlaying: remoteIsPlaying, position, queue: remoteQueue, currentIndex: remoteCurrentIndex, timestamp, isManual } = payload;
    if (!track) return;

    try {
      if (remoteQueue && Array.isArray(remoteQueue)) {
        setPlaylistQueue(remoteQueue);
        setOriginalPlaylistQueue(remoteQueue);
        setUserQueue([]);
        setHistory([]);
        if (remoteCurrentIndex !== undefined && remoteCurrentIndex !== -1) {
          setPlaylistIndex(remoteCurrentIndex);
          setCurrentTrackSource('playlist');
        }
      }

      if (!Number.isFinite(position) || !Number.isFinite(timestamp)) return;
      const latency = remoteIsPlaying ? Math.max(0, Math.min(5, (Date.now() - timestamp) / 1000)) : 0;
      const targetPosition = Math.max(0, Math.min(track.duration || Infinity, position + latency));

      if (!currentTrackRef.current || currentTrackRef.current.id !== track.id) {
        if (remoteIsPlaying) {
          targetSeekTimeRef.current = targetPosition;
        } else {
          targetSeekTimeRef.current = null;
        }
        await playTrack(track, undefined, undefined, true);
      } else {
        const observed = getActivePlayer()?.getCurrentTime?.() ?? 0;
        const drift = Math.abs(observed - targetPosition);
        const playPauseChanged = remoteIsPlaying !== isPlayingRef.current;
        const isFirstSixSeconds = targetPosition <= 6;

        if (isManual || playPauseChanged || isFirstSixSeconds || drift > 4) {
          if (drift > 2) {
            seek(targetPosition, true);
          }
        }
      }

      if (remoteIsPlaying !== isPlayingRef.current) {
        playbackExpectedRef.current = remoteIsPlaying;
        if (remoteIsPlaying) {
          getActivePlayer()?.playVideo?.();
          setIsPlaying(true);
        } else {
          getActivePlayer()?.pauseVideo?.();
          setIsPlaying(false);
        }
      }
    } catch (err) {
      console.warn("[ListenTogether] Failed to apply remote state:", err);
    }
  };

  const broadcastState = (customPosition?: number, forceIsPlaying?: boolean, customTrack?: Track | null, isManual = false) => {
    if (!roomIdRef.current || !isHostRef.current || !channelRef.current) return;
    const trackToBroadcast = customTrack !== undefined ? customTrack : currentTrackRef.current;
    if (!trackToBroadcast) return;

    channelRef.current.send({
      type: "broadcast",
      event: "state_change",
      payload: {
        track: trackToBroadcast,
        isPlaying: forceIsPlaying !== undefined ? forceIsPlaying : isPlayingRef.current,
        position: customPosition ?? getActivePlayer()?.getCurrentTime?.() ?? currentTime,
        queue: queueRef.current,
        currentIndex: currentIndexRef.current,
        timestamp: Date.now(),
        isManual
      }
    });
  };

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);

  const progressValue = React.useMemo(() => ({
    currentTime,
    duration
  }), [currentTime, duration]);

  const audioContextValue = React.useMemo<AudioContextType>(() => ({
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    queue,
    currentIndex,
    isShuffle,
    isRepeat,
    playingPlaylistId,
    setPlayingPlaylistId,
    playTrack,
    playShuffledPlaylist,
    restoreQueue,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    changeVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    addToQueue,
    playNext,
    removeFromQueue,
    clearQueue,
    clearManualQueue,
    playbackError,
    setPlaybackError,
    retryPlayback,
    chooseTrackSource,
    getTrackSourceVideoId,
    pauseForTrackPreview,
    privateSession,
    setPrivateSession,
    autoplay,
    setAutoplay,
    normalizeLocalAudio,
    setNormalizeLocalAudio,
    equalizer,
    setEqualizer,
    smartShuffle,
    setSmartShuffle,
    listeningEntries,
    clearListeningHistory,
    undoQueue,
    reorderQueue,
    toast,
    showToast,
    userQueue,
    playlistQueue,
    playlistIndex,
    currentTrackSource,
    history,
    accumulatedStats,
    setAccumulatedStats,
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    syncRoom,
    proposeRoomTrack,
    roomRequests,
    answerRoomRequest,
    transferRoom,
    directRequests,
    setDirectRequests,
    updateUserIdentity,
    ambientGlowEnabled,
    setAmbientGlowEnabled,
    seamlessTransitions,
    setSeamlessTransitions,
    seamlessDuration,
    setSeamlessDuration,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    lyricsProvider,
    setLyricsProvider,
    lyricsWordByWord,
    setLyricsWordByWord,
    currentUser,
  }), [
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    queue,
    currentIndex,
    isShuffle,
    isRepeat,
    playingPlaylistId,
    playTrack,
    playShuffledPlaylist,
    restoreQueue,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    changeVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    addToQueue,
    playNext,
    removeFromQueue,
    clearQueue,
    clearManualQueue,
    playbackError,
    setPlaybackError,
    retryPlayback,
    chooseTrackSource,
    getTrackSourceVideoId,
    pauseForTrackPreview,
    privateSession,
    setPrivateSession,
    autoplay,
    setAutoplay,
    normalizeLocalAudio,
    setNormalizeLocalAudio,
    equalizer,
    smartShuffle,
    setSmartShuffle,
    listeningEntries,
    clearListeningHistory,
    undoQueue,
    reorderQueue,
    toast,
    showToast,
    userQueue,
    playlistQueue,
    playlistIndex,
    currentTrackSource,
    history,
    accumulatedStats,
    setAccumulatedStats,
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    syncRoom,
    proposeRoomTrack,
    roomRequests,
    answerRoomRequest,
    transferRoom,
    directRequests,
    setDirectRequests,
    updateUserIdentity,
    ambientGlowEnabled,
    seamlessTransitions,
    seamlessDuration,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    lyricsProvider,
    lyricsWordByWord,
    currentUser,
  ]);

  return (
    <AudioContext.Provider value={audioContextValue}>
      <AudioProgressContext.Provider value={progressValue}>
        {children}
      </AudioProgressContext.Provider>
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
