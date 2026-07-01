import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import type { Track } from "../services/musicApi";
import { getYouTubeVideoId, fetchNative } from "../services/musicApi";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { supabase } from "../services/supabaseClient";
import { downloadService } from "../services/downloadService";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

const isAndroid = Capacitor.getPlatform() === "android";
const Media3Session = (Capacitor as any).Plugins?.Media3Session || registerPlugin<any>("Media3Session");

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage = "Request timed out"): Promise<T> {
  let timeoutId: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function validateStreamUrl(url: string, ms = 2500, signal?: AbortSignal): Promise<boolean> {
  if (isAndroid) {
    return true;
  }
  // 1. Try standard browser fetch (with GET + Range: bytes=0-0) first because it's CORS-safe for Piped/Cobalt and DOES NOT download the body unless we call .text()/.json()
  try {
    const res = await withTimeout(
      fetch(url, {
        method: "GET",
        headers: { "Range": "bytes=0-0" },
        signal
      }),
      ms,
      "Browser validation timed out"
    );
    if (res.status === 200 || res.status === 206) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/json")) {
        return true;
      }
    }
  } catch (e) {
    console.warn("Standard fetch validation failed/timed out, trying native HEAD...", e);
  }

  // 2. Try native HEAD request via CapacitorHttp (bypasses CORS, does not download body)
  try {
    const res = await withTimeout(
      fetchNative(url, {
        method: "HEAD",
        timeout: ms - 500
      }),
      ms,
      "Native HEAD validation timed out"
    );
    if (res.status === 200 || res.status === 204 || res.status === 206) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/json")) {
        return true;
      }
    }
  } catch (e) {
    console.warn("Native HEAD validation failed/timed out, trying native GET with Range...", e);
  }

  // 3. Fallback to native GET request with Range, but only as last resort
  try {
    const res = await withTimeout(
      fetchNative(url, {
        method: "GET",
        timeout: ms - 500,
        headers: { "Range": "bytes=0-0" }
      }),
      ms,
      "Native GET validation timed out"
    );
    if (res.status === 200 || res.status === 206) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/json")) {
        return true;
      }
    }
  } catch (e) {
    console.warn("All validation methods failed", e);
  }

  return false;
}


// Cache for pre-resolved YouTube video IDs and native stream URLs to enable instant loading/playback
const resolutionCache = new Map<string, { videoId: string; streamUrl?: string; timestamp: number }>();

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
  playTrack: (track: Track, newQueue?: Track[], playlistId?: string | null, isRemoteSync?: boolean) => void;
  togglePlay: () => void;
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
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toast: { message: string; type: "info" | "success" | "error" } | null;
  showToast: (message: string, type?: "info" | "success" | "error") => void;
  userQueue: Track[];
  playlistQueue: Track[];
  playlistIndex: number;
  currentTrackSource: 'playlist' | 'user_queue' | null;
  history: Track[];
  // Listen Together
  roomId: string | null;
  isHost: boolean;
  isConnected: boolean;
  participants: { id: string; name: string; pfp?: string }[];
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  closeRoom: () => void;
  updateUserIdentity: (name: string, pfp?: string) => void;
  // Custom Settings & Premium features
  ambientGlowEnabled: boolean;
  setAmbientGlowEnabled: (val: boolean) => void;
  eqPreset: "flat" | "bass" | "vocal" | "electronic";
  setEqPreset: (val: "flat" | "bass" | "vocal" | "electronic") => void;
  sleepTimerRemaining: number | null;
  startSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  onlyDownloaded: boolean;
  setOnlyDownloaded: (val: boolean) => void;
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
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => {
    const saved = localStorage.getItem("ibrastream_current_track");
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(() => {
    return localStorage.getItem("ibrastream_playing_playlist_id");
  });
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
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
    q.push(...history);
    if (currentTrack) {
      q.push(currentTrack);
    }
    q.push(...userQueue);
    const startIdx = currentTrackSource === 'playlist' ? playlistIndex + 1 : playlistIndex;
    if (startIdx >= 0 && startIdx < playlistQueue.length) {
      q.push(...playlistQueue.slice(startIdx));
    }
    return q;
  }, [history, currentTrack, userQueue, playlistQueue, playlistIndex, currentTrackSource]);

  const currentIndex = useMemo(() => {
    return currentTrack ? history.length : -1;
  }, [currentTrack, history]);
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

  useEffect(() => {
    roomIdRef.current = roomId;
    isHostRef.current = isHost;
  }, [roomId, isHost]);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);

  // Persist playback settings in localStorage
  useEffect(() => {
    localStorage.setItem("ibrastream_volume", String(volume));
    localStorage.setItem("ibrastream_is_muted", String(isMuted));
    localStorage.setItem("ibrastream_is_shuffle", String(isShuffle));
    localStorage.setItem("ibrastream_is_repeat", isRepeat);
  }, [volume, isMuted, isShuffle, isRepeat]);

  // Persist queue and playing track state
  useEffect(() => {
    localStorage.setItem("ibrastream_queue", JSON.stringify(queue));
    localStorage.setItem("ibrastream_current_index", String(currentIndex));
    localStorage.setItem("ibrastream_user_queue", JSON.stringify(userQueue));
    localStorage.setItem("ibrastream_playlist_queue", JSON.stringify(playlistQueue));
    localStorage.setItem("ibrastream_original_playlist_queue", JSON.stringify(originalPlaylistQueue));
    localStorage.setItem("ibrastream_playlist_index", String(playlistIndex));
    localStorage.setItem("ibrastream_history", JSON.stringify(history));
    if (currentTrackSource) {
      localStorage.setItem("ibrastream_current_track_source", currentTrackSource);
    } else {
      localStorage.removeItem("ibrastream_current_track_source");
    }
    if (currentTrack) {
      localStorage.setItem("ibrastream_current_track", JSON.stringify(currentTrack));
    } else {
      localStorage.removeItem("ibrastream_current_track");
    }
  }, [queue, currentIndex, currentTrack, userQueue, playlistQueue, originalPlaylistQueue, playlistIndex, history, currentTrackSource]);

  // Trigger pre-resolution of the next song in the queue
  useEffect(() => {
    if (!currentTrack || queue.length === 0) return;
    const idx = queue.findIndex(t => t.id === currentTrack.id);
    if (idx !== -1 && idx + 1 < queue.length) {
      const nextTrack = queue[idx + 1];
      const abortController = new AbortController();
      
      // Delay pre-resolution slightly to not block startup network/CPU
      const timer = setTimeout(() => {
        preResolveTrack(nextTrack, abortController.signal).catch(() => {});
      }, 3000);
      
      return () => {
        clearTimeout(timer);
        abortController.abort();
      };
    }
  }, [currentTrack, queue]);

  // Settings & Sleep Timer States
  const [ambientGlowEnabled, setAmbientGlowEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_ambient_glow");
    return saved !== "false"; // Default to true
  });
  const [onlyDownloaded, setOnlyDownloaded] = useState<boolean>(() => {
    const saved = localStorage.getItem("ibrastream_only_downloaded");
    return saved === "true"; // Default to false
  });
  const [eqPreset, setEqPreset] = useState<"flat" | "bass" | "vocal" | "electronic">(() => {
    return (localStorage.getItem("ibrastream_eq_preset") as any) || "flat";
  });
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null);
  const sleepTimerRef = useRef<number | null>(null);
  const originalVolumeRef = useRef<number>(volume);

  useEffect(() => {
    localStorage.setItem("ibrastream_ambient_glow", String(ambientGlowEnabled));
  }, [ambientGlowEnabled]);

  useEffect(() => {
    localStorage.setItem("ibrastream_only_downloaded", String(onlyDownloaded));
    window.dispatchEvent(new Event("ibrastream_only_downloaded_changed"));
  }, [onlyDownloaded]);

  useEffect(() => {
    localStorage.setItem("ibrastream_eq_preset", eqPreset);
    if (isAndroid) {
      Media3Session.setEqualizerPreset({ preset: eqPreset }).catch(() => {});
    }
  }, [eqPreset]);

  const startSleepTimer = (minutes: number) => {
    originalVolumeRef.current = volume;
    setSleepTimerRemaining(minutes * 60);
    showToast(`Sleep timer set for ${minutes} minutes`, "success");
  };

  const cancelSleepTimer = () => {
    setSleepTimerRemaining(null);
    changeVolume(originalVolumeRef.current);
    showToast("Sleep timer cancelled", "info");
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
      showToast("Sleep timer finished. Music paused.", "info");
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

  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);

  // YouTube IFrame Player ref (web only)
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef<boolean>(false);

  // Silent audio hack to keep Media Session alive (web only)
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const progressIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const nextTrackRef = useRef<() => void>(() => {});
  const prevTrackRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => void>(() => {});
  const syncMediaSessionRef = useRef<() => void>(() => {});
  const playbackExpectedRef = useRef<boolean>(false);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
    nextTrackRef.current = nextTrack;
    prevTrackRef.current = prevTrack;
    togglePlayRef.current = togglePlay;
    syncMediaSessionRef.current = syncMediaSession;
  });

  // Initialize YouTube IFrame Player (web only)
  useEffect(() => {
    if (isAndroid) return;

    // Silent audio for Media Session background capability
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silentAudio.loop = true;
    silentAudioRef.current = silentAudio;

    // Create hidden container for YT iframe
    let ytDiv = document.getElementById("youtube-player");
    if (!ytDiv) {
      ytDiv = document.createElement("div");
      ytDiv.id = "youtube-player";
      ytDiv.setAttribute(
        "style",
        "position: fixed; top: -9999px; left: -9999px; width: 1px; height: 1px; opacity: 0.001; pointer-events: none; z-index: -9999;"
      );
      document.body.appendChild(ytDiv);
    }

    const initPlayer = () => {
      if (ytReadyRef.current) return;
      ytReadyRef.current = true;
      ytPlayerRef.current = new window.YT.Player("youtube-player", {
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
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(isMuted ? 0 : volume * 100);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering, 5=cued
            const state = event.data;
            if (state === 1) {
              setIsPlaying(true);
              setIsLoading(false);
              startPollingProgress();
              // Seek to target if set (Listen Together sync)
              if (targetSeekTimeRef.current !== null) {
                event.target.seekTo(targetSeekTimeRef.current, true);
                targetSeekTimeRef.current = null;
              }
              // Keep silent audio alive for MediaSession
              silentAudioRef.current?.play().catch(() => {});
            } else if (state === 2) {
              setIsPlaying(false);
              stopPollingProgress();
              silentAudioRef.current?.pause();
            } else if (state === 0) {
              // Ended
              setIsPlaying(false);
              stopPollingProgress();
              silentAudioRef.current?.pause();
              handleTrackEndedRef.current();
            } else if (state === 3) {
              setIsLoading(true);
            }
          },
          onError: (e: any) => {
            console.error("YouTube Player error:", e.data);
            setIsPlaying(false);
            setIsLoading(false);
            playbackExpectedRef.current = false;
            // Error codes: 2=invalid param, 5=HTML5 error, 100=not found, 101/150=embed disabled
            const msg = e.data === 150 || e.data === 101
              ? "This track cannot be embedded. Trying next..."
              : "Playback error. Trying next track...";
            showToast(msg, "error");
            setTimeout(() => nextTrackRef.current(), 2000);
          }
        }
      });
    };

    // Load YT IFrame API
    if (window.YT && window.YT.Player) {
      initPlayer();
    } else if (!document.getElementById("yt-iframe-api-script")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api-script";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initPlayer;
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      stopPollingProgress();
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === "function") {
        try { ytPlayerRef.current.destroy(); } catch {}
      }
      const playerEl = document.getElementById("youtube-player");
      if (playerEl) playerEl.remove();
      ytReadyRef.current = false;
      silentAudioRef.current?.pause();
    };
  }, []);

  // Android: Poll progress
  useEffect(() => {
    if (isAndroid) {
      const interval = window.setInterval(() => {
        Media3Session.getPlaybackInfo().then((info: any) => {
          setCurrentTime(info.position || 0);
          setDuration(info.duration || 0);
          setIsPlaying(info.isPlaying);
          if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && info.duration > 0) {
            try {
              navigator.mediaSession.setPositionState({
                duration: info.duration,
                playbackRate: 1,
                position: Math.min(info.position || 0, info.duration)
              });
            } catch {}
          }
          if (roomIdRef.current && isHostRef.current && Date.now() - lastBroadcastRef.current > 4000) {
            lastBroadcastRef.current = Date.now();
            broadcastState(info.position || 0, true, currentTrackRef.current);
          }
        }).catch(() => {});
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  const startPollingProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
        const ct = ytPlayerRef.current.getCurrentTime() || 0;
        const dur = ytPlayerRef.current.getDuration() || 0;
        setCurrentTime(ct);
        setDuration(dur);
        // Broadcast for Listen Together
        if (roomIdRef.current && isHostRef.current && Date.now() - lastBroadcastRef.current > 4000) {
          lastBroadcastRef.current = Date.now();
          broadcastState(ct, true, currentTrackRef.current);
        }
      }
    }, 500);
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

  // Sync volume to YT player or Android
  useEffect(() => {
    if (isAndroid) {
      Media3Session.setVolume({ volume: isMuted ? 0 : 1.0 }).catch(() => {});
    } else if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === "function") {
      ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
    }
  }, [volume, isMuted]);

  const handleTrackEnded = () => {
    if (isRepeatRef.current === "one") {
      if (isAndroid) {
        Media3Session.seek({ position: 0 });
        Media3Session.setPlaybackState({ isPlaying: true });
      } else if (ytPlayerRef.current) {
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.playVideo();
      }
      setIsPlaying(true);
    } else {
      nextTrackRef.current();
    }
  };

  const shuffleArray = (array: Track[]) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const playTrack = async (track: Track, newQueue?: Track[], playlistId?: string | null, isRemoteSync?: boolean) => {
    if (roomIdRef.current && !isHostRef.current && !isRemoteSync) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }

    // Check track limit for guests
    if (!currentUser && !isRemoteSync) {
      const savedCount = localStorage.getItem("ibrastream_guest_tracks_played");
      const playedCount = savedCount ? parseInt(savedCount, 10) : 0;
      if (playedCount >= 3) {
        showToast("Please create an account to continue listening", "error");
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

    if (playlistId !== undefined && !isRemoteSync) {
      setPlayingPlaylistId(playlistId);
      if (playlistId) {
        localStorage.setItem("ibrastream_playing_playlist_id", playlistId);
      } else {
        localStorage.removeItem("ibrastream_playing_playlist_id");
      }
    } else if (newQueue && !isRemoteSync) {
      setPlayingPlaylistId(null);
      localStorage.removeItem("ibrastream_playing_playlist_id");
    }

    if (!isRemoteSync) {
      if (newQueue) {
        setOriginalPlaylistQueue(newQueue);
        if (currentTrack) {
          setHistory(prev => [...prev, currentTrack]);
        }
        if (isShuffle) {
          const otherTracks = newQueue.filter(t => t.id !== track.id);
          const shuffled = [track, ...shuffleArray(otherTracks)];
          setPlaylistQueue(shuffled);
          setPlaylistIndex(0);
        } else {
          setPlaylistQueue(newQueue);
          const index = newQueue.findIndex(t => t.id === track.id);
          setPlaylistIndex(index !== -1 ? index : 0);
        }
        setCurrentTrackSource('playlist');
      } else {
        if (currentTrack && currentTrack.id === track.id) {
          // Same track, do nothing
        } else {
          if (currentTrack) {
            setHistory(prev => [...prev, currentTrack]);
          }
          const userQueueIdx = userQueue.findIndex(t => t.id === track.id);
          if (userQueueIdx !== -1) {
            setUserQueue(prev => prev.slice(userQueueIdx + 1));
            setCurrentTrackSource('user_queue');
          } else {
            const playlistIdx = playlistQueue.findIndex(t => t.id === track.id);
            if (playlistIdx !== -1) {
              setPlaylistIndex(playlistIdx);
              setCurrentTrackSource('playlist');
            } else {
              setPlaylistQueue([track]);
              setPlaylistIndex(0);
              setCurrentTrackSource('playlist');
            }
          }
        }
      }
    }

    playbackExpectedRef.current = true;
    setCurrentTrack(track);

    // Add to recently played in localStorage
    try {
      const saved = localStorage.getItem("ibrastream_recently_played");
      let recent: Track[] = saved ? JSON.parse(saved) : [];
      recent = recent.filter(t => t.id !== track.id);
      recent.unshift(track);
      recent = recent.slice(0, 50);
      localStorage.setItem("ibrastream_recently_played", JSON.stringify(recent));
      window.dispatchEvent(new Event("ibrastream_history_updated"));
    } catch (e) {
      console.error("Failed to save to recently played:", e);
    }
    setIsPlaying(false);
    setIsLoading(true);

    // Stop current playing song immediately so user hears silence while loading next song
    if (isAndroid) {
      Media3Session.setPlaybackState({ isPlaying: false }).catch(() => {});
    } else if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
      try { ytPlayerRef.current.pauseVideo(); } catch {}
    }

    // 1. Check for Offline Local File first
    if (isAndroid) {
      const localUri = await downloadService.getLocalUri(track.id);
      if (localUri) {
        console.log(`Playing offline version for: ${track.title}`);
        await Media3Session.updateMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.thumbnail,
          duration: track.duration,
          streamUrl: localUri,
          mediaId: track.id
        });
        await Media3Session.setPlaybackState({ isPlaying: true });
        return;
      }
    }

    // Broadcast immediately if host
    if (roomIdRef.current && isHostRef.current) {
      broadcastState(0, true, track, true);
    }

    try {
      let videoId = "";
      let streamUrl = "";
      
      const cached = resolutionCache.get(track.id);
      if (cached && cached.videoId) {
        console.log(`[Cache Hit] Playing pre-resolved track: ${track.title}`);
        videoId = cached.videoId;
        if (isAndroid) {
          if (cached.streamUrl) {
            const isCachedValid = await validateStreamUrl(cached.streamUrl, 2500, abortController.signal);
            if (isCachedValid) {
              streamUrl = cached.streamUrl;
            } else {
              console.log("Cached streamUrl is invalid or hung. Re-resolving stream URL...");
              cached.streamUrl = undefined;
              streamUrl = await getAndroidStreamUrl(videoId, track, abortController.signal);
              if (abortController.signal.aborted) return;
              cached.streamUrl = streamUrl;
            }
          } else {
            streamUrl = await getAndroidStreamUrl(videoId, track, abortController.signal);
            if (abortController.signal.aborted) return;
            cached.streamUrl = streamUrl;
          }
        }
      } else {
        videoId = await getYouTubeVideoId(track, abortController.signal);
        if (abortController.signal.aborted) return;
        if (isAndroid) {
          streamUrl = await getAndroidStreamUrl(videoId, track, abortController.signal);
          if (abortController.signal.aborted) return;
        }
        resolutionCache.set(track.id, { videoId, streamUrl, timestamp: Date.now() });
      }

      // Asynchronously fetch YouTube views count
      import("../services/musicApi").then(async ({ getYoutubeClient }) => {
        try {
          const yt = await getYoutubeClient();
          const info = await yt.getBasicInfo(videoId);
          const views = info.basic_info.view_count;
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
        } catch (e) {
          console.warn("Failed to fetch YouTube views:", e);
        }
      });

      if (isAndroid) {
        await Media3Session.updateMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.thumbnail,
          duration: track.duration,
          streamUrl,
          mediaId: track.id
        });
        await Media3Session.setPlaybackState({ isPlaying: true });
      } else {
        // Web: use YouTube IFrame API
        if (!ytPlayerRef.current || typeof ytPlayerRef.current.loadVideoById !== "function") {
          // Player not ready yet — wait briefly and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!ytPlayerRef.current || typeof ytPlayerRef.current.loadVideoById !== "function") {
            throw new Error("YouTube Player not fully initialized.");
          }
        }
        ytPlayerRef.current.loadVideoById(videoId);
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`Playback aborted for track: ${track.title}`);
        return;
      }
      console.error("Play failed:", err);
      playbackExpectedRef.current = false;
      setIsPlaying(false);
      setIsLoading(false);
      showToast(`Failed to play "${track.title}". Stream unavailable.`, "error");
    }
  };

  const getAndroidStreamUrl = async (videoId: string, _track: Track, signal?: AbortSignal): Promise<string> => {
    try {
      console.log("Trying primary deciphering via youtubei.js (Innertube) for Android...");
      const { getYouTubeAudioStream } = await import("../services/musicApi");
      const url = await getYouTubeAudioStream(videoId);
      if (url) {
        console.log("Successfully got stream URL via youtubei.js on Android, validating accessibility natively...");
        const isValid = await validateStreamUrl(url, 2500, signal);
        if (isValid) {
          console.log(`Stream URL validated successfully`);
          return url;
        } else {
          throw new Error("Validation returned invalid response or hung");
        }
      }
    } catch (e) {
      console.warn("youtubei.js/Cobalt stream resolution or validation failed on Android:", e);
    }

    throw new Error("Failed to get playback stream URL.");
  };

  const preResolveTrack = async (track: Track, signal?: AbortSignal) => {
    if (!track) return;
    
    const cached = resolutionCache.get(track.id);
    if (cached && cached.videoId && cached.streamUrl) {
      if (isAndroid) {
        try {
          const isValid = await validateStreamUrl(cached.streamUrl, 2500, signal);
          if (isValid) {
            await Media3Session.setNextMetadata({
              title: track.title,
              artist: track.artist,
              artwork: track.thumbnail,
              duration: track.duration,
              streamUrl: cached.streamUrl,
              mediaId: track.id
            });
            return;
          }
          cached.streamUrl = undefined;
        } catch (e) {
          cached.streamUrl = undefined;
        }
      } else {
        return;
      }
    }

    try {
      console.log(`[Pre-Resolve] Pre-resolving track: ${track.title}`);
      
      // Fetch lyrics in parallel in background
      import("../services/musicApi").then(({ getLyricsForTrack }) => {
        if (signal?.aborted) return;
        getLyricsForTrack(track).catch(() => {});
      });

      const videoId = await getYouTubeVideoId(track, signal);
      if (signal?.aborted) return;
      let streamUrl: string | undefined;
      
      if (isAndroid) {
        streamUrl = await getAndroidStreamUrl(videoId, track, signal);
      }
      if (signal?.aborted) return;
      
      resolutionCache.set(track.id, {
        videoId,
        streamUrl,
        timestamp: Date.now()
      });
      console.log(`[Pre-Resolve] Pre-resolved track: ${track.title}`);

      if (isAndroid && streamUrl) {
        try {
          await Media3Session.setNextMetadata({
            title: track.title,
            artist: track.artist,
            artwork: track.thumbnail,
            duration: track.duration,
            streamUrl,
            mediaId: track.id
          });
        } catch (e) {
          console.warn("Failed to set native next metadata after resolution:", e);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log(`[Pre-Resolve] Aborted pre-resolution for track: ${track.title}`);
      } else {
        console.warn(`[Pre-Resolve] Failed to pre-resolve track: ${track.title}`, err);
      }
    }
  };

  const togglePlay = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }

    if (!currentTrack) return;

    const nextState = !isPlaying;
    playbackExpectedRef.current = nextState;

    if (isAndroid) {
      Media3Session.setPlaybackState({ isPlaying: nextState })
        .catch((err: any) => console.error("Toggle play failed", err));
    } else {
      if (!ytPlayerRef.current) return;
      if (nextState) {
        ytPlayerRef.current.playVideo?.();
      } else {
        ytPlayerRef.current.pauseVideo?.();
      }
    }

    setIsPlaying(nextState);

    if (roomIdRef.current && isHostRef.current) {
      broadcastState(undefined, nextState, currentTrackRef.current, true);
    }
  };

  const nextTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (currentTrack) {
      setHistory(prev => [...prev, currentTrack]);
    }

    if (userQueue.length > 0) {
      const nextTrk = userQueue[0];
      setUserQueue(prev => prev.slice(1));
      setCurrentTrackSource('user_queue');
      playTrack(nextTrk);
    } else {
      const playStartIdx = currentTrackSource === 'playlist' ? playlistIndex + 1 : playlistIndex;
      if (playStartIdx >= 0 && playStartIdx < playlistQueue.length) {
        setPlaylistIndex(playStartIdx);
        setCurrentTrackSource('playlist');
        playTrack(playlistQueue[playStartIdx]);
      } else {
        if (isRepeatRef.current === "all" && playlistQueue.length > 0) {
          setPlaylistIndex(0);
          setCurrentTrackSource('playlist');
          playTrack(playlistQueue[0]);
        } else {
          playbackExpectedRef.current = false;
          setIsPlaying(false);
        }
      }
    }
  };

  const prevTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
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
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (isAndroid) {
      Media3Session.seek({ position: time }).catch(() => {});
    } else if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
      ytPlayerRef.current.seekTo(time, true);
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
    if (isAndroid) {
      Media3Session.setVolume({ volume: clamped === 0 || isMuted ? 0 : 1.0 }).catch(() => {});
    }
  };

  const toggleMute = () => setIsMuted(prev => !prev);

  const toggleShuffle = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);

    if (nextShuffle) {
      setOriginalPlaylistQueue(playlistQueue);
      if (currentTrack && currentTrackSource === 'playlist') {
        const others = playlistQueue.filter(t => t.id !== currentTrack.id);
        const shuffled = [currentTrack, ...shuffleArray(others)];
        setPlaylistQueue(shuffled);
        setPlaylistIndex(0);
      } else {
        const shuffled = shuffleArray(playlistQueue);
        setPlaylistQueue(shuffled);
        if (currentTrack && currentTrackSource === 'playlist') {
          const idx = shuffled.findIndex(t => t.id === currentTrack.id);
          setPlaylistIndex(idx !== -1 ? idx : 0);
        }
      }
      showToast("Shuffle on", "info");
    } else {
      if (originalPlaylistQueue.length > 0) {
        setPlaylistQueue(originalPlaylistQueue);
        if (currentTrack && currentTrackSource === 'playlist') {
          const idx = originalPlaylistQueue.findIndex(t => t.id === currentTrack.id);
          setPlaylistIndex(idx !== -1 ? idx : 0);
        }
      }
      showToast("Shuffle off", "info");
    }
  };

  const toggleRepeat = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
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
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (userQueue.some(t => t.id === track.id)) {
      showToast(`"${track.title}" is already in the queue`, "info");
      return;
    }
    showToast(`Added "${track.title}" to queue`, "success");
    const userTrack = { ...track, isUserAdded: true };
    setUserQueue(prev => [...prev, userTrack]);
  };

  const playNext = (track: Track) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const userTrack = { ...track, isUserAdded: true };
    setUserQueue(prev => {
      const cleaned = prev.filter(t => t.id !== track.id);
      return [userTrack, ...cleaned];
    });
    showToast(`"${track.title}" will play next`, "success");
  };

  const removeFromQueue = (trackId: string) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    setUserQueue(prev => prev.filter(t => t.id !== trackId));
    setPlaylistQueue(prev => {
      const idx = prev.findIndex(t => t.id === trackId);
      if (idx !== -1 && idx <= playlistIndex && playlistIndex > 0) {
        setPlaylistIndex(playlistIndex - 1);
      }
      return prev.filter(t => t.id !== trackId);
    });
    setHistory(prev => prev.filter(t => t.id !== trackId));
    showToast("Removed track from queue", "info");
  };

  const clearQueue = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    setUserQueue([]);
    showToast("Cleared manual queue", "info");
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const userQueueStart = history.length + (currentTrack ? 1 : 0);
    if (fromIndex >= userQueueStart && toIndex >= userQueueStart) {
      const playStartIdx = currentTrackSource === 'playlist' ? playlistIndex + 1 : playlistIndex;
      const upcoming = [...userQueue, ...playlistQueue.slice(playStartIdx)];
      const fromOffset = fromIndex - userQueueStart;
      const toOffset = toIndex - userQueueStart;

      if (fromOffset >= 0 && fromOffset < upcoming.length && toOffset >= 0 && toOffset < upcoming.length) {
        const [moved] = upcoming.splice(fromOffset, 1);
        upcoming.splice(toOffset, 0, moved);

        const newUserQueue = upcoming.filter(t => t.isUserAdded);
        const newRemainingPlaylist = upcoming.filter(t => !t.isUserAdded);

        setUserQueue(newUserQueue);
        setPlaylistQueue(prev => [
          ...prev.slice(0, playStartIdx),
          ...newRemainingPlaylist
        ]);
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.getAttribute("contenteditable") === "true")) {
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

  const syncMediaSession = () => {
    if (!currentTrack || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.albumName || "",
        artwork: [
          { src: currentTrack.thumbnail, sizes: "96x96", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "256x256", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      });
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      navigator.mediaSession.setActionHandler("play", () => togglePlayRef.current());
      navigator.mediaSession.setActionHandler("pause", () => togglePlayRef.current());
      navigator.mediaSession.setActionHandler("nexttrack", () => nextTrackRef.current());
      navigator.mediaSession.setActionHandler("previoustrack", () => prevTrackRef.current());
    } catch {}
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
  const leaveRoom = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setRoomId(null);
    setIsHost(false);
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
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newRoomId);
    setIsHost(true);
    joinChannel(newRoomId, true);
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
    setRoomId(cleanId);
    setIsHost(false);
    joinChannel(cleanId, false);
  };

  const joinChannel = (roomName: string, hostFlag: boolean) => {
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
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        const joinTime = Date.now();
        myJoinedAtRef.current = joinTime;
        channel.track({
          name: userNameRef.current,
          pfp: userPfpRef.current,
          joinedAt: joinTime,
          isHost: hostFlag
        }).catch(() => {});
        showToast(`Connected to room ${roomName}`, "success");
        if (!hostFlag) {
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

      const latency = (Date.now() - timestamp) / 1000;
      const targetPosition = position + Math.max(0, latency);

      if (!currentTrackRef.current || currentTrackRef.current.id !== track.id) {
        if (remoteIsPlaying) {
          targetSeekTimeRef.current = targetPosition;
        } else {
          targetSeekTimeRef.current = null;
        }
        await playTrack(track, undefined, undefined, true);
      } else {
        const drift = Math.abs(currentTime - targetPosition);
        const playPauseChanged = remoteIsPlaying !== isPlayingRef.current;
        const isFirstSixSeconds = targetPosition <= 6;

        if (isManual || playPauseChanged || isFirstSixSeconds) {
          if (drift > 2) {
            seek(targetPosition, true);
          }
        }
      }

      if (remoteIsPlaying !== isPlayingRef.current) {
        playbackExpectedRef.current = remoteIsPlaying;
        if (remoteIsPlaying) {
          if (isAndroid) Media3Session.setPlaybackState({ isPlaying: true });
          else ytPlayerRef.current?.playVideo?.();
          setIsPlaying(true);
        } else {
          if (isAndroid) Media3Session.setPlaybackState({ isPlaying: false });
          else ytPlayerRef.current?.pauseVideo?.();
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
        position: customPosition !== undefined ? customPosition : currentTime,
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

  // Android: native Media3 listeners
  useEffect(() => {
    if (!isAndroid) return;
    try {
      Media3Session.addListener("onIsPlayingChanged", (data: { isPlaying: boolean }) => {
        setIsPlaying(data.isPlaying);
        if (data.isPlaying) setIsLoading(false);
        if (roomIdRef.current && isHostRef.current) {
          broadcastState(undefined, data.isPlaying, currentTrackRef.current, true);
        }
      });
      Media3Session.addListener("onPlaybackReady", () => setIsLoading(false));
      Media3Session.addListener("onPlaybackError", (data: { error: string }) => {
        console.error("Native playback error:", data.error);
        setIsLoading(false);
        setIsPlaying(false);
        showToast("Playback error. Skipping...", "error");
        setTimeout(() => nextTrackRef.current(), 2000);
      });
      Media3Session.addListener("onPlaybackEnded", () => {
        handleTrackEndedRef.current();
      });
      Media3Session.addListener("onMediaItemTransition", (data: { mediaId: string }) => {
        console.log("Native listener: onMediaItemTransition:", data.mediaId);
        const q = queueRef.current;
        const targetTrack = q.find(t => t.id === data.mediaId);
        if (targetTrack) {
          const idx = q.findIndex(t => t.id === targetTrack.id);
          setCurrentTrack(targetTrack);
          
          setUserQueue(prevUserQ => {
            const userQueueIdx = prevUserQ.findIndex(t => t.id === targetTrack.id);
            if (userQueueIdx !== -1) {
              setCurrentTrackSource('user_queue');
              return prevUserQ.slice(userQueueIdx + 1);
            } else {
              setPlaylistQueue(prevPlayQ => {
                const playlistIdx = prevPlayQ.findIndex(t => t.id === targetTrack.id);
                if (playlistIdx !== -1) {
                  setPlaylistIndex(playlistIdx);
                  setCurrentTrackSource('playlist');
                }
                return prevPlayQ;
              });
              return prevUserQ;
            }
          });

          setIsPlaying(true);
          setIsLoading(false);
          
          // Also pre-resolve the next track after this natively transitioned track
          if (idx + 1 < q.length) {
            const nextTrack = q[idx + 1];
            setTimeout(() => {
              if (currentTrackRef.current?.id === targetTrack.id) {
                preResolveTrack(nextTrack).catch(() => {});
              }
            }, 3000);
          }
        }
      });
      Media3Session.addListener("onNotificationCommand", (data: { command: string; position?: number }) => {
        if (data.command === "next") nextTrackRef.current();
        else if (data.command === "previous") prevTrackRef.current();
        else if (data.command === "seek" && data.position !== undefined) seek(data.position);
      });
    } catch (err) {
      console.warn("Failed to register native listeners:", err);
    }
    return () => {
      Media3Session.removeAllListeners().catch(() => {});
    };
  }, []);

  // Android: when the app returns to foreground, check if we should be playing
  // but the native player stopped (e.g. track ended while JS was throttled).
  useEffect(() => {
    if (!isAndroid) return;

    let handle: any;
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return; // going to background — ignore
      // Give the WebView a moment to un-throttle, then check state
      setTimeout(() => {
        Media3Session.getPlaybackInfo().then((info: any) => {
          const stoppedOrEnded = !info.isPlaying;
          const hasQueue = queueRef.current.length > 0;
          const hasTrack = !!currentTrackRef.current;
          // If we have a queue but nothing is playing, advance to next track
          if (stoppedOrEnded && hasQueue && hasTrack) {
            // Only auto-advance if position is near the end (>95% done)
            // to avoid accidentally skipping a user-paused track
            const pos = info.position || 0;
            const dur = info.duration || 0;
            const nearEnd = dur > 0 && pos / dur > 0.95;
            if (nearEnd) {
              nextTrackRef.current();
            }
          }
        }).catch(() => {});
      }, 600);
    }).then((h) => { handle = h; });

    return () => { handle?.remove?.(); };
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
    reorderQueue,
    toast,
    showToast,
    userQueue,
    playlistQueue,
    playlistIndex,
    currentTrackSource,
    history,
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    updateUserIdentity,
    ambientGlowEnabled,
    setAmbientGlowEnabled,
    eqPreset,
    setEqPreset,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    onlyDownloaded,
    setOnlyDownloaded,
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
    reorderQueue,
    toast,
    showToast,
    userQueue,
    playlistQueue,
    playlistIndex,
    currentTrackSource,
    history,
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    updateUserIdentity,
    ambientGlowEnabled,
    eqPreset,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    onlyDownloaded,
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
