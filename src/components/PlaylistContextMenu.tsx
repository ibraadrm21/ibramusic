import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  ListPlus,
  Copy,
  Trash2,
  EyeOff,
  Eye,
  ChevronRight,
  Plus,
  ListMusic,
  Download,
  Pin,
  PinOff
} from "lucide-react";
import type { Track } from "../services/musicApi";

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  coverUrl?: string;
  isPublic?: boolean;
}

interface PlaylistContextMenuProps {
  x: number;
  y: number;
  playlist: Playlist;
  playlists: Playlist[];
  isOwnPlaylist: boolean;
  isHidden: boolean;
  isAllExplicit: boolean;
  isDownloading?: boolean;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onClose: () => void;
  onPlay: () => void;
  onDownload?: () => void;
  onAddToQueue: () => void;
  onAddPlaylistToPlaylist: (targetPlaylistId: string) => void;
  onToggleHide: () => void;
  onToggleExplicit: (makeExplicit: boolean) => void;
  onDelete?: () => void;
  onShare: () => void;
}

export const PlaylistContextMenu: React.FC<PlaylistContextMenuProps> = ({
  x,
  y,
  playlist,
  playlists,
  isOwnPlaylist,
  isHidden,
  isAllExplicit,
  isDownloading = false,
  isPinned = false,
  onTogglePin,
  onClose,
  onPlay,
  onDownload,
  onAddToQueue,
  onAddPlaylistToPlaylist,
  onToggleHide,
  onToggleExplicit,
  onDelete,
  onShare,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedCoords, setAdjustedCoords] = useState({ left: x, top: y });
  const [showSubmenu, setShowSubmenu] = useState(false);
  const submenuTimeoutRef = useRef<number | null>(null);

  // Close context menu on outside click
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

  // Adjust coordinates to ensure the menu is fully visible on screen
  useEffect(() => {
    if (menuRef.current) {
      const menuWidth = 240;
      const menuHeight = menuRef.current.offsetHeight || 380;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = x;
      let top = y;

      if (x + menuWidth > viewportWidth) {
        left = Math.max(10, viewportWidth - menuWidth - 15);
      }
      if (y + menuHeight > viewportHeight) {
        top = Math.max(10, viewportHeight - menuHeight - 15);
      }

      setAdjustedCoords({ left, top });
    }
  }, [x, y]);

  const handleMouseEnterSubmenu = () => {
    if (submenuTimeoutRef.current) {
      window.clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
    setShowSubmenu(true);
  };

  const handleMouseLeaveSubmenu = () => {
    submenuTimeoutRef.current = window.setTimeout(() => {
      setShowSubmenu(false);
    }, 150);
  };

  const otherPlaylists = playlists.filter((p) => p.id !== playlist.id);

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
      {/* Playlist info header */}
      <div className="px-4 py-2 border-b border-white/5 mb-1 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
          {playlist.coverUrl || (playlist.tracks && playlist.tracks.length > 0 && playlist.tracks[0].thumbnail) ? (
            <img
              src={playlist.coverUrl || playlist.tracks[0].thumbnail}
              alt={playlist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <ListMusic className="w-4 h-4 text-gray-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white truncate">{playlist.name}</p>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">
            Playlist • {playlist.tracks ? playlist.tracks.length : 0} {playlist.tracks?.length === 1 ? "canción" : "canciones"}
          </p>
        </div>
      </div>

      {/* Play playlist */}
      <button
        onClick={() => {
          onPlay();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
      >
        <Play className="w-4 h-4 text-gray-400 shrink-0" />
        <span>Reproducir playlist</span>
      </button>

      {/* Download playlist */}
      {onDownload && (
        <button
          onClick={() => {
            onDownload();
            onClose();
          }}
          disabled={isDownloading}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          {isDownloading ? (
            <div className="w-4 h-4 border-2 border-brand-accent border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <Download className="w-4 h-4 text-gray-400 shrink-0" />
          )}
          <span>{isDownloading ? "Descargando lista..." : "Descargar playlist"}</span>
        </button>
      )}

      {/* Add to another playlist (Añadir a otra playlist) */}
      <div
        className="relative"
        onMouseEnter={handleMouseEnterSubmenu}
        onMouseLeave={handleMouseLeaveSubmenu}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowSubmenu(!showSubmenu);
          }}
          className={`w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-white/5 hover:text-white transition-all ${
            showSubmenu ? "bg-white/5 text-white" : ""
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Plus className="w-4 h-4 text-gray-400" />
            Añadir a otra playlist
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        </button>

        {/* Floating playlist submenu */}
        {showSubmenu && (
          <div
            className="absolute left-full top-0 ml-1.5 w-56 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-xl shadow-black/80 animate-[fadeIn_0.15s_ease-out] max-h-60 overflow-y-auto"
            onMouseEnter={handleMouseEnterSubmenu}
            onMouseLeave={handleMouseLeaveSubmenu}
          >
            {otherPlaylists.length === 0 ? (
              <div className="px-4 py-2 text-gray-500 italic text-center">No hay otras playlists</div>
            ) : (
              otherPlaylists.map((targetPlaylist) => (
                <button
                  key={targetPlaylist.id}
                  onClick={() => {
                    onAddPlaylistToPlaylist(targetPlaylist.id);
                    onClose();
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-white/5 hover:text-white transition-all truncate flex items-center gap-2"
                >
                  <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                  <span className="truncate">{targetPlaylist.name}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Delete playlist (if own playlist) */}
      {isOwnPlaylist && onDelete && (
        <button
          onClick={() => {
            onDelete();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 text-red-400 hover:text-red-300 transition-all border-b border-white/5 pb-2.5 mb-1"
        >
          <Trash2 className="w-4 h-4" />
          <span>Eliminar playlist</span>
        </button>
      )}

      {/* Pin / Unpin playlist */}
      {onTogglePin && (
        <button
          onClick={() => {
            onTogglePin();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          {isPinned ? (
            <>
              <PinOff className="w-4 h-4 text-brand-accent shrink-0" />
              <span>Desanclar de la biblioteca</span>
            </>
          ) : (
            <>
              <Pin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>Fijar en la biblioteca</span>
            </>
          )}
        </button>
      )}

      {/* Explicit / Safe (Clean) Toggle */}
      <button
        onClick={() => {
          onToggleExplicit(!isAllExplicit);
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        title={isAllExplicit ? "Reproducir versión Clean (sin censura desactivada)" : "Reproducir versión Explicit (con lenguaje explícito)"}
      >
        {isAllExplicit ? (
          <>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-green-500/20 text-[9px] font-bold text-green-400 shrink-0">
              C
            </span>
            <span>Cambiar a versión Clean</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-red-500/20 text-[9px] font-bold text-red-400 shrink-0">
              E
            </span>
            <span>Cambiar a versión Explicit</span>
          </>
        )}
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
        <span>Añadir a la cola</span>
      </button>

      {/* Hide / Unhide playlist */}
      <button
        onClick={() => {
          onToggleHide();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
      >
        {isHidden ? (
          <>
            <Eye className="w-4 h-4 text-gray-400" />
            <span>Mostrar playlist</span>
          </>
        ) : (
          <>
            <EyeOff className="w-4 h-4 text-gray-400" />
            <span>Ocultar playlist</span>
          </>
        )}
      </button>

      {/* Share / Compartir */}
      <button
        onClick={() => {
          onShare();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all border-t border-white/5 mt-1 pt-2.5"
      >
        <Copy className="w-4 h-4 text-gray-400" />
        <span>Compartir</span>
      </button>
    </div>
  );
};

export default PlaylistContextMenu;
