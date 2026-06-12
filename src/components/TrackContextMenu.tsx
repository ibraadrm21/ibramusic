import React, { useEffect, useRef, useState } from "react";
import { Play, Heart, ListPlus, Plus, Music, User, Copy, Trash2, ChevronRight, Disc } from "lucide-react";
import type { Track } from "../services/musicApi";

interface TrackContextMenuProps {
  x: number;
  y: number;
  track: Track;
  isFavorite: boolean;
  playlists: Array<{ id: string; name: string }>;
  currentPlaylistId?: string | null;
  onClose: () => void;
  onToggleFavorite: () => void;
  onAddToQueue: () => void;
  onGoToArtist?: () => void;
  onGoToAlbum?: () => void;
  onShare: () => void;
  onAddToPlaylist: (playlistId: string) => void;
  onRemoveFromPlaylist?: () => void;
  onPlayNext?: () => void;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  x,
  y,
  track,
  isFavorite,
  playlists,
  currentPlaylistId,
  onClose,
  onToggleFavorite,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
  onShare,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onPlayNext
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedCoords, setAdjustedCoords] = useState({ left: x, top: y });
  const [showPlaylistSubmenu, setShowPlaylistSubmenu] = useState(false);
  const submenuTimeoutRef = useRef<number | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Adjust coordinates to ensure the menu is fully visible on the screen
  useEffect(() => {
    if (menuRef.current) {
      const menuWidth = 240; // Approx width
      const menuHeight = menuRef.current.offsetHeight || 350; // Approx or calculated height
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = x;
      let top = y;

      // Check right boundary
      if (x + menuWidth > viewportWidth) {
        left = Math.max(10, viewportWidth - menuWidth - 15);
      }
      // Check bottom boundary
      if (y + menuHeight > viewportHeight) {
        top = Math.max(10, viewportHeight - menuHeight - 15);
      }

      setAdjustedCoords({ left, top });
    }
  }, [x, y]);

  const handleMouseEnterPlaylist = () => {
    if (submenuTimeoutRef.current) {
      window.clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setShowPlaylistSubmenu(true);
  };

  const handleMouseLeavePlaylist = () => {
    submenuTimeoutRef.current = window.setTimeout(() => {
      setShowPlaylistSubmenu(false);
    }, 150);
  };

  return (
    <div
      ref={menuRef}
      style={{
        left: `${adjustedCoords.left}px`,
        top: `${adjustedCoords.top}px`,
        position: "fixed",
      }}
      className="z-50 w-60 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 animate-[fadeIn_0.15s_ease-out] select-none text-xs text-gray-300 font-sans"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Track info header */}
      <div className="px-4 py-2 border-b border-white/5 mb-1 flex items-center gap-2.5">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-8 h-8 rounded-lg object-cover shadow-md shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate">{track.title}</p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{track.artist}</p>
        </div>
      </div>

      {/* Playlist submenu trigger */}
      <div
        className="relative"
        onMouseEnter={handleMouseEnterPlaylist}
        onMouseLeave={handleMouseLeavePlaylist}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowPlaylistSubmenu(!showPlaylistSubmenu);
          }}
          className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-white/5 hover:text-white transition-all ${
            showPlaylistSubmenu ? "bg-white/5 text-white" : ""
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Plus className="w-4 h-4 text-gray-400" />
            Añadir a lista
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        </button>

        {/* Floating playlist submenu */}
        {showPlaylistSubmenu && (
          <div
            className="absolute left-full top-0 ml-1.5 w-56 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-xl shadow-black/80 animate-[fadeIn_0.15s_ease-out] max-h-60 overflow-y-auto"
            onMouseEnter={handleMouseEnterPlaylist}
            onMouseLeave={handleMouseLeavePlaylist}
          >
            {playlists.length === 0 ? (
              <div className="px-4 py-2 text-gray-500 italic text-center">No hay listas creadas</div>
            ) : (
              playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => {
                    onAddToPlaylist(playlist.id);
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-white/5 hover:text-white transition-all truncate flex items-center gap-2"
                >
                  <Music className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="truncate">{playlist.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Remove from this playlist option */}
      {currentPlaylistId && onRemoveFromPlaylist && (
        <button
          onClick={() => {
            onRemoveFromPlaylist();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 text-red-400 hover:text-red-300 transition-all border-b border-white/5 pb-2.5 mb-1"
        >
          <Trash2 className="w-4 h-4" />
          Quitar de esta lista
        </button>
      )}

      {/* Add/Remove from Liked Songs */}
      <button
        onClick={() => {
          onToggleFavorite();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
      >
        <Heart className={`w-4 h-4 ${isFavorite ? "text-red-500 fill-red-500" : "text-gray-400"}`} />
        {isFavorite ? "Eliminar de Canciones que te gustan" : "Añadir a Canciones que te gustan"}
      </button>

      {/* Add to Queue */}
      <button
        onClick={() => {
          onAddToQueue();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
      >
        <ListPlus className="w-4 h-4 text-gray-400" />
        Añadir a la cola
      </button>

      {/* Play Next */}
      {onPlayNext && (
        <button
          onClick={() => {
            onPlayNext();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all border-b border-white/5 pb-2.5 mb-1"
        >
          <Play className="w-4 h-4 text-gray-400" />
          Reproducir a continuación
        </button>
      )}

      {/* Go to Artist */}
      {track.artistId && onGoToArtist && (
        <button
          onClick={() => {
            onGoToArtist();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          <User className="w-4 h-4 text-gray-400" />
          Ir al artista
        </button>
      )}

      {/* Go to Album */}
      {track.albumId && onGoToAlbum && (
        <button
          onClick={() => {
            onGoToAlbum();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          <Disc className="w-4 h-4 text-gray-400" />
          Ir al álbum
        </button>
      )}

      {/* Share / Compartir */}
      <button
        onClick={() => {
          onShare();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all border-t border-white/5 mt-1 pt-2.5"
      >
        <Copy className="w-4 h-4 text-gray-400" />
        Compartir
      </button>
    </div>
  );
};

export default TrackContextMenu;
