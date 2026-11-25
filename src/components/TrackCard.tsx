import { CoverImage } from "./CoverImage";
import { largeCoverUrl } from "../services/coverArt";
import React, { useRef } from "react";
import { Play, Pause, Heart, ListPlus, Plus, MoreVertical } from "lucide-react";
import { motion } from "framer-motion";
import type { Artist, Track } from "../services/musicApi";
import { artistMatches } from "../services/catalog";
import { getArtistsFromTrack } from "../services/musicApi";
import { useAudio } from "../context/AudioContext";
import { localized, useLanguage } from "../context/LanguageContext";

interface TrackCardProps {
  track: Track;
  variant: "square" | "row";
  tracksQueue?: Track[];
  onToggleFavorite?: (track: Track) => void;
  isFavorite?: boolean;
  onOpenArtist?: (artist: any) => void;
  artistProfile?: Artist;
  onOpenAlbum?: (album: any) => void;
  onAddToPlaylist?: (track: Track, e: React.MouseEvent<HTMLButtonElement>) => void;
  trackIndex?: number;
  onContextMenu?: (e: React.MouseEvent, track: Track) => void;
  playlistId?: string;
  isExplicit?: boolean;
  hasDualVersions?: boolean;
}

export const TrackCard = React.memo<TrackCardProps>(({
  track,
  variant,
  tracksQueue = [],
  onToggleFavorite,
  isFavorite = false,
  onOpenArtist,
  artistProfile,
  onOpenAlbum,
  onAddToPlaylist,
  trackIndex,
  onContextMenu,
  playlistId,
  isExplicit,
}) => {
  const { language } = useLanguage();
  const copy = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const { currentTrack, isPlaying, isLoading, playTrack, togglePlay, addToQueue } = useAudio();

  const isCurrent = currentTrack?.id === track.id;

  const showExplicitBadge = isExplicit || track.isExplicit;
  const playLabel = (isCurrent && isPlaying ? copy("Pausar", "Pause", "Pausatu") : copy("Reproducir", "Play", "Erreproduzitu")) + " " + track.title;

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
      const trackToPlay = {
        ...track,
        isExplicit: isExplicit !== undefined ? isExplicit : track.isExplicit
      };
      playTrack(trackToPlay, tracksQueue.length > 0 ? tracksQueue : [trackToPlay], playlistId);
    }
  };

  if (variant === "square") {
    const largeCover = largeCoverUrl(track.thumbnail);
    return (
      <motion.div
        data-track-row=""
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
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="group relative flex flex-col gap-2 rounded-xl cursor-pointer select-none"
      >
        {/* Cover Art Container */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden shadow-lg shadow-black/40">
          <CoverImage
            src={largeCover || (track.id.startsWith("yt-") ? `https://i.ytimg.com/vi/${track.id.substring(3)}/hqdefault.jpg` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80")}
            alt={track.title}
            loading="lazy"
            onError={(e) => {
              if (track.thumbnail && e.currentTarget.getAttribute("src") === largeCover && largeCover !== track.thumbnail) {
                e.currentTarget.src = track.thumbnail;
                return;
              }
              const ytId = track.id.startsWith("yt-") ? track.id.substring(3) : (/^[a-zA-Z0-9_-]{11}$/.test(track.id) ? track.id : null);
              if (ytId && !e.currentTarget.src.includes("i.ytimg.com")) {
                e.currentTarget.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
              } else {
                e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
              }
            }}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          {/* Glass Overlay Play Button */}
          <div className={`absolute inset-0 bg-black/40 ${isCurrent && isLoading ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"} transition-opacity duration-300 flex items-center justify-center`}>
            <button
              aria-label={playLabel}
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

          {/* Explicit badge for square variant */}
          {showExplicitBadge && (
            <div className="absolute top-2 left-2 z-10 pointer-events-none">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-black/75 backdrop-blur-sm text-[9px] font-bold text-gray-200 select-none shadow-sm"
                title={copy("Contenido explícito", "Explicit", "Eduki esplizitua")}
              >
                E
              </span>
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
          <h3 className="font-medium text-xs text-white truncate leading-tight" title={track.title}>
            {track.title}
          </h3>
          <div className="text-[10px] text-gray-400 truncate mt-0.5 flex flex-wrap gap-x-1 select-none">
            {(() => {
              const artistList = getArtistsFromTrack(track);
              return artistList.map((art, i) => (
                <React.Fragment key={art.id || i}>
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
                  {i < artistList.length - 1 && <span>,</span>}
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      </motion.div>
    );
  }

  // Row layout representing Popular Songs / search items
  return (
    <motion.div
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
      whileHover={{ x: 4 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      data-favorite-row={playlistId === "favorites" ? "" : undefined}
      data-track-row=""
      data-current-track={isCurrent ? "" : undefined}
      className={`group flex items-center justify-between md:grid md:grid-cols-12 gap-4 p-2.5 md:p-3 rounded-2xl transition-colors duration-150 cursor-pointer ${
        isCurrent ? "bg-white/10 border-l-4 border-brand-accent" : "hover:bg-white/5 border-l-4 border-transparent"
      }`}
    >
      {/* Col 1: Play button, Cover, Title & Sub-artist (col-span-5 on md+) */}
      <div className="flex items-center gap-3 md:gap-4 md:col-span-5 flex-1 min-w-0">
        {/* Index/Play button */}
        <div className="flex items-center justify-center w-8 shrink-0">
          <button
            aria-label={playLabel}
            onClick={handlePlayClick}
            disabled={isCurrent && isLoading}
            className={`flex items-center justify-center p-2 rounded-full bg-brand-accent text-black ${isCurrent && isLoading ? "" : "md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
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
        <CoverImage
          src={track.thumbnail || (track.id.startsWith("yt-") ? `https://i.ytimg.com/vi/${track.id.substring(3)}/hqdefault.jpg` : "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80")}
          alt={track.title}
          loading="lazy"
          onError={(e) => {
            const ytId = track.id.startsWith("yt-") ? track.id.substring(3) : (/^[a-zA-Z0-9_-]{11}$/.test(track.id) ? track.id : null);
            if (ytId && !e.currentTarget.src.includes("i.ytimg.com")) {
              e.currentTarget.src = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
            } else {
              e.currentTarget.src = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
            }
          }}
          className="w-10 h-10 rounded-lg object-cover shadow-md shadow-black/30 shrink-0"
        />

        {/* Title & Artist subtitle */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {showExplicitBadge && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-white/20 text-[9px] font-bold text-gray-300 shrink-0 select-none"
                title={copy("Contenido explícito", "Explicit", "Eduki esplizitua")}
              >
                E
              </span>
            )}
            <h4 
              title={track.title}
              className={`font-semibold text-sm truncate ${isCurrent ? "text-brand-accent" : "text-white"}`}
            >
              {track.title}
            </h4>
          </div>
          <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1 select-none">
            {(() => {
              const artistList = getArtistsFromTrack(track);
              return artistList.map((art, i) => {
                const isProfileArtist = artistProfile && artistMatches(art.name, art.id, artistProfile);
                return (
                  <React.Fragment key={art.id || i}>
                    <span
                      onClick={(e) => {
                        if (!onOpenArtist || isProfileArtist) return;
                        e.stopPropagation();
                        onOpenArtist({ id: art.id, name: art.name, thumbnail: track.thumbnail });
                      }}
                      className={isProfileArtist ? undefined : "hover:text-brand-accent hover:underline cursor-pointer transition-colors"}
                    >
                      {art.name}
                    </span>
                    {i < artistList.length - 1 && <span>,</span>}
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Col 2: Album Name column (md:col-span-3, hidden on small screens) */}
      <div className="hidden md:flex md:col-span-3 items-center min-w-0 pr-2">
        <span
          onClick={(e) => {
            if (onOpenAlbum && (track.albumId || track.albumName)) {
              e.stopPropagation();
              onOpenAlbum({
                id: track.albumId || `album-${track.albumName}`,
                title: track.albumName || "Album",
                artist: track.artist,
                thumbnail: track.thumbnail
              });
            }
          }}
          className={`text-xs text-gray-400 truncate ${
            onOpenAlbum && (track.albumId || track.albumName)
              ? "hover:text-white hover:underline cursor-pointer transition-colors"
              : ""
          }`}
          title={track.albumName || "—"}
        >
          {track.albumName || "—"}
        </span>
      </div>

      {/* Col 3: Date Added column (md:col-span-2, hidden on small screens) */}
      <div className="hidden md:flex md:col-span-2 items-center min-w-0 pr-2 text-xs text-gray-500 select-none">
        <span className="truncate" title={track.dateAdded ? new Date(track.dateAdded).toLocaleDateString(language) : "—"}>
          {(() => {
            if (!track.dateAdded) return "—";
            try {
              const date = new Date(track.dateAdded);
              if (isNaN(date.getTime())) return "—";
              const now = new Date();
              const diffMs = now.getTime() - date.getTime();
              const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
              if (diffDays <= 0) return copy("Hoy", "Today", "Gaur");
              if (diffDays === 1) return copy("Ayer", "Yesterday", "Atzo");
              if (diffDays < 7) return `${diffDays} days ago`;
              if (diffDays < 30) return `${Math.floor(diffDays / 7)} wk ago`;
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            } catch {
              return "—";
            }
          })()}
        </span>
      </div>

      {/* Col 4: Actions & Duration (md:col-span-2, aligns with remaining table cols) */}
      <div className="col-span-3 md:col-span-2 flex items-center justify-end gap-1.5 md:gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {/* Add to Playlist Button */}
        {onAddToPlaylist && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddToPlaylist(track, e);
            }}
            className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
            title={copy("Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}

        {/* Add to Queue Button */}
        <button
          onClick={() => addToQueue(track)}
          className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors shrink-0"
          title={copy("Añadir a la cola", "Add to queue", "Gehitu ilarara")}
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
          title={copy("Más opciones", "More options", "Aukera gehiago")}
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        <div className="hidden md:block text-[11px] text-gray-400 pr-1 select-none shrink-0 w-10 text-right ml-1">
          <span className="tabular-nums">{Math.floor(track.duration / 60)}:{Math.floor(track.duration % 60).toString().padStart(2, "0")}</span>
        </div>
      </div>
    </motion.div>
  );
});

export default TrackCard;
