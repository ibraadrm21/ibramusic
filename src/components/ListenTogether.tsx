import React, { useState } from "react";
import { useAudio } from "../context/AudioContext";
import { Copy, Check, LogOut, Radio, Plus } from "lucide-react";

export const ListenTogether: React.FC = () => {
  const {
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    showToast
  } = useAudio();

  const [inputRoomId, setInputRoomId] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      showToast("Room ID copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRoomId.trim()) {
      joinRoom(inputRoomId);
      setInputRoomId("");
    }
  };

  return (
    <div className="bg-white/4 border border-white/5 rounded-2xl p-5 flex flex-col gap-4 select-none backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Radio className={`w-4 h-4 ${isConnected ? "text-emerald-400 animate-pulse" : "text-gray-400"}`} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white tracking-wide uppercase">Listen Together</h4>
            <span className="text-[10px] text-gray-500 font-medium">
              {isConnected ? `${participants.length} connected` : "Offline"}
            </span>
          </div>
        </div>
        {isConnected && (
          <button
            onClick={leaveRoom}
            className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
            title="Leave Room"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Content */}
      {!roomId ? (
        <div className="flex flex-col gap-3.5">
          {/* Join Section */}
          <form onSubmit={handleJoin} className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Enter Room ID..."
              value={inputRoomId}
              onChange={(e) => setInputRoomId(e.target.value)}
              className="w-full bg-white/4 border border-white/5 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-white/10 transition-all font-medium uppercase text-center"
            />
            <button
              type="submit"
              className="w-full py-2 bg-white/5 border border-white/10 hover:bg-white/8 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer"
            >
              Join Room
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-2 text-[10px] text-gray-600 font-bold uppercase tracking-widest py-1">
            <span className="h-px bg-white/5 flex-1"></span>
            <span>Or</span>
            <span className="h-px bg-white/5 flex-1"></span>
          </div>

          {/* Create Section */}
          <button
            onClick={createRoom}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            Create Room
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Connected Details */}
          <div className="bg-white/3 border border-white/5 rounded-xl p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Room Code</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20 uppercase">
                {isHost ? "Host" : "Listener"}
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-3 bg-black/20 border border-white/5 rounded-lg px-3 py-2">
              <span className="text-xs font-bold text-white tracking-widest uppercase">{roomId}</span>
              <button
                onClick={handleCopy}
                className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Participants List */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider pl-1">Participants</span>
            <div className="max-h-24 overflow-y-auto flex flex-col gap-1.5 pr-1 scrollbar-thin">
              {participants.length === 0 ? (
                <span className="text-[10px] text-gray-500 italic pl-1">Waiting for listeners...</span>
              ) : (
                participants.map((p, idx) => (
                  <div key={`${p.id}-${idx}`} className="flex items-center gap-2 bg-white/2 border border-white/3 rounded-lg px-2.5 py-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                    <span className="text-[11px] text-gray-300 font-medium truncate flex-1">{p.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
