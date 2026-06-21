import React, { useState, useEffect, useRef } from "react";
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Heart, 
  Volume2, VolumeX, Info, ExternalLink, Disc, Mic, X, Clock
} from "lucide-react";
import { useAudio } from "../context/AudioContext";
import type { Track } from "../services/musicApi";
import { Capacitor } from "@capacitor/core";

const isAndroid = Capacitor.getPlatform() === "android";

interface PlayerPanelProps {
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: boolean;
  onClose?: () => void; // for mobile overlay close
  onOpenAlbum?: (album: any) => void;
  onOpenArtist?: (artist: any) => void;
}

interface LyricLine {
  time: number; // in seconds
  text: string;
}

function parseLRC(lrc: string): LyricLine[] {
  const lines = lrc.split("\n");
  const result: LyricLine[] = [];
  const timeReg = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

  for (const line of lines) {
    const text = line.replace(timeReg, "").trim();
    const matches = [...line.matchAll(timeReg)];
    for (const match of matches) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3]) : 0;
      const time = min * 60 + sec + ms / (ms > 99 ? 1000 : 100);
      result.push({ time, text });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}



export const PlayerPanel: React.FC<PlayerPanelProps> = ({
  onToggleFavorite,
  isFavorite = false,
  onClose,
  onOpenAlbum,
  onOpenArtist
}) => {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
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
    roomId,
    isHost,
    sleepTimerRemaining
  } = useAudio();



  const [sliderVal, setSliderVal] = useState<number>(0);
  const [artistPic, setArtistPic] = useState<string>("");
  const [view, setView] = useState<"info" | "lyrics">("info");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [monthlyListeners, setMonthlyListeners] = useState<number | undefined>(undefined);
  const [showInfoModal, setShowInfoModal] = useState<boolean>(false);


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
      getLyricsForTrack(currentTrack)
        .then(data => {
          if (!active) return;
          if (data.syncedLyrics) {
            setLyrics(parseLRC(data.syncedLyrics));
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
  }, [currentTrack]);

  const activeLineIndex = lyrics.reduce((acc, line, idx) => {
    if (currentTime >= line.time) return idx;
    return acc;
  }, -1);

  // Auto-scroll lyrics container
  useEffect(() => {
    if (view === "lyrics" && lyricsContainerRef.current) {
      const activeEl = lyricsContainerRef.current.querySelector(".lyrics-active-line");
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: "smooth",
          block: "center"
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
      className="h-full flex flex-col justify-start gap-5 p-6 md:p-8 glass-panel border-l border-gray-800/50 relative overflow-y-auto select-none"
      style={{
        paddingTop: 'calc(1.5rem + var(--safe-top))',
        paddingBottom: 'calc(1.5rem + var(--safe-bottom))'
      }}
    >
      
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-6 shrink-0 relative">
        {sleepTimerRemaining !== null && (
          <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 bg-brand-accent/20 border border-brand-accent/35 text-white text-[9px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center gap-1.5 animate-pulse shrink-0 backdrop-blur-md">
            <Clock className="w-2.5 h-2.5 text-brand-accent" />
            <span>Sleep: {Math.floor(sleepTimerRemaining / 60)}:{(sleepTimerRemaining % 60).toString().padStart(2, "0")}</span>
          </div>
        )}
        {onClose && (
          <button 
            onClick={onClose}
            className="md:hidden p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
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
            <Mic className="w-3.5 h-3.5" /> Lyrics
          </button>
        </div>
        <button 
          onClick={() => setShowInfoModal(true)}
          className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
        >
          <Info className="w-4.5 h-4.5" />
        </button>

      </div>

      {/* Main Content Area: Album Art or Lyrics */}
      {view === "info" ? (
        <div className="flex-1 shrink-0 flex flex-col items-center justify-center my-4 relative w-full min-h-[300px]">
          <div className="relative group w-64 md:w-72 aspect-square rounded-[32px] overflow-hidden shadow-2xl shadow-black/80 p-0.5 bg-white/5 shrink-0 z-10">
            <div className="w-full h-full rounded-[28px] overflow-hidden relative">
              <img
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                className={`w-full h-full object-cover transition-transform duration-700 ${
                  isPlaying ? "scale-105" : "scale-100"
                }`}
              />
              {/* Ambient Shadow glow */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
              
              {/* Loading Overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
              <div className="w-8 h-8 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        /* Synced Lyrics Container */
        <div className="flex-1 flex flex-col my-4 min-h-0 relative">
          {isLoadingLyrics ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
              <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Fetching lyrics...</span>
            </div>
          ) : lyrics.length > 0 ? (
            <div 
              ref={lyricsContainerRef}
              className="flex-1 overflow-y-auto flex flex-col gap-6 py-24 px-2 scrollbar-none"
              style={{ scrollBehavior: "smooth" }}
            >
              {lyrics.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                const isPast = idx < activeLineIndex;
                return (
                  <p
                    key={idx}
                    onClick={() => seek(line.time)}
                    className={`lyrics-line text-lg md:text-xl font-bold cursor-pointer transition-all duration-300 text-left origin-left leading-relaxed ${
                      isActive 
                        ? "lyrics-active-line text-white scale-105 filter drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] opacity-100" 
                        : isPast 
                          ? "lyrics-line-past text-white/40 hover:text-white/80" 
                          : "lyrics-line-future text-white/20 hover:text-white/60"
                    }`}
                  >
                    {line.text || "•••"}
                  </p>
                );
              })}
            </div>
          ) : plainLyrics ? (
            <div className="plain-lyrics flex-1 overflow-y-auto whitespace-pre-wrap text-base font-medium text-gray-300 leading-loose py-4 text-left">
              {plainLyrics}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2 text-center px-4">
              <Mic className="w-10 h-10 text-gray-700 animate-pulse" />
              <p className="text-sm font-semibold">Lyrics not available</p>
              <p className="text-xs text-gray-600">We couldn't find lyrics for this song on LRCLIB.</p>
            </div>
          )}
        </div>
      )}

      {/* Metadata & Actions */}
      <div className="w-full flex items-center justify-between mt-6 mb-4 shrink-0">
        <div className="min-w-0 flex-1">
          <h2 
            onClick={() => {
              if (onOpenAlbum && currentTrack.albumId) {
                onOpenAlbum({ id: currentTrack.albumId, title: currentTrack.albumName || "Album", artist: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                if (onClose) onClose();
              }
            }}
            className="text-2xl font-bold text-white truncate tracking-wide cursor-pointer hover:text-brand-accent hover:underline"
          >
            {currentTrack.title}
          </h2>
          <div className="text-sm text-gray-400 mt-1 flex flex-wrap gap-x-1 select-none">
            {currentTrack.artists && currentTrack.artists.length > 0 ? (
              currentTrack.artists.map((art, i) => (
                <React.Fragment key={art.id}>
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
                  {i < currentTrack.artists!.length - 1 && <span>,</span>}
                </React.Fragment>
              ))
            ) : (
              <span
                onClick={() => {
                  if (onOpenArtist && currentTrack.artistId) {
                    onOpenArtist({ id: currentTrack.artistId, name: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                    if (onClose) onClose();
                  }
                }}
                className="cursor-pointer hover:text-brand-accent hover:underline transition-colors"
              >
                {currentTrack.artist}
              </span>
            )}
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
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
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
        {!isAndroid && (
          <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-4 py-2.5 rounded-2xl mt-2">
            <button onClick={toggleMute} className="text-gray-400 hover:text-white">
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
              className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
            />
          </div>
        )}
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
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-gray-400">Next In Queue</span>
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

