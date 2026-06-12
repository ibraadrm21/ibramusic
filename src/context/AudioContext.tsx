import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { Track } from "../services/musicApi";
import { getYouTubeVideoId } from "../services/musicApi";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "../services/supabaseClient";

const isAndroid = Capacitor.getPlatform() === "android";
const Media3Session = registerPlugin<any>("Media3Session");



declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

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
  participants: { id: string; name: string }[];
  createRoom: () => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: () => void;
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
  const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);

  // Listen Together Refs
  const channelRef = useRef<any>(null);
  const clientIdRef = useRef<string>(Math.random().toString(36).substring(2, 11));
  const userNameRef = useRef<string>(`User-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
  const lastBroadcastRef = useRef<number>(0);
  const roomIdRef = useRef<string | null>(null);
  const isHostRef = useRef<boolean>(false);
  const currentTrackRef = useRef<Track | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const queueRef = useRef<Track[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const targetSeekTimeRef = useRef<number | null>(null);

  useEffect(() => {
    roomIdRef.current = roomId;
    isHostRef.current = isHost;
  }, [roomId, isHost]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

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

  const ytPlayerRef = useRef<any>(null);
  const progressIntervalRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const handleTrackEndedRef = useRef<() => void>(() => {});
  const silentAudioRef = useRef<HTMLAudioElement | null>(null);
  const nextTrackRef = useRef<() => void>(() => {});
  const prevTrackRef = useRef<() => void>(() => {});
  const togglePlayRef = useRef<() => void>(() => {});
  const playbackExpectedRef = useRef<boolean>(false);

  useEffect(() => {
    // Verified 100% valid silent WAV file base64 to keep media session active
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA");
    silentAudio.loop = true;
    silentAudioRef.current = silentAudio;
  }, []);

  const syncMediaSessionRef = useRef<() => void>(() => {});

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
    nextTrackRef.current = nextTrack;
    prevTrackRef.current = prevTrack;
    togglePlayRef.current = togglePlay;
    syncMediaSessionRef.current = syncMediaSession;
  });

  const webAudioCtxRef = useRef<AudioContext | null>(null);
  const webAudioGainRef = useRef<GainNode | null>(null);

  const startWebAudioSilence = () => {
    if (webAudioCtxRef.current) {
      if (webAudioCtxRef.current.state === "suspended") {
        webAudioCtxRef.current.resume().catch(err => console.warn("Failed to resume Web Audio context:", err));
      }
      return;
    }
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Extremely quiet and low frequency (inaudible but registered by OS as active audio)
      osc.frequency.value = 20; 
      gain.gain.value = 0.00001; 
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      
      ctx.resume().catch(err => console.warn("Web Audio context resume failed:", err));
      
      webAudioCtxRef.current = ctx;
      webAudioGainRef.current = gain;
    } catch (err) {
      console.warn("Failed to initialize Web Audio silence:", err);
    }
  };

  const showToast = (message: string, type: "info" | "success" | "error" = "info") => {
    setToast({ message, type });
  };

  // Auto-hide toast messages
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const startPollingProgress = () => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    progressIntervalRef.current = window.setInterval(() => {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
        const time = ytPlayerRef.current.getCurrentTime() || 0;
        const dur = ytPlayerRef.current.getDuration() || 0;
        setCurrentTime(time);
        setDuration(dur);

        // Update Chrome's MediaSession timeline to enable skip/prev buttons on overlay
        if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && dur > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration: dur,
              playbackRate: 1,
              position: Math.min(time, dur)
            });
          } catch (e) {
            console.warn("Failed to set position state:", e);
          }
        }

        // Periodically broadcast state to listeners every 4 seconds to maintain sync
        if (roomIdRef.current && isHostRef.current && Date.now() - lastBroadcastRef.current > 4000) {
          lastBroadcastRef.current = Date.now();
          broadcastState(time, true, currentTrackRef.current);
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

  // Initialize YouTube IFrame Player
  useEffect(() => {
    // 1. Create a hidden container for the YouTube iframe off-screen
    let ytDiv = document.getElementById("youtube-player");
    if (!ytDiv) {
      ytDiv = document.createElement("div");
      ytDiv.id = "youtube-player";
      ytDiv.setAttribute(
        "style",
        "position: fixed; bottom: 10px; right: 10px; width: 200px; height: 200px; opacity: 1; pointer-events: none; z-index: -10;"
      );
      document.body.appendChild(ytDiv);
    }

    // 2. Load YouTube IFrame API script if not present
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Player initializer function
    const initPlayer = () => {
      ytPlayerRef.current = new window.YT.Player("youtube-player", {
        height: "200",
        width: "200",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          showinfo: 0,
          modestbranding: 1
        },
        events: {
          onReady: (event: any) => {
            event.target.setVolume(volume * 100);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering)
            const state = event.data;
            if (state === 1) {
              setIsPlaying(true);
              setIsLoading(false);
              startPollingProgress();
              if (isAndroid) {
                Media3Session.setPlaybackState({ isPlaying: true }).catch(() => {});
              }
              // Force sync MediaSession metadata and handlers immediately when YouTube player transitions to playing state
              syncMediaSessionRef.current();

              // Sync target seek time for listener if set
              if (!isHostRef.current && targetSeekTimeRef.current !== null) {
                const targetPos = targetSeekTimeRef.current;
                targetSeekTimeRef.current = null;
                setTimeout(() => {
                  if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
                    ytPlayerRef.current.seekTo(targetPos, true);
                    setCurrentTime(targetPos);
                  }
                }, 50);
              }

              // Broadcast if host
              if (roomIdRef.current && isHostRef.current) {
                broadcastState(0, true, currentTrackRef.current);
              }
            } else if (state === 2) {
              if (playbackExpectedRef.current) {
                // If it paused but we expect it to play (e.g. background auto-pause or loaded in background)
                // Force-resume it immediately.
                if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === "function") {
                  ytPlayerRef.current.playVideo();
                }
              } else {
                stopPollingProgress();
                if (isAndroid) {
                  Media3Session.setPlaybackState({ isPlaying: false }).catch(() => {});
                }
              }
            } else if (state === 0) {
              setIsPlaying(false);
              stopPollingProgress();
              if (isAndroid) {
                Media3Session.setPlaybackState({ isPlaying: false }).catch(() => {});
              }
              handleTrackEndedRef.current();
            } else if (state === 3) {
              setIsLoading(true);
            }
          },
          onError: (e: any) => {
            console.error("YouTube Player error:", e.data);
            setIsPlaying(false);
            setIsLoading(false);
            showToast("Playback error: audio restricted in this region.", "error");
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      stopPollingProgress();
      if (ytPlayerRef.current && typeof ytPlayerRef.current.destroy === "function") {
        ytPlayerRef.current.destroy();
      }
      const playerEl = document.getElementById("youtube-player");
      if (playerEl) playerEl.remove();
    };
  }, []);

  // Sync volume state
  useEffect(() => {
    if (isAndroid) {
      Media3Session.setVolume({ volume: isMuted ? 0 : volume }).catch((err: any) => console.error("Volume sync failed", err));
    } else if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === "function") {
      ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
    }
  }, [volume, isMuted]);

  // Handle track ending logic
  const handleTrackEnded = () => {
    if (isRepeat === "one") {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
        ytPlayerRef.current.seekTo(0, true);
        playbackExpectedRef.current = true;
        ytPlayerRef.current.playVideo();
        setIsPlaying(true);
      }
    } else {
      nextTrack();
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
    // Start Web Audio silence to keep the tab awake in the background
    startWebAudioSilence();

    // Synchronously trigger silent audio play to bypass autoplay restrictions and register MediaSession
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(err => console.warn("Autoplay bypass failed", err));
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
          // Shuffle the new queue, keeping the clicked track at index 0
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
        // Direct playback from the existing queue
        const index = queue.findIndex(t => t.id === track.id);
        if (index !== -1) {
          setCurrentIndex(index);
        } else {
          const updatedQueue = [...queue, track];
          setQueue(updatedQueue);
          setOriginalQueue(prev => [...prev, track]);
          setCurrentIndex(updatedQueue.length - 1);
        }
      }
    }

    playbackExpectedRef.current = true;
    setCurrentTrack(track);
    setIsPlaying(false);
    setIsLoading(true);

    try {
      const videoId = await getYouTubeVideoId(track, abortController.signal);
      if (abortController.signal.aborted) return;

      if (!ytPlayerRef.current || typeof ytPlayerRef.current.loadVideoById !== "function") {
        throw new Error("YouTube Player not fully initialized.");
      }

      if (typeof ytPlayerRef.current.unMute === "function") {
        ytPlayerRef.current.unMute();
      }
      if (typeof ytPlayerRef.current.setVolume === "function") {
        ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
      }

      ytPlayerRef.current.loadVideoById(videoId);

      // Broadcast state change immediately if host
      if (roomIdRef.current && isHostRef.current) {
        broadcastState(0, true, track);
      }

      if (isAndroid) {
        try {
          await Media3Session.updateMetadata({
            title: track.title,
            artist: track.artist,
            artwork: track.thumbnail,
            duration: track.duration
          });
          await Media3Session.setPlaybackState({ isPlaying: true });
        } catch (err) {
          console.error("Native session setup failed:", err);
        }
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

  const togglePlay = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (!ytPlayerRef.current || !currentTrack || typeof ytPlayerRef.current.playVideo !== "function") return;

    // Start Web Audio silence to keep the tab awake in the background
    startWebAudioSilence();

    const nextState = !isPlaying;
    playbackExpectedRef.current = nextState;
    if (nextState) {
      if (silentAudioRef.current) {
        silentAudioRef.current.play().catch(err => console.warn("Silent audio play failed", err));
      }
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
      startPollingProgress();
    } else {
      if (silentAudioRef.current) {
        silentAudioRef.current.pause();
      }
      ytPlayerRef.current.pauseVideo();
      setIsPlaying(false);
      stopPollingProgress();
    }

    if (isAndroid) {
      Media3Session.setPlaybackState({ isPlaying: nextState })
        .catch((err: any) => console.error("Toggle play failed", err));
    }

    // Broadcast if host
    if (roomIdRef.current && isHostRef.current) {
      broadcastState(undefined, nextState, currentTrackRef.current);
    }
  };

  const nextTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (queue.length === 0) return;

    let nextIdx = currentIndex + 1;

    if (nextIdx >= queue.length) {
      if (isRepeat === "all") {
        nextIdx = 0;
      } else {
        playbackExpectedRef.current = false;
        setIsPlaying(false);
        return; // End of playlist
      }
    }

    if (queue[nextIdx]) {
      playTrack(queue[nextIdx]);
    }
  };

  const prevTrack = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (queue.length === 0) return;

    if (currentTime >= 3) {
      seek(0);
      return;
    }

    let prevIdx = currentIndex - 1;

    if (prevIdx < 0) {
      if (isRepeat === "all") {
        prevIdx = queue.length - 1;
      } else {
        prevIdx = 0; // Remain on first track
      }
    }

    if (queue[prevIdx]) {
      playTrack(queue[prevIdx]);
    }
  };

  const seek = (time: number, isRemoteSync?: boolean) => {
    if (roomIdRef.current && !isHostRef.current && !isRemoteSync) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.seekTo !== "function") return;
    ytPlayerRef.current.seekTo(time, true);
    setCurrentTime(time);

    if (isAndroid) {
      Media3Session.seek({ position: time }).catch((err: any) => console.error("Seek failed", err));
    } else if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: duration,
          playbackRate: 1,
          position: Math.min(time, duration)
        });
      } catch (e) {
        console.warn("Failed to set position state during seek:", e);
      }
    }

    // Broadcast if host
    if (roomIdRef.current && isHostRef.current) {
      broadcastState(time, undefined, currentTrackRef.current);
    }
  };

  const changeVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    if (clamped > 0) {
      setIsMuted(false);
    }
    if (isAndroid) {
      Media3Session.setVolume({ volume: isMuted ? 0 : clamped }).catch((err: any) => console.error("Volume set failed", err));
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isAndroid) {
      Media3Session.setVolume({ volume: nextMuted ? 0 : volume }).catch((err: any) => console.error("Volume set failed", err));
    }
  };

  const toggleShuffle = () => {
    if (roomIdRef.current && !isHostRef.current) {
      showToast("Controls are disabled for listeners in Listen Together", "error");
      return;
    }
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);
    
    if (nextShuffle) {
      // Turn Shuffle ON
      setOriginalQueue(queue);
      if (currentTrack) {
        const otherTracks = queue.filter(t => t.id !== currentTrack.id);
        const shuffled = [currentTrack, ...shuffleArray(otherTracks)];
        setQueue(shuffled);
        setCurrentIndex(0);
      } else {
        const shuffled = shuffleArray(queue);
        setQueue(shuffled);
        setCurrentIndex(0);
      }
      showToast("Shuffle on", "info");
    } else {
      // Turn Shuffle OFF
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
      let nextState: "none" | "one" | "all" = "none";
      if (prev === "none") nextState = "all";
      if (prev === "all") nextState = "one";
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
    // 1. Remove if already in queue to avoid duplicates
    const cleanedQueue = queue.filter(t => t.id !== track.id);
    const cleanedOriginal = originalQueue.filter(t => t.id !== track.id);
    
    // Find current index in cleanedQueue
    const currentId = currentTrack?.id;
    const activeIdx = cleanedQueue.findIndex(t => t.id === currentId);
    
    let newQueue = [...cleanedQueue];
    if (activeIdx !== -1) {
      newQueue.splice(activeIdx + 1, 0, track);
    } else {
      newQueue.unshift(track);
    }
    
    let newOriginal = [...cleanedOriginal];
    const originalActiveIdx = cleanedOriginal.findIndex(t => t.id === currentId);
    if (originalActiveIdx !== -1) {
      newOriginal.splice(originalActiveIdx + 1, 0, track);
    } else {
      newOriginal.unshift(track);
    }
    
    setQueue(newQueue);
    setOriginalQueue(newOriginal);
    
    // Recalculate index
    const newIdx = newQueue.findIndex(t => t.id === currentId);
    if (newIdx !== -1) {
      setCurrentIndex(newIdx);
    }
    
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

    // Sync originalQueue
    const updatedOriginal = [...originalQueue];
    const originalFromIdx = updatedOriginal.findIndex(t => t.id === movedItem.id);
    if (originalFromIdx !== -1) {
      const [movedOriginal] = updatedOriginal.splice(originalFromIdx, 1);
      // Determine where to insert it in original queue
      const targetOriginalIdx = Math.max(0, Math.min(updatedOriginal.length, toIndex));
      updatedOriginal.splice(targetOriginalIdx, 0, movedOriginal);
      setOriginalQueue(updatedOriginal);
    }

    // Update currentIndex to follow the currently playing track
    if (currentIndex === fromIndex) {
      setCurrentIndex(toIndex);
    } else {
      let newIdx = currentIndex;
      if (currentIndex > fromIndex && currentIndex <= toIndex) {
        newIdx = currentIndex - 1;
      } else if (currentIndex < fromIndex && currentIndex >= toIndex) {
        newIdx = currentIndex + 1;
      }
      setCurrentIndex(newIdx);
    }
  };

  // Keyboard and Media Session Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting keyboard controls when typing in inputs/textareas
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        togglePlay();
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
        nextTrack();
      } else if (e.key === "MediaTrackPrevious" || e.key === "F6") {
        e.preventDefault();
        prevTrack();
      } else if (e.key === "F7") {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, currentTrack, nextTrack, prevTrack, togglePlay, currentTime, duration, volume, seek, changeVolume, toggleMute]);

  const syncMediaSession = () => {
    if (!currentTrack || !("mediaSession" in navigator)) return;

    try {
      // 1. Sync metadata
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.albumName || "",
        artwork: [
          { src: currentTrack.thumbnail, sizes: "96x96", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "128x128", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "192x192", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "256x256", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "384x384", type: "image/jpeg" },
          { src: currentTrack.thumbnail, sizes: "512x512", type: "image/jpeg" },
        ]
      });

      // 2. Sync playback state
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

      // 3. Sync action handlers to override YouTube iframe defaults
      navigator.mediaSession.setActionHandler("play", () => {
        togglePlayRef.current();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        togglePlayRef.current();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        nextTrackRef.current();
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        prevTrackRef.current();
      });
    } catch (error) {
      console.warn("Failed to sync Media Session:", error);
    }
  };

  // Sync Media Session and schedule delayed retries to override YouTube player asynchronously
  useEffect(() => {
    syncMediaSession();

    // Schedule retries in case YouTube iframe script delays overwriting mediaSession
    const t1 = setTimeout(syncMediaSession, 200);
    const t2 = setTimeout(syncMediaSession, 500);
    const t3 = setTimeout(syncMediaSession, 1000);
    const t4 = setTimeout(syncMediaSession, 2000);
    const t5 = setTimeout(syncMediaSession, 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [currentTrack, isPlaying]);

  // Clean up action handlers only when the audio provider is fully unmounted
  useEffect(() => {
    return () => {
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("nexttrack", null);
          navigator.mediaSession.setActionHandler("previoustrack", null);
        } catch (error) {
          console.warn("Media Session Action Handler cleanup failed:", error);
        }
      }
    };
  }, []);

  const leaveRoom = () => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    setRoomId(null);
    setIsHost(false);
    setIsConnected(false);
    setParticipants([]);
    showToast("Left Listen Together room", "info");
  };

  const primeYouTubePlayer = () => {
    if (ytPlayerRef.current && typeof ytPlayerRef.current.loadVideoById === "function") {
      try {
        ytPlayerRef.current.mute();
        ytPlayerRef.current.loadVideoById("dQw4w9WgXcQ");
        ytPlayerRef.current.playVideo();
      } catch (err) {
        console.warn("Failed to prime YouTube player:", err);
      }
    }
  };

  const createRoom = () => {
    leaveRoom();
    startWebAudioSilence();
    primeYouTubePlayer();
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(err => console.warn("Autoplay bypass failed on room creation", err));
    }
    const newRoomId = `ROOM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setRoomId(newRoomId);
    setIsHost(true);
    joinChannel(newRoomId, true);
  };

  const joinRoom = (targetRoomId: string) => {
    if (!targetRoomId.trim()) return;
    leaveRoom();
    startWebAudioSilence();
    primeYouTubePlayer();
    if (silentAudioRef.current) {
      silentAudioRef.current.play().catch(err => console.warn("Autoplay bypass failed on room join", err));
    }
    const cleanId = targetRoomId.trim().toUpperCase();
    setRoomId(cleanId);
    setIsHost(false);
    joinChannel(cleanId, false);
  };

  const joinChannel = (roomName: string, hostFlag: boolean) => {
    console.log(`[ListenTogether] JoinChannel called. roomName=${roomName}, hostFlag=${hostFlag}, clientId=${clientIdRef.current}`);
    const channel = supabase.channel(roomName, {
      config: {
        broadcast: { self: false },
        presence: { key: clientIdRef.current }
      }
    });

    channel
      .on("broadcast", { event: "state_change" }, (msg: any) => {
        console.log("[ListenTogether] Received state_change broadcast:", msg);
        if (hostFlag) {
          console.log("[ListenTogether] Host ignoring state_change broadcast.");
          return;
        }
        handleRemoteState(msg.payload);
      })
      .on("broadcast", { event: "request_state" }, (msg: any) => {
        console.log("[ListenTogether] Received request_state broadcast:", msg);
        if (!hostFlag) {
          console.log("[ListenTogether] Listener ignoring request_state broadcast.");
          return;
        }
        console.log("[ListenTogether] Host responding to request_state broadcast.");
        broadcastState(undefined, undefined, currentTrackRef.current);
      });

    // Setup Presence to track participants
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      console.log("[ListenTogether] Presence Sync. Current state:", state);
      const users: { id: string; name: string }[] = [];
      Object.keys(state).forEach((key) => {
        const presences = state[key] as any;
        presences.forEach((p: any) => {
          users.push({ id: key, name: p.name || `User ${key.substring(0, 4)}` });
        });
      });
      console.log("[ListenTogether] Connected participants list updated:", users);
      setParticipants(users);
    });

    channel.subscribe((status: string) => {
      console.log(`[ListenTogether] Channel subscribe status update: ${status}`);
      if (status === "SUBSCRIBED") {
        setIsConnected(true);
        channel.track({ name: userNameRef.current, joinedAt: Date.now() })
          .then((res) => console.log("[ListenTogether] presence track result:", res))
          .catch((err) => console.error("[ListenTogether] presence track error:", err));
        showToast(`Connected to room ${roomName}`, "success");
        
        if (!hostFlag) {
          console.log("[ListenTogether] Listener requesting current state from host...");
          // Request current state from host
          channel.send({
            type: "broadcast",
            event: "request_state",
            payload: { requesterId: clientIdRef.current }
          }).then((res) => {
            console.log("[ListenTogether] request_state send result:", res);
          });
        }
      } else {
        setIsConnected(false);
      }
    });

    channelRef.current = channel;
  };

  const handleRemoteState = async (payload: any) => {
    console.log("[ListenTogether] handleRemoteState payload:", payload);
    const { track, isPlaying: remoteIsPlaying, position, queue: remoteQueue, currentIndex: remoteCurrentIndex, timestamp } = payload;
    if (!track) {
      console.log("[ListenTogether] handleRemoteState: no track in payload, aborting.");
      return;
    }

    try {
      // Sync queue and index first so local lists and PlayerPanel are aligned
      if (remoteQueue && Array.isArray(remoteQueue)) {
        console.log("[ListenTogether] Syncing queue. Size:", remoteQueue.length, "Index:", remoteCurrentIndex);
        setQueue(remoteQueue);
        setOriginalQueue(remoteQueue);
        if (remoteCurrentIndex !== undefined && remoteCurrentIndex !== -1) {
          setCurrentIndex(remoteCurrentIndex);
        }
      }

      // Calculate elapsed time due to latency
      const latency = (Date.now() - timestamp) / 1000;
      const targetPosition = position + Math.max(0, latency);
      console.log(`[ListenTogether] Latency: ${latency.toFixed(3)}s, Target position: ${targetPosition.toFixed(2)}s`);

      // 1. Sync track if different
      if (!currentTrackRef.current || currentTrackRef.current.id !== track.id) {
        console.log(`[ListenTogether] Changing track from ${currentTrackRef.current?.title || "none"} to ${track.title}`);
        if (remoteIsPlaying) {
          targetSeekTimeRef.current = targetPosition;
          console.log(`[ListenTogether] Set targetSeekTimeRef to ${targetPosition.toFixed(2)}`);
        } else {
          targetSeekTimeRef.current = null;
        }
        await playTrack(track, undefined, undefined, true);
      } else {
        // 2. Sync seek position if drift > 2 seconds
        if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
          const currentPos = ytPlayerRef.current.getCurrentTime() || 0;
          const drift = Math.abs(currentPos - targetPosition);
          console.log(`[ListenTogether] Drift: ${drift.toFixed(2)}s (Local: ${currentPos.toFixed(2)}s, Target: ${targetPosition.toFixed(2)}s)`);
          if (drift > 2) {
            console.log("[ListenTogether] Drift exceeded 2s. Seeking...");
            seek(targetPosition, true);
          }
        }
      }

      // 3. Sync play/pause state
      if (remoteIsPlaying !== isPlayingRef.current) {
        console.log(`[ListenTogether] Syncing playback state. Remote: ${remoteIsPlaying}, Local: ${isPlayingRef.current}`);
        playbackExpectedRef.current = remoteIsPlaying;
        if (remoteIsPlaying) {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === "function") {
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
          }
        } else {
          if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
            ytPlayerRef.current.pauseVideo();
            setIsPlaying(false);
          }
        }
      }
    } catch (err) {
      console.warn("[ListenTogether] Failed to apply remote playback state:", err);
    }
  };

  const broadcastState = (customPosition?: number, forceIsPlaying?: boolean, customTrack?: Track | null) => {
    console.log(`[ListenTogether] broadcastState. roomId=${roomIdRef.current}, isHost=${isHostRef.current}, channelActive=${!!channelRef.current}`);
    if (!roomIdRef.current || !isHostRef.current || !channelRef.current) return;
    
    const pos = customPosition !== undefined ? customPosition : (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function" ? ytPlayerRef.current.getCurrentTime() : 0);
    const playing = forceIsPlaying !== undefined ? forceIsPlaying : isPlayingRef.current;
    const trackToBroadcast = customTrack !== undefined ? customTrack : currentTrackRef.current;

    console.log(`[ListenTogether] Broadcasting: track=${trackToBroadcast?.title}, playing=${playing}, position=${pos}`);
    if (!trackToBroadcast) {
      console.log("[ListenTogether] No track to broadcast, aborting.");
      return;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "state_change",
      payload: {
        track: trackToBroadcast,
        isPlaying: playing,
        position: pos,
        queue: queueRef.current,
        currentIndex: currentIndexRef.current,
        timestamp: Date.now()
      }
    }).then((res: any) => {
      console.log("[ListenTogether] broadcastState send result:", res);
    });
  };

  // Clean up channel on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, []);

  // Listen to native player events on Android
  useEffect(() => {
    if (isAndroid) {
      try {
        Media3Session.addListener("onIsPlayingChanged", (data: { isPlaying: boolean }) => {
          setIsPlaying(data.isPlaying);
          if (data.isPlaying) {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.playVideo === "function") {
              ytPlayerRef.current.playVideo();
            }
            startPollingProgress();
          } else {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.pauseVideo === "function") {
              ytPlayerRef.current.pauseVideo();
            }
            stopPollingProgress();
          }
        });

        Media3Session.addListener("onPlaybackEnded", () => {
          console.log("Native track ended event received");
          if (handleTrackEndedRef.current) {
            handleTrackEndedRef.current();
          }
        });

        Media3Session.addListener("onNotificationCommand", (data: { command: string; position?: number }) => {
          console.log("Native notification command received:", data.command);
          if (data.command === "next") {
            nextTrack();
          } else if (data.command === "previous") {
            prevTrack();
          } else if (data.command === "seek" && data.position !== undefined) {
            if (ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === "function") {
              const diff = Math.abs(ytPlayerRef.current.getCurrentTime() - data.position);
              if (diff > 2) {
                seek(data.position);
              }
            }
          }
        });
      } catch (err) {
        console.warn("Failed to register native media session listeners:", err);
      }

      return () => {
        Media3Session.removeAllListeners().catch((err: any) => console.warn("Failed to remove all listeners:", err));
      };
    }
  }, [currentIndex, queue, isRepeat]);

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
        leaveRoom
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
