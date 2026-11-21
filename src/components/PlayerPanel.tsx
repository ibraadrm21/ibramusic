import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Heart, 
  Volume2, VolumeX, Info, ExternalLink, Disc, Mic, X, Clock, Waves,
  ListMusic, Trash2, ArrowUp, ArrowDown, Maximize2, FileText
} from "lucide-react";
import { useAudio, useAudioProgress } from "../context/AudioContext";
import type { Track } from "../services/musicApi";
import { getArtistsFromTrack } from "../services/musicApi";
import { animate } from "animejs";
import { Modal } from "./Modal";
import { downloadFile } from "../services/libraryFiles";

const lyricsControl = "inline-flex min-h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-white";

interface PlayerPanelProps {
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: boolean;
  onClose?: () => void; // for mobile overlay close
  onOpenAlbum?: (album: any) => void;
  onOpenArtist?: (artist: any) => void;
  isExplicit?: boolean;
}

export interface LyricWord {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  words?: LyricWord[];
}

function parseTimeTag(m: string, s: string, ms?: string): number {
  const min = parseInt(m, 10);
  const sec = parseInt(s, 10);
  const millis = ms ? parseInt(ms, 10) : 0;
  return min * 60 + sec + millis / (millis > 99 ? 1000 : 100);
}

function parseLRC(lrc: string, rawLrc?: string, enableWordSync: boolean = true): LyricLine[] {
  const source = (enableWordSync && rawLrc && rawLrc.includes("<")) ? rawLrc : (lrc || rawLrc || "");
  if (!source) return [];

  const lines = source.split("\n");
  const result: LyricLine[] = [];
  const lineTimeReg = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

  // Step 1: Parse all timestamped lines and explicit <mm:ss.xx> word tags if present
  for (const rawLine of lines) {
    const lineMatches = [...rawLine.matchAll(lineTimeReg)];
    if (lineMatches.length === 0) continue;

    const rest = rawLine.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
    if (!rest) continue;

    let words: LyricWord[] | undefined = undefined;
    if (enableWordSync && rest.includes("<")) {
      const wordRegex = /<(\d+):(\d+)(?:\.(\d+))?>([^<]*)/g;
      const tokens: { time: number; text: string }[] = [];
      let m: RegExpExecArray | null;
      while ((m = wordRegex.exec(rest)) !== null) {
        tokens.push({
          time: parseTimeTag(m[1], m[2], m[3]),
          text: m[4]
        });
      }

      if (tokens.length > 0) {
        words = [];
        for (let i = 0; i < tokens.length; i++) {
          const current = tokens[i];
          const textTrimmed = current.text.trim();
          if (!textTrimmed && i === tokens.length - 1) {
            if (words.length > 0) {
              words[words.length - 1].endTime = current.time;
            }
            continue;
          }
          if (!textTrimmed) continue;
          const nextToken = tokens[i + 1];
          const endTime = nextToken ? nextToken.time : current.time + 0.6;
          words.push({
            text: textTrimmed,
            startTime: current.time,
            endTime: Math.max(endTime, current.time + 0.08)
          });
        }
      }
    }

    const cleanText = words && words.length > 0
      ? words.map(w => w.text.trim()).filter(Boolean).join(" ").trim()
      : rawLine.replace(lineTimeReg, "").replace(/<\d+:\d+(?:\.\d+)?>/g, " ").replace(/\s+/g, " ").trim();

    for (const match of lineMatches) {
      const time = parseTimeTag(match[1], match[2], match[3]);
      result.push({ time, text: cleanText, words });
    }
  }

  result.sort((a, b) => a.time - b.time);

  // Step 2: For lines that lack explicit word tags, automatically generate word timings
  // so that Word-by-Word karaoke works on EVERY song with synced lyrics!
  if (enableWordSync) {
    for (let i = 0; i < result.length; i++) {
      const currentLine = result[i];
      if (currentLine.words && currentLine.words.length > 0) continue;

      const rawWords = currentLine.text.trim().split(/\s+/).filter(Boolean);
      if (rawWords.length === 0) continue;

      const nextLine = result[i + 1];
      const nextTime = nextLine ? nextLine.time : undefined;
      const lineDuration = nextTime && nextTime > currentLine.time
        ? Math.min(nextTime - currentLine.time, Math.max(2.0, rawWords.length * 0.7))
        : Math.max(1.5, rawWords.length * 0.45);

      const activeSingingDuration = Math.max(0.6, lineDuration * 0.88);
      const weights = rawWords.map(w => Math.max(2, w.replace(/[^a-zA-Z0-9]/g, "").length));
      const totalWeight = weights.reduce((a, b) => a + b, 0);

      let curStart = currentLine.time;
      const genWords: LyricWord[] = [];
      for (let w = 0; w < rawWords.length; w++) {
        const wordDur = (weights[w] / totalWeight) * activeSingingDuration;
        const end = w === rawWords.length - 1
          ? currentLine.time + activeSingingDuration
          : curStart + wordDur;

        genWords.push({
          text: rawWords[w].trim(),
          startTime: curStart,
          endTime: end
        });
        curStart = end;
      }
      currentLine.words = genWords;
    }
  }

  return result;
}



export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  onToggleFavorite,
  isFavorite = false,
  onClose,
  onOpenAlbum,
  onOpenArtist,
  isExplicit = false
}) => {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    isShuffle,
    isRepeat,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    changeVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    queue,
    currentIndex,
    playTrack,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    roomId,
    isHost,
    sleepTimerRemaining,
    currentUser,
    ambientGlowEnabled,
    seamlessTransitions,
    setSeamlessTransitions,
    lyricsProvider,
    lyricsWordByWord
  } = useAudio();

  const { currentTime, duration } = useAudioProgress();



  const [sliderVal, setSliderVal] = useState<number>(0);
  const [artistPic, setArtistPic] = useState<string>("");
  const [view, setView] = useState<"info" | "lyrics" | "queue">("info");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [rawLrcText, setRawLrcText] = useState<string>("");
  const [syncedLrcText, setSyncedLrcText] = useState<string>("");
  const [lyricsSource, setLyricsSource] = useState<string>("lrclib");
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [monthlyListeners, setMonthlyListeners] = useState<number | undefined>(undefined);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [lyricsFollow, setLyricsFollow] = useState(true);
  const fullLyrics = useRef<HTMLDivElement | null>(null);
  const [lyricsFont, setLyricsFont] = useState(26);
  const [lyricsOffset, setLyricsOffset] = useState<number>(0);
  const [hasDualVersions, setHasDualVersions] = useState<boolean>(currentTrack?.hasDualVersions === true);

  useEffect(() => {
    let isMounted = true;
    if (!currentTrack) {
      setHasDualVersions(false);
      return;
    }
    if (currentTrack.hasDualVersions !== undefined) {
      setHasDualVersions(currentTrack.hasDualVersions);
      return;
    }
    import("../services/musicApi").then(({ checkTrackDualVersions }) => {
      checkTrackDualVersions(currentTrack).then((dual) => {
        if (isMounted) setHasDualVersions(dual);
      });
    });
    return () => {
      isMounted = false;
    };
  }, [currentTrack?.id, currentTrack?.artist, currentTrack?.title, currentTrack?.hasDualVersions]);

  const updateOffset = (newOffset: number) => {
    setLyricsOffset(newOffset);
    if (currentTrack) {
      const userId = currentUser ? currentUser.id : "guest";
      localStorage.setItem(`ibrastream_lyric_offset_${userId}_${currentTrack.id}_${isExplicit || currentTrack.isExplicit ? "explicit" : "clean"}`, String(newOffset));
    }
  };


  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  // Sync internal slider value to currentTime
  useEffect(() => {
    setSliderVal(currentTime);
  }, [currentTime]);

  // Fetch artist actual profile picture, monthly listeners, and lyrics
  useEffect(() => {
    if (!currentTrack) return;
    let active = true;

    setArtistPic(""); // Reset
    setMonthlyListeners(undefined);
    setLyrics([]);
    setPlainLyrics("");
    setRawLrcText("");
    setSyncedLrcText("");
    
    // Load saved offset for this song & user combination
    const userId = currentUser ? currentUser.id : "guest";
    const saved = localStorage.getItem(`ibrastream_lyric_offset_${userId}_${currentTrack.id}_${isExplicit || currentTrack.isExplicit ? "explicit" : "clean"}`) ?? localStorage.getItem(`ibrastream_lyric_offset_${userId}_${currentTrack.id}`);
    setLyricsOffset(saved ? parseFloat(saved) : 0);

    setIsLoadingLyrics(true);

    // Fetch artist picture and stats
    import("../services/musicApi").then(({ searchArtists, getSpotifyArtistStats }) => {
      if (!active) return;
      searchArtists(currentTrack.artist).then((artists) => {
        if (!active) return;
        if (artists && artists.length > 0) {
          const match = artists.find(a => a.name.toLowerCase() === currentTrack.artist.toLowerCase()) || artists[0];
          if (match && match.thumbnail) {
            setArtistPic(match.thumbnail);
          }
        }
      }).catch(err => {
        console.warn("Failed to search artist picture:", err);
      });

      getSpotifyArtistStats(currentTrack.artist).then((stats) => {
        if (!active) return;
        if (stats && stats.monthlyListeners) {
          setMonthlyListeners(stats.monthlyListeners);
        }
      }).catch(err => {
        console.warn("Failed to fetch artist stats in PlayerPanel:", err);
      });
    });

    // Fetch lyrics from cache or network in parallel
    import("../services/musicApi").then(({ getLyricsForTrack }) => {
      if (!active) return;
      getLyricsForTrack(currentTrack, lyricsProvider, lyricsWordByWord)
        .then(data => {
          if (!active) return;
          if (data.provider) setLyricsSource(data.provider);
          else setLyricsSource(lyricsProvider);
          setRawLrcText(data.rawLrc || "");
          setSyncedLrcText(data.syncedLyrics || "");
          if (data.syncedLyrics) {
            setLyrics(parseLRC(data.syncedLyrics, data.rawLrc, lyricsWordByWord));
          } else if (data.plainLyrics) {
            setPlainLyrics(data.plainLyrics);
          }
        })
        .catch(err => {
          if (active) {
            console.warn("All lyrics sources failed:", err);
          }
        })
        .finally(() => {
          if (active) {
            setIsLoadingLyrics(false);
          }
        });
    });

    return () => {
      active = false;
    };
  }, [currentTrack, currentUser, lyricsProvider, lyricsWordByWord]);

  // Re-parse when word-by-word mode is toggled or new lyrics arrive
  useEffect(() => {
    if (syncedLrcText || rawLrcText) {
      setLyrics(parseLRC(syncedLrcText || rawLrcText, rawLrcText, lyricsWordByWord));
    }
  }, [lyricsWordByWord, syncedLrcText, rawLrcText]);

  const activeLineIndex = lyrics.reduce((acc, line, idx) => {
    if (currentTime >= (line.time + lyricsOffset)) return idx;
    return acc;
  }, -1);

  useEffect(() => {
    if (lyricsExpanded && lyricsFollow) {
      fullLyrics.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
    }
  }, [lyricsExpanded, lyricsFollow, activeLineIndex]);

  // Auto-scroll lyrics container & animate active line with animejs
  useEffect(() => {
    if (lyricsFollow && view === "lyrics" && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.querySelector(".lyrics-active-line");
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
        if (document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        animate(activeEl, {
          scale: [0.97, 1.05],
          translateX: [-6, 0],
          duration: 450,
          ease: "outCubic"
        });
      } else if (activeLineIndex === -1) {
        lyricsContainerRef.current.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }
    }
  }, [activeLineIndex, view]);

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 glass-panel border-l border-gray-800">
        <Disc className="w-16 h-16 animate-spin-slow mb-4 text-gray-700" />
        <h3 className="text-lg font-semibold text-gray-400">No Song Selected</h3>
        <p className="text-sm text-gray-600 mt-1 max-w-[200px]">
          Pick a song from the library or search to start streaming
        </p>
      </div>
    );
  }

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSliderVal(val);
  };

  const handleSliderMouseUp = () => {
    seek(sliderVal);
  };

  return (
    <div
      className="h-full w-full flex flex-col justify-between p-5 md:p-6 glass-panel border-l border-gray-800/50 relative overflow-hidden select-none"
    >
      {/* Immersive blurred backdrop overlay */}
      {ambientGlowEnabled && document.documentElement.getAttribute("data-theme") !== "noir" && (
        <div 
          className="player-cover-glow absolute inset-0 z-0 pointer-events-none transition-all duration-1000 opacity-20 select-none filter blur-[100px] bg-center bg-cover"
          style={{
            backgroundImage: `url(${currentTrack.thumbnail})`,
          }}
        />
      )}
      
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-2 shrink-0 relative z-10">
        {sleepTimerRemaining !== null && (
          <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-brand-accent/20 border border-brand-accent/35 text-white text-[9px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center gap-1.5 animate-pulse shrink-0 backdrop-blur-md">
            <Clock className="w-2.5 h-2.5 text-brand-accent" />
            <span>Sleep: {Math.floor(sleepTimerRemaining / 60)}:{(sleepTimerRemaining % 60).toString().padStart(2, "0")}</span>
          </div>
        )}
        {onClose && (
          <button 
            onClick={onClose}
            aria-label="Cerrar reproductor"
            className="lg:hidden grid size-11 place-items-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white"
          >
            ← Back
          </button>
        )}
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl text-xs font-semibold text-gray-400 mx-auto">
          <button 
            onClick={() => setView("info")} 
            className={`px-3 py-1.5 rounded-lg transition-all ${view === "info" ? "bg-white text-black font-bold shadow" : "hover:text-white"}`}
          >
            Overview
          </button>
          <button 
            onClick={() => setView("lyrics")} 
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${view === "lyrics" ? "bg-white text-black font-bold shadow" : "hover:text-white"}`}
          >
            <Mic className="w-3.5 h-3.5" /> Letras
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSeamlessTransitions(!seamlessTransitions)}
            className={`p-2 rounded-full transition-all relative ${
              seamlessTransitions
                ? "text-white bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            title={seamlessTransitions ? "Seamless Transitions (Crossfade) activo" : "Activar Seamless Transitions"}
          >
            <Waves className="w-4 h-4" />
            {seamlessTransitions && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            )}
          </button>
          <button 
            onClick={() => setShowInfoModal(true)}
            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <Info className="w-4.5 h-4.5" />
          </button>
        </div>

      </div>

      {/* Main Content Area: Album Art, Lyrics, or Queue */}
      {view === "info" ? (
        <div className="flex-1 shrink flex flex-col items-center justify-center my-2 relative w-full overflow-hidden">
          <div className="relative group w-64 sm:w-72 md:w-80 max-w-full aspect-square rounded-none overflow-hidden shrink z-10">
            <div className="w-full h-full rounded-none overflow-hidden relative">
              <img
                src={currentTrack.thumbnail || (currentTrack.id?.startsWith("yt-") ? `https://i.ytimg.com/vi/${currentTrack.id.substring(3)}/hqdefault.jpg` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80")}
                alt={currentTrack.title}
                onError={(e) => {
                  const ytId = currentTrack.id?.startsWith("yt-") ? currentTrack.id.substring(3) : (/^[a-zA-Z0-9_-]{11}$/.test(currentTrack.id) ? currentTrack.id : null);
                  if (ytId && !e.currentTarget.src.includes("i.ytimg.com")) {
                    e.currentTarget.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
                  } else {
                    e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
                  }
                }}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? "scale-105" : "scale-100"
                }`}
              />
              
              {/* Loading Overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
                  <div className="w-8 h-8 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : view === "lyrics" ? (
        /* Synced Lyrics Container */
        <div className="flex-1 flex flex-col my-4 min-h-0 relative z-10">
          <div className="mb-2 flex flex-wrap gap-2">
            <button type="button" className={lyricsControl} onClick={() => setLyricsExpanded(true)}><Maximize2 className="size-3.5" aria-hidden="true" /> Ampliar letra</button>
            <button type="button" className={lyricsControl} onClick={() => downloadFile("reporte-letra.txt", [
              "IbraMusic · Incidencia con una letra",
              currentTrack.title + " — " + currentTrack.artist,
              "Proveedor: " + lyricsSource,
              "Describe el problema: letra incorrecta, desfase u otro.",
            ].join("\n"), "text/plain")}><FileText className="size-3.5" aria-hidden="true" /> Preparar reporte</button>
          </div>
          {lyricsExpanded && (
            <Modal title="Letras" wide onClose={() => setLyricsExpanded(false)}>
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div className="flex min-w-0 items-center gap-3">
                  <img src={currentTrack.thumbnail} alt="" className="size-11 shrink-0 rounded-lg bg-white/5 object-cover" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-white">{currentTrack.title}</p>
                    <p className="truncate text-xs text-gray-400">{currentTrack.artist}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className={lyricsControl}>
                    Tamaño
                    <input type="range" min={16} max={44} value={lyricsFont} onChange={event => setLyricsFont(Number(event.target.value))}
                      className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-white/15 accent-brand-accent" />
                  </label>
                  <button type="button" role="switch" aria-checked={lyricsFollow} className={lyricsControl} onClick={() => setLyricsFollow(!lyricsFollow)}>
                    Seguir la letra
                    <span aria-hidden="true" className={"relative h-3.5 w-6 rounded-full transition-colors " + (lyricsFollow ? "bg-brand-accent" : "bg-white/15")}>
                      <span className={"absolute left-0.5 top-0.5 size-2.5 rounded-full transition-transform " + (lyricsFollow ? "translate-x-2.5 bg-black" : "bg-gray-400")} />
                    </span>
                  </button>
                </div>
              </div>
              <div ref={fullLyrics} className="mt-4 max-h-[58dvh] space-y-3 overflow-auto px-1 py-4 font-bold leading-relaxed sm:px-3" style={{ fontSize: lyricsFont }}>
                {lyrics.length ? lyrics.map((line, index) => (
                  <button type="button" key={index} aria-current={index === activeLineIndex ? "true" : undefined}
                    className={"lyrics-line block w-full rounded-lg px-2 py-1 text-left transition-colors " + (index === activeLineIndex
                      ? "lyrics-active-line text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                      : index < activeLineIndex ? "lyrics-line-past text-white/40 hover:text-white/80" : "lyrics-line-future text-white/20 hover:text-white/60")}
                    onClick={() => seek(Math.max(0, line.time + lyricsOffset))}>{line.text || "•••"}</button>
                )) : <p className="whitespace-pre-wrap text-gray-300">{isLoadingLyrics ? "Cargando letras…" : plainLyrics || "Letra no disponible."}</p>}
              </div>
            </Modal>
          )}
          {isLoadingLyrics ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
              <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Fetching lyrics...</span>
            </div>
          ) : lyrics.length > 0 ? (
            <>
              {/* Sync offset controls pill */}
              <div className="flex justify-center mb-3 shrink-0">
                <div className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full text-xs font-semibold text-gray-400 transition-all select-none backdrop-blur-md">
                  <span>Sync:</span>
                  <button 
                    onClick={() => updateOffset(lyricsOffset - 0.5)}
                    className="hover:text-white px-1.5 font-bold cursor-pointer transition-colors"
                    title="Advance lyrics 0.5s"
                  >
                    -0.5s
                  </button>
                  <span className={`min-w-[42px] text-center font-bold transition-colors ${lyricsOffset !== 0 ? 'text-brand-accent scale-105' : 'text-gray-300'}`}>
                    {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
                  </span>
                  <button 
                    onClick={() => updateOffset(lyricsOffset + 0.5)}
                    className="hover:text-white px-1.5 font-bold cursor-pointer transition-colors"
                    title="Delay lyrics 0.5s"
                  >
                    +0.5s
                  </button>
                  {lyricsOffset !== 0 && (
                    <button 
                    onClick={() => updateOffset(0)}
                    className="text-brand-accent hover:text-white pl-1 font-bold cursor-pointer transition-colors border-l border-white/10 ml-0.5"
                    title="Reset"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
              
              <div 
                ref={lyricsContainerRef}
                className="flex-1 overflow-y-auto flex flex-col gap-6 py-24 px-2 scrollbar-none"
                style={{ scrollBehavior: "smooth" }}
              >
                {lyrics.map((line, idx) => {
                  const isActive = idx === activeLineIndex;
                  const isPast = idx < activeLineIndex;
                  const effectiveTime = currentTime - lyricsOffset;
                  const hasWordSync = Boolean(lyricsWordByWord && line.words && line.words.length > 0);

                  return (
                    <button
                      type="button"
                      key={idx}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => seek(Math.max(0, line.time + lyricsOffset))}
                      className={`lyrics-line text-lg md:text-xl font-bold cursor-pointer transition-all duration-300 text-left origin-left leading-relaxed ${
                        isActive 
                          ? `lyrics-active-line scale-105 ${hasWordSync ? '' : 'text-white filter drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] opacity-100'}`
                          : isPast 
                            ? "lyrics-line-past text-white/40 hover:text-white/80" 
                            : "lyrics-line-future text-white/20 hover:text-white/60"
                      }`}
                    >
                      {isActive && hasWordSync ? (
                        line.words!.map((word, wIdx) => {
                          const isPastWord = effectiveTime >= word.endTime;
                          const isCurrentWord = effectiveTime >= word.startTime && effectiveTime < word.endTime;
                          return (
                            <span
                              key={wIdx}
                              className={`transition-all duration-150 inline-block mr-[0.28em] ${
                                isCurrentWord
                                  ? "!text-white scale-110 !font-black !opacity-100 drop-shadow-[0_0_18px_rgba(255,255,255,0.95)]"
                                  : isPastWord
                                    ? "!text-white/60 !font-semibold !opacity-60"
                                    : "!text-white/20 !font-medium !opacity-20 select-none"
                              }`}
                            >
                              {word.text}
                            </span>
                          );
                        })
                      ) : (
                        line.text || "•••"
                      )}
                    </button>
                  );
                })}
                <div className="pt-8 pb-4 text-center shrink-0">
                  <a
                    href={lyricsSource === "spicylyrics" ? "https://spicylyrics.org" : lyricsSource === "lrcred" ? "https://lrc.red" : "https://lrclib.net"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/5"
                  >
                    <span>Lyrics via {lyricsSource === "spicylyrics" ? "Spicy Lyrics" : lyricsSource === "lrcred" ? "lrc.red" : "lrclib.net"}</span>
                    {lyricsWordByWord && lyrics.some(l => l.words && l.words.length > 0) && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-brand-accent bg-brand-accent/20 px-1.5 py-0.5 rounded-full border border-brand-accent/30">
                        Word-sync
                      </span>
                    )}
                    <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                  </a>
                </div>
              </div>
            </>
          ) : plainLyrics ? (
            <div className="plain-lyrics flex-1 overflow-y-auto whitespace-pre-wrap text-base font-medium text-gray-300 leading-loose py-4 text-left">
              <span className="mb-2 block text-sm text-gray-300">Letra sin sincronización</span>
              {plainLyrics}
              <div className="pt-6 pb-2 text-center">
                <a
                  href={lyricsSource === "spicylyrics" ? "https://spicylyrics.org" : lyricsSource === "lrcred" ? "https://lrc.red" : "https://lrclib.net"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/5"
                >
                  <span>Lyrics via {lyricsSource === "spicylyrics" ? "Spicy Lyrics" : lyricsSource === "lrcred" ? "lrc.red" : "lrclib.net"}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2 text-center px-4">
              <Mic className="w-10 h-10 text-gray-700 animate-pulse" />
              <p className="text-sm font-semibold">Lyrics not available</p>
              <p className="text-xs text-gray-600">We couldn't find lyrics for this song on LRCLIB.</p>
            </div>
          )}
        </div>
      ) : (
        /* Queue View Container */
        <div className="flex-1 flex flex-col my-2 min-h-0 relative z-10 overflow-hidden">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">
              Up Next ({Math.max(0, queue.length - 1)})
            </span>
            {queue.length > 1 && (
              <button
                onClick={clearQueue}
                className="text-[10px] text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors font-medium px-2 py-0.5 rounded-md hover:bg-white/5"
                title="Clear queue"
              >
                <Trash2 className="w-3 h-3" /> Clear queue
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {/* Now Playing Header in Queue */}
            <div className="p-2.5 rounded-xl bg-white/5 border border-brand-accent/20 flex items-center gap-3">
              <img src={currentTrack.thumbnail} className="w-9 h-9 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase text-brand-accent tracking-wider">Now Playing</span>
                </div>
                <h4 className="font-bold text-xs text-white truncate">{currentTrack.title}</h4>
                <p className="text-[10px] text-gray-400 truncate">{currentTrack.artist}</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-brand-accent animate-pulse mr-1" />
            </div>

            {/* Upcoming Queue Items */}
            {queue.length <= 1 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 gap-2">
                <ListMusic className="w-8 h-8 text-gray-700" />
                <p className="text-xs font-semibold text-gray-400">No more tracks in the queue</p>
                <p className="text-[10px] text-gray-600">Add tracks using the context menu or play a playlist</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 mt-2">
                {queue.slice(1).map((track, i) => {
                  const originalIdx = i + 1;
                  return (
                    <div
                      key={`${track.id}-${i}`}
                      className="group flex items-center gap-2.5 p-2 rounded-xl bg-white/[0.02] hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all cursor-pointer"
                      onClick={() => playTrack(track)}
                    >
                      <span className="text-[10px] font-bold text-gray-500 w-4 text-center shrink-0">
                        {i + 1}
                      </span>
                      <img src={track.thumbnail} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          {track.isUserAdded && (
                            <span className="text-[8px] bg-brand-accent/20 text-brand-accent px-1 rounded font-bold">
                              User
                            </span>
                          )}
                          <h4 className="font-semibold text-xs text-white truncate group-hover:text-brand-accent transition-colors">
                            {track.title}
                          </h4>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        {i > 0 && (
                          <button
                            onClick={() => reorderQueue(originalIdx, originalIdx - 1)}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                            title="Move up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {i < queue.length - 2 && (
                          <button
                            onClick={() => reorderQueue(originalIdx, originalIdx + 1)}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                            title="Move down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFromQueue(track.id)}
                          className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-white/10"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metadata & Actions */}
      <div className="w-full flex items-center justify-between mt-3 mb-2 shrink-0 overflow-hidden">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            {(isExplicit || currentTrack.isExplicit) && hasDualVersions && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-white/20 text-[9px] font-bold text-gray-300 shrink-0 select-none"
                title="Explicit"
              >
                E
              </span>
            )}
            <h2 
              onClick={() => {
                if (onOpenAlbum && currentTrack.albumId) {
                  onOpenAlbum({ id: currentTrack.albumId, title: currentTrack.albumName || "Album", artist: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                  if (onClose) onClose();
                }
              }}
              className="text-2xl font-bold text-white truncate tracking-wide cursor-pointer hover:text-brand-accent hover:underline block max-w-full"
            >
              {currentTrack.title}
            </h2>
          </div>
          <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-1 select-none">
            {(() => {
              const artistList = getArtistsFromTrack(currentTrack);
              return artistList.map((art, i) => (
                <React.Fragment key={art.id || i}>
                  <span
                    onClick={() => {
                      if (onOpenArtist) {
                        onOpenArtist({ id: art.id, name: art.name, thumbnail: currentTrack.thumbnail });
                        if (onClose) onClose();
                      }
                    }}
                    className="cursor-pointer hover:text-brand-accent hover:underline transition-colors"
                  >
                    {art.name}
                  </span>
                  {i < artistList.length - 1 && <span>,</span>}
                </React.Fragment>
              ));
            })()}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* External integration links */}
          {currentTrack.spotifyUrl && (
            <a 
              href={currentTrack.spotifyUrl} 
              target="_blank" 
              rel="noreferrer"
              className="p-2 rounded-full hover:bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 transition-all"
              title="Open Spotify"
            >
              <ExternalLink className="w-4.5 h-4.5" />
            </a>
          )}
          {currentTrack.youtubeUrl && (
            <a 
              href={currentTrack.youtubeUrl} 
              target="_blank" 
              rel="noreferrer"
              className="p-2 rounded-full hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-all"
              title="Open YouTube video"
            >
              <Play className="w-4.5 h-4.5" />
            </a>
          )}
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(currentTrack)}
              className={`p-2.5 rounded-full hover:bg-white/10 transition-all ${
                isFavorite ? "text-red-500 scale-110" : "text-gray-400 hover:text-white"
              }`}
            >
              <Heart className="w-5.5 h-5.5" fill={isFavorite ? "currentColor" : "none"} />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Playback Controls (only visible on mobile/tablet screens) */}
      <div className="lg:hidden w-full flex flex-col gap-5 mt-4 shrink-0 px-2 select-none">
        {/* Progress Slider */}
        <div className="w-full flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={sliderVal}
            onChange={handleSliderChange}
            onMouseUp={handleSliderMouseUp}
            onTouchEnd={handleSliderMouseUp}
            disabled={roomId !== null && !isHost}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer playback-range accent-brand-accent focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between text-[11px] text-gray-400 font-semibold tracking-wider">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between px-4 mt-2">
          <button
            onClick={toggleShuffle}
            disabled={roomId !== null && !isHost}
            className={`p-2 rounded-full transition-all ${
              isShuffle ? "text-brand-accent scale-110" : "text-gray-400 hover:text-white"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Shuffle"
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={prevTrack}
            disabled={roomId !== null && !isHost}
            className="p-2 rounded-full text-white active:scale-90 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoading || (roomId !== null && !isHost)}
            className="p-5 rounded-full bg-white text-black transition-transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-black/40"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-1" />
            )}
          </button>

          <button
            onClick={nextTrack}
            disabled={roomId !== null && !isHost}
            className="p-2 rounded-full text-white active:scale-90 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={toggleRepeat}
            disabled={roomId !== null && !isHost}
            className={`p-2 rounded-full relative transition-all ${
              isRepeat !== "none" ? "text-brand-accent scale-110" : "text-gray-400 hover:text-white"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Repeat"
          >
            <Repeat className="w-5 h-5" />
            {isRepeat === "one" && (
              <span className="absolute top-1 right-1 text-[8px] font-black bg-brand-accent text-white px-0.5 rounded-full">
                1
              </span>
            )}
          </button>
        </div>

        {/* Volume Indicator */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2.5 rounded-2xl mt-2">
          <button aria-label={isMuted ? "Activar sonido" : "Silenciar"} onClick={toggleMute} className="text-gray-300 hover:text-white">
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4.5 h-4.5 text-brand-accent" />
            ) : (
              <Volume2 className="w-4.5 h-4.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => changeVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer playback-range accent-brand-accent"
          />
        </div>
      </div>

      {/* Artist Profile & Next Up Sections (Only visible in Overview tab) */}
      {view === "info" && (
        <div className="hidden lg:flex mt-4 flex-col gap-5 w-full shrink-0">
          {/* About the Artist Card */}
          <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/5 group/artist h-36">
            <div className="artist-card-overlay absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 z-10" />
            <img 
              src={artistPic || currentTrack.thumbnail} 
              alt={currentTrack.artist} 
              className="w-full h-full object-cover opacity-60 blur-xs scale-105 group-hover/artist:scale-110 transition-transform duration-700" 
            />
            <div className="absolute inset-x-0 bottom-0 p-4 z-20 flex flex-col gap-1.5">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-accent">About the Artist</span>
              <div className="flex items-center gap-2.5">
                <img 
                  src={artistPic || currentTrack.thumbnail} 
                  alt={currentTrack.artist} 
                  className="w-9 h-9 rounded-full object-cover border border-brand-accent/50 shadow-md"
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm truncate">{currentTrack.artist}</h3>
                  {monthlyListeners !== undefined && (
                    <p className="text-[9px] text-gray-300 mt-0.5">
                      {monthlyListeners.toLocaleString()} Monthly Listeners
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-1 mt-0.5">
                Leading the charts. Stream more popular tracks from {currentTrack.artist} directly on their page.
              </p>
            </div>
          </div>

          {/* Next Up Card */}
          <div className="rounded-2xl bg-white/5 border border-white/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Next In Queue</span>
              {queue.length > 1 && (
                <button
                  onClick={() => setView("queue")}
                  className="text-[10px] text-brand-accent hover:underline font-semibold"
                >
                  View all ({queue.length - 1})
                </button>
              )}
            </div>
            {currentIndex >= 0 && currentIndex < queue.length - 1 ? (
              (() => {
                const nextTrackItem = queue[currentIndex + 1];
                return (
                  <div 
                    onClick={() => playTrack(nextTrackItem)}
                    className="flex items-center gap-3 p-2 rounded-xl bg-white/5 hover:bg-brand-accent/10 hover:border-brand-accent/20 border border-transparent transition-all cursor-pointer group/next"
                  >
                    <img src={nextTrackItem.thumbnail} className="w-8 h-8 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[11px] text-white truncate group-hover/next:text-brand-accent transition-colors">{nextTrackItem.title}</h4>
                      <p className="text-[9px] text-gray-400 truncate mt-0.5">{nextTrackItem.artist}</p>
                    </div>
                    <Play className="w-3 h-3 text-gray-400 group-hover/next:text-brand-accent fill-current transition-colors opacity-0 group-hover/next:opacity-100 mr-1" />
                  </div>
                );
              })()
            ) : (
              <div className="text-[10px] text-gray-500 py-1 italic text-center">
                Queue ends after this track.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Track Info Detail Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 select-none animate-fadeIn backdrop-blur-md">
          <div className="bg-[#121212] border border-white/10 w-full max-w-md rounded-[28px] p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowInfoModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-brand-accent" />
              Track Metadata
            </h3>

            <div className="flex flex-col gap-4 text-xs">
              <div className="flex items-center gap-4 bg-white/5 p-3 rounded-2xl border border-white/5">
                <img src={currentTrack.thumbnail} className="w-14 h-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-white truncate">{currentTrack.title}</p>
                  <p className="text-gray-400 truncate mt-0.5">{currentTrack.artist}</p>
                  {currentTrack.albumName && (
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">Album: {currentTrack.albumName}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2.5 bg-white/5 p-4 rounded-2xl border border-white/5">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Track ID:</span>
                  <span className="text-gray-300 font-mono text-[10px] select-all">{currentTrack.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Duration:</span>
                  <span className="text-gray-300">{formatTime(currentTrack.duration)} ({currentTrack.duration}s)</span>
                </div>
                {currentTrack.plays && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-semibold">YouTube Views:</span>
                    <span className="text-gray-300">{currentTrack.plays}</span>
                  </div>
                )}
                {currentTrack.audioUrl && (
                  <div className="flex flex-col gap-1.5 mt-1 pt-2.5 border-t border-white/5">
                    <span className="text-gray-500 font-semibold">Decrypted Stream URL:</span>
                    <input 
                      type="text" 
                      readOnly 
                      value={currentTrack.audioUrl} 
                      className="bg-black/40 border border-white/5 rounded-lg p-2 font-mono text-[9px] text-gray-400 select-all"
                    />
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowInfoModal(false)}
                className="w-full py-2.5 mt-2 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default PlayerPanel;

