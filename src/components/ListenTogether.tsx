import React, { useState, useEffect } from "react";
import { useAudio } from "../context/AudioContext";
import { Copy, Check, LogOut, Radio, Plus, ChevronDown, ChevronUp, Share2, X } from "lucide-react";

interface ListenTogetherProps {
  alwaysOpen?: boolean;
}

export const ListenTogether: React.FC<ListenTogetherProps> = ({ alwaysOpen = false }) => {
  const {
    roomId,
    isHost,
    isConnected,
    participants,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    showToast
  } = useAudio();

  const [inputRoomId, setInputRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(alwaysOpen || false);

  // Auto-expand when joining/creating a room or if alwaysOpen is true
  useEffect(() => {
    if (roomId || alwaysOpen) {
      setIsOpen(true);
    }
  }, [roomId, alwaysOpen]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      showToast("Room ID copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (roomId) {
      const origin = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") 
        ? window.location.origin 
        : "https://ibrastream.vercel.app";
      const shareUrl = `${origin}/?room=${roomId}`;
      navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      showToast("Room link copied to clipboard", "success");
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleShareLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (roomId) {
      const origin = window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1") 
        ? window.location.origin 
        : "https://ibrastream.vercel.app";
      const shareUrl = `${origin}/?room=${roomId}`;
      
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Join my Listen Together room on IbraStream",
            text: `Join my Listen Together room ${roomId} on IbraStream!`,
            url: shareUrl,
          });
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            handleCopyLink(e);
          }
        }
      } else {
        handleCopyLink(e);
      }
    }
  };

  const handleLeave = (e: React.MouseEvent) => {
    e.stopPropagation();
    leaveRoom();
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeRoom();
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRoomId.trim()) {
      joinRoom(inputRoomId);
      setInputRoomId("");
    }
  };

  return (
    <div className="bg-white/4 border border-white/5 rounded-2xl p-4.5 flex flex-col gap-4 select-none backdrop-blur-md transition-all">
      {/* Header (Clickable to toggle collapse) */}
      <div 
        onClick={() => !alwaysOpen && setIsOpen(!isOpen)} 
        className={`flex items-center justify-between group ${alwaysOpen ? "cursor-default" : "cursor-pointer"}`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
            <Radio className={`w-4 h-4 ${isConnected ? "text-emerald-400 animate-pulse" : "text-gray-400"}`} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-white tracking-wide uppercase group-hover:text-brand-accent transition-colors">Listen Together</h4>
            <span className="text-[10px] text-gray-500 font-medium">
              {isConnected ? `${participants.length} connected` : "Offline"}
            </span>
          </div>
        </div>
        
        {!alwaysOpen && (
          <div className="flex items-center gap-1.5">
            <div className="text-gray-400 group-hover:text-white transition-colors">
              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        )}
      </div>

      {/* Main Content (visible only when expanded) */}
      {isOpen && (
        <div className="flex flex-col gap-4 animate-[fadeIn_0.2s_ease]">
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleCopy}
                      title="Copy Code"
                      className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={handleShareLink}
                      title="Share Link"
                      className="p-1 rounded hover:bg-white/5 text-gray-400 hover:text-white transition-all cursor-pointer"
                    >
                      {linkCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
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
                      <div key={`${p.id}-${idx}`} className="flex items-center gap-2.5 bg-white/2 border border-white/3 rounded-lg px-2.5 py-1.5 hover:bg-white/4 transition-colors">
                        {p.pfp ? (
                          <img 
                            src={p.pfp} 
                            alt={p.name}
                            className="w-5 h-5 rounded-full object-cover border border-white/10 shrink-0" 
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[9px] font-bold text-white uppercase border border-white/10 shrink-0">
                            {p.name.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-[11px] text-gray-300 font-medium truncate flex-1">{p.name}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Leave / Close Room Action */}
              {isHost ? (
                <div className="flex gap-2 w-full mt-1.5 animate-fadeIn">
                  <button
                    onClick={handleLeave}
                    className="flex-1 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-red-600/10"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                    Close Room
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLeave}
                  className="w-full mt-1.5 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer animate-fadeIn"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Leave Room
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
