import React, { useState, useEffect } from "react";
import { 
  Sliders, Eye, Clock, Trash2, ShieldAlert, Sparkles, Volume2, HardDrive
} from "lucide-react";
import { useAudio } from "../context/AudioContext";

export const SettingsPanel: React.FC = () => {
  const {
    ambientGlowEnabled,
    setAmbientGlowEnabled,
    eqPreset,
    setEqPreset,
    sleepTimerRemaining,
    startSleepTimer,
    cancelSleepTimer,
    showToast
  } = useAudio();

  const [customTimerMinutes, setCustomTimerMinutes] = useState<number>(30);
  const [downloadCount, setDownloadCount] = useState<number>(0);
  const [cachedLyricsCount, setCachedLyricsCount] = useState<number>(0);

  // Fetch metrics on mount
  useEffect(() => {
    // 1. Get downloads count
    try {
      const savedDownloads = localStorage.getItem("ibrastream_downloaded_ids");
      if (savedDownloads) {
        const ids = JSON.parse(savedDownloads);
        if (Array.isArray(ids)) {
          setDownloadCount(ids.length);
        }
      }
    } catch {}

    // 2. Count items in localStorage to estimate lyrics/other cache
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("ibrastream_lyrics_") || key.startsWith("ibrastream_meta_"))) {
        count++;
      }
    }
    setCachedLyricsCount(count);
  }, []);

  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClearCache = () => {
    let clearedCount = 0;
    const keysToRemove: string[] = [];

    // Find all track-related cache keys (except settings/likes/downloads)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith("ibrastream_lyrics_") || 
        key.startsWith("ibrastream_recently_played") ||
        key.startsWith("ibrastream_guest_tracks_played")
      )) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(k => {
      localStorage.removeItem(k);
      clearedCount++;
    });

    setCachedLyricsCount(0);
    showToast(`Cleared ${clearedCount} cached items!`, "success");
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 p-6 animate-fadeIn pb-24">
      {/* Page Title */}
      <div className="flex flex-col gap-1.5 border-b border-white/5 pb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-brand-accent animate-pulse" />
          Premium Settings
        </h1>
        <p className="text-xs text-gray-400">
          Personalize your layout, audio processing, background features, and timers
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Visual Settings Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Eye className="w-5 h-5 text-brand-accent" />
            Visual Customization
          </h2>

          {/* Ambient Glow Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 max-w-[70%]">
              <span className="text-sm font-semibold text-white">Ambient Glow Aura</span>
              <span className="text-[11px] text-gray-400">
                Slowly shifting fluid gradient background matching active artwork colors.
              </span>
            </div>
            <button
              onClick={() => setAmbientGlowEnabled(!ambientGlowEnabled)}
              className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${
                ambientGlowEnabled ? "bg-white" : "bg-white/10"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-300 ${
                  ambientGlowEnabled ? "bg-black translate-x-5" : "bg-gray-400 translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Audio / EQ Settings Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Sliders className="w-5 h-5 text-brand-accent" />
            Equalizer & Audio Presets
          </h2>

          <div className="flex flex-col gap-3">
            <span className="text-sm font-semibold text-white flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-gray-400" />
              Sound Profiles
            </span>
            <p className="text-[11px] text-gray-400">
              Enhance frequency bands dynamically using standard high/low shelving filters.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs mt-1">
              {(["flat", "bass", "vocal", "electronic"] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setEqPreset(preset)}
                  className={`py-3 px-4 rounded-xl border text-center font-bold capitalize transition-all ${
                    eqPreset === preset
                      ? "bg-white text-black border-white"
                      : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {preset === "bass" ? "Bass Booster" : preset === "vocal" ? "Vocal Booster" : preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sleep Timer Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <Clock className="w-5 h-5 text-brand-accent" />
            Sleep Timer
          </h2>

          {sleepTimerRemaining !== null ? (
            <div className="flex flex-col items-center justify-center py-4 bg-white/5 rounded-2xl border border-white/5 gap-3">
              <span className="text-xs text-gray-400 font-medium">Timer Active • Remaining</span>
              <span className="text-4xl font-extrabold text-white tracking-widest tabular-nums animate-pulse">
                {formatRemainingTime(sleepTimerRemaining)}
              </span>
              <button
                onClick={cancelSleepTimer}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs font-bold transition-all mt-1"
              >
                Cancel Timer
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <span className="text-xs text-gray-400">
                Set a duration to automatically pause music. The volume will smoothly fade out over the final 30 seconds.
              </span>
              
              {/* Presets */}
              <div className="grid grid-cols-4 gap-1.5 text-xs font-bold">
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => startSleepTimer(mins)}
                    className="py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all"
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              {/* Custom Selector */}
              <div className="flex flex-col gap-1.5 mt-2">
                <div className="flex justify-between text-xs font-semibold text-gray-300">
                  <span>Custom Duration:</span>
                  <span>{customTimerMinutes} minutes</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={180}
                  step={5}
                  value={customTimerMinutes}
                  onChange={(e) => setCustomTimerMinutes(parseInt(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent"
                />
                <button
                  onClick={() => startSleepTimer(customTimerMinutes)}
                  className="w-full py-2.5 mt-2 rounded-full bg-white text-black text-xs font-bold hover:bg-gray-200 transition-all"
                >
                  Start Timer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Storage & Local Cache Manager Card */}
        <div className="rounded-3xl bg-white/5 border border-white/5 p-6 flex flex-col gap-5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5 border-b border-white/5 pb-3">
            <HardDrive className="w-5 h-5 text-brand-accent" />
            Storage & Local Cache
          </h2>

          <div className="flex flex-col gap-3.5 text-xs text-gray-400">
            {/* Downloads count */}
            <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-white">Offline Downloads</span>
                <span className="text-[10px] text-gray-500">Tracks downloaded to phone storage.</span>
              </div>
              <span className="text-base font-extrabold text-white">{downloadCount} tracks</span>
            </div>

            {/* Cache count */}
            <div className="flex justify-between items-center bg-white/5 p-3.5 rounded-2xl border border-white/5">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-white">Lyrics & App Cache</span>
                <span className="text-[10px] text-gray-500">Stored search queries and lyrics logs.</span>
              </div>
              <span className="text-base font-extrabold text-white">{cachedLyricsCount} items</span>
            </div>

            <button
              onClick={handleClearCache}
              disabled={cachedLyricsCount === 0}
              className="w-full py-2.5 mt-1 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold border border-red-500/25 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Clear Local App Cache
            </button>
          </div>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex gap-3 text-xs text-yellow-500/80 leading-relaxed shrink-0">
        <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
        <p>
          <strong>Notice:</strong> All premium preferences (Sleep Timer, EQ, visual customizers) are saved locally on your device. Clearing app storage or signing out from another client won't reset these visual modifiers.
        </p>
      </div>

    </div>
  );
};

export default SettingsPanel;
