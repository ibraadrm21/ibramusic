import React, { useRef } from "react";
import { Play, Pause, Heart, ListPlus, Plus, MoreVertical } from "lucide-react";
import type { Track } from "../services/musicApi";
import { useAudio } from "../context/AudioContext";

interface TrackCardProps {
  track: Track;
  variant: "square" | "row";
  tracksQueue?: Track[];
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: boolean;
  onOpenArtist?: (artist: any) => void;
  onAddToPlaylist?: (track: Track) => void;
  trackIndex?: number;
  onContextMenu?: (e: React.MouseEvent, track: Track) => void;
  playlistId?: string;
}

export const TrackCard = React.memo<TrackCardProps>(({
  track,
  variant,
  tracksQueue = [],
  onToggleFavorite,
  isFavorite = false,
  onOpenArtist,
  onAddToPlaylist,
  trackIndex,
  onContextMenu,
  playlistId
}) => {
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlay, addToQueue } = useAudio();

  const isCurrent = currentTrack?.id === track.id;

  const longPressTimeoutRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
    }
    
    longPressTimeoutRef.current = window.setTimeout(() => {
      if (onContextMenu) {
        const syntheticEvent = {
          preventDefault: () => {},
          clientX: touch.clientX,
          clientY: touch.clientY,
        } as unknown as React.MouseEvent;
        onContextMenu(syntheticEvent, track);
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 600);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      if (longPressTimeoutRef.current) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, tracksQueue.length > 0 ? tracksQueue : [track], playlistId);
    }
  };

  if (variant === "square") {
    return (
      <div
        onClick={handlePlayClick}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            onContextMenu(e, track);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="group relative flex flex-col gap-2 rounded-xl cursor-pointer select-none"
      >
        {/* Cover Art Container */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-lg shadow-black/40">
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {/* Glass Overlay Play Button */}
          <div className={`absolute inset-0 bg-black/40 ${isCurrent && isLoading ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity duration-300 flex items-center justify-center`}>
            <button
              onClick={handlePlayClick}
              disabled={isCurrent && isLoading}
              className={`p-3 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black transition-all duration-300 glow-accent ${isCurrent && isLoading ? "translate-y-0" : "transform translate-y-3 group-hover:translate-y-0"}`}
            >
              {isCurrent && isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isCurrent && isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* Playing indicator strip */}
          {isCurrent && (isPlaying || isLoading) && (
            <div className="absolute bottom-1.5 left-1.5 right-1.5 bg-brand-accent/90 backdrop-blur-md px-2 py-0.5 rounded-md flex items-center justify-between text-[9px] text-white">
              <span className="font-medium truncate mr-1">{isLoading ? "Loading..." : "Playing"}</span>
              {!isLoading && (
                <div className="flex items-end gap-0.5 h-2.5">
                  <span className="w-0.5 bg-white wave-bar" style={{ animationDelay: "0.1s" }}></span>
                  <span className="w-0.5 bg-white wave-bar" style={{ animationDelay: "0.4s" }}></span>
                  <span className="w-0.5 bg-white wave-bar" style={{ animationDelay: "0.2s" }}></span>
                </div>
              )}
            </div>
          )}

          {/* 3-Dots actions button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onContextMenu) {
                onContextMenu(e, track);
              }
            }}
            className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/50 hover:bg-black/70 text-gray-300 transition-all z-20"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Metadata - Now below the image */}
        <div className="w-full px-0.5 min-w-0">
          <h3 className="font-medium text-xs text-white truncate leading-tight">
            {track.title}
          </h3>
          <div className="text-[10px] text-gray-400 truncate mt-0.5 flex flex-wrap gap-x-1 select-none">
            {track.artists && track.artists.length > 0 ? (
              track.artists.map((art, i) => (
                <React.Fragment key={art.id}>
                  <span
                    onClick={(e) => {
                      if (onOpenArtist) {
                        e.stopPropagation();
                        onOpenArtist({ id: art.id, name: art.name, thumbnail: track.thumbnail });
                      }
                    }}
                    className="hover:text-brand-accent transition-colors"
                  >
                    {art.name}
                  </span>
                  {i < track.artists!.length - 1 && <span>,</span>}
                </React.Fragment>
              ))
            ) : (
              <span
                onClick={(e) => {
                  if (onOpenArtist && track.artistId) {
                    e.stopPropagation();
                    onOpenArtist({ id: track.artistId, name: track.artist, thumbnail: track.thumbnail });
                  }
                }}
                className="hover:text-brand-accent transition-colors"
              >
                {track.artist}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Row layout representing Popular Songs / search items
  return (
    <div
      onClick={handlePlayClick}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e, track);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`group flex items-center justify-between md:grid md:grid-cols-10 gap-4 p-2.5 md:p-3 rounded-2xl transition-all duration-300 cursor-pointer ${
        isCurrent ? "bg-white/10 border-l-4 border-brand-accent" : "hover:bg-white/5 border-l-4 border-transparent"
      }`}
    >
      {/* Col 1: Play button, Cover, Title & Sub-artist (visible on all screen widths) */}
      <div className="flex items-center gap-3 md:gap-4 col-span-8 flex-1 min-w-0">
        {/* Index/Play button */}
        <div className="flex items-center justify-center w-8 shrink-0">
          <button
            onClick={handlePlayClick}
            disabled={isCurrent && isLoading}
            className={`flex items-center justify-center p-2 rounded-full bg-brand-accent text-black ${isCurrent && isLoading ? "" : "hidden group-hover:flex"}`}
          >
            {isCurrent && isLoading ? (
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isCurrent && isPlaying ? (
              <Pause className="w-3 h-3 fill-current" />
            ) : (
              <Play className="w-3 h-3 fill-current ml-0.5" />
            )}
          </button>
          <span className={`text-xs font-semibold text-gray-500 ${isCurrent && isLoading ? "hidden" : "group-hover:hidden"} ${isCurrent ? "text-brand-accent" : ""}`}>
            {isCurrent && isPlaying ? (
              <div className="flex items-end gap-0.5 h-3">
                <span className="w-0.5 bg-brand-accent wave-bar" style={{ animationDelay: "0.1s" }}></span>
                <span className="w-0.5 bg-brand-accent wave-bar" style={{ animationDelay: "0.4s" }}></span>
                <span className="w-0.5 bg-brand-accent wave-bar" style={{ animationDelay: "0.2s" }}></span>
              </div>
            ) : (
              trackIndex !== undefined ? trackIndex : "▶"
            )}
          </span>
        </div>

        {/* Album Cover */}
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-10 h-10 rounded-lg object-cover shadow-md shadow-black/30 shrink-0"
        />

        {/* Title & Artist subtitle */}
        <div className="min-w-0 flex-1">
          <h4 
            className={`font-semibold text-sm truncate ${isCurrent ? "text-brand-accent" : "text-white"}`}
          >
            {track.title}
          </h4>
          <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1 select-none">
            {track.artists && track.artists.length > 0 ? (
              track.artists.map((art, i) => (
                <React.Fragment key={art.id}>
                  <span
                    onClick={(e) => {
                      if (onOpenArtist) {
                        e.stopPropagation();
                        onOpenArtist({ id: art.id, name: art.name, thumbnail: track.thumbnail });
                      }
                    }}
                    className="hover:text-brand-accent hover:underline cursor-pointer transition-colors"
                  >
                    {art.name}
                  </span>
                  {i < track.artists!.length - 1 && <span>,</span>}
                </React.Fragment>
              ))
            ) : (
              <span
                onClick={(e) => {
                  if (onOpenArtist && track.artistId) {
                    e.stopPropagation();
                    onOpenArtist({ id: track.artistId, name: track.artist, thumbnail: track.thumbnail });
                  }
                }}
                className="hover:text-brand-accent hover:underline cursor-pointer transition-colors"
              >
                {track.artist}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Col 2: Actions & Duration */}
      <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5 md:gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Add to Playlist Button */}
        {onAddToPlaylist && (
          <button
            onClick={() => onAddToPlaylist(track)}
            className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
            title="Add to playlist"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}

        {/* Add to Queue Button */}
        <button
          onClick={() => addToQueue(track)}
          className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
          title="Add to queue"
        >
          <ListPlus className="w-4 h-4" />
        </button>

        {onToggleFavorite && (
          <button
            onClick={() => onToggleFavorite(track)}
            className={`p-1.5 rounded-full hover:bg-white/10 transition-colors shrink-0 ${
              isFavorite ? "text-red-500" : "text-gray-400 hover:text-white"
            }`}
          >
            <Heart className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
          </button>
        )}

        {/* 3-Dots actions button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onContextMenu) {
              onContextMenu(e, track);
            }
          }}
          className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
          title="More options"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        <div className="hidden md:block text-[11px] text-gray-400 pr-1 select-none shrink-0 w-10 text-right ml-1">
          {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, "0")}
        </div>
      </div>
    </div>
  );
});

export default TrackCard;
