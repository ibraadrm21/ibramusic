import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, Heart, Plus, Music, User, Copy, Trash2, ChevronRight, Disc, CheckSquare, Compass, ListPlus, CircleHelp, Clock } from "lucide-react";
import type { Track, Artist } from "../services/musicApi";
import { getArtistsFromTrack } from "../services/musicApi";
import { localized, useLanguage } from "../context/LanguageContext";

interface TrackContextMenuProps {
  x: number;
  y: number;
  anchor?: HTMLElement;
  track: Track;
  isFavorite: boolean;
  isExplicit: boolean;
  playlists: Array<{ id: string; name: string }>;
  currentPlaylistId?: string | null;
  onClose: () => void;
  onToggleFavorite: () => void;
  isSavedForLater: boolean;
  listenLaterBlocked: boolean;
  onToggleListenLater: () => void;
  onToggleExplicit: () => void;
  onAddToQueue: () => void;
  queueActionLabel?: string;
  onGoToArtist?: (artist?: Artist) => void;
  onGoToAlbum?: () => void;
  onShare?: () => void;
  onStartRadio?: () => void;
  onStartArtistRadio?: () => void;
  onDiscoveryAction?: (action: "more" | "hide" | "mute") => void;
  onAddToPlaylist: (playlistId: string) => void;
  onRemoveFromPlaylist?: () => void;
  onPlayNext?: () => void;
  onWrongSong?: () => void;
  onSelect?: () => void;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  x,
  y,
  anchor,
  track,
  isFavorite,
  isExplicit,
  playlists,
  currentPlaylistId,
  onClose,
  onToggleFavorite,
  isSavedForLater,
  listenLaterBlocked,
  onToggleListenLater,
  onToggleExplicit,
  onAddToQueue,
  queueActionLabel,
  onGoToArtist,
  onGoToAlbum,
  onShare,
  onStartRadio,
  onStartArtistRadio,
  onDiscoveryAction,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onPlayNext,
  onWrongSong,
  onSelect
}) => {
  const { language } = useLanguage();
  const copy = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedCoords, setAdjustedCoords] = useState({ left: x, top: y });
  const [submenu, setSubmenu] = useState<"playlist" | "discovery" | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuTimeoutRef = useRef<number | null>(null);
  const [hasDualVersions, setHasDualVersions] = useState<boolean>(track.hasDualVersions === true);

  // Check if track has both explicit and clean versions available
  useEffect(() => {
    let isMounted = true;
    if (track.hasDualVersions !== undefined) {
      setHasDualVersions(track.hasDualVersions);
      return;
    }
    import("../services/musicApi").then(({ checkTrackDualVersions }) => {
      checkTrackDualVersions(track).then((dual) => {
        if (isMounted) setHasDualVersions(dual);
      });
    });
    return () => {
      isMounted = false;
    };
  }, [track.id, track.artist, track.title, track.hasDualVersions]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", escape, true);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const origin = anchor?.getBoundingClientRect();

    const positionMenu = () => {
      const row = anchor?.isConnected ? anchor.getBoundingClientRect() : origin;
      const cursorX = x + ((row?.left ?? 0) - (origin?.left ?? 0));
      const cursorY = y + ((row?.top ?? 0) - (origin?.top ?? 0));
      const left = Math.max(10, Math.min(cursorX, window.innerWidth - menu.offsetWidth - 10));
      const top = Math.max(10, Math.min(cursorY, window.innerHeight - menu.offsetHeight - 10));
      setAdjustedCoords(previous => previous.left === left && previous.top === top ? previous : { left, top });
    };

    positionMenu();
    const observer = new ResizeObserver(positionMenu);
    observer.observe(menu);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [x, y, anchor]);

  useLayoutEffect(() => {
    const panel = submenuRef.current;
    const anchor = panel?.parentElement;
    if (!panel || !anchor) return;

    const place = () => {
      const margin = 10;
      const row = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const preferredLeft = row.right + width <= window.innerWidth - margin ? row.right : row.left - width;
      const left = Math.max(margin, Math.min(preferredLeft, window.innerWidth - width - margin));
      const top = Math.max(margin, Math.min(row.top, window.innerHeight - height - margin));
      panel.style.left = left + "px";
      panel.style.top = top + "px";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [submenu, adjustedCoords, playlists.length]);

  useEffect(() => () => {
    if (submenuTimeoutRef.current !== null) window.clearTimeout(submenuTimeoutRef.current);
  }, []);

  const submenuRow = (kind: "playlist" | "discovery", label: string, Icon: typeof Plus, content: React.ReactNode) => {
    const open = submenu === kind;
    return (
      <div className="relative" onPointerEnter={event => {
        if (event.pointerType !== "mouse") return;
        if (submenuTimeoutRef.current !== null) window.clearTimeout(submenuTimeoutRef.current);
        setSubmenu(kind);
      }} onPointerLeave={event => {
        if (event.pointerType !== "mouse") return;
        submenuTimeoutRef.current = window.setTimeout(() => setSubmenu(current => current === kind ? null : current), 150);
      }} onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setSubmenu(current => current === kind ? null : current);
      }}>
        <button type="button" aria-expanded={open} onClick={event => {
          if (submenuTimeoutRef.current !== null) window.clearTimeout(submenuTimeoutRef.current);
          setSubmenu(open && event.detail === 0 ? null : kind);
        }} className={"flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-all hover:bg-white/5 hover:text-white " + (open ? "bg-white/5 text-white" : "")}>
          <Icon className="w-4 h-4 shrink-0 text-gray-400" aria-hidden="true" />
          {label}
          <ChevronRight className="ml-auto size-3.5 text-gray-500" aria-hidden="true" />
        </button>
        {open && (
          <div ref={submenuRef} className="fixed z-10 max-h-[min(15rem,calc(100dvh-20px))] w-56 max-w-[calc(100vw-20px)] overflow-y-auto rounded-2xl border border-white/10 bg-brand-darkBg glass-panel py-1.5 shadow-xl shadow-black/80">
            {content}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{
        left: `${adjustedCoords.left}px`,
        top: `${adjustedCoords.top}px`,
        position: "fixed",
      }}
      className="z-[120] max-h-[calc(100dvh-20px)] w-60 max-w-[calc(100vw-20px)] overflow-y-auto rounded-2xl border border-white/10 bg-brand-darkBg py-1.5 text-xs text-gray-300 shadow-2xl shadow-black/80 motion-safe:animate-[fadeIn_0.15s_ease-out] select-none font-sans"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={event => event.preventDefault()}
    >
      {/* Track info header */}
      <div className="px-4 py-2 border-b border-white/5 mb-1 flex items-center gap-2.5">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-8 h-8 rounded-lg object-cover shadow-md shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isExplicit && hasDualVersions && (
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-[2px] bg-white/15 text-[8px] font-bold text-gray-300 shrink-0 select-none">
                E
              </span>
            )}
            <p className="font-bold text-white truncate">{track.title}</p>
          </div>
          <p className="text-[10px] text-gray-400 truncate mt-0.5">{track.artist}</p>
        </div>
      </div>

      {/* Select option */}
      {onSelect && (
        <button
          onClick={() => {
            onSelect();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all border-b border-white/5 pb-2.5 mb-1"
        >
          <CheckSquare className="w-4 h-4 text-brand-accent" />
          <span className="text-brand-accent font-medium">{copy("Seleccionar", "Select", "Hautatu")}</span>
        </button>
      )}

      {submenuRow("playlist", copy("Añadir a playlist", "Add to playlist", "Gehitu zerrendara"), Plus, playlists.length === 0 ? (
        <div className="px-4 py-2 text-center italic text-gray-500">{copy("Todavía no hay playlists", "No playlists yet", "Ez dago zerrendarik oraindik")}</div>
      ) : playlists.map(playlist => (
        <button type="button" key={playlist.id} onClick={() => {
          onAddToPlaylist(playlist.id);
          onClose();
        }} className="flex w-full items-center gap-2 px-4 py-2 text-left transition-all hover:bg-white/5 hover:text-white">
          <Music className="size-3.5 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="truncate">{playlist.name}</span>
        </button>
      )))}

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
          {copy("Quitar de esta playlist", "Remove from this playlist", "Kendu zerrenda honetatik")}
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
        {isFavorite ? copy("Quitar de favoritos", "Remove from Liked Songs", "Kendu gogokoetatik") : copy("Añadir a favoritos", "Add to Liked Songs", "Gehitu gogokoetara")}
      </button>

      <button disabled={listenLaterBlocked && !isSavedForLater} onClick={() => { onToggleListenLater(); onClose(); }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 enabled:hover:bg-white/5 enabled:hover:text-white disabled:text-gray-400 disabled:cursor-not-allowed transition-all">
        <Clock className={`size-4 ${isSavedForLater ? "text-brand-accent" : "text-gray-400"}`} />
        <span>{isSavedForLater
          ? copy("Quitar de Escuchar más tarde", "Remove from Listen Later", "Kendu Gero entzutetik")
          : copy("Escuchar más tarde", "Listen Later", "Gero entzun")}
          {listenLaterBlocked && !isSavedForLater && <span className="block text-[11px]">
            {copy("Esta canción ya está en tu biblioteca", "This song is already in your library", "Abesti hau liburutegian dago jada")}
          </span>}
        </span>
      </button>

      {/* Toggle Explicit/Clean */}
      {hasDualVersions && (
        <button
          onClick={() => {
            onToggleExplicit();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
          title={isExplicit ? "Play Clean version" : "Play Explicit version"}
        >
          {isExplicit ? (
            <>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-green-500/20 text-[9px] font-bold text-green-400 shrink-0">
                C
              </span>
              <span>Switch to Clean version</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-red-500/20 text-[9px] font-bold text-red-400 shrink-0">
                E
              </span>
              <span>Switch to Explicit version</span>
            </>
          )}
        </button>
      )}

      {/* Add to Queue */}
      <button
        onClick={() => {
          onAddToQueue();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
      >
        <ListPlus className="w-4 h-4 text-gray-400" />
        {queueActionLabel ?? "Añadir al final de la cola"}
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
          {copy("Reproducir a continuación", "Play next", "Erreproduzitu hurrengo")}
        </button>
      )}

      {/* Go to Artist (Supports single and multiple artists) */}
      {onGoToArtist && (() => {
        const artistList = getArtistsFromTrack(track);
        if (artistList.length > 1) {
          return artistList.map((art, idx) => (
            <button
              key={art.id || idx}
              onClick={() => {
                onGoToArtist({
                  id: art.id,
                  name: art.name,
                  thumbnail: track.thumbnail
                });
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all text-xs"
              title={`Go to ${art.name}`}
            >
              <User className="w-4 h-4 text-brand-accent shrink-0" />
              <span className="truncate">Go to {art.name}</span>
            </button>
          ));
        }

        if (track.artistId || track.artist) {
          return (
            <button
              onClick={() => {
                onGoToArtist({
                  id: track.artistId || `artist-${encodeURIComponent(track.artist)}`,
                  name: track.artist,
                  thumbnail: track.thumbnail
                });
                onClose();
              }}
              className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
            >
              <User className="w-4 h-4 text-gray-400" />
              {copy("Ir al artista", "Go to artist", "Joan artistarengana")}
            </button>
          );
        }
        return null;
      })()}

      {/* Go to Album */}
      {(track.albumId || track.albumName) && onGoToAlbum && (
        <button
          onClick={() => {
            onGoToAlbum();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          <Disc className="w-4 h-4 text-gray-400" />
          {copy("Ir al álbum", "Go to album", "Joan albumera")}
        </button>
      )}

      {onStartRadio && submenuRow("discovery", copy("Descubrir", "Discover", "Aurkitu"), Compass, <>
        {track.recommendationReason && <p className="border-b border-white/5 px-4 py-2 text-gray-400">{track.recommendationReason}</p>}
        <button type="button" className="w-full px-4 py-2 text-left transition-all hover:bg-white/5 hover:text-white" onClick={() => { onStartRadio(); onClose(); }}>Radio de esta canción</button>
        {onStartArtistRadio && <button type="button" className="w-full px-4 py-2 text-left transition-all hover:bg-white/5 hover:text-white" onClick={() => { onStartArtistRadio(); onClose(); }}>Radio de este artista</button>}
        {onDiscoveryAction && (["more", "hide", "mute"] as const).map(action => (
          <button type="button" key={action} className="w-full px-4 py-2 text-left transition-all hover:bg-white/5 hover:text-white" onClick={() => { onDiscoveryAction(action); onClose(); }}>
            {{ more: "Más como esto", hide: "Ocultar canción", mute: "Mostrar menos de este artista" }[action]}
          </button>
        ))}
      </>)}
      {onWrongSong && (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => {
            onWrongSong();
            onClose();
          }}
          className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all"
        >
          <CircleHelp aria-hidden="true" className="w-4 h-4 text-gray-400" />
          {copy("¿Canción incorrecta?", "Wrong song?", "Abesti okerra?")}
        </button>
      )}
      {onShare && <button
        onClick={() => {
          onShare();
          onClose();
        }}
        className="w-full px-4 py-2.5 text-left flex items-center gap-2.5 hover:bg-white/5 hover:text-white transition-all border-t border-white/5 mt-1 pt-2.5"
      >
        <Copy className="w-4 h-4 text-gray-400" />
        {copy("Compartir", "Share", "Partekatu")}
      </button>}
    </div>,
    anchor?.closest("dialog[open]") ?? document.body,
  );
};

export default TrackContextMenu;
