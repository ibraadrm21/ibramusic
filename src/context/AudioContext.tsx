import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { Track } from "../services/musicApi";
import { getYouTubeVideoId } from "../services/musicApi";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { supabase } from "../services/supabaseClient";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

const isAndroid = Capacitor.getPlatform() === "android";
const Media3Session = (Capacitor as any).Plugins?.Media3Session || registerPlugin<any>("Media3Session");

interface AudioContextType {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
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
  // Listen Together
  roomId: string | null;
  isHost: boolean;
  isConnected: boolean;
  participants: { id: string; name: string; pfp?: string }[];
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
  updateUserIdentity: (name: string, pfp?: string) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

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
  const [queue, setQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_queue");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [originalQueue, setOriginalQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_original_queue");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const saved = localStorage.getItem("ibrastream_current_index");
    return saved ? parseInt(saved, 10) : -1;
  });
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

  const updateUserIdentity = (name: string, pfp?: string) => {
    if (name.trim()) userNameRef.current = name.trim();
    if (pfp !== undefined) userPfpRef.current = pfp;

    if (channelRef.current && isConnected) {
      channelRef.current.track({
        name: userNameRef.current,
        pfp: userPfpRef.current,
        joinedAt: Date.now()
      }).catch((err: any) => console.error("Failed to update presence info:", err));
    }
  };
  const roomIdRef = useRef<string | null>(null);
  const isHostRef = useRef<boolean>(false);
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
    localStorage.setItem("ibrastream_original_queue", JSON.stringify(originalQueue));
    localStorage.setItem("ibrastream_current_index", String(currentIndex));
    if (currentTrack) {
      localStorage.setItem("ibrastream_current_track", JSON.stringify(currentTrack));
    } else {
      localStorage.removeItem("ibrastream_current_track");
    }
  }, [queue, originalQueue, currentIndex, currentTrack]);

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
        setOriginalQueue(newQueue);
        if (isShuffle) {
          const otherTracks = newQueue.filter(t => t.id !== track.id);
          const shuffled = [track, ...shuffleArray(otherTracks)];
          setQueue(shuffled);
          setCurrentIndex(0);
        } else {
          setQueue(newQueue);
          const index = newQueue.findIndex(t => t.id === track.id);
          setCurrentIndex(index !== -1 ? index : 0);
        }
      } else {
        // Use queueRef.current (always fresh) instead of stale 'queue' state
        const currentQ = queueRef.current;
        const index = currentQ.findIndex(t => t.id === track.id);
        if (index !== -1) {
          setCurrentIndex(index);
        } else {
          // Track not in queue at all — add it
          const updatedQueue = [...currentQ, track];
          setQueue(updatedQueue);
          queueRef.current = updatedQueue;
          setOriginalQueue(prev => [...prev, track]);
          setCurrentIndex(updatedQueue.length - 1);
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

    // Broadcast immediately if host
    if (roomIdRef.current && isHostRef.current) {
      broadcastState(0, true, track);
    }

    try {
      const videoId = await getYouTubeVideoId(track, abortController.signal);
      if (abortController.signal.aborted) return;

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
        // Build a stream URL via Piped for Android native player
        const streamUrl = await getAndroidStreamUrl(videoId, track, abortController.signal);
        if (abortController.signal.aborted) return;
        await Media3Session.updateMetadata({
          title: track.title,
          artist: track.artist,
          artwork: track.thumbnail,
          duration: track.duration,
          streamUrl
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
        console.log("Successfully got stream URL via youtubei.js on Android, validating accessibility...");
        const validateResponse = await fetch(url, { method: "HEAD", signal });
        if (validateResponse.status === 403) {
          throw new Error("Validation returned 403 Forbidden");
        }
        console.log(`Stream URL validated successfully: status ${validateResponse.status}`);
        return url;
      }
    } catch (e) {
      console.warn("youtubei.js stream resolution or validation failed on Android, falling back to Piped:", e);
    }

    const PIPED_HOSTS = [
      "https://pipedapi.kavin.rocks",
      "https://api.piped.private.coffee",
      "https://pipedapi.lvk.li",
    ];

    for (const host of PIPED_HOSTS) {
      try {
        const r = await fetch(`${host}/streams/${videoId}`, {
          signal,
          headers: { "Accept": "application/json" }
        });
        if (!r.ok) continue;
        const data = await r.json();
        // Pick best audio stream
        const audio = (data.audioStreams || [])
          .filter((s: any) => s.mimeType?.includes("audio"))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        if (audio?.url) {
          console.log(`Got Android stream URL from ${host}`);
          return audio.url;
        }
      } catch (e: any) {
        if (e?.name === "AbortError") throw e;
        console.warn(`Piped ${host} failed for Android:`, e);
      }
    }

    throw new Error("Failed to get playback stream URL.");
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
      broadcastState(undefined, nextState, currentTrackRef.current);
    }
  };

  const nextTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    let nextIdx = idx + 1;
    if (nextIdx >= q.length) {
      if (isRepeatRef.current === "all") {
        nextIdx = 0;
      } else {
        playbackExpectedRef.current = false;
        setIsPlaying(false);
        return;
      }
    }

    if (q[nextIdx]) playTrack(q[nextIdx]);
  };

  const prevTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const q = queueRef.current;
    const idx = currentIndexRef.current;
    if (q.length === 0) return;

    if (currentTime >= 3) {
      seek(0);
      return;
    }

    let prevIdx = idx - 1;
    if (prevIdx < 0) {
      prevIdx = isRepeatRef.current === "all" ? q.length - 1 : 0;
    }

    if (q[prevIdx]) playTrack(q[prevIdx]);
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
      broadcastState(time, undefined, currentTrackRef.current);
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
      setOriginalQueue(queue);
      if (currentTrack) {
        const others = queue.filter(t => t.id !== currentTrack.id);
        setQueue([currentTrack, ...shuffleArray(others)]);
        setCurrentIndex(0);
      } else {
        setQueue(shuffleArray(queue));
        setCurrentIndex(0);
      }
      showToast("Shuffle on", "info");
    } else {
      if (originalQueue.length > 0) {
        setQueue(originalQueue);
        if (currentTrack) {
          const idx = originalQueue.findIndex(t => t.id === currentTrack.id);
          setCurrentIndex(idx !== -1 ? idx : 0);
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
    if (queue.some(t => t.id === track.id)) {
      showToast(`"${track.title}" is already in the queue`, "info");
      return;
    }
    showToast(`Added "${track.title}" to queue`, "success");
    setQueue(prev => [...prev, track]);
    setOriginalQueue(prev => [...prev, track]);
  };

  const playNext = (track: Track) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const cleanedQueue = queue.filter(t => t.id !== track.id);
    const cleanedOriginal = originalQueue.filter(t => t.id !== track.id);
    const currentId = currentTrack?.id;
    const activeIdx = cleanedQueue.findIndex(t => t.id === currentId);

    const newQueue = [...cleanedQueue];
    if (activeIdx !== -1) {
      newQueue.splice(activeIdx + 1, 0, track);
    } else {
      newQueue.unshift(track);
    }

    const newOriginal = [...cleanedOriginal];
    const originalActiveIdx = cleanedOriginal.findIndex(t => t.id === currentId);
    if (originalActiveIdx !== -1) {
      newOriginal.splice(originalActiveIdx + 1, 0, track);
    } else {
      newOriginal.unshift(track);
    }

    setQueue(newQueue);
    setOriginalQueue(newOriginal);

    const newIdx = newQueue.findIndex(t => t.id === currentId);
    if (newIdx !== -1) setCurrentIndex(newIdx);

    showToast(`"${track.title}" will play next`, "success");
  };

  const removeFromQueue = (trackId: string) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    setQueue(prev => prev.filter(t => t.id !== trackId));
    setOriginalQueue(prev => prev.filter(t => t.id !== trackId));
    showToast("Removed track from queue", "info");
  };

  const clearQueue = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const newQ = currentTrack ? [currentTrack] : [];
    setQueue(newQ);
    setOriginalQueue(newQ);
    setCurrentIndex(currentTrack ? 0 : -1);
    showToast("Cleared queue", "info");
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;

    const updated = [...queue];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, movedItem);
    setQueue(updated);

    const updatedOriginal = [...originalQueue];
    const originalFromIdx = updatedOriginal.findIndex(t => t.id === movedItem.id);
    if (originalFromIdx !== -1) {
      const [movedOriginal] = updatedOriginal.splice(originalFromIdx, 1);
      updatedOriginal.splice(Math.max(0, Math.min(updatedOriginal.length, toIndex)), 0, movedOriginal);
      setOriginalQueue(updatedOriginal);
    }

    if (currentIndex === fromIndex) {
      setCurrentIndex(toIndex);
    } else {
      let newIdx = currentIndex;
      if (currentIndex > fromIndex && currentIndex <= toIndex) newIdx = currentIndex - 1;
      else if (currentIndex < fromIndex && currentIndex >= toIndex) newIdx = currentIndex + 1;
      setCurrentIndex(newIdx);
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

  const createRoom = () => {
    if (!currentUser) {
      showToast("Please login to create a Listen Together room", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    leaveRoom();
    const newRoomId = `ROOM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
        if (hostFlag) return;
        handleRemoteState(msg.payload);
      })
      .on("broadcast", { event: "request_state" }, (_msg: any) => {
        if (!hostFlag) return;
        broadcastState(undefined, undefined, currentTrackRef.current);
      });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const users: { id: string; name: string; pfp?: string }[] = [];
      Object.keys(state).forEach(key => {
        const presences = state[key] as any;
        if (presences && presences.length > 0) {
          // Take the latest presence for this client ID to avoid duplicates
          const p = presences[presences.length - 1];
          users.push({
            id: key,
            name: p.name || `User ${key.substring(0, 4)}`,
            pfp: p.pfp || ""
          });
        }
      });
      setParticipants(users);
    });

    channel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        channel.track({
          name: userNameRef.current,
          pfp: userPfpRef.current,
          joinedAt: Date.now()
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
    const { track, isPlaying: remoteIsPlaying, position, queue: remoteQueue, currentIndex: remoteCurrentIndex, timestamp } = payload;
    if (!track) return;

    try {
      if (remoteQueue && Array.isArray(remoteQueue)) {
        setQueue(remoteQueue);
        setOriginalQueue(remoteQueue);
        if (remoteCurrentIndex !== undefined && remoteCurrentIndex !== -1) {
          setCurrentIndex(remoteCurrentIndex);
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
        if (drift > 2) seek(targetPosition, true);
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

  const broadcastState = (customPosition?: number, forceIsPlaying?: boolean, customTrack?: Track | null) => {
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
        timestamp: Date.now()
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

  return (
    <AudioContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isLoading,
        currentTime,
        duration,
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
        roomId,
        isHost,
        isConnected,
        participants,
        createRoom,
        joinRoom,
        leaveRoom,
        updateUserIdentity,
      }}
    >
      {children}
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
