import React, { useState } from "react";
import { Gauge, X, RotateCcw, Check, Sparkles } from "lucide-react";

interface PlaybackSpeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpeed: number;
  onSelectSpeed: (speed: number) => void;
}

const PRESET_SPEEDS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

export const PlaybackSpeedModal: React.FC<PlaybackSpeedModalProps> = ({
  isOpen,
  onClose,
  currentSpeed,
  onSelectSpeed,
}) => {
  const [customInput, setCustomInput] = useState<string>(currentSpeed.toString());

  if (!isOpen) return null;

  const handleApplyCustom = () => {
    const parsed = parseFloat(customInput);
    if (!isNaN(parsed) && parsed >= 0.25 && parsed <= 16) {
      onSelectSpeed(Number(parsed.toFixed(2)));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCustomInput(val.toString());
    onSelectSpeed(val);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 select-none animate-fadeIn backdrop-blur-md">
      <div 
        className="bg-[#121212] border border-white/10 w-full max-w-sm rounded-[28px] p-6 shadow-2xl relative flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-brand-accent">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Playback Speed</h3>
              <p className="text-[11px] text-gray-400">Speed up or slow down current playback</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 hover:bg-white/5 rounded-full transition-all"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Speed Pill Display */}
        <div className="flex items-center justify-between bg-white/5 border border-white/5 px-4 py-3 rounded-2xl">
          <span className="text-xs font-semibold text-gray-400">Current Speed:</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-black text-brand-accent tracking-wide">
              {currentSpeed}x
            </span>
            {currentSpeed !== 1.0 && (
              <button
                onClick={() => {
                  onSelectSpeed(1.0);
                  setCustomInput("1");
                }}
                className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white bg-white/10 px-2 py-1 rounded-lg transition-all"
                title="Reset to 1x"
              >
                <RotateCcw className="w-3 h-3" />
                Normal
              </button>
            )}
          </div>
        </div>

        {/* Presets Grid */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Quick Presets
            </span>
            {currentSpeed >= 2.0 && (
              <span className="text-[10px] font-extrabold text-amber-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Fast
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {PRESET_SPEEDS.map((speed) => {
              const isSelected = Math.abs(currentSpeed - speed) < 0.01;
              return (
                <button
                  key={speed}
                  onClick={() => {
                    onSelectSpeed(speed);
                    setCustomInput(speed.toString());
                  }}
                  className={`py-2.5 px-1 rounded-xl text-xs font-bold border transition-all text-center flex items-center justify-center ${
                    isSelected
                      ? "bg-white text-black border-white shadow-md shadow-white/20 scale-[1.03]"
                      : "bg-white/5 text-gray-300 border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20"
                  }`}
                >
                  {speed}x
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Speed Slider & Numeric Input */}
        <div className="flex flex-col gap-3 bg-white/5 border border-white/5 p-4 rounded-2xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-300">Custom</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0.25"
                max="16"
                step="0.05"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onBlur={handleApplyCustom}
                onKeyDown={(e) => e.key === "Enter" && handleApplyCustom()}
                className="w-16 bg-black/50 border border-white/10 text-white font-bold text-xs px-2 py-1 rounded-lg text-center focus:outline-none focus:border-brand-accent"
              />
              <span className="text-xs font-bold text-gray-400">x</span>
            </div>
          </div>

          <input
            type="range"
            min={0.25}
            max={4.0}
            step={0.05}
            value={Math.min(currentSpeed, 4.0)}
            onChange={handleSliderChange}
            className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-accent focus:outline-none"
          />

          <div className="flex justify-between text-[10px] text-gray-500 font-medium">
            <span>0.25x (Slow)</span>
            <span>1.0x</span>
            <span>2.0x</span>
            <span>4.0x (Turbo)</span>
          </div>
        </div>

        {/* Done / Close Button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-2xl bg-white text-black text-xs font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-white/10"
        >
          <Check className="w-4 h-4" />
          Done
        </button>
      </div>
    </div>
  );
};
