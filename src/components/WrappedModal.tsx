import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Play, Pause, Share2, Sparkles, Clock, Music, User, RefreshCw, ArrowLeft, ArrowRight } from "lucide-react";
import type { Track } from "../services/musicApi";

interface WrappedModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: Track[];
}

// Music personalities descriptions
const PERSONALITIES = [
  {
    name: "The Deep Diver",
    desc: "When you find a song you love, you play it on repeat. You value depth and connection over surface-level listening.",
    gradient: "from-blue-600 via-indigo-700 to-purple-800"
  },
  {
    name: "The Sonic Explorer",
    desc: "You wander far and wide across genres and artists. Your library is a diverse museum of musical discoveries.",
    gradient: "from-emerald-600 via-teal-700 to-cyan-800"
  },
  {
    name: "The Trendsetter",
    desc: "You always have your finger on the pulse. You listen to the latest hits and love sharing fresh tracks with others.",
    gradient: "from-pink-600 via-rose-700 to-amber-600"
  },
  {
    name: "The Nostalgic Soul",
    desc: "You find comfort in familiar rhythms. Your history is full of timeless favorites that evoke sweet memories.",
    gradient: "from-orange-500 via-amber-600 to-yellow-600"
  }
];

// Mock data for Demo Mode
const MOCK_HISTORY: Track[] = [
  { id: "1", title: "Blinding Lights", artist: "The Weeknd", duration: 200, thumbnail: "https://i.scdn.co/image/ab67616d0000b273c51feee404fcf4143d2ef402", audioUrl: "" },
  { id: "1", title: "Blinding Lights", artist: "The Weeknd", duration: 200, thumbnail: "https://i.scdn.co/image/ab67616d0000b273c51feee404fcf4143d2ef402", audioUrl: "" },
  { id: "1", title: "Blinding Lights", artist: "The Weeknd", duration: 200, thumbnail: "https://i.scdn.co/image/ab67616d0000b273c51feee404fcf4143d2ef402", audioUrl: "" },
  { id: "2", title: "Starboy", artist: "The Weeknd", duration: 230, thumbnail: "https://i.scdn.co/image/ab67616d0000b273b1c67e8af81e2e41de430489", audioUrl: "" },
  { id: "2", title: "Starboy", artist: "The Weeknd", duration: 230, thumbnail: "https://i.scdn.co/image/ab67616d0000b273b1c67e8af81e2e41de430489", audioUrl: "" },
  { id: "3", title: "As It Was", artist: "Harry Styles", duration: 167, thumbnail: "https://i.scdn.co/image/ab67616d0000b273b46b0112dbd83772aaab96b5", audioUrl: "" },
  { id: "3", title: "As It Was", artist: "Harry Styles", duration: 167, thumbnail: "https://i.scdn.co/image/ab67616d0000b273b46b0112dbd83772aaab96b5", audioUrl: "" },
  { id: "4", title: "Flowers", artist: "Miley Cyrus", duration: 200, thumbnail: "https://i.scdn.co/image/ab67616d0000b273f429549197cdad72750e68d0", audioUrl: "" },
  { id: "5", title: "Levitating", artist: "Dua Lipa", duration: 203, thumbnail: "https://i.scdn.co/image/ab67616d0000b273bd6e48cf69cedb63e1cc64e2", audioUrl: "" },
  { id: "6", title: "Sweater Weather", artist: "The Neighbourhood", duration: 240, thumbnail: "https://i.scdn.co/image/ab67616d0000b27382c40c11f753229b48f65750", audioUrl: "" }
];

export const WrappedModal: React.FC<WrappedModalProps> = ({ isOpen, onClose, history: realHistory }) => {
  const [isDemo, setIsDemo] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const durationPerSlide = 6000; // 6 seconds per slide
  const totalSlides = 6;
  const progressIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const pausedProgressRef = useRef<number>(0);

  // Determine active dataset
  const activeHistory = useMemo(() => {
    if (isDemo || realHistory.length < 5) {
      return MOCK_HISTORY;
    }
    return realHistory;
  }, [realHistory, isDemo]);

  // Compute Stats
  const stats = useMemo(() => {
    if (activeHistory.length === 0) return null;

    // Total counts
    const totalSongs = activeHistory.length;

    // Track play counts
    const trackCounts: Record<string, { track: Track; count: number }> = {};
    activeHistory.forEach(track => {
      if (!trackCounts[track.id]) {
        trackCounts[track.id] = { track, count: 0 };
      }
      trackCounts[track.id].count += 1;
    });

    const topTracks = Object.values(trackCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Artist play counts
    const artistCounts: Record<string, { name: string; count: number; tracks: Track[] }> = {};
    activeHistory.forEach(track => {
      const artistName = track.artist || "Unknown Artist";
      if (!artistCounts[artistName]) {
        artistCounts[artistName] = { name: artistName, count: 0, tracks: [] };
      }
      artistCounts[artistName].count += 1;
      artistCounts[artistName].tracks.push(track);
    });

    const topArtists = Object.values(artistCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Total Minutes Listened
    // If track has duration, sum it. Otherwise, assume average 3.2 minutes per song.
    const totalSeconds = activeHistory.reduce((acc, curr) => acc + (curr.duration && curr.duration > 10 ? curr.duration : 192), 0);
    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));

    // Personality classification
    const uniqueTracks = Object.keys(trackCounts).length;
    const diversityRatio = uniqueTracks / totalSongs;
    
    let personality = PERSONALITIES[0]; // default Deep Diver
    if (diversityRatio > 0.6) {
      personality = PERSONALITIES[1]; // Sonic Explorer
    } else if (totalMinutes > 30) {
      personality = PERSONALITIES[2]; // Trendsetter
    } else if (diversityRatio < 0.3) {
      personality = PERSONALITIES[0]; // Deep Diver
    } else {
      personality = PERSONALITIES[3]; // Nostalgic Soul
    }

    return {
      totalSongs,
      totalMinutes,
      topTracks,
      topArtists,
      personality,
      uniqueTracks
    };
  }, [activeHistory]);

  // Handle slide progress
  useEffect(() => {
    if (!isOpen) return;

    if (isPlaying) {
      const startTime = Date.now() - (pausedProgressRef.current / 100) * durationPerSlide;
      startTimeRef.current = startTime;

      const updateProgress = () => {
        const elapsed = Date.now() - startTimeRef.current;
        const currentProgress = Math.min(100, (elapsed / durationPerSlide) * 100);
        setProgress(currentProgress);

        if (currentProgress >= 100) {
          if (currentSlide < totalSlides - 1) {
            setCurrentSlide(prev => prev + 1);
            setProgress(0);
            pausedProgressRef.current = 0;
          } else {
            setIsPlaying(false);
          }
        } else {
          progressIntervalRef.current = requestAnimationFrame(updateProgress);
        }
      };

      progressIntervalRef.current = requestAnimationFrame(updateProgress);
    } else {
      if (progressIntervalRef.current) {
        cancelAnimationFrame(progressIntervalRef.current);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        cancelAnimationFrame(progressIntervalRef.current);
      }
    };
  }, [isPlaying, currentSlide, isOpen]);

  // Set isDemo correctly when modal opens based on history size
  useEffect(() => {
    if (isOpen) {
      setIsDemo(realHistory.length < 5);
      setCurrentSlide(0);
      setProgress(0);
      setIsPlaying(true);
      pausedProgressRef.current = 0;
    }
  }, [isOpen, realHistory]);

  const handleNext = () => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(prev => prev + 1);
      setProgress(0);
      pausedProgressRef.current = 0;
      setIsPlaying(true);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
      setProgress(0);
      pausedProgressRef.current = 0;
      setIsPlaying(true);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pausedProgressRef.current = progress;
    }
    setIsPlaying(!isPlaying);
  };

  const handleShare = () => {
    if (!stats) return;
    const text = `🎵 Mi Spotify Wrapped en ibramusic!\n⏱️ ¡Escuché ${stats.totalMinutes} minutos de música!\n🏆 Mi canción top: "${stats.topTracks[0]?.track.title}" de ${stats.topTracks[0]?.track.artist}\n👑 Mi artista top: ${stats.topArtists[0]?.name}\n✨ Personalidad musical: ${stats.personality.name}\n¡Descubre tu viaje musical en ibramusic!`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !stats) return null;

  // Background color classes matching slides
  const bgGradients = [
    "bg-gradient-to-tr from-violet-900 via-indigo-900 to-purple-800", // Intro
    "bg-gradient-to-tr from-cyan-900 via-sky-800 to-indigo-950",   // Minutes
    "bg-gradient-to-tr from-fuchsia-950 via-purple-900 to-rose-950", // Tracks
    "bg-gradient-to-tr from-orange-950 via-amber-900 to-red-950",   // Artists
    `bg-gradient-to-tr ${stats.personality.gradient}`,            // Personality
    "bg-gradient-to-tr from-neutral-950 via-slate-900 to-stone-900"  // Summary
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md select-none text-white animate-[fadeIn_0.2s_ease]">
      {/* Container sizing matches mobile story frame */}
      <div className={`relative w-full h-full md:max-w-md md:h-[80vh] md:rounded-[36px] overflow-hidden flex flex-col shadow-2xl transition-all duration-700 ${bgGradients[currentSlide]} border border-white/5`}>
        
        {/* Story Progress Indicators */}
        <div className="absolute top-4 left-0 right-0 px-4 flex gap-1 z-30">
          {Array.from({ length: totalSlides }).map((_, idx) => (
            <div key={idx} className="h-1 flex-1 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-100 ease-linear"
                style={{ 
                  width: idx < currentSlide ? "100%" : idx === currentSlide ? `${progress}%` : "0%" 
                }}
              />
            </div>
          ))}
        </div>

        {/* Top Control Bar */}
        <div className="absolute top-8 left-0 right-0 px-4 flex items-center justify-between z-30">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest uppercase bg-white/10 px-2 py-0.5 rounded-full border border-white/10 backdrop-blur-md flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-brand-accent animate-spin" style={{ animationDuration: '4s' }} />
              {isDemo ? "Demo Wrapped" : "Your Wrapped"}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={togglePlayPause} 
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all border border-white/10 active:scale-90"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <button 
              onClick={onClose} 
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-all border border-white/10 active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Left/Right Tap Zones for quick navigation */}
        <div className="absolute inset-y-16 left-0 w-1/4 z-10 cursor-pointer" onClick={handlePrev} />
        <div className="absolute inset-y-16 right-0 w-1/4 z-10 cursor-pointer" onClick={handleNext} />

        {/* Slides Content */}
        <div className="flex-1 flex flex-col justify-center items-center px-8 relative z-20 text-center select-none pt-12 pb-8">
          
          {/* SLIDE 1: INTRO */}
          {currentSlide === 0 && (
            <div className="flex flex-col items-center justify-center gap-6 animate-[scaleUp_0.5s_ease-out]">
              <div className="relative w-44 h-44 rounded-full bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl animate-pulse">
                <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/25 animate-spin" style={{ animationDuration: '30s' }} />
                <Music className="w-16 h-16 text-brand-accent animate-[bounce_2s_infinite]" />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[10px] tracking-[0.25em] font-extrabold text-brand-accent uppercase">ibramusic wrapped</h3>
                <h1 className="text-3xl font-extrabold tracking-tight leading-tight">Your Journey In Sound</h1>
                <p className="text-xs text-gray-300 max-w-[280px] mx-auto mt-2">
                  Let's explore your listening profile, minutes, top tracks, and your unique personality.
                </p>
              </div>
            </div>
          )}

          {/* SLIDE 2: MINUTES LISTENED */}
          {currentSlide === 1 && (
            <div className="flex flex-col items-center justify-center gap-6 animate-[fadeIn_0.5s_ease-out]">
              <Clock className="w-14 h-14 text-cyan-400 animate-pulse" />
              <div className="flex flex-col gap-1">
                <span className="text-xs uppercase tracking-widest text-cyan-400 font-bold">Total Listening Time</span>
                <h2 className="text-5xl font-black text-white tracking-tight my-2 animate-[scaleUp_0.4s_ease-out]">
                  {stats.totalMinutes.toLocaleString()}
                </h2>
                <span className="text-lg font-bold text-gray-200">minutes listened</span>
              </div>
              <div className="glass-panel p-4 rounded-2xl border border-white/15 max-w-[280px] text-xs text-gray-300">
                🚀 That's about <strong className="text-white">{Math.round(stats.totalMinutes / 60)} hours</strong> spent inside your musical world!
              </div>
            </div>
          )}

          {/* SLIDE 3: TOP TRACKS */}
          {currentSlide === 2 && (
            <div className="w-full flex flex-col gap-5 animate-[fadeIn_0.5s_ease-out]">
              <div className="flex flex-col gap-1 items-center">
                <Music className="w-8 h-8 text-fuchsia-400 mb-1" />
                <span className="text-[10px] uppercase tracking-widest text-fuchsia-400 font-bold">Your Soundtrack</span>
                <h2 className="text-2xl font-extrabold">Top Tracks</h2>
              </div>
              
              <div className="flex flex-col gap-2.5 w-full text-left">
                {stats.topTracks.map((item, idx) => (
                  <div key={item.track.id} className="flex items-center gap-3 glass-panel p-2.5 rounded-2xl border border-white/10 hover:bg-white/5 transition-all">
                    <span className="w-6 text-center font-black text-fuchsia-400 text-sm">{idx + 1}</span>
                    <img src={item.track.thumbnail || "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&auto=format&fit=crop&q=60"} className="w-10 h-10 object-cover rounded-lg bg-neutral-800" alt="" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-white truncate">{item.track.title}</h4>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">{item.track.artist}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[9px] font-bold text-fuchsia-300 block">{item.count} plays</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE 4: TOP ARTISTS */}
          {currentSlide === 3 && (
            <div className="w-full flex flex-col gap-5 animate-[fadeIn_0.5s_ease-out]">
              <div className="flex flex-col gap-1 items-center">
                <User className="w-8 h-8 text-amber-400 mb-1" />
                <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Your Icons</span>
                <h2 className="text-2xl font-extrabold">Top Artists</h2>
              </div>
              
              <div className="flex flex-col gap-3 w-full text-left">
                {stats.topArtists.map((item, idx) => (
                  <div key={item.name} className="flex items-center gap-4 glass-panel p-3 rounded-2xl border border-white/10">
                    <span className="w-6 text-center font-black text-amber-400 text-base">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-white truncate">{item.name}</h4>
                      <p className="text-[10px] text-gray-400 mt-0.5">Top song: {item.tracks[0]?.title || "N/A"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-xs font-bold text-white bg-white/5 border border-white/10 px-2 py-1 rounded-lg">
                        {item.count} plays
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SLIDE 5: MUSIC PERSONALITY */}
          {currentSlide === 4 && (
            <div className="flex flex-col items-center justify-center gap-5 animate-[scaleUp_0.5s_ease-out]">
              <Sparkles className="w-12 h-12 text-brand-accent animate-[bounce_3s_infinite]" />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-brand-accent font-bold">Your Musical Personality</span>
                <h2 className="text-3xl font-black text-white leading-tight mt-1">{stats.personality.name}</h2>
              </div>
              
              <div className="glass-panel p-5 rounded-[24px] border border-white/15 max-w-[300px] text-xs leading-relaxed text-gray-200">
                {stats.personality.desc}
              </div>
            </div>
          )}

          {/* SLIDE 6: SUMMARY SHARE CARD */}
          {currentSlide === 5 && (
            <div className="w-full flex flex-col gap-4 animate-[scaleUp_0.4s_ease-out]">
              {/* Wrapped Poster */}
              <div className="w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 rounded-3xl p-5 border border-white/10 text-left shadow-2xl relative overflow-hidden flex flex-col gap-4 select-none">
                
                {/* Background lighting effect */}
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-brand-accent/20 rounded-full blur-[60px]" />
                <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-[60px]" />
                
                <div className="flex justify-between items-center pb-2 border-b border-white/10 relative z-10">
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center">
                      <Music className="w-3.5 h-3.5 text-brand-accent" />
                    </div>
                    <span className="text-xs font-black tracking-wider uppercase">ibramusic</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">wrapped 2026</span>
                </div>

                <div className="flex flex-col gap-3 relative z-10">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[9px] uppercase text-gray-400 block font-bold">top artist</span>
                      <span className="text-sm font-extrabold text-white truncate max-w-[150px] block mt-0.5">
                        {stats.topArtists[0]?.name || "N/A"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase text-gray-400 block font-bold">listening time</span>
                      <span className="text-sm font-extrabold text-brand-accent block mt-0.5">
                        {stats.totalMinutes.toLocaleString()} min
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[9px] uppercase text-gray-400 block font-bold">personality</span>
                      <span className="text-sm font-extrabold text-white block mt-0.5">
                        {stats.personality.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] uppercase text-gray-400 block font-bold">tracks played</span>
                      <span className="text-sm font-extrabold text-white block mt-0.5">
                        {stats.totalSongs}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Top tracks bullet list */}
                <div className="flex flex-col gap-1.5 mt-1 border-t border-white/10 pt-3 relative z-10">
                  <span className="text-[9px] uppercase text-gray-400 font-bold block mb-1">Top Tracks</span>
                  {stats.topTracks.slice(0, 3).map((item, idx) => (
                    <div key={item.track.id} className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-400 text-[10px] shrink-0 mr-1.5">{idx + 1}</span>
                      <span className="font-semibold text-white truncate flex-1 pr-4">{item.track.title}</span>
                      <span className="text-[10px] text-gray-400 truncate shrink-0 max-w-[90px]">{item.track.artist}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-2 w-full">
                <button
                  onClick={handleShare}
                  className="flex-1 py-3 px-4 bg-brand-accent text-black font-extrabold text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-lg shadow-brand-accent/20 active:scale-95 transition-all hover:bg-brand-accent/90"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  {copied ? "Copied!" : "Share stats"}
                </button>
                
                <button
                  onClick={() => {
                    setCurrentSlide(0);
                    setProgress(0);
                    setIsPlaying(true);
                  }}
                  className="py-3 px-4 bg-white/5 border border-white/10 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all hover:bg-white/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replay
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer controls for desktop layout click-throughs */}
        <div className="absolute bottom-4 left-0 right-0 px-4 py-2 flex items-center justify-between z-30 bg-gradient-to-t from-black/20 to-transparent">
          <button 
            onClick={handlePrev} 
            disabled={currentSlide === 0}
            className={`flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 hover:text-white uppercase disabled:opacity-30 disabled:pointer-events-none transition-all`}
          >
            <ArrowLeft className="w-3 h-3" /> Prev
          </button>
          
          <span className="text-[9px] text-gray-500 font-bold">
            Slide {currentSlide + 1} of {totalSlides}
          </span>

          <button 
            onClick={handleNext} 
            disabled={currentSlide === totalSlides - 1}
            className={`flex items-center gap-1 text-[10px] font-bold tracking-wider text-gray-400 hover:text-white uppercase disabled:opacity-30 disabled:pointer-events-none transition-all`}
          >
            Next <ArrowRight className="w-3 h-3" />
          </button>
        </div>

      </div>
    </div>
  );
};

export default WrappedModal;
