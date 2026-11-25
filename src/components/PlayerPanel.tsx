import { parseLRC } from "../services/lyricsTiming";
import { localized, useLanguage } from "../context/LanguageContext";
import { LoadingSkeleton } from "./LoadingSkeleton";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Heart, 
  Volume2, VolumeX, Info, ExternalLink, Disc, Mic, X, Clock, Waves,
  ListMusic, Trash2, ArrowUp, ArrowDown, Maximize2, FileText, MoreHorizontal, ChevronDown
} from "lucide-react";
import { useAudio, useAudioProgress } from "../context/AudioContext";
import type { Track } from "../services/musicApi";
import { getArtistsFromTrack } from "../services/musicApi";
import { Modal } from "./Modal";
import { downloadFile } from "../services/libraryFiles";

const lyricsControl = "inline-flex min-h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 transition-colors hover:text-white";

interface PlayerPanelProps {
  onTrackContextMenu?: (event: React.MouseEvent, track: Track) => void;
  desktopLyricsRequest?: { show: boolean };
  immersive?: boolean;
  immersivePalette?: "color";
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: boolean;
  onClose?: () => void; // for mobile overlay close
  onOpenAlbum?: (album: any) => void;
  onOpenArtist?: (artist: any) => void;
  isExplicit?: boolean;
}

export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  desktopLyricsRequest,
  immersive = false,
  immersivePalette,
  onTrackContextMenu,
  onToggleFavorite,
  isFavorite = false,
  onClose,
  onOpenAlbum,
  onOpenArtist,
  isExplicit = false
}) => {
  const { language } = useLanguage();
  const copy = (es: string, en: string, eu: string) => localized(language, es, en, eu);
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
  const [artistProfile, setArtistProfile] = useState<{ key: string; portrait?: string; fans?: number }>();
  const [view, setView] = useState<"info" | "lyrics" | "queue">(immersive ? "lyrics" : "info");
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [rawLrcText, setRawLrcText] = useState<string>("");
  const [syncedLrcText, setSyncedLrcText] = useState<string>("");
  const [lyricsSource, setLyricsSource] = useState<string>("lrclib");
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);
  useEffect(() => {
    if (desktopLyricsRequest) setView(value => desktopLyricsRequest.show || value !== "lyrics" ? "lyrics" : "info");
  }, [desktopLyricsRequest]);
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
  const immersiveTitleRef = useRef<HTMLHeadingElement>(null);
  const [immersiveFollowing, setImmersiveFollowing] = useState(true);
  const [immersiveMenu, setImmersiveMenu] = useState(false);
  const [immersiveSync, setImmersiveSync] = useState(false);
  const immersiveMenuRef = useRef<HTMLDivElement>(null);
  const immersiveMenuTrigger = useRef<HTMLButtonElement>(null);
  const closeImmersiveMenu = () => {
    setImmersiveMenu(false);
    immersiveMenuTrigger.current?.focus();
  };
  useEffect(() => {
    if (!immersiveMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !immersiveMenuRef.current?.contains(event.target)) {
        setImmersiveMenu(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [immersiveMenu]);
  // Sync internal slider value to currentTime
  useEffect(() => {
    setSliderVal(currentTime);
  }, [currentTime]);

  // Fetch artist actual profile picture, monthly listeners, and lyrics
  useEffect(() => {
    if (!currentTrack) return;
    let active = true;

    setPlainLyrics("");
    setRawLrcText("");
    setSyncedLrcText("");
    
    // Load saved offset for this song & user combination
    const userId = currentUser ? currentUser.id : "guest";
    const saved = localStorage.getItem(`ibrastream_lyric_offset_${userId}_${currentTrack.id}_${isExplicit || currentTrack.isExplicit ? "explicit" : "clean"}`) ?? localStorage.getItem(`ibrastream_lyric_offset_${userId}_${currentTrack.id}`);
    setLyricsOffset(saved ? parseFloat(saved) : 0);

    setIsLoadingLyrics(true);

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
          if (data.plainLyrics) setPlainLyrics(data.plainLyrics);
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

  const creditedArtist = currentTrack?.artists?.[0];
  const artistName = creditedArtist?.name || currentTrack?.artist || "";
  const artistId = creditedArtist?.id || currentTrack?.artistId || "";
  const artistKey = JSON.stringify([artistName, artistId]);
  const artistPic = artistProfile?.key === artistKey ? artistProfile.portrait : undefined;
  const artistFans = artistProfile?.key === artistKey ? artistProfile.fans : undefined;

  useEffect(() => {
    if (!artistName || immersive) return;
    let active = true;
    void import("../services/musicApi").then(async ({ resolveArtistIdentity }) => {
      const identity = await resolveArtistIdentity({ id: artistId, name: artistName, thumbnail: "" }, currentTrack ?? undefined);
      if (!active || !identity) return;
      setArtistProfile({ key: artistKey, portrait: identity.portrait, fans: identity.provider === "deezer" ? identity.popularity : undefined });
    }).catch(() => {});
    return () => { active = false; };
  }, [artistId, artistKey, artistName, currentTrack, immersive]);

  const lyrics = useMemo(
    () => parseLRC(syncedLrcText || rawLrcText, rawLrcText, lyricsWordByWord),
    [lyricsWordByWord, syncedLrcText, rawLrcText],
  );

  const effectiveTime = currentTime - lyricsOffset;
  let firstUpcoming = 0;
  let end = lyrics.length;
  while (firstUpcoming < end) {
    const mid = Math.floor((firstUpcoming + end) / 2);
    if (lyrics[mid].time <= effectiveTime) firstUpcoming = mid + 1;
    else end = mid;
  }
  const activeLineIndex = firstUpcoming - 1;

  React.useLayoutEffect(() => {
    const viewport = lyricsContainerRef.current;
    const title = immersiveTitleRef.current;
    if (!immersive || view !== "lyrics" || !viewport || !title) return;

    const alignFade = () => {
      const bounds = viewport.getBoundingClientRect();
      if (!bounds.height) return;
      const position = (title.getBoundingClientRect().top - bounds.top) / bounds.height;
      viewport.style.setProperty("--immersive-lyrics-fade-start", Math.min(1, Math.max(0.08, position)) * 100 + "%");
    };
    alignFade();
    const observer = new ResizeObserver(alignFade);
    observer.observe(viewport);
    observer.observe(title);
    if (title.parentElement?.parentElement) observer.observe(title.parentElement.parentElement);
    window.addEventListener("resize", alignFade);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", alignFade);
      viewport.style.removeProperty("--immersive-lyrics-fade-start");
    };
  }, [immersive, view, currentTrack?.id, isLoadingLyrics, lyrics.length]);

  useEffect(() => {
    if (lyricsExpanded && lyricsFollow) {
      fullLyrics.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
    }
  }, [lyricsExpanded, lyricsFollow, activeLineIndex]);

  useEffect(() => {
    const container = lyricsContainerRef.current;
    if (!(immersive ? immersiveFollowing : lyricsFollow) || view !== "lyrics" || !container) return;
    const active = container.querySelector(".lyrics-active-line");
    const bounds = active?.getBoundingClientRect();
    const top = bounds
      ? container.scrollTop + bounds.top - container.getBoundingClientRect().top - (container.clientHeight - bounds.height) / 2
      : 0;
    const reduce = document.documentElement.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    container.scrollTo({ top, behavior: reduce || activeLineIndex < 0 ? "instant" : "smooth" });
  }, [activeLineIndex, view, lyricsFollow, immersive, immersiveFollowing, lyrics]);

  if (!currentTrack) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500 glass-panel border-l border-gray-800">
        <Disc className="w-16 h-16 animate-spin-slow mb-4 text-gray-700" />
        <h3 className="text-lg font-semibold text-gray-400">{copy("Ninguna canción seleccionada", "No Song Selected", "Aukeratu abesti bat")}</h3>
        <p className="text-sm text-gray-600 mt-1 max-w-[200px]">
          {copy("Elige una canción de la biblioteca o búscala para empezar.", "Choose a song from the library or search to get started.", "Aukeratu abesti bat liburutegian edo bilatu hasteko.")}
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
  const reportLyrics = () => downloadFile("reporte-letra.txt", [
    "IbraMusic · Incidencia con una letra",
    currentTrack.title + " — " + currentTrack.artist,
    "Proveedor: " + lyricsSource,
    "Describe el problema: letra incorrecta, desfase u otro.",
  ].join("\n"), "text/plain");
  const lyricsProviderUrl = lyricsSource === "spicylyrics" ? "https://spicylyrics.org" : lyricsSource === "lrcred" ? "https://lrc.red" : "https://lrclib.net";
  const lyricsProviderName = lyricsSource === "spicylyrics" ? "Spicy Lyrics" : lyricsSource === "lrcred" ? "lrc.red" : "LRCLIB";
  const offsetDisplay = (lyricsOffset > 0 ? "+" : "") + lyricsOffset.toFixed(1) + "s";

  return (
    <div
      className={immersive ? "immersive-player relative h-full w-full overflow-hidden" : "h-full w-full flex flex-col justify-between p-5 md:p-6 glass-panel border-l border-gray-800/50 relative overflow-hidden select-none"}
      data-immersive-palette={immersive ? immersivePalette : undefined}
    >
      {/* Immersive blurred backdrop overlay */}
      {immersive && immersivePalette === "color" && <div key={currentTrack.thumbnail} className="immersive-ambient" aria-hidden="true" />}
      {!immersive && ambientGlowEnabled && document.documentElement.getAttribute("data-theme") !== "noir" && (
        <div 
          className="player-cover-glow absolute inset-0 z-0 pointer-events-none transition-all duration-1000 opacity-20 select-none filter blur-[100px] bg-center bg-cover"
          style={{
            backgroundImage: `url(${currentTrack.thumbnail})`,
          }}
        />
      )}
      
      {/* Header Controls */}
      <div className={immersive ? "immersive-tools relative z-10 flex justify-end pr-16" : "flex items-center justify-between mb-2 shrink-0 relative z-10"}>
        {!immersive && sleepTimerRemaining !== null && (
          <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-brand-accent/20 border border-brand-accent/35 text-white text-[9px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center gap-1.5 animate-pulse shrink-0 backdrop-blur-md">
            <Clock className="w-2.5 h-2.5 text-brand-accent" />
            <span>Sleep: {Math.floor(sleepTimerRemaining / 60)}:{(sleepTimerRemaining % 60).toString().padStart(2, "0")}</span>
          </div>
        )}
        {onClose && (
          <button 
            onClick={onClose}
            aria-label={copy("Cerrar reproductor", "Close player", "Itxi erreproduzitzailea")}
            className="lg:hidden grid size-11 place-items-center rounded-full hover:bg-white/10 text-gray-300 hover:text-white"
          >
            ← Back
          </button>
        )}
        {!immersive && <div className="flex gap-1 bg-white/5 p-1 rounded-xl text-xs font-semibold text-gray-400 mx-auto">
          <button 
            onClick={() => setView("info")} 
            aria-pressed={view === "info"}
            className={`px-3 py-1.5 rounded-lg transition-all ${view === "info" ? "bg-white text-black font-bold shadow" : "hover:text-white"}`}
          >
            {copy("Resumen", "Overview", "Laburpena")}
          </button>
          <button 
            onClick={() => setView("lyrics")} 
            aria-pressed={view === "lyrics"}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${view === "lyrics" ? "bg-white text-black font-bold shadow" : "hover:text-white"}`}
          >
            <Mic className="w-3.5 h-3.5" /> {copy("Letras", "Lyrics", "Letrak")}
          </button>
        </div>}
        {immersive ? <div ref={immersiveMenuRef} className="relative" onKeyDown={event => {
          if (event.key !== "Escape" || !immersiveMenu) return;
          event.preventDefault();
          event.stopPropagation();
          closeImmersiveMenu();
        }}>
          <button ref={immersiveMenuTrigger} type="button" className="immersive-options-trigger"
            aria-expanded={immersiveMenu} aria-label={copy("Opciones", "Options", "Aukerak")}
            title={copy("Opciones", "Options", "Aukerak")}
            onClick={() => {
              if (immersiveMenu) closeImmersiveMenu();
              else { setImmersiveSync(false); setImmersiveMenu(true); }
            }}>
            <MoreHorizontal aria-hidden="true" className="size-5" />
          </button>
          <div role="group" inert={!immersiveMenu} data-open={immersiveMenu} aria-label={copy("Opciones del modo inmersivo", "Immersive options", "Murgiltze-moduko aukerak")} className="immersive-options-menu">
            <section className="immersive-options-group">
              <h3>{copy("Acciones", "Actions", "Ekintzak")}</h3>
              <button type="button" onClick={() => { closeImmersiveMenu(); setLyricsExpanded(true); }}>{copy("Ampliar letra", "Expand lyrics", "Handitu letra")}</button>
              {lyrics.length > 0 &&
                <button type="button" onClick={() => { setImmersiveFollowing(value => !value); closeImmersiveMenu(); }}>
                  {immersiveFollowing ? copy("Pausar seguimiento", "Pause auto-follow", "Pausatu jarraipena") : copy("Reanudar seguimiento", "Resume auto-follow", "Berrekin jarraipenari")}
                </button>
              }
              <button type="button" onClick={() => { closeImmersiveMenu(); reportLyrics(); }}>{copy("Reportar un problema con la letra", "Report lyrics issue", "Jakinarazi letraren arazoa")}</button>
            </section>
            <section className="immersive-options-group">
              <h3>{copy("Letras y reproducción", "Lyrics and playback", "Letrak eta erreprodukzioa")}</h3>
              {lyrics.length > 0 && <>
                <button type="button" aria-expanded={immersiveSync} onClick={() => setImmersiveSync(value => !value)}>
                  {copy("Ajustar sincronía", "Adjust sync", "Doitu sinkronizazioa")}
                  <span className="immersive-options-value">{offsetDisplay}<ChevronDown aria-hidden="true" className="size-3" /></span>
                </button>
                {immersiveSync && <div className="immersive-options-sync">
                  <button type="button" aria-label={copy("Adelantar letra 0,5 s", "Advance lyrics 0.5s", "Aurreratu letra 0,5 s")} onClick={() => updateOffset(lyricsOffset - 0.5)}>−0.5s</button>
                  <output aria-live="polite">{offsetDisplay}</output>
                  <button type="button" aria-label={copy("Retrasar letra 0,5 s", "Delay lyrics 0.5s", "Atzeratu letra 0,5 s")} onClick={() => updateOffset(lyricsOffset + 0.5)}>+0.5s</button>
                  <button type="button" onClick={() => updateOffset(0)}>{copy("Restablecer sincronía", "Reset sync", "Berrezarri sinkronizazioa")}</button>
                </div>}
              </>}
              <button type="button" aria-pressed={seamlessTransitions} onClick={() => setSeamlessTransitions(!seamlessTransitions)}>
                {copy("Transición fluida", "Crossfade", "Trantsizio leuna")}
                <span className="immersive-options-value">{seamlessTransitions ? copy("Activa", "On", "Aktibatuta") : copy("Inactiva", "Off", "Desaktibatuta")}</span>
              </button>
              {(lyrics.length > 0 || plainLyrics) && <a href={lyricsProviderUrl} target="_blank" rel="noreferrer">
                {copy("Proveedor de letras", "Lyrics provider", "Letren hornitzailea")} <span className="immersive-options-value">{lyricsProviderName}</span>
              </a>}
            </section>
            <section className="immersive-options-group">
              <h3>{copy("Información", "Info", "Informazioa")}</h3>
              <button type="button" onClick={() => { closeImmersiveMenu(); setShowInfoModal(true); }}>{copy("Información de la canción", "Track information", "Abestiaren informazioa")}</button>
              {sleepTimerRemaining !== null && <p>{copy("Temporizador", "Sleep timer", "Tenporizadorea")} · {formatTime(sleepTimerRemaining)}</p>}
            </section>
          </div>
        </div> : <div className="flex items-center gap-1">
          <button
            onClick={() => setSeamlessTransitions(!seamlessTransitions)}
            className={`p-2 rounded-full transition-all relative ${
              seamlessTransitions
                ? "text-white bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.2)]"
                : "text-gray-400 hover:text-white hover:bg-white/10"
            }`}
            aria-pressed={seamlessTransitions}
            title={copy("Transición fluida", "Crossfade", "Trantsizio leuna")}
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
        </div>}

      </div>

      {immersive && <div className="immersive-cover" onContextMenu={event => onTrackContextMenu?.(event, currentTrack)}>
        <div className="immersive-artwork">
          {currentTrack.thumbnail ? <img key={currentTrack.thumbnail} alt="" src={currentTrack.thumbnail} />
            : <Disc aria-hidden="true" className="size-20" />}
        </div>
        <div key={currentTrack.id} className="immersive-track">
          <h2 ref={immersiveTitleRef} title={currentTrack.title}>{currentTrack.title}</h2>
          <p title={currentTrack.artist}>{currentTrack.artist}</p>
        </div>
      </div>}
      {/* Main Content Area: Album Art, Lyrics, or Queue */}
      {view === "info" ? (
        <div onContextMenu={event => onTrackContextMenu?.(event, currentTrack)} className="overview-art flex-1 min-h-0 flex flex-col items-center justify-center my-2 relative w-full overflow-hidden">
          <div className="relative group w-64 sm:w-72 md:w-80 max-w-full aspect-square rounded-none overflow-hidden shrink z-10">
            <div className="w-full h-full rounded-none overflow-hidden relative">
              <img
                key={currentTrack.id}
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
                className="overview-cover w-full h-full object-contain"
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
        <div className={`lyrics-palette flex-1 flex flex-col min-h-0 relative z-10 ${immersive ? "immersive-lyrics" : "my-4"}`}>
          {!immersive && <div className="mb-2 flex shrink-0 flex-wrap gap-2">
            <button type="button" className={lyricsControl} onClick={() => setLyricsExpanded(true)}><Maximize2 className="size-3.5" aria-hidden="true" /> {copy("Ampliar letra", "Expand lyrics", "Handitu letra")}</button>
            <button type="button" className={lyricsControl} onClick={reportLyrics}><FileText className="size-3.5" aria-hidden="true" /> {copy("Preparar reporte", "Prepare report", "Prestatu txostena")}</button>
          </div>}
          {lyricsExpanded && (
            <Modal title={copy("Letras", "Lyrics", "Letrak")} wide onClose={() => setLyricsExpanded(false)}>
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
              <div ref={fullLyrics} className="lyrics-palette mt-4 max-h-[58dvh] space-y-3 overflow-auto px-1 py-4 font-bold leading-relaxed sm:px-3" style={{ fontSize: lyricsFont }}>
                {lyrics.length ? lyrics.map((line, index) => (
                  <button type="button" key={index} aria-current={index === activeLineIndex ? "true" : undefined}
                    className={"lyrics-line block w-full rounded-lg px-2 py-1 text-left transition-colors " + (index === activeLineIndex
                      ? "lyrics-active-line bg-white/5"
                      : index < activeLineIndex ? "lyrics-line-past" : "lyrics-line-future")}
                    onClick={() => seek(Math.max(0, line.time + lyricsOffset))}>{line.text || "•••"}</button>
                )) : isLoadingLyrics ? <LoadingSkeleton layout="text" label={copy("Cargando letras…", "Loading lyrics…", "Letrak kargatzen…")} /> : <p className="plain-lyrics whitespace-pre-wrap">{plainLyrics || copy("Letra no disponible.", "Lyrics not available.", "Letra ez dago erabilgarri.")}</p>}
              </div>
            </Modal>
          )}
          {isLoadingLyrics ? (
            <LoadingSkeleton layout="text" label={copy("Cargando letras…", "Loading lyrics…", "Letrak kargatzen…")} className="flex-1 py-14" />
          ) : lyrics.length > 0 ? (
            <>
              {/* Sync offset controls pill */}
              {!immersive && <div className="flex mb-3 shrink-0 justify-center">
                <div className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-full text-xs font-semibold text-gray-400 transition-all select-none backdrop-blur-md">
                  <span>{copy("Sincronía", "Sync", "Sinkronizazioa")}</span>
                  <button 
                    onClick={() => updateOffset(lyricsOffset - 0.5)}
                    className="hover:text-white px-1.5 font-bold cursor-pointer transition-colors"
                    title={copy("Adelantar letra 0,5 s", "Advance lyrics 0.5s", "Aurreratu letra 0,5 s")}
                  >
                    -0.5s
                  </button>
                  <span className={`min-w-[42px] text-center font-bold transition-colors ${lyricsOffset !== 0 ? 'text-brand-accent scale-105' : 'text-gray-300'}`}>
                    {lyricsOffset > 0 ? `+${lyricsOffset.toFixed(1)}s` : `${lyricsOffset.toFixed(1)}s`}
                  </span>
                  <button 
                    onClick={() => updateOffset(lyricsOffset + 0.5)}
                    className="hover:text-white px-1.5 font-bold cursor-pointer transition-colors"
                    title={copy("Retrasar letra 0,5 s", "Delay lyrics 0.5s", "Atzeratu letra 0,5 s")}
                  >
                    +0.5s
                  </button>
                  {lyricsOffset !== 0 && (
                    <button 
                    onClick={() => updateOffset(0)}
                    className="text-brand-accent hover:text-white pl-1 font-bold cursor-pointer transition-colors border-l border-white/10 ml-0.5"
                    title={copy("Restablecer", "Reset", "Berrezarri")}
                  >
                    {copy("Restablecer", "Reset", "Berrezarri")}
                  </button>
                )}
              </div>
            </div>}
              
              <div 
                key={currentTrack.id}
                ref={lyricsContainerRef}
                tabIndex={immersive ? 0 : undefined}
                aria-label={immersive ? copy("Letras sincronizadas", "Synced lyrics", "Letra sinkronizatuak") : undefined}
                onWheel={immersive ? () => setImmersiveFollowing(false) : undefined}
                onKeyDown={immersive ? event => {
                  if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
                    event.stopPropagation();
                    setImmersiveFollowing(false);
                  }
                } : undefined}
                className={`lyrics-scroll flex-1 overflow-y-auto flex flex-col gap-6 px-2 scrollbar-none ${immersive ? "immersive-lyrics-scroll" : "py-24"}`}
              >
                {lyrics.map((line, idx) => {
                  const isActive = idx === activeLineIndex;
                  const isPast = idx < activeLineIndex;
                  const hasWordSync = Boolean(lyricsWordByWord && line.words && line.words.length > 0);

                  return (
                    <button
                      type="button"
                      key={idx}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => seek(Math.max(0, line.time + lyricsOffset))}
                      className={`lyrics-line break-words text-lg md:text-xl font-bold cursor-pointer transition-colors duration-150 text-left leading-relaxed ${
                        isActive 
                          ? "lyrics-active-line font-extrabold"
                          : isPast 
                            ? "lyrics-line-past"
                            : "lyrics-line-future"
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
                                  ? "font-black underline decoration-2 underline-offset-4"
                                  : isPastWord
                                    ? "lyrics-word-sung font-semibold"
                                    : "lyrics-word-upcoming font-medium"
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
                {!immersive && <div className="pt-8 pb-4 text-center shrink-0">
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
                </div>}
              </div>
            </>
          ) : plainLyrics ? (
            <div className="plain-lyrics flex-1 overflow-y-auto whitespace-pre-wrap text-base font-medium leading-loose py-4 text-left">
              <span className="mb-2 block text-sm text-gray-300">{copy("Letra sin sincronización", "Unsynced lyrics", "Sinkronizatu gabeko letra")}</span>
              {plainLyrics}
              {!immersive && <div className="pt-6 pb-2 text-center">
                <a
                  href={lyricsSource === "spicylyrics" ? "https://spicylyrics.org" : lyricsSource === "lrcred" ? "https://lrc.red" : "https://lrclib.net"}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/5"
                >
                  <span>Lyrics via {lyricsSource === "spicylyrics" ? "Spicy Lyrics" : lyricsSource === "lrcred" ? "lrc.red" : "lrclib.net"}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </a>
              </div>}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2 text-center px-4">
              <Mic className="w-10 h-10 text-gray-700 animate-pulse" />
              <p className="text-sm font-semibold">{copy("Letra no disponible", "Lyrics not available", "Letra ez dago erabilgarri")}</p>
              <p className="text-xs text-gray-600">{copy("No encontramos la letra de esta canción.", "We couldn't find lyrics for this song.", "Ez dugu abesti honen letra aurkitu.")}</p>
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
                title={copy("Vaciar cola", "Clear queue", "Hustu ilara")}
              >
                <Trash2 className="w-3 h-3" /> Clear queue
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {/* Now Playing Header in Queue */}
            <div onContextMenu={event => onTrackContextMenu?.(event, currentTrack)} className="p-2.5 rounded-xl bg-white/5 border border-brand-accent/20 flex items-center gap-3">
              <img src={currentTrack.thumbnail} className="w-9 h-9 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold uppercase text-brand-accent tracking-wider">{copy("En reproducción", "Now Playing", "Erreproduzitzen")}</span>
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
                <p className="text-xs font-semibold text-gray-400">{copy("No quedan canciones en la cola", "No more tracks in the queue", "Ez da abesti gehiagorik geratzen ilaran")}</p>
                <p className="text-[10px] text-gray-600">{copy("Añade canciones desde su menú o reproduce una playlist", "Add tracks using the context menu or play a playlist", "Gehitu abestiak menutik edo erreproduzitu zerrenda bat")}</p>
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
                      onContextMenu={event => onTrackContextMenu?.(event, track)}
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
                            title={copy("Subir", "Move up", "Igo")}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                        )}
                        {i < queue.length - 2 && (
                          <button
                            onClick={() => reorderQueue(originalIdx, originalIdx + 1)}
                            className="p-1 text-gray-400 hover:text-white rounded hover:bg-white/10"
                            title={copy("Bajar", "Move down", "Jaitsi")}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          onClick={() => removeFromQueue(track.id)}
                          className="p-1 text-gray-400 hover:text-red-400 rounded hover:bg-white/10"
                          title={copy("Quitar de la cola", "Remove from queue", "Kendu ilaratik")}
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
      {!immersive && <div className="w-full flex items-center justify-between mt-3 mb-2 shrink-0 overflow-hidden">
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
              title={currentTrack.title}
              className="text-2xl font-bold text-white truncate tracking-tight cursor-pointer hover:text-brand-accent hover:underline block max-w-full"
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

      }
      {/* Shared playback controls */}
      <div className={`${immersive ? "immersive-controls relative z-10 mx-auto max-w-3xl border-t border-white/10 pt-3" : "lg:hidden"} w-full flex flex-col gap-3 mt-4 shrink-0 px-2 select-none`}>
        {/* Progress Slider */}
        <div className="w-full flex flex-col gap-2">
          <input
            type="range"
            aria-label={copy("Posición de reproducción", "Playback position", "Erreprodukzio-posizioa")}
            min={0}
            max={duration || 100}
            value={sliderVal}
            style={immersive ? { "--immersive-range-position": Math.max(0, Math.min(1, sliderVal / (duration || 100))) } as React.CSSProperties : undefined}
            onChange={handleSliderChange}
            onMouseUp={handleSliderMouseUp}
            onTouchEnd={handleSliderMouseUp}
            onKeyUp={event => {
              if (immersive && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
                seek(Number(event.currentTarget.value));
              }
            }}
            disabled={roomId !== null && !isHost}
            className={`w-full appearance-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${immersive ? "immersive-range" : "h-1.5 bg-white/10 rounded-lg playback-range accent-brand-accent focus:outline-none"}`}
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
            aria-pressed={isShuffle}
            disabled={roomId !== null && !isHost}
            className={`p-2 rounded-full transition-all ${
              immersive ? "" : isShuffle ? "text-brand-accent scale-110" : "text-gray-400 hover:text-white"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title={copy("Aleatorio", "Shuffle", "Ausaz")}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            onClick={prevTrack}
            disabled={roomId !== null && !isHost}
            className="p-2 rounded-full text-white active:scale-90 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
            title={copy("Anterior", "Previous", "Aurrekoa")}
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoading || (roomId !== null && !isHost)}
            className="p-5 rounded-full bg-white text-black transition-transform active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow-lg shadow-black/40"
            title={isPlaying ? copy("Pausar", "Pause", "Pausatu") : copy("Reproducir", "Play", "Erreproduzitu")}
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
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
            title={copy("Siguiente", "Next", "Hurrengoa")}
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            onClick={toggleRepeat}
            aria-pressed={isRepeat !== "none"}
            disabled={roomId !== null && !isHost}
            className={`p-2 rounded-full relative transition-all ${
              immersive ? "" : isRepeat !== "none" ? "text-brand-accent scale-110" : "text-gray-400 hover:text-white"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            title={copy("Repetir", "Repeat", "Errepikatu")}
          >
            <Repeat className="w-5 h-5" />
            {isRepeat === "one" && (
              <span className={`absolute top-1 right-1 text-[8px] font-black px-0.5 rounded-full ${immersive ? "immersive-repeat-badge" : "bg-brand-accent text-white"}`}>
                1
              </span>
            )}
          </button>
        </div>

        {/* Volume Indicator */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2.5 rounded-2xl mt-2">
          <button aria-label={isMuted ? copy("Activar sonido", "Unmute", "Aktibatu soinua") : copy("Silenciar", "Mute", "Isilarazi")} onClick={toggleMute} className="text-gray-300 hover:text-white">
            {isMuted || volume === 0 ? (
              <VolumeX className={`w-4.5 h-4.5 ${immersive ? "" : "text-brand-accent"}`} />
            ) : (
              <Volume2 className="w-4.5 h-4.5" />
            )}
          </button>
          <input
            type="range"
            aria-label={copy("Volumen", "Volume", "Bolumena")}
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            style={immersive ? { "--immersive-range-position": isMuted ? 0 : volume } as React.CSSProperties : undefined}
            onChange={(e) => changeVolume(parseFloat(e.target.value))}
            className={`flex-1 appearance-none cursor-pointer ${immersive ? "immersive-range" : "h-1 bg-white/10 rounded-lg playback-range accent-brand-accent"}`}
          />
        </div>
      </div>

      {/* Artist Profile & Next Up Sections (Only visible in Overview tab) */}
      {view === "info" && (
        <div className="hidden lg:flex mt-3 flex-col gap-3 w-full shrink-0">
          {/* About the Artist Card */}
          <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/5 group/artist h-36">
            <div className="artist-card-overlay absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/10 z-10" />
            {artistPic && <img src={artistPic} alt="" className="h-full w-full object-cover opacity-50 blur-md" />}
            <div className="absolute inset-x-0 bottom-0 p-4 z-20 flex flex-col gap-1.5">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-brand-accent">{copy("Sobre el artista", "About the Artist", "Artistari buruz")}</span>
              <div className="flex items-center gap-2.5">
                {artistPic ? <img src={artistPic} alt="" className="size-9 shrink-0 rounded-full border border-brand-accent/50 object-contain"
                  onError={() => setArtistProfile(previous => previous && previous.key === artistKey && previous.portrait === artistPic ? { ...previous, portrait: undefined } : previous)} /> : <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10"><Disc className="size-4" /></span>}
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm truncate">{artistName}</h3>
                  {artistFans !== undefined && (
                    <p className="text-[9px] text-gray-300 mt-0.5">
                      {artistFans.toLocaleString()} {copy("fans en Deezer", "Deezer fans", "jarraitzaile Deezer-en")}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-1 mt-0.5">
                {copy("Más canciones en la página del artista.", "More songs on the artist’s page.", "Abesti gehiago artistaren orrian.")}
              </p>
            </div>
          </div>

          {/* Next Up Card */}
          <div className="rounded-2xl bg-white/5 border border-white/5 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">{copy("Siguiente en la cola", "Next In Queue", "Ilaran hurrengoa")}</span>
              {queue.length > 1 && (
                <button
                  onClick={() => setView("queue")}
                  className="text-[10px] text-brand-accent hover:underline font-semibold"
                >
                  {copy("Ver todo", "View all", "Ikusi dena")} ({queue.length - 1})
                </button>
              )}
            </div>
            {currentIndex >= 0 && currentIndex < queue.length - 1 ? (
              (() => {
                const nextTrackItem = queue[currentIndex + 1];
                return (
                  <button type="button"
                    title={nextTrackItem.title + " · " + nextTrackItem.artist}
                    onClick={() => playTrack(nextTrackItem)}
                    onContextMenu={event => onTrackContextMenu?.(event, nextTrackItem)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-white/5 p-2 text-left transition-colors hover:border-brand-accent/20 hover:bg-brand-accent/10 group/next"
                  >
                    <img src={nextTrackItem.thumbnail} alt="" loading="lazy" className="size-8 shrink-0 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-[11px] text-white truncate group-hover/next:text-brand-accent transition-colors">{nextTrackItem.title}</h4>
                      <p className="text-[9px] text-gray-400 truncate mt-0.5">{nextTrackItem.artist}</p>
                    </div>
                    <Play className="w-3 h-3 text-gray-400 group-hover/next:text-brand-accent fill-current transition-colors opacity-0 group-hover/next:opacity-100 mr-1" />
                  </button>
                );
              })()
            ) : (
              <div className="text-[10px] text-gray-500 py-1 italic text-center">
                {copy("La cola termina después de esta canción.", "The queue ends after this track.", "Ilara abesti honen ondoren amaitzen da.")}
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

