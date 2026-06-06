import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import type { Track } from "../services/musicApi";
import { getYouTubeVideoId } from "../services/musicApi";

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
  playTrack: (track: Track, newQueue?: Track[]) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number) => void;
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
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => {
    const saved = localStorage.getItem("ibrastream_current_track");
    try { return saved ? JSON.parse(saved) : null; } catch { return null; }
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

  useEffect(() => {
    // 1-second silent WAV base64
    const silentAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    silentAudio.loop = true;
    silentAudioRef.current = silentAudio;
  }, []);

  useEffect(() => {
    if (!silentAudioRef.current) return;
    if (isPlaying) {
      silentAudioRef.current.play().catch(err => console.warn("Failed to play silent audio background trigger:", err));
    } else {
      silentAudioRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    handleTrackEndedRef.current = handleTrackEnded;
  });

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
        setCurrentTime(ytPlayerRef.current.getCurrentTime() || 0);
        setDuration(ytPlayerRef.current.getDuration() || 0);
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
        "position: fixed; top: -100px; left: -100px; width: 1px; height: 1px; opacity: 0.001; pointer-events: none; z-index: -9999;"
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
        height: "1",
        width: "1",
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
            } else if (state === 2) {
              setIsPlaying(false);
              stopPollingProgress();
            } else if (state === 0) {
              setIsPlaying(false);
              stopPollingProgress();
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
    if (ytPlayerRef.current && typeof ytPlayerRef.current.setVolume === "function") {
      ytPlayerRef.current.setVolume(isMuted ? 0 : volume * 100);
    }
  }, [volume, isMuted]);

  // Handle track ending logic
  const handleTrackEnded = () => {
    if (isRepeat === "one") {
      if (ytPlayerRef.current && typeof ytPlayerRef.current.seekTo === "function") {
        ytPlayerRef.current.seekTo(0, true);
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

  const playTrack = async (track: Track, newQueue?: Track[]) => {
    // Abort previous loading request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

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

    setCurrentTrack(track);
    setIsPlaying(false);
    setIsLoading(true);

    try {
      const videoId = await getYouTubeVideoId(track, abortController.signal);
      if (abortController.signal.aborted) return;
      if (!ytPlayerRef.current || typeof ytPlayerRef.current.loadVideoById !== "function") {
        throw new Error("YouTube Player not fully initialized.");
      }
      
      ytPlayerRef.current.loadVideoById(videoId);
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`Playback aborted for track: ${track.title}`);
        return;
      }
      console.error("Play failed:", err);
      setIsPlaying(false);
      setIsLoading(false);
      showToast(`Failed to play "${track.title}". Stream unavailable.`, "error");
    }
  };

  const togglePlay = () => {
    if (!ytPlayerRef.current || !currentTrack || typeof ytPlayerRef.current.playVideo !== "function") return;

    if (isPlaying) {
      ytPlayerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      ytPlayerRef.current.playVideo();
      setIsPlaying(true);
    }
  };

  const nextTrack = () => {
    if (queue.length === 0) return;

    let nextIdx = currentIndex + 1;

    if (nextIdx >= queue.length) {
      if (isRepeat === "all") {
        nextIdx = 0;
      } else {
        setIsPlaying(false);
        return; // End of playlist
      }
    }

    if (queue[nextIdx]) {
      playTrack(queue[nextIdx]);
    }
  };

  const prevTrack = () => {
    if (queue.length === 0) return;

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

  const seek = (time: number) => {
    if (!ytPlayerRef.current || typeof ytPlayerRef.current.seekTo !== "function") return;
    ytPlayerRef.current.seekTo(time, true);
    setCurrentTime(time);
  };

  const changeVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    if (clamped > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const toggleShuffle = () => {
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
    setIsRepeat(prev => {
      let nextState: "none" | "one" | "all" = "none";
      if (prev === "none") nextState = "all";
      if (prev === "all") nextState = "one";
      showToast(nextState === "none" ? "Repeat off" : nextState === "all" ? "Repeat playlist" : "Repeat track", "info");
      return nextState;
    });
  };

  const addToQueue = (track: Track) => {
    if (queue.some(t => t.id === track.id)) {
      showToast(`"${track.title}" is already in the queue`, "info");
      return;
    }
    showToast(`Added "${track.title}" to queue`, "success");
    setQueue(prev => [...prev, track]);
    setOriginalQueue(prev => [...prev, track]);
  };

  const playNext = (track: Track) => {
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
    setQueue(prev => prev.filter(t => t.id !== trackId));
    setOriginalQueue(prev => prev.filter(t => t.id !== trackId));
    showToast("Removed track from queue", "info");
  };

  const clearQueue = () => {
    const newQ = currentTrack ? [currentTrack] : [];
    setQueue(newQ);
    setOriginalQueue(newQ);
    setCurrentIndex(currentTrack ? 0 : -1);
    showToast("Cleared queue", "info");
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
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
      } else if (e.key === "MediaTrackNext") {
        e.preventDefault();
        nextTrack();
      } else if (e.key === "MediaTrackPrevious") {
        e.preventDefault();
        prevTrack();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPlaying, currentTrack, nextTrack, prevTrack, togglePlay, currentTime, duration, volume, seek, changeVolume, toggleMute]);

  // Update Media Session metadata when track changes
  useEffect(() => {
    if (currentTrack && "mediaSession" in navigator) {
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
    }
  }, [currentTrack]);

  // Update Media Session playback state
  useEffect(() => {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    }
  }, [isPlaying]);

  // Setup Media Session action handlers
  useEffect(() => {
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.setActionHandler("play", togglePlay);
        navigator.mediaSession.setActionHandler("pause", togglePlay);
        navigator.mediaSession.setActionHandler("nexttrack", nextTrack);
        navigator.mediaSession.setActionHandler("previoustrack", prevTrack);
      } catch (error) {
        console.warn("Media Session Action Handler registration failed:", error);
      }
    }
    return () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
        navigator.mediaSession.setActionHandler("previoustrack", null);
      }
    };
  }, [togglePlay, nextTrack, prevTrack]);

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
        showToast
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
