import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { ActionMenu, menuAction } from "./components/ActionMenu";
import { desktopAmbientBackground, getCachedCoverColor, readCoverColor, readableCoverColors, rememberCoverColor, type AmbientMode } from "./services/coverArt";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, Heart, Sparkles, Play, Pause, Trash2, ListMusic, ListPlus, X, Plus, Home,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Clock,
  ChevronUp, ChevronDown, MoreVertical, Radio, AlertCircle, Settings, Gift,
  User, Globe, Lock, Link, Music2, Mic2, Waves, Zap, CloudRain, Flame, Moon, Star,
  CheckCircle2, RotateCw, Disc, Folder, PanelRight, Maximize2, Pin, PinOff, Pencil, Image, FileDown
} from "lucide-react";
import { AudioProvider, useAudio, useAudioProgress, invalidateTrackResolution } from "./context/AudioContext";
import { readTrackVersionPreference, readTrackVersionPreferences, saveTrackVersionPreferences, trackVersionId } from "./services/explicitPreferences";
import { downloadService } from "./services/downloadService";
import Sidebar from "./components/Sidebar";
import { buildShareLink, readMediaRoute, resolveSharedTrack } from "./services/links";
import { localDate, statsFor } from "./services/listeningHistory";
import { downloadFile, exportPlaylist, parsePlaylistBackup } from "./services/libraryFiles";
import { localized, useLanguage } from "./context/LanguageContext";
import { measure } from "./services/metrics";
import { Modal } from "./components/Modal";
import { shareableTracks } from "./services/playlistSharing";
import { SearchField } from "./components/SearchField";
import { normalizeSearch, profileReleases, profileTracks, rankTracks, starterTracks, trackTitleArtistKey } from "./services/catalog";


const Logo: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <defs>
      <linearGradient id="logo_grad_main" x1="50" y1="100" x2="462" y2="412" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="var(--app-cover-accent-dim, #D1D1D1)"/>
        <stop offset="0.5" stopColor="var(--app-cover-accent, #FFFFFF)"/>
        <stop offset="1" stopColor="var(--app-cover-accent-dim, #A1A1A1)"/>
      </linearGradient>
    </defs>
    <path
      d="M80 320C120 240 180 340 240 260C280 200 240 120 280 80C320 40 380 80 400 120C420 160 380 220 320 240C260 260 200 340 260 400C320 460 400 420 440 360"
      stroke="url(#logo_grad_main)"
      strokeWidth="50"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M260 50C285 30 305 50 285 80C265 110 245 90 260 50Z"
      fill="url(#logo_grad_main)"
    />
    <path d="M245 235L295 265L245 295V235Z" fill="var(--app-cover-accent, white)" />
  </svg>
);

const PlayerPanel = React.lazy(() => import("./components/PlayerPanel"));
import TrackCard from "./components/TrackCard";
import TrackContextMenu from "./components/TrackContextMenu";
import { WrongSongMenu } from "./components/WrongSongMenu";
import PlaylistContextMenu from "./components/PlaylistContextMenu";
import { ListenTogether } from "./components/ListenTogether";
const SharePlaylistManager = React.lazy(() => import("./components/SharedPlaylistPanel").then(module => ({ default: module.SharePlaylistManager })));
const SharedPlaylistView = React.lazy(() => import("./components/SharedPlaylistPanel").then(module => ({ default: module.SharedPlaylistView })));
const FollowedReleases = React.lazy(() => import("./components/FollowedReleases"));
const playlistHeaderControl = "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors";
const playlistHeaderButton = playlistHeaderControl + " bg-white/5 border-white/10 text-gray-400 hover:text-white";

const LibraryExtras = React.lazy(() => import("./components/LibraryExtras").then(module => ({ default: module.LibraryExtras })));
const WrappedModal = React.lazy(() => import("./components/WrappedModal"));
const StatsPanel = React.lazy(() => import("./components/StatsPanel"));
const SettingsPanel = React.lazy(() => import("./components/SettingsPanel").then(module => ({ default: module.SettingsPanel })));
import { getHomeRecommendations, getSearchRecommendations, getTrendingRecommendations } from "./services/recommendationEngine";
import {
  searchTracks,
  searchAlbums, searchArtists,
  getAlbumTracks, resolveArtistIdentity, artistProfilePortrait,
  getArtistProfileTracks, getArtistReleasePage, getSpotifyAlbumStats,
  searchPublicPlaylists, getPublicPlaylistTracks,
  getArtistsFromTrack
} from "./services/musicApi";
import type { Track, Album, Artist } from "./services/musicApi";
import AlbumCard from "./components/AlbumCard";
import ArtistCard from "./components/ArtistCard";
import { checkForUpdates, redirectToUpdate, startAutoUpdatePolling } from "./services/updateChecker";
import type { UpdateInfo } from "./services/updateChecker";
import { signUp, signIn, signOut, syncLibrary, sendPasswordReset, updatePassword, resendConfirmation } from "./services/authSync";
import { equalLibraryData, indexLibraryTracks, mergeLibrary, pruneListenLater, type Library, type ListenLaterEntry, type Playlist, type PlaylistCoverFit, type ThemeSettings } from "./services/librarySync";
import { supabase } from "./services/supabaseClient";
import { StorageService } from "./services/storageService";



function setViewAddress(url: URL, replace = false) {
  if (url.href === window.location.href) return;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

function tabAddress(tab: string) {
  const url = new URL(window.location.pathname, window.location.origin);
  if (tab !== "home") url.searchParams.set("view", tab);
  return url;
}

interface RecentItem {
  id: string;
  type: "playlist" | "album";
  name: string;
  coverUrl?: string;
  artistName?: string;
  tracks: Track[];
}

const mapColorBetweenThemes = (color: string, fromTheme: "dark" | "bright" | "noir", toTheme: "dark" | "bright" | "noir") => {
  if (!color) return "";
  if (toTheme === "noir") return "#000000";

  const darkPresets = [
    "#0f0f0f","#0f0f1a","#0a0f1e","#0d1117","#0f1923","#10151f","#1a0a0a","#120a0f",
    "#1e1e2e","#1a1a2e","#16213e","#0d2137","#0a2540","#162032","#2d1b1b","#1f0d24",
    "#1a0533","#0d0d2b","#00141f","#001a00","#1a1000","#1a0000","#002233","#190019",
    "#2a0a3a","#0e1f4d","#00261c","#1a2500","#2b1700","#2a0000","#003344","#250038"
  ];
  const brightPresets = [
    "#fafafa","#f1f5f9","#e2e8f0","#f8fafc","#f3f4f6","#e5e7eb","#f9fafb","#eceff1",
    "#ffe4e6","#ffedd5","#fef9c3","#dcfce7","#ccfbf1","#e0f2fe","#f3e8ff","#fae8ff",
    "#fecdd3","#fed7aa","#fef08a","#bbf7d0","#99f6e4","#bae6fd","#e9d5ff","#f5d0fe",
    "#fda4af","#fdbb2d","#ffe066","#a7f3d0","#80f1d5","#7dd3fc","#d8b4fe","#f472b6"
  ];
  
  const fromList = fromTheme === "bright" ? brightPresets : darkPresets;
  const toList = toTheme === "bright" ? brightPresets : darkPresets;
  
  // Find exact index
  const exactIdx = fromList.findIndex(c => c.toLowerCase() === color.toLowerCase());
  if (exactIdx !== -1) {
    return toList[exactIdx];
  }
  
  // Parse hex to RGB
  const parseHex = (hex: string) => {
    const clean = hex.replace("#", "");
    if (clean.length === 3) {
      return {
        r: parseInt(clean[0] + clean[0], 16),
        g: parseInt(clean[1] + clean[1], 16),
        b: parseInt(clean[2] + clean[2], 16)
      };
    }
    return {
      r: parseInt(clean.substring(0, 2), 16) || 0,
      g: parseInt(clean.substring(2, 4), 16) || 0,
      b: parseInt(clean.substring(4, 6), 16) || 0
    };
  };

  // Convert RGB to HSL
  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  // Convert HSL to Hex
  const hslToHex = (h: number, s: number, l: number) => {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  try {
    const rgb = parseHex(color);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

    if (toTheme === "bright") {
      // Make it a pastel/bright color: set Lightness between 85% and 95%
      const newL = Math.max(85, Math.min(95, 100 - (100 - hsl.l) * 0.15));
      return hslToHex(hsl.h, Math.max(20, Math.min(60, hsl.s)), newL);
    } else {
      // Make it a dark color: set Lightness between 5% and 15%
      const newL = Math.max(5, Math.min(15, hsl.l * 0.15));
      return hslToHex(hsl.h, Math.max(30, hsl.s), newL);
    }
  } catch {
    return toTheme === "bright" ? "#fafafa" : "#0f0f0f";
  }
};

const MainLayout: React.FC = () => {
  const { labels, language, setLanguage } = useLanguage();

  const {
    currentTrack, playTrack,
    ambientGlowEnabled, setAmbientGlowEnabled,
    queue, currentIndex, removeFromQueue, clearQueue, clearManualQueue, reorderQueue,
    toast, showToast, playShuffledPlaylist, restoreQueue,
    playNext,
    addToQueue,
    playbackError, setPlaybackError,
    retryPlayback,
    privateSession,
    listeningEntries,
    clearListeningHistory,
    nextTrack, prevTrack, togglePlay, toggleMute, changeVolume, volume,
    undoQueue,
    playingPlaylistId,
    roomId,
    updateUserIdentity,
    joinRoom,
    isHost,
    proposeRoomTrack,
    history,
    accumulatedStats,
    setAccumulatedStats,
  } = useAudio();

  const upcomingItems = React.useMemo(() => {
    return queue.slice(currentIndex + 1).map((track, relativeIdx) => ({
      track,
      originalIdx: currentIndex + 1 + relativeIdx
    }));
  }, [queue, currentIndex]);

  const userAddedItems = React.useMemo(() => {
    return upcomingItems.filter(item => item.track.isUserAdded);
  }, [upcomingItems]);

  const playlistItems = React.useMemo(() => {
    return upcomingItems.filter(item => !item.track.isUserAdded);
  }, [upcomingItems]);

    // --- Explicit Content State ---
  const [explicitTrackIds, setExplicitTrackIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("ibrastream_explicit_tracks");
    try {
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const [trackVersionPreferences, setTrackVersionPreferences] = useState(readTrackVersionPreferences);

  const saveExplicitTrackIds = (updated: Set<string>) => {
    setExplicitTrackIds(updated);
    const arr = Array.from(updated);
    StorageService.setItemSync("ibrastream_explicit_tracks", arr);
    try {
      localStorage.setItem("ibrastream_explicit_track_ids", JSON.stringify(arr));
    } catch {}
  };

  const isTrackExplicit = (track: Track): boolean => {
    const chosen = readTrackVersionPreference(track.id, trackVersionPreferences);
    return chosen ?? (explicitTrackIds.has(track.id) || explicitTrackIds.has(trackVersionId(track.id)) || track.isExplicit === true);
  };

  const chooseTrackVersions = (tracks: Track[], explicit: boolean) => {
    const next = readTrackVersionPreferences();
    for (const track of tracks) next[trackVersionId(track.id)] = explicit;
    saveTrackVersionPreferences(next);
    setTrackVersionPreferences(next);
    for (const track of tracks) invalidateTrackResolution(track.id);
    if (currentTrack && tracks.some(track => trackVersionId(track.id) === trackVersionId(currentTrack.id))) {
      if (currentTrack.isExplicit !== explicit) playTrack({ ...currentTrack, isExplicit: explicit }, undefined, undefined, false, 0, true);
    }
  };

  const handleToggleExplicit = (track: Track) => {
    const explicit = !isTrackExplicit(track);
    chooseTrackVersions([track], explicit);
    showToast(explicit ? "Versión explícita seleccionada." : "Versión limpia seleccionada.", "success");
  };

  // Filter explicit content setting
  const [filterExplicit, setFilterExplicit] = useState<boolean>(() => {
    return localStorage.getItem("ibrastream_filter_explicit") === "true";
  });

  const handleToggleFilterExplicit = () => {
    const newVal = !filterExplicit;
    setFilterExplicit(newVal);
    localStorage.setItem("ibrastream_filter_explicit", String(newVal));
    showToast(
      newVal
        ? "Explicit content hidden"
        : "Showing all content",
      "success"
    );
  };

  const filterTracks = React.useCallback((tracks: Track[]) => {
    let result = tracks;
    if (filterExplicit) {
      result = result.filter(track => !isTrackExplicit(track));
    }
    return result;
  }, [filterExplicit, explicitTrackIds, trackVersionPreferences]);

  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem("ibrastream_active_tab") || "home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => localStorage.getItem("ibrastream_sidebar_collapsed") === "true");
  const [tabDirection, setTabDirection] = useState<"forward" | "backward" | "none">("none");
  const [isWrappedModalOpen, setIsWrappedModalOpen] = useState(false);

  // Tab order for directional transition detection
  const TAB_ORDER = ["home", "search", "favorites", "playlists", "stats", "wrapped", "settings", "dashboard", "github"];
  const [syncState, setSyncState] = useState<"pending" | "syncing" | "saved" | "offline" | "error">("pending");
  const [syncError, setSyncError] = useState("");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const prevTabRef = React.useRef<string>(activeTab);

  // Theme settings state
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem("ibrastream_theme_settings");
    const defaults: ThemeSettings = { theme: "dark", corners: "rounded", bgColor: "", bgImage: "" };
    try { return saved ? { ...defaults, ...JSON.parse(saved) } : defaults; } catch { return defaults; }
  });

  const [ambientMode, setAmbientMode] = useState<AmbientMode>(() => {
    const mode = localStorage.getItem("ibrastream_ambient_mode");
    return mode === "cover" || mode === "secondary" ? mode : "classic";
  });
  useEffect(() => {
    localStorage.setItem("ibrastream_ambient_mode", ambientMode);
  }, [ambientMode]);
  const advancedAmbient = ambientMode !== "classic";
  const [desktopTheme, setDesktopTheme] = useState(() => matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const viewport = matchMedia("(min-width: 768px)");
    const update = () => setDesktopTheme(viewport.matches);
    viewport.addEventListener("change", update);
    update();
    return () => viewport.removeEventListener("change", update);
  }, []);
  const auraActive = ambientGlowEnabled;
  const coverUrl = currentTrack?.thumbnail;
  const coverTitle = currentTrack?.title;
  const coverArtist = currentTrack?.artist;
  const nextCoverUrl = queue[currentIndex + 1]?.thumbnail;
  const [coverPalette, setCoverPalette] = useState<({ url: string } & Awaited<ReturnType<typeof readCoverColor>>) | null>(null);
  const cachedPalette = React.useMemo(() => auraActive && coverUrl ? getCachedCoverColor(coverUrl) : undefined, [auraActive, coverUrl]);
  const palette = auraActive ? (coverPalette?.url === coverUrl ? coverPalette : cachedPalette) : null;

  useEffect(() => {
    if (auraActive && nextCoverUrl && nextCoverUrl !== coverUrl) {
      void readCoverColor(nextCoverUrl, advancedAmbient).catch(() => {});
    }
  }, [auraActive, advancedAmbient, coverUrl, nextCoverUrl]);

  useEffect(() => {
    if (!auraActive || !coverUrl) return;
    let cancelled = false;
    const loadPalette = async () => {
      try {
        return await readCoverColor(coverUrl, advancedAmbient);
      } catch (error) {
        if (cancelled || advancedAmbient || !coverTitle || !coverArtist) throw error;
        const artists = getArtistsFromTrack({ artist: coverArtist });
        const names = artists.map(artist => normalizeSearch(artist.name));
        const matches = await searchTracks(coverTitle + " " + artists[0].name);
        const alternate = matches.find(track =>
          track.thumbnail && track.thumbnail !== coverUrl
          && normalizeSearch(track.title) === normalizeSearch(coverTitle)
          && getArtistsFromTrack(track).some(artist => names.includes(normalizeSearch(artist.name))));
        if (!alternate) throw error;
        const { ambient: _ambient, auraImage: _auraImage, ...color } = await readCoverColor(alternate.thumbnail);
        if (!cancelled) rememberCoverColor(coverUrl, color);
        return color;
      }
    };
    void loadPalette().then(color => {
      if (!cancelled) setCoverPalette({ url: coverUrl, ...color });
    }, () => {
      if (!cancelled) setCoverPalette(null);
    });
    return () => { cancelled = true; };
  }, [auraActive, advancedAmbient, coverUrl, coverTitle, coverArtist]);

  useEffect(() => {
    localStorage.setItem("ibrastream_theme_settings", JSON.stringify(themeSettings));
    const r = document.documentElement.style;
    if (themeSettings.corners === "rounded") {
      r.setProperty("--app-radius-xl", "28px"); r.setProperty("--app-radius-lg", "20px");
      r.setProperty("--app-radius-md", "12px"); r.setProperty("--app-radius-sm", "8px");
    } else {
      r.setProperty("--app-radius-xl", "8px"); r.setProperty("--app-radius-lg", "6px");
      r.setProperty("--app-radius-md", "4px"); r.setProperty("--app-radius-sm", "2px");
    }
  }, [themeSettings]);

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const r = root.style;
    const classicPalette = advancedAmbient ? null : palette;
    const useDesktopComposition = desktopTheme && advancedAmbient;
    const ambientBackground = useDesktopComposition && auraActive
      ? desktopAmbientBackground(ambientMode, themeSettings.theme, palette)
      : ambientMode === "secondary" ? palette?.ambient?.secondaryDark : palette?.background?.color;
    const contrast = ambientBackground && readableCoverColors(ambientBackground,
      ambientMode === "cover" ? palette?.ambient?.detail : palette?.ambient?.dominant,
      ambientMode === "cover" && Boolean(palette?.auraImage));
    const bright = useDesktopComposition ? themeSettings.theme === "bright"
      : contrast ? contrast.light : classicPalette?.mostlyWhite || (!classicPalette?.mostlyBlack && themeSettings.theme === "bright");
    root.setAttribute("data-theme", palette && !useDesktopComposition ? (bright ? "bright" : "dark") : themeSettings.theme);
    root.toggleAttribute("data-cover-black", !!classicPalette?.mostlyBlack);
    root.toggleAttribute("data-cover-white", !!classicPalette?.mostlyWhite);
    root.toggleAttribute("data-cover-aura", auraActive);
    root.toggleAttribute("data-cover-background", Boolean(contrast));
    if (auraActive && advancedAmbient) root.setAttribute("data-ambient-mode", ambientMode);
    else root.removeAttribute("data-ambient-mode");
    r.removeProperty("--ambient-secondary");
    r.removeProperty("--ambient-deepest");
    r.removeProperty("--ambient-detail");
    r.removeProperty("--ambient-artwork");
    r.removeProperty("--ambient-artwork-opacity");
    r.removeProperty("--ambient-accent");
    r.removeProperty("--app-cover-accent");
    r.removeProperty("--app-cover-accent-dim");
    r.removeProperty("--app-cover-detail");
    r.removeProperty("--app-cover-detail-secondary");
    r.removeProperty("--app-cover-muted");
    if (auraActive && advancedAmbient) {
      r.removeProperty("--app-bg-image-val");
      r.removeProperty("--app-bg-color-val");
      if (ambientBackground && contrast) {
        r.setProperty("--app-bg-color-val", ambientBackground);
        r.setProperty("--app-cover-muted", contrast.muted);
        r.setProperty("--ambient-accent", contrast.accent);
        r.setProperty("--ambient-artwork-opacity", String(contrast.imageOpacity));
      }
      if (palette?.ambient) {
        r.setProperty("--ambient-secondary", palette.ambient.secondaryDark);
        r.setProperty("--ambient-deepest", palette.ambient.deepest);
        if (ambientBackground) r.setProperty("--ambient-detail",
          readableCoverColors(ambientBackground, palette.ambient.detail, ambientMode === "cover").accent);
      }
      if (ambientMode === "cover" && palette?.auraImage) {
        r.setProperty("--ambient-artwork", `url("${palette.auraImage}")`);
      }
    } else if (auraActive) {
      r.removeProperty("--app-bg-image-val");
      const saturation = palette?.saturation ? Math.min(94, 28 + palette.saturation * 0.9) : 0;
      const hue = palette?.hue ?? 0;
      if (palette?.mostlyBlack && !bright) {
        r.setProperty("--app-bg-color-val", "#000000");
        r.setProperty("--app-cover-accent", "#ffffff");
        r.setProperty("--app-cover-accent-dim", "#d1d1d1");
        if (saturation) r.setProperty("--app-cover-detail", "hsl(" + hue + " " + saturation + "% 58%)");
        if (palette.secondaryHue !== undefined) {
          r.setProperty("--app-cover-detail-secondary", "hsl(" + palette.secondaryHue + " 72% 67%)");
        }
      } else if (palette?.mostlyWhite && bright) {
        r.setProperty("--app-bg-color-val", "#ffffff");
        r.setProperty("--app-cover-accent", saturation ? "hsl(" + hue + " 82% 39%)" : "#18181b");
        r.setProperty("--app-cover-accent-dim", "#27272a");
        if (palette.secondaryHue !== undefined) {
          const warmMetal = palette.secondaryHue >= 18 && palette.secondaryHue <= 55;
          r.setProperty("--app-cover-detail", `hsl(${palette.secondaryHue} ${warmMetal ? "65% 33%" : "85% 42%"})`);
        }
      } else if (palette) {
        r.setProperty("--app-bg-color-val", "hsl(" + hue + " " + saturation * 0.74 + "% " + (bright ? 93 : saturation ? 17 : 12) + "%)");
        r.setProperty("--app-cover-accent", "hsl(" + hue + " " + saturation + "% " + (bright ? 26 : saturation ? 69 : 74) + "%)");
        r.setProperty("--app-cover-accent-dim", "hsl(" + hue + " " + saturation * 0.65 + "% " + (bright ? 37 : 58) + "%)");
        if (palette.secondaryHue !== undefined) r.setProperty("--app-cover-detail", "hsl(" + palette.secondaryHue + " 78% " + (bright ? 38 : 69) + "%)");
      } else {
        r.setProperty("--app-bg-color-val", bright ? "#f2f2f2" : "#1f1f1f");
      }
      if (ambientBackground && contrast) {
        r.setProperty("--app-bg-color-val", ambientBackground);
        r.setProperty("--app-cover-muted", contrast.muted);
        for (const token of ["--app-cover-accent", "--app-cover-accent-dim", "--app-cover-detail", "--app-cover-detail-secondary"]) {
          const value = r.getPropertyValue(token);
          if (value) r.setProperty(token, readableCoverColors(ambientBackground, value).accent);
        }
      }
    } else if (themeSettings.bgImage) {
      r.setProperty("--app-bg-image-val", `url(${themeSettings.bgImage})`);
      r.setProperty("--app-bg-color-val", "transparent");
    } else if (themeSettings.bgColor) {
      r.setProperty("--app-bg-image-val", "none");
      r.setProperty("--app-bg-color-val", themeSettings.bgColor);
    } else {
      r.removeProperty("--app-bg-image-val"); r.removeProperty("--app-bg-color-val");
    }
  }, [auraActive, advancedAmbient, ambientMode, desktopTheme, palette, themeSettings.bgColor, themeSettings.bgImage, themeSettings.theme]);
  const [user, setUser] = useState<any>(null);
  const detailRequest = useRef(0);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("ibrastream_search_history");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const saveSearchToHistory = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || privateSession) return;
    setSearchHistory(prev => {
      const filtered = prev.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      localStorage.setItem("ibrastream_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const removeHistoryItem = (itemToRemove: string) => {
    setSearchHistory(prev => {
      const updated = prev.filter(q => q !== itemToRemove);
      localStorage.setItem("ibrastream_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem("ibrastream_search_history");
  };

  const [searchType, setSearchType] = useState<"all" | "track" | "album" | "artist" | "community" | "library">("all");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    track: Track;
    anchor?: HTMLElement;
    currentPlaylistId?: string | null;
  } | null>(null);
  const [sourceMenuTrack, setSourceMenuTrack] = useState<Track | null>(null);

  const [playlistContextMenu, setPlaylistContextMenu] = useState<{
    x: number;
    y: number;
    playlist: Playlist;
  } | null>(null);

  const [hiddenPlaylistIds, setHiddenPlaylistIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("ibrastream_hidden_playlists");
    try {
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const [pinnedPlaylistIds, setPinnedPlaylistIds] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("ibrastream_pinned_playlists");
    try {
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const savePinnedPlaylistIds = (updated: Set<string>) => {
    setPinnedPlaylistIds(updated);
    const arr = Array.from(updated);
    localStorage.setItem("ibrastream_pinned_playlists", JSON.stringify(arr));
    StorageService.setItemSync("ibrastream_pinned_playlists", arr);
  };

  const handleTogglePinPlaylist = (playlistId: string) => {
    const updated = new Set(pinnedPlaylistIds);
    if (updated.has(playlistId)) {
      updated.delete(playlistId);
      showToast("Playlist unpinned from library", "info");
    } else {
      updated.add(playlistId);
      showToast("Playlist pinned to library 📌", "success");
    }
    savePinnedPlaylistIds(updated);
  };


  const saveHiddenPlaylistIds = (updated: Set<string>) => {
    setHiddenPlaylistIds(updated);
    const arr = Array.from(updated);
    localStorage.setItem("ibrastream_hidden_playlists", JSON.stringify(arr));
    StorageService.setItemSync("ibrastream_hidden_playlists", arr);
  };

  // Persist activeTab in localStorage
  useEffect(() => {
    localStorage.setItem("ibrastream_active_tab", activeTab);
  }, [activeTab]);

  // Followed Artists state
  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
    const saved = localStorage.getItem("ibrastream_followed_artists");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const saveFollowedArtists = (updated: Artist[]) => {
    setFollowedArtists(updated);
    localStorage.setItem("ibrastream_followed_artists", JSON.stringify(updated));
  };

  const handleToggleFollowArtist = (artist: Artist) => {
    const isFollowing = followedArtists.some(a => a.id === artist.id);
    let updated;
    if (isFollowing) {
      updated = followedArtists.filter(a => a.id !== artist.id);
      showToast(`Unfollowed ${artist.name}`, "info");
    } else {
      updated = [...followedArtists, artist];
      showToast(`Followed ${artist.name}`, "success");
    }
    saveFollowedArtists(updated);
  };
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [albumResults, setAlbumResults] = useState<Album[]>([]);
  const [artistResults, setArtistResults] = useState<Artist[]>([]);
  const [communityResults, setCommunityResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchingMore, setIsSearchingMore] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const searchRequest = useRef(0);
  const searchPending = useRef<{ key: string; id: number } | null>(null);
  const [searchSort, setSearchSort] = useState("relevance");
  const [releaseYear, setReleaseYear] = useState("");
  const [searchVersion, setSearchVersion] = useState("all");
  const [visibleSearchTracks, setVisibleSearchTracks] = useState(30);

  // Auto-sync explicit tracks detected from API search results
  useEffect(() => {
    if (!searchResults || searchResults.length === 0) return;
    const newExplicit = new Set(explicitTrackIds);
    let changed = false;
    searchResults.forEach(track => {
      if (track.isExplicit && !newExplicit.has(track.id)) {
        newExplicit.add(track.id);
        changed = true;
      }
    });
    if (changed) {
      saveExplicitTrackIds(newExplicit);
    }
  }, [searchResults]);

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentItem[]>(() => {
    const saved = StorageService.getItemSync<RecentItem[]>("ibrastream_recently_played_items") ?? StorageService.getItemSync<RecentItem[]>("ibrastream_recently_played");
    return Array.isArray(saved) ? saved.filter(item => (item.type === "playlist" || item.type === "album") && Array.isArray(item.tracks)) : [];
  });

  const addToRecentlyPlayed = (item: RecentItem) => {
    if (!user) return;
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(r => !(r.id === item.id && r.type === item.type));
      const updated = [item, ...filtered].slice(0, 12);
      StorageService.setItemSync("ibrastream_recently_played_items", updated);
      return updated;
    });
  };


  const [favorites, setFavorites] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_favorites");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [showMobilePlayer, setShowMobilePlayer] = useState<boolean>(false);
  const [storedListenLater, setListenLater] = useState<ListenLaterEntry[]>(() => {
    const stored = StorageService.getItemSync<ListenLaterEntry[]>("ibrastream_listen_later");
    return Array.isArray(stored) ? stored : [];
  });
  const [showListenLater, setShowListenLater] = useState(false);

  // Detail overlays state
  const [shareToken, setShareToken] = useState(() => new URLSearchParams(location.search).get("share"));
  const [isOpeningPublicPlaylist, setIsOpeningPublicPlaylist] = useState(() => {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get("playlistId") || params.get("playlist"));
  });
  const [manageShare, setManageShare] = useState<Playlist | null>(null);
  const [deleteAccount, setDeleteAccount] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [sharedTrack, setSharedTrack] = useState<{ track: Track; seconds: number } | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState<boolean>(false);

  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [previousArtist, setPreviousArtist] = useState<Artist | null>(null);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(false);
  const [artistTracksSource, setArtistTracksSource] = useState<"top" | "catalog" | "local">("top");
  const [artistTracksError, setArtistTracksError] = useState(false);
  const [artistReleasesError, setArtistReleasesError] = useState(false);
  const [artistReleasePage, setArtistReleasePage] = useState<{ artist: Artist; index: number }>();
  const [artistCatalogIdentity, setArtistCatalogIdentity] = useState<Artist>();
  const [isLoadingMoreArtistReleases, setIsLoadingMoreArtistReleases] = useState(false);
  const [isLoadingArtistAbout, setIsLoadingArtistAbout] = useState(false);
  const visibleArtistTracks = React.useMemo(() => filterTracks(artistTracks), [artistTracks, filterTracks]);
  const [artistTab, setArtistTab] = useState<"popular" | "albums" | "about">("popular");
  const [artistAlbums, setArtistAlbums] = useState<Album[]>([]);
  const [isLoadingArtistAlbums, setIsLoadingArtistAlbums] = useState<boolean>(false);
  const [visibleArtistTracksCount, setVisibleArtistTracksCount] = useState<number>(8);
  const [visiblePlaylistCount, setVisiblePlaylistCount] = useState<number>(30);
  const [visibleFavoritesCount, setVisibleFavoritesCount] = useState<number>(30);

  const [showQueueOverlay, setShowQueueOverlay] = useState<boolean>(false);
  const [savedPlaybackQueue, setSavedPlaybackQueue] = useState(() => StorageService.getItemSync<SavedPlaybackQueue>(savedQueueKey));
  const [duplicateSelection, setDuplicateSelection] = useState<Set<number> | null>(null);
  const [cleanDestination, setCleanDestination] = useState("");
  const [playlistUndo, setPlaylistUndo] = useState<{ before: Playlist[]; after: Playlist[] } | null>(null);
  useEffect(() => {
    if (!playlistUndo) return;
    const timer = window.setTimeout(() => setPlaylistUndo(null), 12000);
    return () => window.clearTimeout(timer);
  }, [playlistUndo]);
  const [showListenTogetherOverlay, setShowListenTogetherOverlay] = useState<boolean>(false);
  const [showListenTogetherDropdown, setShowListenTogetherDropdown] = useState<boolean>(false);
  const playlistSentinelRef = useRef<HTMLDivElement | null>(null);
  const favoritesSentinelRef = useRef<HTMLDivElement | null>(null);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const searchScrollTop = useRef(0);
  const listenTogetherDropdownRef = React.useRef<HTMLDivElement>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState<boolean>(false);
  const accountDropdownRef = React.useRef<HTMLDivElement>(null);
  const mobileAccountOverlayRef = React.useRef<HTMLDivElement>(null);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem("ibrastream_username") || "Guest";
  });
  const [pfp, setPfp] = useState<string>(() => {
    return localStorage.getItem("ibrastream_pfp") || "";
  });

  // Sync username and pfp to Listen Together user identity
  useEffect(() => {
    updateUserIdentity(username, pfp);
  }, [username, pfp, updateUserIdentity]);

  // Sync profile details with Supabase user metadata
  useEffect(() => {
    if (user) {
      const metaUsername = user.user_metadata?.username || user.email?.split("@")[0] || "User";
      const metaPfp = user.user_metadata?.avatar_url || "";
      setUsername(metaUsername);
      setPfp(metaPfp);
      StorageService.setItemSync("ibrastream_username", metaUsername);
      StorageService.setItemSync("ibrastream_pfp", metaPfp);
    } else {
      setUsername("Guest");
      setPfp("");
    }
  }, [user]);

  const handleUpdatePfp = async (base64Data: string) => {
    setPfp(base64Data);
    StorageService.setItemSync("ibrastream_pfp", base64Data);
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { avatar_url: base64Data }
        });
        showToast("Profile picture updated", "success");
      } catch (err: any) {
        showToast(`Failed to save pfp: ${err.message}`, "error");
      }
    }
  };

  const handleUpdateUsername = async (newVal: string) => {
    setUsername(newVal);
    localStorage.setItem("ibrastream_username", newVal);
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { username: newVal }
        });
      } catch (err: any) {
        console.error("Failed to sync username with Supabase:", err);
      }
    }
  };
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Playlists state
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    const saved = localStorage.getItem("ibrastream_playlists");
    try {
      const parsed = JSON.parse(saved || "");
      return Array.isArray(parsed) ? parsed.map((p: any) => ({
        ...p,
        tracks: Array.isArray(p.tracks) ? p.tracks : []
      })) : [];
    } catch (e) {
      return [];
    }
  });

  const isInPersonalLibrary = React.useMemo(() =>
    indexLibraryTracks([...favorites, ...playlists.flatMap(playlist => playlist.tracks)]), [favorites, playlists]);
  const listenLater = React.useMemo(() => pruneListenLater(storedListenLater, isInPersonalLibrary), [storedListenLater, isInPersonalLibrary]);
  const isSavedForLater = React.useMemo(() => indexLibraryTracks(listenLater.map(entry => entry.track)), [listenLater]);
  useLayoutEffect(() => {
    if (listenLater !== storedListenLater) setListenLater(listenLater);
  }, [listenLater, storedListenLater]);
  useEffect(() => {
    StorageService.setItemSync("ibrastream_listen_later", listenLater);
  }, [listenLater]);

  const [isHydratingPlaylists, setIsHydratingPlaylists] = useState(true);
  const [isHydratingFavorites, setIsHydratingFavorites] = useState(true);

  // Hydrate playlists and favorites from IndexedDB if available
  useEffect(() => {
    StorageService.getItem<Playlist[]>("ibrastream_playlists").then(idbPlaylists => {
      if (idbPlaylists && Array.isArray(idbPlaylists) && idbPlaylists.length > 0) {
        setPlaylists(idbPlaylists);
      }
    }).catch(() => {}).finally(() => setIsHydratingPlaylists(false));
    StorageService.getItem<Track[]>("ibrastream_favorites").then(idbFavs => {
      if (idbFavs && Array.isArray(idbFavs) && idbFavs.length > 0) {
        setFavorites(idbFavs);
      }
    }).catch(() => {}).finally(() => setIsHydratingFavorites(false));
    StorageService.getItem<string[]>("ibrastream_explicit_tracks").then(idbExplicit => {
      if (idbExplicit && Array.isArray(idbExplicit) && idbExplicit.length > 0) {
        setExplicitTrackIds(prev => {
          const merged = new Set([...prev, ...idbExplicit]);
          return merged;
        });
      }
    }).catch(() => {});
  }, []);
  const [showPlaylistCreateModal, setShowPlaylistCreateModal] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState<string>("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const queueSourceName = (() => {
    if (!playingPlaylistId) return "Queue";
    const playlist = playlists.find(item => item.id === playingPlaylistId)
      ?? (selectedPlaylist?.id === playingPlaylistId ? selectedPlaylist : null);
    if (playlist?.name) return playlist.name;
    if (playingPlaylistId === "liked-songs" || playingPlaylistId === "favorites") return "Liked Songs";
    if (playingPlaylistId === "listen-later") return localized(language, "Escuchar más tarde", "Listen Later", "Gero entzun");
    if (playingPlaylistId.startsWith("album-")) return "Album";
    if (playingPlaylistId.startsWith("artist-")) return "Artist Radio";
    if (playingPlaylistId.startsWith("radio-")) return "Radio";
    return "Playlist";
  })();
  const navigateTab = React.useCallback((tab: string, writeAddress = true) => {
    detailRequest.current++;
    if (writeAddress) setViewAddress(tabAddress(tab));
    setShareToken(null);
    const prevIdx = TAB_ORDER.indexOf(prevTabRef.current);
    const nextIdx = TAB_ORDER.indexOf(tab);
    if (prevIdx === -1 || nextIdx === -1 || prevIdx === nextIdx) {
      setTabDirection("none");
    } else {
      setTabDirection(nextIdx > prevIdx ? "forward" : "backward");
    }
    prevTabRef.current = tab;
    // Clear sub-selections so they don't bleed into other tabs
    setSelectedPlaylist(null);
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setShowListenLater(false);
    setActiveTab(tab);
  }, []);

  const isOwnPlaylist = selectedPlaylist ? playlists.some(p => p.id === selectedPlaylist.id) : false;
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);
  const [albumToAddToPlaylist, setAlbumToAddToPlaylist] = useState<{ album: Album; tracks: Track[] } | null>(null);
  const [playlistPopoverCoords, setPlaylistPopoverCoords] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const playlistPopoverRef = useRef<HTMLDivElement>(null);
  const [playlistPopoverPosition, setPlaylistPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [playlistFolderDraft, setPlaylistFolderDraft] = useState<string | null>(null);
  const [trackPendingNewPlaylist, setTrackPendingNewPlaylist] = useState<Track | null>(null);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState<string>("");
  const [saveQueueMode, setSaveQueueMode] = useState<boolean>(false);
  const [includeCurrentInQueue, setIncludeCurrentInQueue] = useState(true);

  // Multi-select state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [showBulkPlaylistPicker, setShowBulkPlaylistPicker] = useState<boolean>(false);
  const isSelecting = selectedTrackIds.size > 0;

  const handleOpenAddToPlaylist = (track: Track, event?: React.MouseEvent) => {
    const rect = event?.currentTarget.getBoundingClientRect();
    setPlaylistPopoverCoords(rect ? { x: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom } : null);
    setTrackToAddToPlaylist(track);
  };

  useLayoutEffect(() => {
    const panel = playlistPopoverRef.current;
    if (!trackToAddToPlaylist || !playlistPopoverCoords || !panel) return;

    const { x, top: anchorTop, bottom: anchorBottom } = playlistPopoverCoords;
    const update = () => {
      if (window.innerWidth < 768) {
        setPlaylistPopoverPosition(null);
        return;
      }
      const margin = 16;
      const gap = 12;
      const height = panel.offsetHeight;
      const above = anchorTop - gap - height;
      const below = anchorBottom + gap;
      setPlaylistPopoverPosition({
        left: Math.max(margin, Math.min(x - panel.offsetWidth / 2, window.innerWidth - panel.offsetWidth - margin)),
        top: above >= margin ? above : Math.max(margin, Math.min(below, window.innerHeight - height - margin)),
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      setPlaylistPopoverPosition(null);
    };
  }, [trackToAddToPlaylist, playlistPopoverCoords]);

  const handleSelectTrack = (trackId: string) => {
    setSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId); else next.add(trackId);
      return next;
    });
  };

  const handleSelectAll = (tracks: Track[]) => {
    if (selectedTrackIds.size === tracks.length) {
      setSelectedTrackIds(new Set());
    } else {
      setSelectedTrackIds(new Set(tracks.map(t => t.id)));
    }
  };

  const clearSelection = () => setSelectedTrackIds(new Set());

  // In-app navigation history stack
  interface ViewState {
    activeTab: string;
    selectedArtist: Artist | null;
    selectedAlbum: Album | null;
    selectedPlaylist: Playlist | null;
  }
  const [navHistory, setNavHistory] = useState<ViewState[]>([]);
  const [navIndex, setNavIndex] = useState<number>(-1);
  const isNavigatingRef = React.useRef(false);

  // Close header dropdown on clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = (event as TouchEvent).touches
        ? (event as TouchEvent).touches[0]?.target as Node
        : (event as MouseEvent).target as Node;

      if (
        listenTogetherDropdownRef.current &&
        !listenTogetherDropdownRef.current.contains(target)
      ) {
        setShowListenTogetherDropdown(false);
      }
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(target) &&
        // Don't close when tapping inside the mobile full-screen overlay
        !(mobileAccountOverlayRef.current && mobileAccountOverlayRef.current.contains(target))
      ) {
        setShowAccountDropdown(false);
      }
      // Close bulk playlist picker if click is outside the toolbar
      const toolbar = document.getElementById("bulk-action-toolbar");
      if (toolbar && !toolbar.contains(target)) {
        setShowBulkPlaylistPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside as EventListener, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as EventListener);
    };
  }, []);

  // Initialize history on mount
  useEffect(() => {
    setNavHistory([{
      activeTab,
      selectedArtist: null,
      selectedAlbum: null,
      selectedPlaylist: null
    }]);
    setNavIndex(0);
  }, []);

  // Sync state changes with navigation history
  useEffect(() => {
    if (isNavigatingRef.current) return;
    if (navIndex === -1) return;

    const current = navHistory[navIndex];
    if (!current) return;

    const hasChanged =
      current.activeTab !== activeTab ||
      current.selectedArtist?.id !== selectedArtist?.id ||
      current.selectedAlbum?.id !== selectedAlbum?.id ||
      current.selectedPlaylist?.id !== selectedPlaylist?.id;

    if (hasChanged) {
      const newHistory = navHistory.slice(0, navIndex + 1);
      newHistory.push({
        activeTab,
        selectedArtist,
        selectedAlbum,
        selectedPlaylist
      });
      setNavHistory(newHistory);
      setNavIndex(newHistory.length - 1);
    }
  }, [activeTab, selectedArtist, selectedAlbum, selectedPlaylist]);

  const goBack = () => {
    if (navIndex > 0) {
      isNavigatingRef.current = true;
      const prevIndex = navIndex - 1;
      const prevView = navHistory[prevIndex];
      setNavIndex(prevIndex);

      const url = prevView.selectedAlbum ? buildShareLink("album", prevView.selectedAlbum.id, prevView.selectedAlbum.title, prevView.selectedAlbum.artist)
        : prevView.selectedArtist ? buildShareLink("artist", prevView.selectedArtist.id, prevView.selectedArtist.name) : tabAddress(prevView.activeTab);
      setViewAddress(url, true);
      setActiveTab(prevView.activeTab);
      setSelectedArtist(prevView.selectedArtist);
      setSelectedAlbum(prevView.selectedAlbum);
      setSelectedPlaylist(prevView.selectedPlaylist);

      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 50);
    }
  };

  const goForward = () => {
    if (navIndex < navHistory.length - 1) {
      isNavigatingRef.current = true;
      const nextIndex = navIndex + 1;
      const nextView = navHistory[nextIndex];
      setNavIndex(nextIndex);

      const url = nextView.selectedAlbum ? buildShareLink("album", nextView.selectedAlbum.id, nextView.selectedAlbum.title, nextView.selectedAlbum.artist)
        : nextView.selectedArtist ? buildShareLink("artist", nextView.selectedArtist.id, nextView.selectedArtist.name) : tabAddress(nextView.activeTab);
      setViewAddress(url, true);
      setActiveTab(nextView.activeTab);
      setSelectedArtist(nextView.selectedArtist);
      setSelectedAlbum(nextView.selectedAlbum);
      setSelectedPlaylist(nextView.selectedPlaylist);

      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 50);
    }
  };

  const canSaveQueueAsPlaylist = (() => {
    if (queue.length === 0) return false;
    if (!playingPlaylistId) return true;
    
    if (playingPlaylistId === "favorites") {
      if (queue.length !== favorites.length) return true;
      return !queue.every((track, idx) => track.id === favorites[idx]?.id);
    }

    const playingPlaylist = playlists.find(p => p.id === playingPlaylistId);
    if (!playingPlaylist) return true;
    
    if (queue.length !== playingPlaylist.tracks.length) return true;
    return !queue.every((track, idx) => track.id === playingPlaylist.tracks[idx]?.id);
  })();

  // Spotify import states
  const [immersivePlayer, setImmersivePlayer] = useState(false);
  const mainSearchRef = useRef<HTMLDivElement>(null);
  const [showSpotifyImportModal, setShowSpotifyImportModal] = useState<boolean>(false);
  const [spotifyLink, setSpotifyLink] = useState<string>("");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const importAbort = useRef<AbortController | null>(null);
  const [importPreview, setImportPreview] = useState<Playlist | null>(null);
  const [savedAlbums, setSavedAlbums] = useState<Album[]>(() => StorageService.getItemSync<Album[]>("ibrastream_saved_albums") ?? []);
  const [deletedPlaylists, setDeletedPlaylists] = useState<Playlist[]>(() => StorageService.getItemSync<Playlist[]>("ibrastream_playlist_trash") ?? []);
  const [playlistFolder, setPlaylistFolder] = useState("");
  const [desktopLibraryLayout, setDesktopLibraryLayout] = useState(() => localStorage.getItem("ibrastream_desktop_library_layout") === "list" ? "list" : "grid");
  const [desktopLibrarySort, setDesktopLibrarySort] = useState("default");
  const [desktopPanelVisible, setDesktopPanelVisible] = useState(() => localStorage.getItem("ibrastream_desktop_panel") !== "hidden");
  const [desktopLyricsRequest, setDesktopLyricsRequest] = useState<{ show: boolean }>();
  const [desktopPanelWidth, setDesktopPanelWidth] = useState(() => Math.max(300, Math.min(640, Number(localStorage.getItem("ibrastream_desktop_panel_width")) || 380)));
  const playlistDrag = useRef<number | null>(null);
  const desktopPanelRef = useRef<HTMLElement>(null);
  const panelDrag = useRef<{ x: number; width: number } | null>(null);
  function resizeDesktopPanel(width: number) {
    setDesktopPanelWidth(Math.round(Math.max(300, Math.min(640, window.innerWidth - 460, width))));
  }
  useEffect(() => {
    localStorage.setItem("ibrastream_desktop_panel_width", String(desktopPanelWidth));
    localStorage.setItem("ibrastream_desktop_panel", desktopPanelVisible ? "visible" : "hidden");
  }, [desktopPanelWidth, desktopPanelVisible]);

  const [isImportingSpotify, setIsImportingSpotify] = useState<boolean>(false);
  const [spotifyToken, setSpotifyTokenState] = useState<string | null>(() => localStorage.getItem("ibrastream_spotify_token"));
  const [spotifyClientId, setSpotifyClientId] = useState<string>(() => localStorage.getItem("ibrastream_spotify_client_id") || "4af2775b763e4e2e80bd63dcf5ea3c23");
  const [importTab, setImportTab] = useState<"spotify" | "m3u">("spotify");
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [subSearchQuery, setSubSearchQuery] = useState<string>("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!matchMedia("(min-width: 1024px)").matches || event.defaultPrevented || event.isComposing) return;
      const origin = event.target;
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setContextMenu(null); setPlaylistContextMenu(null); setShowQueueOverlay(false);
        return;
      }
      if (origin instanceof HTMLElement && origin.closest("input, textarea, select, [contenteditable], [role=separator]")) return;
      if (document.querySelector("dialog[open]")) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const roomControls = !roomId || isHost;
      let action: (() => void) | undefined;
      if ((modifier && !event.altKey && key === "k") || (!modifier && !event.altKey && key === "/")) action = () => mainSearchRef.current?.querySelector("input")?.focus();
      if ((modifier || event.altKey) && key === "l") action = () => {
        setDesktopLyricsRequest({ show: !desktopPanelVisible || showQueueOverlay });
        if (!desktopPanelVisible || showQueueOverlay) {
          setDesktopPanelVisible(true); setShowQueueOverlay(false);
        }
      };
      if (event.altKey && key !== "l") return;
      if (modifier && roomControls && key === "arrowright") action = nextTrack;
      if (modifier && roomControls && key === "arrowleft") action = prevTrack;
      if (!modifier && roomControls && key === " " && !(origin instanceof HTMLElement && origin.closest("button, a, summary"))) action = togglePlay;
      if (!modifier && key === "m") action = toggleMute;
      if (!modifier && key === "arrowup") action = () => changeVolume(volume + .05);
      if (!modifier && key === "arrowdown") action = () => changeVolume(volume - .05);
      if (action) { event.preventDefault(); action(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [desktopPanelVisible, showQueueOverlay, roomId, isHost, volume, togglePlay, toggleMute, changeVolume, nextTrack, prevTrack]);
  const [sortField, setSortField] = useState<"title" | "album" | "dateAdded" | "duration" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Update checker states
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);

  // Featured content states
  const [featuredSongs, setFeaturedSongs] = useState<Track[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<any[]>([]);
  const [adminSongSearchResults, setAdminSongSearchResults] = useState<Track[]>([]);
  const [newAdminPlName, setNewAdminPlName] = useState<string>("");
  const [newAdminPlPfp, setNewAdminPlPfp] = useState<string>("");
  const [adminPlSearchResults, setAdminPlSearchResults] = useState<Track[]>([]);
  const [newAdminPlTracks, setNewAdminPlTracks] = useState<Track[]>([]);
  const [loadingYouTubePlaylistId, setLoadingYouTubePlaylistId] = useState<string | null>(null);

  // Hero Banner State
  const [heroDraft, setHeroDraft] = useState(() => StorageService.getItemSync<{ title: string; subtitle: string; description: string; gradient: string; color: string }>("ibrastream_hero_draft"));
  const [heroTitle, setHeroTitle] = useState<string>("IbraMusic");
  const [heroSubtitle, setHeroSubtitle] = useState<string>("Tu biblioteca de música");
  const [heroDescription, setHeroDescription] = useState<string>("Encuentra canciones, organiza listas y escucha con amigos.");
  const [heroBgGradient, setHeroBgGradient] = useState<string>("from-brand-accent/20 via-pink-500/10 to-transparent");
  const [heroTextColor, setHeroTextColor] = useState<string>("text-white");

  const [isLoadingFeatured, setIsLoadingFeatured] = useState(true);
  const [liquidGlassEnabled, setLiquidGlassEnabled] = useState(() => localStorage.getItem("ibrastream_desktop_hero_glass") !== "off");
  const fetchFeaturedContent = async () => {
    try {
      const { data, error } = await supabase.from("featured_content").select("*").abortSignal(AbortSignal.timeout(10_000));
      if (error) throw error;
      if (data) {
        const songsEntry = data.find((item: any) => item.type === "songs");
        setFeaturedSongs(songsEntry ? songsEntry.tracks : []);
        setFeaturedPlaylists(data.filter((item: any) => item.type === "playlist"));

        const heroEntry = data.find((item: any) => item.type === "hero_banner");
        if (heroEntry) {
          setHeroTitle(heroEntry.name || "bla bla car");
          setHeroSubtitle(heroEntry.pfp || "Brrrrrr");
          if (heroEntry.tracks && !Array.isArray(heroEntry.tracks)) {
            const meta = heroEntry.tracks as any;
            if (meta.description) setHeroDescription(meta.description);
            if (meta.bgGradient) setHeroBgGradient(meta.bgGradient);
            if (meta.textColor) setHeroTextColor(meta.textColor);
          } else if (Array.isArray(heroEntry.tracks) && heroEntry.tracks.length > 0) {
            const meta = heroEntry.tracks[0] as any;
            if (meta) {
              if (meta.description) setHeroDescription(meta.description);
              if (meta.bgGradient) setHeroBgGradient(meta.bgGradient);
              if (meta.textColor) setHeroTextColor(meta.textColor);
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch featured content:", err);
    } finally {
      setIsLoadingFeatured(false);
    }
  };

  useEffect(() => { void fetchFeaturedContent(); }, []);

  const handleSaveFeaturedSongs = async (tracks: Track[]) => {
    try {
      const { data, error: selectError } = await supabase
        .from("featured_content")
        .select("id")
        .eq("type", "songs")
        .maybeSingle();
      
      if (selectError) throw selectError;

      if (data) {
        const { error } = await supabase
          .from("featured_content")
          .update({ tracks })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("featured_content")
          .insert({ type: "songs", name: "Featured Songs", tracks });
        if (error) throw error;
      }
      showToast("Featured songs updated successfully!", "success");
      fetchFeaturedContent();
    } catch (err: any) {
      console.error(err);
      showToast("Failed to save featured songs: " + err.message, "error");
    }
  };

  const handleCreateFeaturedPlaylist = async () => {
    if (!newAdminPlName.trim()) {
      showToast("Playlist name is required", "error");
      return;
    }
    try {
      const { error } = await supabase
        .from("featured_content")
        .insert({
          type: "playlist",
          name: newAdminPlName.trim(),
          pfp: newAdminPlPfp || null,
          tracks: newAdminPlTracks
        });
      
      if (error) throw error;
      showToast(`Featured playlist "${newAdminPlName}" created!`, "success");
      setNewAdminPlName("");
      setNewAdminPlPfp("");
      setNewAdminPlTracks([]);
      fetchFeaturedContent();
    } catch (err: any) {
      console.error(err);
      showToast("Failed to create playlist: " + err.message, "error");
    }
  };

  const handleSaveHeroBanner = async (title: string, subtitle: string, description: string, bgGradient: string, textColor: string) => {
    try {
      const { data, error: selectError } = await supabase
        .from("featured_content")
        .select("id")
        .eq("type", "hero_banner")
        .maybeSingle();
      
      if (selectError) throw selectError;

      const payload = {
        type: "hero_banner",
        name: title,
        pfp: subtitle,
        tracks: [{ description, bgGradient, textColor }]
      };

      if (data) {
        const { error } = await supabase
          .from("featured_content")
          .update(payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("featured_content")
          .insert(payload);
        if (error) throw error;
      }
      showToast("Hero banner updated successfully!", "success");
      fetchFeaturedContent();
    } catch (err: any) {
      console.error(err);
      showToast("Failed to save hero banner: " + err.message, "error");
    }
  };

  // Auth and Sync state
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [isAuthModalForced, setIsAuthModalForced] = useState<boolean>(false);
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authIsSignUp, setAuthIsSignUp] = useState<boolean>(false);
  const [authRecovery, setAuthRecovery] = useState(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearGuestData = () => {
    // Reset all local user states
    setPlaylists([]);
    setSavedAlbums([]);
    setDeletedPlaylists([]);
    void StorageService.removeItem("ibrastream_saved_albums");
    void StorageService.removeItem("ibrastream_playlist_trash");
    setFavorites([]);
    setListenLater([]);
    setShowListenLater(false);
    setFollowedArtists([]);
    setRecentlyPlayed([]);
    setUsername("Guest");
    setPfp("");
    setSelectedPlaylist(null);
    setSelectedAlbum(null);
    setSelectedArtist(null);
    setPreviousArtist(null);
    
    // Reset theme settings to default
    setThemeSettings({ theme: "dark", corners: "rounded", bgColor: "", bgImage: "" });
    setIsAuthModalForced(false);
    
    // Clear playback queue
    clearQueue();

    // Clear all associated localStorage items
    const keysToClear = [
      "ibrastream_playlists",
      "ibrastream_favorites",
      "ibrastream_followed_artists",
      "ibrastream_username",
      "ibrastream_pfp",
      "ibrastream_recently_played",
      "ibrastream_recently_played_items",
      "ibrastream_theme_settings",
      "ibrastream_playing_playlist_id",
      "ibrastream_queue",
      "ibrastream_original_queue",
      "ibrastream_current_index",
      "ibrastream_current_track",
      "ibrastream_guest_tracks_played"
    ];
    keysToClear.forEach(key => { void StorageService.removeItem(key); });
  };

  // Listen to forced login requests
  useEffect(() => {
    const handleForceLogin = () => {
      setIsAuthModalForced(true);
      setAuthIsSignUp(true);
      setShowAuthModal(true);
    };
    window.addEventListener("ibrastream_force_login", handleForceLogin);
    return () => window.removeEventListener("ibrastream_force_login", handleForceLogin);
  }, []);

  // Clear guest limits on login
  useEffect(() => {
    if (user) {
      setIsAuthModalForced(false);
      localStorage.removeItem("ibrastream_guest_tracks_played");
    }
  }, [user]);



  // Reset import error when modal or tab changes
  useEffect(() => {
    setImportFileError(null);
    setImportPreview(null);
  }, [showSpotifyImportModal, importTab]);

  // Reset sub-search filter and sorting when switching tabs, playlists, albums, or artists
  useEffect(() => {
    setSubSearchQuery("");
    setSortField(null);
    setSortDirection("asc");
    setVisiblePlaylistCount(30);
    setVisibleFavoritesCount(30);
  }, [activeTab, selectedPlaylist, selectedAlbum, selectedArtist]);

  // Reset scroll to top on tab/view changes
  useEffect(() => {
    if (mainContentRef.current) {
      mainContentRef.current.scrollTop = activeTab === "search" && !selectedPlaylist && !selectedAlbum && !selectedArtist ? searchScrollTop.current : 0;
    }
  }, [activeTab, selectedPlaylist, selectedAlbum, selectedArtist]);

  useEffect(() => {
    setVisiblePlaylistCount(30);
    setVisibleFavoritesCount(30);
  }, [subSearchQuery, sortField, sortDirection]);

  // Intersection Observer for auto-loading songs gradually in playlists
  useEffect(() => {
    const el = playlistSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisiblePlaylistCount(prev => prev + 100);
      }
    }, { rootMargin: "800px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [playlistSentinelRef.current, playlistSentinelRef]);

  // Intersection Observer for auto-loading songs gradually in favorites
  useEffect(() => {
    const el = favoritesSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleFavoritesCount(prev => prev + 100);
      }
    }, { rootMargin: "800px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [favoritesSentinelRef.current, favoritesSentinelRef]);

  // Recommendation states
  const [hiddenTracks, setHiddenTracks] = useState<string[]>(() => StorageService.getItemSync<string[]>("ibrastream_hidden_recommendations") ?? []);
  const [mutedArtists, setMutedArtists] = useState<string[]>(() => StorageService.getItemSync<string[]>("ibrastream_muted_recommendations") ?? []);
  const [radioSeeds, setRadioSeeds] = useState<Track[]>(() => StorageService.getItemSync<Track[]>("ibrastream_radio_seeds") ?? []);
  const [homeRecommendations, setHomeRecommendations] = useState<Track[]>([]);
  const [isRefreshingHome, setIsRefreshingHome] = useState(false);
  const homeRequest = useRef<{ key: string; pending: boolean; at: number } | null>(null);
  const playlistTrackKeys = React.useMemo(() => new Set(playlists.flatMap(playlist => playlist.tracks.map(trackTitleArtistKey))), [playlists]);

  const [searchRecommendations, setSearchRecommendations] = useState<Track[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);




  const getSpotifyRedirectUri = () => {
    const origin = window.location.origin;
    if (origin.includes("localhost")) {
      return origin.replace("localhost", "127.0.0.1");
    }
    return origin;
  };

  // Handle Spotify redirect on mount and silent refresh
  useEffect(() => {
    const handleAuth = async () => {
      // 1. Check for PKCE query callback
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const state = searchParams.get("state");

      if (code) {
        const savedState = localStorage.getItem("ibrastream_spotify_auth_state");
        localStorage.removeItem("ibrastream_spotify_auth_state");
        if (state && state === savedState) {
          try {
            const { exchangeCodeForToken } = await import("./services/spotifyImporter");
            const token = await exchangeCodeForToken(code, spotifyClientId, getSpotifyRedirectUri());
            setSpotifyTokenState(token);
            window.history.replaceState(null, "", window.location.pathname + window.location.hash);
            showToast("Connected to Spotify successfully! Unlimited imports active.", "success");
            setActiveTab("playlists");
            setShowSpotifyImportModal(true);
            return;
          } catch (err: any) {
            console.error("Token exchange failed:", err);
            showToast(`Failed to connect with Spotify: ${err.message}`, "error");
          }
        }
      }

      // 2. Check for hash fallback (Implicit grant)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1)); // strip '#'
        const token = params.get("access_token");
        if (token) {
          localStorage.setItem("ibrastream_spotify_token", token);
          setSpotifyTokenState(token);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          showToast("Connected to Spotify successfully! Unlimited imports active.", "success");
          setActiveTab("playlists");
          setShowSpotifyImportModal(true);
          return;
        }
      }

      // 3. Silent refresh if expired or near expiry
      const expiry = Number(localStorage.getItem("ibrastream_spotify_token_expiry"));
      const rToken = localStorage.getItem("ibrastream_spotify_refresh_token");
      if (rToken && (!expiry || Date.now() > expiry - 60000)) {
        try {
          const { refreshSpotifyToken } = await import("./services/spotifyImporter");
          const token = await refreshSpotifyToken(rToken, spotifyClientId);
          setSpotifyTokenState(token);
        } catch (err) {
          console.warn("Silent refresh failed:", err);
          localStorage.removeItem("ibrastream_spotify_token");
          localStorage.removeItem("ibrastream_spotify_token_expiry");
          localStorage.removeItem("ibrastream_spotify_refresh_token");
          setSpotifyTokenState(null);
        }
      }
    };

    handleAuth();
  }, [spotifyClientId]);

  const savePlaylists = (updated: Playlist[]) => {
    const previous = new Map(playlists.map(list => [list.id, list]));
    const now = new Date().toISOString();
    const dated = updated.map(list => {
      const before = previous.get(list.id);
      return before ? equalLibraryData(before, list) ? before : { ...list, modifiedAt: now }
        : { ...list, createdAt: list.createdAt ?? now, modifiedAt: now };
    });
    setPlaylists(dated);
    StorageService.setItemSync("ibrastream_playlists", dated);
  };

  const handleCreatePlaylist = (name: string) => {
    if (!name.trim()) return;
    const newPlaylist: Playlist = {
      id: String(Date.now()),
      name: name.trim(),
      tracks: saveQueueMode 
        ? queue.filter((track, index) => includeCurrentInQueue || index !== 0 || track.id !== currentTrack?.id)
        : (trackPendingNewPlaylist ? [trackPendingNewPlaylist] : [])
    };
    const updated = [...playlists, newPlaylist];
    savePlaylists(updated);
    setNewPlaylistName("");
    setShowPlaylistCreateModal(false);
    setSaveQueueMode(false);
    setTrackPendingNewPlaylist(null);
    showToast(`Created playlist "${newPlaylist.name}"`, "success");
  };

  const handleAddPlaylistToLibrary = (playlistToAdd: Playlist) => {
    if (!user) {
      showToast("Please login to add playlists to library", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    const newPlaylist: Playlist = {
      id: String(Date.now()) + "_" + Math.random().toString(36).substr(2, 9),
      name: playlistToAdd.name,
      tracks: playlistToAdd.tracks || [],
      coverUrl: playlistToAdd.coverUrl,
      coverFit: playlistToAdd.coverFit,
      isPublic: false
    };
    const updated = [...playlists, newPlaylist];
    savePlaylists(updated);
    showToast(`Added "${playlistToAdd.name}" to your library!`, "success");
  };


  const handleImportSpotify = async (link: string) => {
    if (!link.trim()) return;
    setIsImportingSpotify(true);
    try {
      const { importSpotifyPlaylist, importSpotifyPlaylistWithToken } = await import("./services/spotifyImporter");
      let name = "";
      let tracks: Track[] = [];

      if (spotifyToken) {
        try {
          const res = await importSpotifyPlaylistWithToken(link, spotifyToken);
          name = res.name;
          tracks = res.tracks;
        } catch (authErr: any) {
          console.warn("Spotify auth import failed, falling back to guest import...", authErr);
          showToast(`Auth import failed: ${authErr.message || authErr}. Using guest mode (100 tracks max).`, "error");
          // If token expired/invalid, try guest mode
          const res = await importSpotifyPlaylist(link);
          name = res.name;
          tracks = res.tracks;
        }
      } else {
        const res = await importSpotifyPlaylist(link);
        name = res.name;
        tracks = res.tracks;
      }

      setImportPreview({ id: crypto.randomUUID(), name, tracks });

    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to import Spotify playlist.", "error");
    } finally {
      setIsImportingSpotify(false);
    }
  };

  const handleImportM3U = async (fileName: string, content: string) => {
    if (!content.trim()) {
      setImportFileError("The file is empty.");
      return;
    }
    const isBinary = content.includes('\u0000') || /[\x00-\x08\x0E-\x1F\x7F]/.test(content);
    if (isBinary) {
      setImportFileError("The uploaded file is a binary file and cannot be read as text.");
      return;
    }
    setIsImportingSpotify(true);
    setImportFileError(null);
    const controller = new AbortController();
    importAbort.current = controller;
    setImportProgress(null);
    try {
      const { importM3UPlaylist } = await import("./services/spotifyImporter");
      const defaultName = fileName.replace(/\.[^/.]+$/, ""); // Strip file extension
      const { name, tracks } = parsePlaylistBackup(content) ?? await importM3UPlaylist(defaultName, content, {
        signal: controller.signal,
        onProgress: (done, total) => setImportProgress({ done, total }),
      });

      if (!tracks || tracks.length === 0) {
        throw new Error("No tracks could be parsed. Make sure the file format is valid (e.g. M3U, CSV, JSON).");
      }

      setImportPreview({ id: crypto.randomUUID(), name, tracks });
    } catch (err: any) {
      console.error(err);
      if (!controller.signal.aborted) setImportFileError(err.message || "No se pudo importar el archivo.");
    } finally {
      importAbort.current = null;
      setImportProgress(null);
      setIsImportingSpotify(false);
    }
  };

  function setTrash(items: Playlist[]) {
    setDeletedPlaylists(items);
    StorageService.setItemSync("ibrastream_playlist_trash", items);
  }

  function restorePlaylist(playlist: Playlist) {
    if (playlists.some(item => item.id === playlist.id)) return;
    savePlaylists([...playlists, { ...playlist, isPublic: false }]);
    setTrash(deletedPlaylists.filter(item => item.id !== playlist.id));
    showToast("Lista restaurada.", "success");
  }

  function toggleSavedAlbum(album: Album) {
    const next = savedAlbums.some(item => item.id === album.id)
      ? savedAlbums.filter(item => item.id !== album.id) : [...savedAlbums, album];
    setSavedAlbums(next);
    StorageService.setItemSync("ibrastream_saved_albums", next);
  }

  const handleDeletePlaylist = (id: string) => {
    const removed = playlists.find(playlist => playlist.id === id);
    if (!removed) return;
    setTrash([removed, ...deletedPlaylists.filter(item => item.id !== id)]);
    const updated = playlists.filter(p => p.id !== id);
    savePlaylists(updated);
    if (selectedPlaylist?.id === id) {
      setSelectedPlaylist(null);
    }
    showToast("Lista movida a la papelera.", "info");
  };

  const handleRenamePlaylist = (id: string, newName: string) => {
    if (!newName.trim()) return;
    const updated = playlists.map(p => p.id === id ? { ...p, name: newName.trim() } : p);
    savePlaylists(updated);
    if (selectedPlaylist?.id === id) {
      setSelectedPlaylist(prev => prev ? { ...prev, name: newName.trim() } : null);
    }
    setEditingPlaylistId(null);
    setEditingPlaylistName("");
    showToast("Renamed playlist", "success");
  };

  const handleUpdatePlaylistCover = (id: string, coverUrl: string) => {
    const updated = playlists.map(p => p.id === id ? { ...p, coverUrl } : p);
    savePlaylists(updated);
    if (selectedPlaylist?.id === id) {
      setSelectedPlaylist(prev => prev ? { ...prev, coverUrl } : null);
    }
    showToast("Playlist cover updated", "success");
  };

  const openPlaylistCoverPicker = () => document.getElementById("playlist-cover-upload")?.click();

  const handlePlaylistCoverFit = (id: string, coverFit: PlaylistCoverFit) => {
    savePlaylists(playlists.map(playlist => playlist.id === id ? { ...playlist, coverFit } : playlist));
    setSelectedPlaylist(playlist => playlist?.id === id ? { ...playlist, coverFit } : playlist);
  };

  const handleSaveAlbumAsPlaylist = async (album: Album, tracks: Track[]) => {
    let tracksToSave = tracks;
    if (!tracksToSave || tracksToSave.length === 0) {
      try {
        tracksToSave = await getAlbumTracks(album.id, album.provider);
        if (tracksToSave.length > 0) setAlbumTracks(tracksToSave);
      } catch (e) {
        console.warn("Failed to fetch album tracks:", e);
      }
    }
    if (!tracksToSave || tracksToSave.length === 0) {
      showToast("This album has no songs to save", "info");
      return;
    }
    const newPlaylist: Playlist = {
      id: "pl-" + Date.now(),
      name: album.title,
      tracks: tracksToSave.map((t) => ({ ...t, dateAdded: new Date().toISOString() })),
      coverUrl: album.thumbnail
    };
    const updated = [...playlists, newPlaylist];
    savePlaylists(updated);
    showToast(`Album saved as playlist "${album.title}"`, "success");
  };

  const handleAddAlbumTracksToPlaylist = async (playlistId: string, album: Album, tracks: Track[]) => {
    let tracksToAdd = tracks;
    if (!tracksToAdd || tracksToAdd.length === 0) {
      try {
        tracksToAdd = await getAlbumTracks(album.id, album.provider);
        if (tracksToAdd.length > 0) setAlbumTracks(tracksToAdd);
      } catch (e) {
        console.warn("Failed to fetch album tracks:", e);
      }
    }
    if (!tracksToAdd || tracksToAdd.length === 0) {
      showToast("No tracks to add", "info");
      return;
    }
    const target = playlists.find((p) => p.id === playlistId);
    if (!target) return;

    const existingIds = new Set(target.tracks.map((t) => t.id));
    const newTracks = tracksToAdd
      .filter((t) => !existingIds.has(t.id))
      .map((t) => ({ ...t, dateAdded: new Date().toISOString() }));

    if (newTracks.length === 0) {
      showToast(`All tracks from this album are already in "${target.name}"`, "info");
      return;
    }

    const updated = playlists.map((p) => {
      if (p.id === playlistId) {
        return {
          ...p,
          tracks: [...p.tracks, ...newTracks],
          coverUrl: p.coverUrl || album.thumbnail
        };
      }
      return p;
    });

    savePlaylists(updated);
    showToast(`Added ${newTracks.length} songs from "${album.title}" to "${target.name}"`, "success");
    setAlbumToAddToPlaylist(null);
  };

    const handleAddTrackToPlaylist = (playlistId: string, track: Track) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        if (p.tracks.some(t => t.id === track.id)) {
          showToast(`"${track.title}" is already in "${p.name}"`, "info");
          return p;
        }
        showToast(`Added "${track.title}" to "${p.name}"`, "success");
        return { ...p, tracks: [...p.tracks, { ...track, dateAdded: new Date().toISOString() }] };
      }
      return p;
    });
    savePlaylists(updated);
    setTrackToAddToPlaylist(null);
  };

  const handleToggleTrackPlaylist = (playlistId: string, track: Track) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        const exists = p.tracks.some(t => t.id === track.id);
        if (exists) {
          showToast(`Removed "${track.title}" from "${p.name}"`, "info");
          return { ...p, tracks: p.tracks.filter(t => t.id !== track.id) };
        } else {
          showToast(`Added "${track.title}" to "${p.name}"`, "success");
          return { ...p, tracks: [...p.tracks, { ...track, dateAdded: new Date().toISOString() }] };
        }
      }
      return p;
    });
    savePlaylists(updated);
    if (selectedPlaylist && selectedPlaylist.id === playlistId) {
      const updatedSel = updated.find(p => p.id === playlistId) || null;
      setSelectedPlaylist(updatedSel);
    }
  };

  function reorderPlaylistTracks(source: Playlist, from: number, to: number) {
    if (from === to || !source.tracks[from] || !source.tracks[to]) return;
    const tracks = [...source.tracks];
    const [track] = tracks.splice(from, 1);
    tracks.splice(to, 0, track);
    const updated = { ...source, tracks };
    savePlaylists(playlists.map(list => list.id === source.id ? updated : list));
    setSelectedPlaylist(updated);
  }

  const handleSort = (field: "title" | "album" | "dateAdded" | "duration") => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleRemoveTrackFromPlaylist = (playlistId: string, trackId: string) => {
    const updated = playlists.map(p => {
      if (p.id === playlistId) {
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
      }
      return p;
    });
    savePlaylists(updated);
    const updatedSel = updated.find(p => p.id === playlistId) || null;
    setSelectedPlaylist(updatedSel);
    showToast(localized(language, "Canción quitada de la playlist", "Removed track from playlist", "Abestia zerrendatik kendu da"), "info");
  };

  // Bulk action handlers
  const handleBulkAddToFavorites = (tracks: Track[]) => {
    const toAdd = tracks.filter(t => !favorites.some(f => f.id === t.id));
    if (toAdd.length === 0) {
      showToast(localized(language, "Las canciones seleccionadas ya están en favoritos", "All selected tracks are already in favorites", "Hautatutako abestiak gogokoetan daude dagoeneko"), "info");
    } else {
      const updated = [...favorites, ...toAdd];
      setFavorites(updated);
      localStorage.setItem("ibrastream_favorites", JSON.stringify(updated));
      showToast(`Added ${toAdd.length} track${toAdd.length > 1 ? "s" : ""} to Favorites`, "success");
    }
    clearSelection();
  };

  const handleBulkAddToPlaylist = (playlistId: string, tracks: Track[]) => {
    const updated = playlists.map(p => {
      if (p.id !== playlistId) return p;
      const existing = new Set(p.tracks.map(t => t.id));
      const newTracks = tracks
        .filter(t => !existing.has(t.id))
        .map(t => ({ ...t, dateAdded: new Date().toISOString() }));
      if (newTracks.length === 0) {
        showToast(localized(language, "Las canciones seleccionadas ya están en esta playlist", "All selected tracks are already in this playlist", "Hautatutako abestiak zerrenda honetan daude dagoeneko"), "info");
        return p;
      }
      showToast(`Added ${newTracks.length} track${newTracks.length > 1 ? "s" : ""} to "${p.name}"`, "success");
      return { ...p, tracks: [...p.tracks, ...newTracks] };
    });
    savePlaylists(updated);
    clearSelection();
    setShowBulkPlaylistPicker(false);
  };

  function changePlaylistSelection(source: Playlist, indices: Set<number>, destinationId = "") {
    const destination = playlists.find(item => item.id === destinationId && item.id !== source.id);
    const picked = source.tracks.filter((_, index) => indices.has(index));
    if (!picked.length || (destinationId && !destination)) return;
    const before = destination ? [source, destination] : [source];
    const after = [{ ...source, tracks: source.tracks.filter((_, index) => !indices.has(index)) }];
    if (destination) {
      const keys = new Set(destination.tracks.map(trackTitleArtistKey));
      const added = picked.filter(track => {
        const key = trackTitleArtistKey(track);
        if (keys.has(key)) return false;
        keys.add(key);
        return true;
      });
      after.push({ ...destination, tracks: [...destination.tracks, ...added] });
    }
    savePlaylists(playlists.map(item => after.find(updated => updated.id === item.id) ?? item));
    setSelectedPlaylist(after[0]);
    setPlaylistUndo({ before, after });
    setDuplicateSelection(null);
    clearSelection();
    setShowBulkPlaylistPicker(false);
    showToast(destination ? "Canciones movidas." : "Canciones quitadas.", "success");
  }

  function undoPlaylistChange() {
    if (!playlistUndo) return;
    const current = latestLibrary.current.playlists;
    setPlaylistUndo(null);
    if (!playlistUndo.after.every(item => equalLibraryData(current.find(list => list.id === item.id)?.tracks, item.tracks))) {
      showToast("La playlist cambió después de esta acción.", "info");
      return;
    }
    const restored = current.map(item => {
      const before = playlistUndo.before.find(list => list.id === item.id);
      return before ? { ...item, tracks: before.tracks } : item;
    });
    savePlaylists(restored);
    if (selectedPlaylist) setSelectedPlaylist(restored.find(item => item.id === selectedPlaylist.id) ?? selectedPlaylist);
    showToast("Cambio deshecho.", "success");
  }

  function duplicateIndices(tracks: Track[]) {
    const seen = new Set<string>();
    return tracks.flatMap((track, index) => {
      const key = trackTitleArtistKey(track);
      if (seen.has(key)) return [index];
      seen.add(key);
      return [];
    });
  }

  const handleBulkRemoveFromFavorites = (trackIds: string[]) => {
    const idSet = new Set(trackIds);
    const updated = favorites.filter(t => !idSet.has(t.id));
    setFavorites(updated);
    localStorage.setItem("ibrastream_favorites", JSON.stringify(updated));
    showToast(`Removed ${trackIds.length} track${trackIds.length > 1 ? "s" : ""} from Favorites`, "info");
    clearSelection();
  };

  const refreshHomeRecs = async (force = false) => {
    if (privateSession || !navigator.onLine) return;

    const recent = listeningEntries.slice(-50).reverse().map(entry => entry.track);
    const legacy = recent.length === 0 && StorageService.getItemSync<Track[]>("ibrastream_recently_played");
    const seeds = recent.length > 0 ? recent : Array.isArray(legacy) && legacy.length > 0
      ? legacy.filter(track => track?.title && track.artist).slice(0, 50)
      : [...radioSeeds, ...favorites].slice(0, 50);
    const key = JSON.stringify(seeds.map(track => track.id));
    const previous = homeRequest.current;
    if (previous?.key === key && (previous.pending || (!force && Date.now() - previous.at < 120000))) return;

    const request = { key, pending: true, at: Date.now() };
    homeRequest.current = request;
    setIsRefreshingHome(true);
    try {
      const [recommendations, trending] = await Promise.all([
        getHomeRecommendations(seeds, playlistTrackKeys),
        getTrendingRecommendations(favorites, seeds),
      ]);
      if (homeRequest.current !== request) return;
      setHomeRecommendations(recommendations);
      setTrendingTracks(trending);
      request.at = Date.now();
    } catch (error) {
      console.error("Failed to load home recommendations", error);
      request.at = 0;
    } finally {
      if (homeRequest.current === request) {
        request.pending = false;
        setIsRefreshingHome(false);
      }
    }
  };

  useEffect(() => {
    if (activeTab === "home" && !selectedArtist && !selectedAlbum && !selectedPlaylist) {
      void refreshHomeRecs();
    }
  }, [activeTab, selectedArtist, selectedAlbum, selectedPlaylist, listeningEntries, privateSession]);

  // Run initial search

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates().then((info) => {
      if (info && info.hasUpdate) {
        const dismissed = sessionStorage.getItem(`ibrastream_dismissed_update_${info.latestVersion}`);
        if (!dismissed) {
          setUpdateInfo(info);
          setShowUpdateModal(true);
        }
      }
    });
    startAutoUpdatePolling(30);
  }, []);

  useEffect(() => {
    let token = 0;
    function applyRoute() {
      const request = ++token;
      const params = new URLSearchParams(window.location.search);
      const trackId = params.get("track");
      setShareToken(params.get("share"));
      if (params.has("share")) return;
      const media = readMediaRoute(params);
      if (trackId) {
        const seconds = Math.max(0, Math.min(86400, Number(params.get("t")) || 0));
        void resolveSharedTrack(trackId, params.get("title") ?? undefined, params.get("artistName") ?? undefined).then(track => {
          if (request !== token) return;
          if (!track) throw new Error("Pista no disponible");
          setSharedTrack({ track, seconds });
          navigateTab("search", false);
        }).catch(() => {
          if (request === token) showToast(localized(language, "No se pudo abrir la canción compartida.", "Couldn't open the shared song.", "Ezin izan da partekatutako abestia ireki."), "error");
        });
      } else {
        setSharedTrack(null);
        if (media.album) void handleOpenAlbum(media.album, false);
        else if (media.artist) void handleOpenArtist(media.artist, false);
        else if (!params.has("playlistId") && !params.has("playlist") && !params.has("room")) {
          const tab = params.get("view");
          if (tab && (TAB_ORDER.includes(tab) || tab === "admin" || tab === "visuals")) navigateTab(tab, false);
          else if (request > 1) navigateTab("home", false);
        }
      }
    }
    applyRoute();
    window.addEventListener("popstate", applyRoute);
    return () => {
      token++;
      window.removeEventListener("popstate", applyRoute);
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("room");
    if (!code) return;
    const expiresAt = Number(url.searchParams.get("exp"));
    if (expiresAt && expiresAt < Date.now()) {
      showToast("La invitación a esta sala ha caducado.", "error");
      return;
    }
    if (!user?.id) {
      setShowAuthModal(true);
      return;
    }
    joinRoom(code);
    url.searchParams.delete("room");
    url.searchParams.delete("exp");
    window.history.replaceState(null, "", url);
  }, [user?.id]);

  // INITIAL_SESSION may contain no account. Preserve the guest library in that case.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "PASSWORD_RECOVERY") {
        setAuthRecovery(true);
        setShowAuthModal(true);
      }
      if (event === "SIGNED_OUT") clearGuestData();
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close account dropdown when user logs out
  useEffect(() => {
    if (!user) {
      setShowAccountDropdown(false);
    }
  }, [user]);

  const latestLibrary = useRef<Library>({ favorites, playlists, followedArtists, themeSettings, accumulatedStats, savedAlbums, deletedPlaylists, listenLater });
  const cloudInFlight = useRef<Promise<unknown> | null>(null);
  const userId = user?.id as string | undefined;
  useEffect(() => {
    latestLibrary.current = { favorites, playlists, followedArtists, themeSettings, accumulatedStats, savedAlbums, deletedPlaylists, listenLater };
  }, [favorites, playlists, followedArtists, themeSettings, accumulatedStats, savedAlbums, deletedPlaylists, listenLater]);

  useEffect(() => {
    const retry = () => setSyncAttempt(attempt => attempt + 1);
    const offline = () => setSyncState("offline");
    window.addEventListener("offline", offline);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    if (!navigator.onLine) { setSyncState("offline"); return; }
    let cancelled = false;
    const key = "ibrastream_cloud_base_" + userId;
    if (!equalLibraryData(StorageService.getItemSync<Library>(key), latestLibrary.current)) setSyncState("pending");
    const timer = window.setTimeout(() => {
      const previous = cloudInFlight.current;
      const work = (async () => {
        if (previous) await previous;
        if (cancelled) return;
        try {
          const observed = structuredClone(latestLibrary.current);
          const mirror = await StorageService.getItem<Library>(key) ?? {};
          const pending = await StorageService.getItem<Library>("ibrastream_cloud_pending_" + userId);
          const captured = pending ? mergeLibrary({}, observed, pending) : observed;
          if (cancelled) return;
          if (!navigator.onLine) { setSyncState("offline"); return; }
          setSyncState("syncing");
          const synced = await syncLibrary(userId, captured, mirror);
          if (cancelled && userId !== (await supabase.auth.getSession()).data.session?.user.id) return;
          if (!equalLibraryData(mirror, synced)) await StorageService.setItem(key, synced);
          if (pending) await StorageService.removeItem("ibrastream_cloud_pending_" + userId);
          const current = latestLibrary.current;
          const next = mergeLibrary(observed, current, synced);
          latestLibrary.current = next;
          if (next.listenLater && !equalLibraryData(next.listenLater, current.listenLater)) setListenLater(next.listenLater);
          if (!equalLibraryData(next.favorites, current.favorites)) {
            setFavorites(next.favorites);
            StorageService.setItemSync("ibrastream_favorites", next.favorites);
          }
          if (!equalLibraryData(next.playlists, current.playlists)) {
            setPlaylists(next.playlists);
            StorageService.setItemSync("ibrastream_playlists", next.playlists);
          }
          if (next.savedAlbums && !equalLibraryData(next.savedAlbums, current.savedAlbums)) {
            setSavedAlbums(next.savedAlbums);
            StorageService.setItemSync("ibrastream_saved_albums", next.savedAlbums);
          }
          if (next.deletedPlaylists && !equalLibraryData(next.deletedPlaylists, current.deletedPlaylists)) setTrash(next.deletedPlaylists);
          if (!equalLibraryData(next.followedArtists, current.followedArtists)) saveFollowedArtists(next.followedArtists);
          if (!equalLibraryData(next.themeSettings, current.themeSettings)) setThemeSettings(next.themeSettings);
          if (!equalLibraryData(next.accumulatedStats, current.accumulatedStats)) setAccumulatedStats(next.accumulatedStats);
          if (!cancelled) {
            setSyncError("");
            setSyncState(equalLibraryData(next, synced) ? "saved" : "pending");
          }
        } catch (error) {
          if (cancelled) return;
          const code = (error as { code?: string } | null)?.code;
          setSyncError(!navigator.onLine ? localized(language, "Sin conexión a internet.", "No internet connection.", "Interneteko konexiorik gabe.")
            : code === "42501" ? localized(language, "Supabase denegó el acceso a tu biblioteca.", "Supabase denied access to your library.", "Supabasek liburutegirako sarbidea ukatu du.")
            : code === "PGRST301" || code === "PGRST303" ? localized(language, "La sesión ha caducado. Vuelve a iniciar sesión.", "Your session expired. Sign in again.", "Saioa iraungi da. Hasi saioa berriro.")
            : error instanceof Error && error.message.startsWith("La biblioteca") ? error.message
            : localized(language, "No se pudo completar la sincronización con Supabase.", "Couldn't finish syncing with Supabase.", "Ezin izan da Supabaseko sinkronizazioa osatu."));
          if (code) console.warn("Cloud sync failed:", code);
          setSyncState(navigator.onLine ? "error" : "offline");
        }
      })();
      cloudInFlight.current = work;
      void work.finally(() => {
        if (cloudInFlight.current === work) cloudInFlight.current = null;
      });
    }, 900);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, favorites, playlists, followedArtists, themeSettings, accumulatedStats, savedAlbums, deletedPlaylists, listenLater, syncAttempt]);

  const rankingPreference = (user?.user_metadata?.ranking as "public" | "anonymous" | undefined) ?? "off";
  const [rankingBusy, setRankingBusy] = useState(false);

  async function changeRanking(preference: "public" | "anonymous" | "off") {
    if (!userId || rankingBusy) return;
    setRankingBusy(true);
    try {
      const update = await supabase.auth.updateUser({ data: { ranking: preference } });
      if (update.error) throw update.error;
      if (preference === "off") {
        const result = await supabase.from("user_monthly_stats").delete().eq("user_id", userId);
        if (result.error) throw result.error;
      }
      showToast("Preferencia de clasificación guardada.", "success");
    } catch {
      showToast("No se pudo completar el cambio de clasificación.", "error");
    } finally {
      setRankingBusy(false);
    }
  }

  useEffect(() => {
    if (!userId || rankingPreference === "off" || privateSession || !listeningEntries.length) return;
    const month = localDate(new Date()).slice(0, 7);
    const stats = statsFor(listeningEntries.filter(entry => localDate(new Date(entry.at)).startsWith(month)));
    const timer = window.setTimeout(() => {
      void supabase.from("user_monthly_stats").upsert({
        user_id: userId,
        month,
        username: rankingPreference === "anonymous" ? "Oyente anónimo" : username,
        avatar_url: rankingPreference === "anonymous" ? "" : pfp,
        minutes: Math.floor(stats.totalSeconds / 60),
        top_tracks: [],
        top_artists: [],
        updated_at: new Date().toISOString(),
      }).then(({ error }) => { if (error) console.warn("No se pudo sincronizar la clasificación."); });
    }, 1500);
    return () => clearTimeout(timer);
  }, [userId, rankingPreference, privateSession, listeningEntries, username, pfp]);

  // Synchronize public_playlists to Supabase when playlists change
  useEffect(() => {
    if (!user) return;

    const syncPublicPlaylists = async () => {
      try {
        const localPublicPlaylists = playlists.filter(p => p.isPublic);

        const { data: dbPlaylists, error } = await supabase
          .from("public_playlists")
          .select("playlist_id")
          .eq("user_id", user.id);

        if (error) {
          console.error("Failed to fetch public playlists from DB:", error);
          return;
        }

        const dbPlaylistIds = (dbPlaylists || []).map((p: any) => p.playlist_id);
        const localPublicIds = localPublicPlaylists.map(p => p.id);

        const toDeleteIds = dbPlaylistIds.filter(id => !localPublicIds.includes(id));
        if (toDeleteIds.length > 0) {
          await supabase
            .from("public_playlists")
            .delete()
            .eq("user_id", user.id)
            .in("playlist_id", toDeleteIds);
        }

        const usernameVal = user.user_metadata?.username || user.email?.split("@")[0] || "User";
        for (const lp of localPublicPlaylists) {
          await supabase
            .from("public_playlists")
            .upsert({
              playlist_id: lp.id,
              user_id: user.id,
              name: lp.name,
              tracks: shareableTracks(lp.tracks),
              cover_url: lp.coverUrl || "",
              username: usernameVal,
              updated_at: new Date().toISOString()
            });
        }
      } catch (err) {
        console.error("Error syncing public playlists:", err);
      }
    };

    const timer = setTimeout(() => {
      syncPublicPlaylists();
    }, 2500);

    return () => clearTimeout(timer);
  }, [playlists, user]);

  // Load shared playlist from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedPlaylistId = params.get("playlistId") || params.get("playlist");
    if (sharedPlaylistId) {
      const fetchSharedPlaylist = async () => {
        try {
          const { data, error } = await supabase
            .from("public_playlists")
            .select("*")
            .eq("playlist_id", sharedPlaylistId)
            .abortSignal(AbortSignal.timeout(10_000))
            .single();

          if (error) {
            showToast(localized(language, "No se pudo cargar la playlist compartida", "Failed to load shared playlist", "Ezin izan da partekatutako zerrenda kargatu"), "error");
            console.error(error);
            return;
          }

          if (data) {
            const sharedPlaylist: Playlist = {
              id: data.playlist_id,
              name: data.name,
              tracks: data.tracks || [],
              coverUrl: data.cover_url,
              isPublic: true
            };
            setSelectedPlaylist(sharedPlaylist);
            setActiveTab("playlists");
            showToast(`Loaded shared playlist "${data.name}"`, "success");
          }
        } catch (err) {
          console.error("Error loading shared playlist:", err);
        } finally {
          setIsOpeningPublicPlaylist(false);
        }
      };

      fetchSharedPlaylist();
    }
  }, []);

  useEffect(() => {
    if (privateSession || !currentTrack || !playingPlaylistId) return;
    const playlist = playlists.find(item => item.id === playingPlaylistId);
    if (playlist && playlist.tracks.length) {
      addToRecentlyPlayed({ id: playlist.id, type: "playlist", name: playlist.name, coverUrl: playlist.coverUrl, tracks: playlist.tracks });
    } else if (selectedAlbum && albumTracks.length && playingPlaylistId === "album-" + selectedAlbum.id) {
      addToRecentlyPlayed({ id: selectedAlbum.id, type: "album", name: selectedAlbum.title,
        coverUrl: selectedAlbum.thumbnail, artistName: selectedAlbum.artist, tracks: albumTracks });
    }
  }, [playingPlaylistId, currentTrack?.id, privateSession]);

  const handleSignOut = async () => {
    try {
      if (cloudInFlight.current) await cloudInFlight.current.catch(() => {});
      if (userId) {
        const key = "ibrastream_cloud_base_" + userId;
        const base = await StorageService.getItem<Library>(key) ?? {};
        const captured = structuredClone(latestLibrary.current);
        if (!equalLibraryData(base, captured)) {
          await StorageService.setItem("ibrastream_cloud_pending_" + userId, captured);
        }
      }
      await signOut();
      showToast(localized(language, "Sesión cerrada", "Signed out successfully!", "Saioa itxi da"), "info");
    } catch (err: any) {
      showToast(`Sign out failed: ${err.message}`, "error");
    }
  };



  const handleToggleFavorite = (track: Track) => {
    let updated;
    if (favorites.some((t) => t.id === track.id)) {
      updated = favorites.filter((t) => t.id !== track.id);
    } else {
      updated = [...favorites, track];
    }
    setFavorites(updated);
    StorageService.setItemSync("ibrastream_favorites", updated);
  };

  function getPlaylistShareUrl(id: string) {
    return buildShareLink("playlistId", id).href;
  }

  const [copyNotice, setCopyNotice] = useState<number | null>(null);
  useEffect(() => {
    if (copyNotice === null) return;
    const timeout = window.setTimeout(() => setCopyNotice(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [copyNotice]);

  async function copyLink(url: URL | string) {
    try {
      await navigator.clipboard.writeText(String(url));
      setCopyNotice(performance.now());
    } catch {
      showToast(localized(language, "No se pudo copiar el enlace.", "Couldn't copy the link.", "Ezin izan da esteka kopiatu."), "error");
    }
  }

  function updateSearchQuery(value: string) {
    setSharedTrack(null);
    searchScrollTop.current = 0;
    setSearchQuery(value);
    setVisibleSearchTracks(30);
    searchRequest.current += 1;
    setIsSearching(false);
    setIsSearchingMore(false);
    setSearchError(false);
    setSearchResults([]);
    setSearchRecommendations([]);
    setAlbumResults([]);
    setArtistResults([]);
    setCommunityResults([]);
    setSubmittedQuery("");
  }

  async function handleSearch(query: string, type: typeof searchType = searchType) {
    const value = query.trim();
    if (!value) { updateSearchQuery(value); return; }
    const key = JSON.stringify([type, value]);
    if (searchPending.current?.key === key && searchPending.current.id === searchRequest.current) return;
    updateSearchQuery(value);
    const request = searchRequest.current;
    searchPending.current = { key, id: request };
    const beganAt = performance.now();
    const isCurrent = () => searchRequest.current === request;
    setSearchType(type);
    setSubmittedQuery(value);
    setIsSearching(true);
    saveSearchToHistory(value);

    if (type === "all") {
      setIsSearchingMore(true);
      void Promise.allSettled([
        searchAlbums(value).then(albums => { if (isCurrent()) setAlbumResults(albums); }),
        searchArtists(value).then(artists => { if (isCurrent()) setArtistResults(artists); }),
      ]).finally(() => { if (isCurrent()) setIsSearchingMore(false); });
    }

    try {
      if (type === "library") {
        const terms = normalizeSearch(value).split(/\s+/);
        const artistMatches = followedArtists.filter(artist => normalizeSearch(artist.name).includes(normalizeSearch(value)));
        if (isCurrent()) {
          setArtistResults(artistMatches);
          setAlbumResults(savedAlbums.filter(album => terms.every(term => normalizeSearch(album.title + " " + album.artist).includes(term))));
        }
        const tracks = [...favorites, ...playlists.flatMap(list => list.tracks), ...downloadService.listTracks()];
        const found = tracks.filter(track => {
          const text = normalizeSearch([track.title, track.artist, track.albumName].filter(Boolean).join(" "));
          return terms.every(term => text.includes(term));
        });
        if (isCurrent()) setSearchResults(rankTracks(found, value));
      } else if (type === "track" || type === "all") {
        let candidates = await searchTracks(value);
        const normalized = normalizeSearch(value);
        if (isCurrent() && !candidates.length && normalized !== value.toLowerCase() && !/^https?:/i.test(value)) candidates = await searchTracks(normalized);
        const results = rankTracks(candidates, value);
        if (!isCurrent()) return;
        setSearchResults(results);
        if (results.length) measure("search", performance.now() - beganAt);
        if (results.length && !privateSession && !/^https?:\/\//i.test(value)) {
          void getSearchRecommendations(value, results).then(tracks => {
            if (isCurrent()) setSearchRecommendations(tracks);
          }).catch(() => {});
        }
      } else if (type === "album") {
        const results = await searchAlbums(value);
        if (isCurrent()) setAlbumResults(results);
      } else if (type === "artist") {
        const results = await searchArtists(value);
        if (isCurrent()) setArtistResults(results);
      } else {
        const [publicLists, youtubeLists, collaboration] = await Promise.allSettled([
          supabase.from("public_playlists").select("*").ilike("name", "%" + value + "%").limit(30),
          searchPublicPlaylists(value),
          supabase.rpc("ibramusic_search_shares", { query_text: value }),
        ]);
        if (!isCurrent()) return;
        const lists = publicLists.status === "fulfilled" && !publicLists.value.error ? publicLists.value.data ?? [] : [];
        if (youtubeLists.status === "rejected" && publicLists.status === "rejected") throw new Error("Search unavailable");
        const sharedLists = collaboration.status === "fulfilled" && !collaboration.value.error ? (collaboration.value.data ?? []) : [];
        const shared = sharedLists.map((row: { id: string; name: string; tracks: Track[]; cover_url: string }) => ({ ...row, playlist_id: row.id, shareToken: row.id }));
        setCommunityResults([...shared, ...lists, ...(youtubeLists.status === "fulfilled" ? youtubeLists.value : [])]);
      }
    } catch {
      if (isCurrent()) setSearchError(true);
    } finally {
      if (searchPending.current?.id === request) searchPending.current = null;
      if (isCurrent()) setIsSearching(false);
    }
  }

  const handleOpenAlbum = async (album: Album, writeAddress = true) => {
    const request = ++detailRequest.current;
    if (writeAddress) setViewAddress(buildShareLink("album", album.id, album.title, album.artist));
    setShareToken(null);
    if (selectedArtist) {
      setPreviousArtist(selectedArtist);
      setSelectedArtist(null);
    } else {
      setPreviousArtist(null);
    }
    setSelectedAlbum(album);
    setAlbumTracks([]);
    setIsLoadingAlbum(true);

    let fetchedTracks: Track[] = [];
    try {
      fetchedTracks = await getAlbumTracks(album.id, album.provider);

      // Smart Fallback: if album.id failed to return tracks (e.g. single track ID, obsolete token, or mismatch),
      // search for the album by title and artist to obtain full tracks list
      if (!album.provider && (!fetchedTracks || fetchedTracks.length === 0) && (album.title || album.artist)) {
        try {
          const searchQ = `${album.title} ${album.artist || ""}`.trim();
          const foundAlbums = await searchAlbums(searchQ);
          const matched = foundAlbums.find(a => 
            a.id !== album.id && 
            a.title.toLowerCase().includes(album.title.toLowerCase())
          ) || (foundAlbums.length > 0 && foundAlbums[0].id !== album.id ? foundAlbums[0] : null);

          if (matched) {
            const fallbackTracks = await getAlbumTracks(matched.id);
            if (fallbackTracks && fallbackTracks.length > 0) {
              fetchedTracks = fallbackTracks;
              // Update album thumbnail / id if better match was found
              setSelectedAlbum(prev => prev ? { ...prev, id: matched.id, thumbnail: matched.thumbnail || prev.thumbnail } : matched);
            }
          }
        } catch (searchErr) {
          console.warn("[handleOpenAlbum] Fallback album search failed:", searchErr);
        }
      }

      if (detailRequest.current !== request) return;
      setAlbumTracks(fetchedTracks);
      if (fetchedTracks && fetchedTracks.length > 0) {
        setExplicitTrackIds(prev => {
          let changed = false;
          const next = new Set(prev);
          fetchedTracks.forEach(t => {
            if (t.isExplicit && !next.has(t.id)) {
              next.add(t.id);
              changed = true;
            }
          });
          if (changed) saveExplicitTrackIds(next);
          return changed ? next : prev;
        });
      }
    } catch (e) {
      console.error("Failed to load album tracks", e);
    } finally {
      if (detailRequest.current === request) setIsLoadingAlbum(false);
    }

    // Merge Spotify stream counts
    getSpotifyAlbumStats(album.title, album.artist).then((albumStats) => {
      if (albumStats && albumStats.tracks && albumStats.tracks.length > 0 && fetchedTracks.length > 0) {
        const formatStreamCount = (count: number): string => {
          if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
          if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
          if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
          return String(count);
        };

        const updatedTracks = fetchedTracks.map(t => {
          const match = albumStats.tracks.find((tt: any) =>
            tt.name.toLowerCase().includes(t.title.toLowerCase()) ||
            t.title.toLowerCase().includes(tt.name.toLowerCase())
          );
          if (match && match.streamCount) {
            return { ...t, plays: formatStreamCount(match.streamCount) };
          }
          return t;
        });

        setAlbumTracks(updatedTracks);
      }
    }).catch(err => {
      console.warn("Failed to merge album stream counts:", err);
    });
  };

  const handleOpenArtist = async (artist: Artist, writeAddress = true, initialTab: typeof artistTab = "popular", seed?: Track) => {
    const request = ++detailRequest.current;
    if (writeAddress) setViewAddress(buildShareLink("artist", artist.id, artist.name));
    setShareToken(null);
    setSelectedArtist({ ...artist, portrait: artistProfilePortrait(artist) });
    setPreviousArtist(null);
    setSelectedAlbum(null);
    setArtistTracks([]);
    setArtistAlbums([]);
    setArtistReleasePage(undefined);
    setArtistCatalogIdentity(undefined);
    setIsLoadingMoreArtistReleases(false);
    setIsLoadingArtist(true);
    setVisibleArtistTracksCount(8);
    setIsLoadingArtistAlbums(true);
    setArtistTab(initialTab);

    setArtistTracksError(false);
    setArtistReleasesError(false);
    setIsLoadingArtistAbout(true);
    const isCurrent = () => detailRequest.current === request;
    const knownTracks = profileTracks([
      ...(seed ? [seed] : []),
      ...(currentTrack ? [currentTrack] : []),
      ...history,
      ...favorites,
      ...playlists.flatMap(list => list.tracks),
    ], artist);
    if (filterTracks(knownTracks).length) {
      setArtistTracks(knownTracks);
      setArtistTracksSource("local");
      setIsLoadingArtist(false);
    }
    const identity = await resolveArtistIdentity(artist, seed && profileTracks([seed], artist).length
      ? seed : knownTracks.find(track => track.duration > 0));
    if (!isCurrent()) return;
    if (!identity) {
      setIsLoadingArtist(false);
      setIsLoadingArtistAlbums(false);
      setIsLoadingArtistAbout(false);
      setArtistTracksSource("local");
      setArtistTracksError(true);
      setArtistReleasesError(true);
      return;
    }
    setArtistCatalogIdentity(identity);
    setSelectedArtist(previous => previous?.id === artist.id ? {
      ...previous,
      portrait: identity.portrait,
      description: identity.description?.trim() || previous.description,
      popularity: identity.popularity,
    } : previous);
    setIsLoadingArtistAbout(false);

    const loadTracks = async () => {
      let source: typeof artistTracksSource = "top";
      let primaryFailed = false;
      let tracks: Track[] = [];
      try {
        tracks = await getArtistProfileTracks(identity);
      } catch {
        primaryFailed = true;
      }
      if (!isCurrent()) return;
      if (filterTracks(tracks).length === 0 && identity.provider === "deezer") {
        source = "catalog";
        try {
          tracks = profileTracks(await searchTracks(identity.name, identity), identity);
        } catch {
          primaryFailed = true;
        }
        if (!isCurrent()) return;
      }
      if (filterTracks(tracks).length === 0) {
        source = "local";
        tracks = profileTracks([...tracks, ...knownTracks], identity);
      }
      setArtistTracks(tracks);
      setArtistTracksSource(source);
      setArtistTracksError(primaryFailed && source === "local");
    };

    await Promise.all([
      loadTracks().finally(() => { if (isCurrent()) setIsLoadingArtist(false); }),
      getArtistReleasePage(identity).then(page => {
        if (!isCurrent()) return;
        setArtistAlbums(profileReleases(page.albums, identity));
        if (page.nextIndex !== undefined) setArtistReleasePage({ artist: identity, index: page.nextIndex });
      }).catch(() => {
        if (isCurrent()) setArtistReleasesError(true);
      }).finally(() => { if (isCurrent()) setIsLoadingArtistAlbums(false); }),
    ]);
  };

  const loadMoreArtistReleases = async () => {
    if (!artistReleasePage || isLoadingMoreArtistReleases) return;
    const request = detailRequest.current;
    const { artist, index } = artistReleasePage;
    setIsLoadingMoreArtistReleases(true);
    setArtistReleasesError(false);
    try {
      const page = await getArtistReleasePage(artist, index);
      if (detailRequest.current !== request) return;
      setArtistAlbums(previous => profileReleases([...previous, ...page.albums], artist));
      setArtistReleasePage(page.nextIndex === undefined ? undefined : { artist, index: page.nextIndex });
    } catch {
      if (detailRequest.current === request) setArtistReleasesError(true);
    } finally {
      if (detailRequest.current === request) setIsLoadingMoreArtistReleases(false);
    }
  };

  const handleTrackContextMenu = React.useCallback((e: React.MouseEvent, track: Track, currentPlaylistId?: string | null) => {
    if (e.type === "contextmenu") {
      e.preventDefault();
      e.stopPropagation();
    }
    setPlaylistContextMenu(null);
    setSourceMenuTrack(null);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      track,
      anchor: e.currentTarget instanceof HTMLElement ? e.currentTarget : undefined,
      currentPlaylistId
    });
  }, []);
  const closeTrackContextMenu = React.useCallback(() => setContextMenu(null), []);

  const handlePlaylistContextMenu = (e: React.MouseEvent, playlist: Playlist) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setPlaylistContextMenu({
      x: e.clientX,
      y: e.clientY,
      playlist,
    });
  };

  const recordPlaylistActivity = (playlistId: string) => {
    try {
      const saved = localStorage.getItem("ibrastream_playlist_activity");
      const map = saved ? JSON.parse(saved) : {};
      map[playlistId] = Date.now();
      localStorage.setItem("ibrastream_playlist_activity", JSON.stringify(map));
      window.dispatchEvent(new CustomEvent("ibrastream_playlist_activity_updated", { detail: { playlistId } }));
    } catch {
      // ignore
    }
  };

  const handlePlayPlaylist = (playlist: Playlist) => {
    recordPlaylistActivity(playlist.id);
    if (!playlist.tracks || playlist.tracks.length === 0) {
      showToast(localized(language, "La playlist está vacía", "Playlist is empty", "Zerrenda hutsik dago"), "info");
      return;
    }
    playTrack(playlist.tracks[0], playlist.tracks, playlist.id);
    showToast(`Playing playlist "${playlist.name}"`, "success");
  };

  const handleAddPlaylistToQueue = (playlist: Playlist) => {
    if (!playlist.tracks || playlist.tracks.length === 0) {
      showToast(localized(language, "La playlist está vacía", "Playlist is empty", "Zerrenda hutsik dago"), "info");
      return;
    }
    playlist.tracks.forEach((track) => addToQueue(track));
  };

  const handleMergePlaylists = (sourcePlaylist: Playlist, targetPlaylistId: string) => {
    if (!sourcePlaylist.tracks || sourcePlaylist.tracks.length === 0) {
      showToast(localized(language, "No hay canciones para mover", "No songs to transfer", "Ez dago mugitzeko abestirik"), "info");
      return;
    }
    const target = playlists.find((p) => p.id === targetPlaylistId);
    if (!target) return;

    const existingIds = new Set(target.tracks.map((t) => t.id));
    const newTracks = sourcePlaylist.tracks.filter((t) => !existingIds.has(t.id));

    if (newTracks.length === 0) {
      showToast(`All songs are already in "${target.name}"`, "info");
      return;
    }

    const updated = playlists.map((p) => {
      if (p.id === targetPlaylistId) {
        return { ...p, tracks: [...p.tracks, ...newTracks] };
      }
      return p;
    });

    savePlaylists(updated);
    showToast(`Added ${newTracks.length} songs to "${target.name}"`, "success");
  };

  const handleToggleHidePlaylist = (playlistId: string) => {
    const updated = new Set(hiddenPlaylistIds);
    if (updated.has(playlistId)) {
      updated.delete(playlistId);
      showToast(localized(language, "Playlist visible de nuevo", "Playlist visible again", "Zerrenda berriro ikusgai dago"), "info");
    } else {
      updated.add(playlistId);
      showToast(localized(language, "Playlist oculta", "Playlist hidden", "Zerrenda ezkutatu da"), "info");
    }
    saveHiddenPlaylistIds(updated);
  };

  const handleTogglePlaylistExplicit = (playlist: Playlist, makeExplicit: boolean) => {
    if (!playlist.tracks || playlist.tracks.length === 0) {
      showToast(localized(language, "La playlist no tiene canciones", "Playlist has no songs", "Zerrendak ez du abestirik"), "info");
      return;
    }
    chooseTrackVersions(playlist.tracks, makeExplicit);
    showToast(
      makeExplicit
        ? `Playlist "${playlist.name}" switched to Explicit 🔞`
        : `Playlist "${playlist.name}" switched to Safe / Clean`,
      "success"
    );
  };

  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [listenLaterSort, setListenLaterSort] = useState("date");
  const [listenLaterLimit, setListenLaterLimit] = useState(50);
  const listenLaterLabel = localized(language, "Escuchar más tarde", "Listen Later", "Gero entzun");
  const listenLaterTracks = React.useMemo(() => {
    const query = normalizeSearch(librarySearchQuery);
    const entries = listenLater.filter(({ track }) =>
      normalizeSearch([track.title, track.artist, track.albumName ?? ""].join(" ")).includes(query));
    entries.sort((a, b) => {
      if (listenLaterSort === "title") return a.track.title.localeCompare(b.track.title, language);
      if (listenLaterSort === "artist") return a.track.artist.localeCompare(b.track.artist, language);
      return b.savedAt.localeCompare(a.savedAt);
    });
    return filterTracks(entries.map(({ track, savedAt }) => ({ ...track, dateAdded: savedAt })));
  }, [listenLater, librarySearchQuery, listenLaterSort, language, filterTracks]);
  const toggleListenLater = (track: Track) => {
    const saved = isSavedForLater(track);
    if (!saved && isInPersonalLibrary(track)) return;
    const matchesTrack = indexLibraryTracks([track]);
    const savedAt = new Date().toISOString();
    setListenLater(previous => saved ? previous.filter(entry => !matchesTrack(entry.track))
      : previous.some(entry => matchesTrack(entry.track)) ? previous : [{ id: track.id, savedAt, track }, ...previous]);
    showToast(saved
      ? localized(language, "Quitada de Escuchar más tarde", "Removed from Listen Later", "Gero entzutetik kenduta")
      : localized(language, "Guardada en Escuchar más tarde", "Saved to Listen Later", "Gero entzuteko gordeta"), "success");
  };
  const inListenLater = activeTab === "playlists" && showListenLater && !selectedPlaylist && !selectedArtist && !selectedAlbum;
  const headerSearchScope = activeTab === "playlists" ? "library" : activeTab === "search" ? searchType : "all";
  const headerSearchLabel = inListenLater
    ? localized(language, "Buscar en Escuchar más tarde", "Search Listen Later", "Bilatu Gero entzun atalean")
    : headerSearchScope === "library" ? localized(language, "Buscar en tu biblioteca", "Search your library", "Bilatu liburutegian") : labels.searchField;
  const headerSearchValue = activeTab === "playlists" ? librarySearchQuery : searchQuery;
  const changeHeaderSearch = activeTab === "playlists" ? setLibrarySearchQuery : updateSearchQuery;

  function submitSearch(value: string) {
    if (inListenLater) {
      setLibrarySearchQuery(value);
      setMobileSearchOpen(false);
      return;
    }
    navigateTab("search");
    setMobileSearchOpen(false);
    void handleSearch(value, headerSearchScope === "library" ? "library" : /^https?:\/\//i.test(value) ? "track" : headerSearchScope);
  }

  const libraryMatches = searchType === "library" && submittedQuery.trim() ? playlists.flatMap(list => {
    const query = normalizeSearch(submittedQuery);
    const matches = list.tracks.filter(track => query.split(/\s+/).every(term =>
      normalizeSearch([track.title, track.artist, track.albumName].filter(Boolean).join(" ")).includes(term)));
    return matches.length || normalizeSearch(list.name).includes(query) ? [{ list, matches }] : [];
  }) : [];

  function filterRecommended(tracks: Track[]) {
    if (privateSession) return [];
    return filterTracks(tracks).filter(track => !hiddenTracks.includes(track.id) && !mutedArtists.includes(normalizeSearch(track.artist)));
  }

  const visibleHomeRecommendations = filterRecommended(homeRecommendations).filter(track => !playlistTrackKeys.has(trackTitleArtistKey(track)));

  const [discoveryCutoff, setDiscoveryCutoff] = React.useState(() => Date.now() - 30 * 86_400_000);
  useEffect(() => {
    const update = () => setDiscoveryCutoff(Date.now() - 30 * 86_400_000);
    const timer = window.setInterval(update, 60 * 60 * 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  const smartPlaylists = React.useMemo(() => {
    if (privateSession) return [];
    const stats = statsFor(listeningEntries);
    const top = Object.values(stats.tracks).sort((a, b) => b.count - a.count || b.seconds - a.seconds).map(item => item.track);
    const regular = Object.values(stats.artists).sort((a, b) => b.seconds - a.seconds).slice(0, 5).map(item => item.name);
    const chronological = [...listeningEntries].sort((a, b) => a.at - b.at);
    const last = new Map(chronological.map(item => [trackTitleArtistKey(item.track), item]));
    const seen = new Set<string>();
    const discoveries = chronological.filter(item => {
      const key = trackTitleArtistKey(item.track);
      if (seen.has(key)) return false;
      seen.add(key);
      return item.at > discoveryCutoff;
    }).reverse().map(item => item.track);
    const distant = [...last.values()].filter(item => item.at <= discoveryCutoff).sort((a, b) => a.at - b.at).map(item => item.track);
    return [
      { id: "smart-top", name: localized(language, "Más escuchadas", "Most played", "Gehien entzunak"), tracks: top },
      { id: "smart-favorites", name: localized(language, "Favoritos recientes", "Recent favorites", "Azken gogokoak"), tracks: favorites.slice(-30).reverse() },
      { id: "smart-artists", name: localized(language, "Artistas habituales", "Frequent artists", "Ohiko artistak"), tracks: top.filter(track => regular.includes(track.artist)) },
      { id: "smart-revisit", name: localized(language, "Hace tiempo que no escuchas", "Listen again", "Entzun berriro"), tracks: distant },
      { id: "smart-discovered", name: localized(language, "Descubrimientos recientes", "Recent discoveries", "Azken aurkikuntzak"), tracks: discoveries },
    ].filter(list => list.tracks.length).map(list => ({ ...list, tracks: list.tracks.slice(0, 30) }));
  }, [listeningEntries, favorites, language, privateSession, discoveryCutoff]);

  async function startRadio(track: Track, useArtist = false) {
    showToast(localized(language, "Preparando radio…", "Preparing radio…", "Irratia prestatzen…"), "info");
    try {
      const recommendations = useArtist
        ? await getSearchRecommendations(track.artist, [track])
        : await getSearchRecommendations(track.title + " " + track.artist, [track]);
      const candidates = filterTracks(rankTracks(recommendations, "")).filter(candidate => candidate.id !== track.id);
      if (!candidates.length) {
        showToast(localized(language, "No se encontraron pistas para esta radio.", "No tracks found for this radio.", "Ez da irrati honetarako abestirik aurkitu."), "info");
        return;
      }
      playTrack(candidates[0], candidates, "radio-" + track.id);
    } catch {
      showToast(localized(language, "No se pudo preparar la radio.", "Couldn't prepare radio.", "Ezin izan da irratia prestatu."), "error");
    }
  }

  const searchSuggestions = [...searchHistory, ...followedArtists.map(artist => artist.name), ...favorites.map(track => track.title)];

  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);
  const wrappedYear = new Date().getFullYear();
  const searchableTracks = filterTracks(searchResults).filter(track => searchVersion === "all" || (searchVersion === "clean" ? !isTrackExplicit(track) : isTrackExplicit(track)));
  const sortedSearchTracks = searchSort === "relevance" ? searchableTracks : [...searchableTracks].sort((left, right) => (left.duration - right.duration) * (searchSort === "shortest" ? 1 : -1));
  const [installPrompt, setInstallPrompt] = useState<(Event & { prompt(): Promise<void> }) | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt(): Promise<void> });
    };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  return (
    <div
      className="app-shell isolate h-dvh w-full flex flex-col overflow-hidden relative"
      style={{
        backgroundColor: themeSettings.theme === "bright" ? "var(--app-bg-color-val, #fafafa)" : themeSettings.theme === "noir" ? "var(--app-bg-color-val, #000000)" : "var(--app-bg-color-val, var(--desktop-dark-base, #0f0f0f))",
        backgroundImage: "var(--app-bg-image-val, none)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
        "--desktop-player-width": desktopPanelWidth + "px",
        "--desktop-playback-height": currentTrack ? "6rem" : "0px",
      } as React.CSSProperties}
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:m-3 focus:rounded-lg focus:bg-white focus:p-3 focus:text-black">{labels.skip}</a>
      {/* Ambient Glow Background */}
      {auraActive && ambientMode === "cover" && palette?.auraImage && (
        <div key={coverUrl} className="ambient-cover-layer" aria-hidden="true" />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden relative w-full z-10">

        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setSelectedArtist(null);
            setSelectedAlbum(null);
            setPreviousArtist(null);
            navigateTab(tab);
            setShowMobilePlayer(false);
            clearSelection();
          }}
          playlists={playlists.filter(p => !hiddenPlaylistIds.has(p.id))}
          followedArtists={followedArtists}
          onPlaylistContextMenu={handlePlaylistContextMenu}
          onSelectPlaylist={(p) => {
            recordPlaylistActivity(p.id);
            setSelectedArtist(null);
            setSelectedAlbum(null);
            setPreviousArtist(null);
            setActiveTab("playlists");
            setSelectedPlaylist(p);
            clearSelection();
          }}
          onSelectArtist={(a) => {
            handleOpenArtist(a);
          }}
          pinnedPlaylistIds={pinnedPlaylistIds}
          onTogglePinPlaylist={handleTogglePinPlaylist}
          onCreatePlaylist={() => {
            setNewPlaylistName("");
            setSaveQueueMode(false);
            setTrackPendingNewPlaylist(null);
            setShowPlaylistCreateModal(true);
          }}
          isAdmin={user?.app_metadata?.ibramusic_admin === true}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => {
            setSidebarCollapsed(prev => {
              const next = !prev;
              localStorage.setItem("ibrastream_sidebar_collapsed", String(next));
              return next;
            });
          }}
        />


        {/* ═══ MOBILE STICKY TOP BAR ═══ */}
        <div
          className="md:hidden fixed top-0 left-0 right-0 z-30 bg-brand-darkBg/95 backdrop-blur-md border-b border-white/5"
          style={{ paddingTop: 'var(--safe-top)' }}
        >
          {mobileSearchOpen ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <SearchField value={headerSearchValue} suggestions={searchSuggestions} label={headerSearchLabel} onChange={changeHeaderSearch} onSubmit={submitSearch} autoFocus />
              <button
                onClick={() => {
                  setMobileSearchOpen(false);
                  changeHeaderSearch("");
                  setSearchRecommendations([]);
                }}
                className="text-gray-400 hover:text-white text-sm font-medium shrink-0"
              >
                {localized(language, "Cancelar", "Cancel", "Utzi")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center p-1 overflow-hidden">
                  <Logo className="w-full h-full" />
                </div>
                <span className="text-base font-semibold text-white tracking-tight">IbraMusic</span>
              </div>
              <div className="flex items-center gap-2">
                {activeTab !== "search" && <button
                  aria-label={headerSearchLabel}
                  onClick={() => setMobileSearchOpen(true)}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <Search className="w-4.5 h-4.5" />
                </button>}
                <button
                  onClick={() => {
                    if (user) {
                      setShowAccountDropdown(true);
                    } else {
                      setAuthIsSignUp(false);
                      setShowAuthModal(true);
                    }
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all overflow-hidden ${
                    user ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20" : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                  title={user ? `Signed in as ${user.email} (Click to sign out)` : "Sign in to sync"}
                >
                  {user && pfp ? (
                    <img src={pfp} className="w-full h-full object-cover" alt="Profile" />
                  ) : user ? (
                    <span className="text-[11px] font-bold text-white uppercase">{username.slice(0, 2)}</span>
                  ) : (
                    <User className="w-4.5 h-4.5" />
                  )}
                </button>
                <button
                  aria-label="Escuchar juntos"
                  onClick={() => setShowListenTogetherOverlay(true)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    roomId ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <Radio className={`w-4.5 h-4.5 ${roomId ? "animate-pulse" : ""}`} />
                </button>
                <button
                  aria-label="Ver cola de reproducción"
                  onClick={() => setShowQueueOverlay(true)}
                  className="relative w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <ListMusic className="w-4.5 h-4.5" />
                  {queue.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-white text-black text-[9px] font-black flex items-center justify-center">
                      {queue.length > 9 ? "9+" : queue.length}
                    </span>
                  )}
                </button>

              </div>
            </div>
          )}
        </div>


        {/* Mobile expanded player is handled by the PlayerPanel overlay below */}

        {/* Main Panel Content */}
        <main
          id="main-content"
          tabIndex={-1}
          ref={mainContentRef}
          onScroll={event => {
            setIsHeaderScrolled(event.currentTarget.scrollTop > 0);
            if (activeTab === "search" && !selectedPlaylist && !selectedAlbum && !selectedArtist) searchScrollTop.current = event.currentTarget.scrollTop;
          }}
          className={`desktop-content-scroll min-w-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pt-[76px] px-4 pb-[148px] md:pt-0 md:px-8 ${sidebarCollapsed ? "md:ml-20" : "md:ml-72"} ${desktopPanelVisible ? "lg:mr-[var(--desktop-player-size)]" : ""} transition-colors duration-300`}
        >

          {/* Desktop-only Top Header Bar (Sticky) */}
          <header className={`hidden md:flex items-center justify-between gap-4 py-3 mb-4 sticky top-0 z-30 pt-4 px-8 -mx-8 transition-all duration-200 ${
            isHeaderScrolled 
              ? "bg-brand-darkBg border-b border-white/5"
              : "bg-transparent backdrop-blur-none border-b border-transparent"
          }`}>
            <div className="flex items-center gap-3 flex-1 max-w-lg">
              {/* Back / Forward history arrows */}
              <div className="flex items-center gap-2">
                <button
                  onClick={goBack}
                  disabled={navIndex <= 0}
                  className={`w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center transition-all ${
                    navIndex <= 0
                      ? "opacity-30 cursor-not-allowed text-gray-600"
                      : "hover:bg-black/60 text-gray-400 hover:text-white"
                  }`}
                  title={localized(language, "Atrás", "Go back", "Atzera")}
                >
                  <span className="text-sm font-bold">←</span>
                </button>
                <button
                  onClick={goForward}
                  disabled={navIndex >= navHistory.length - 1}
                  className={`w-9 h-9 rounded-full bg-black/40 border border-white/5 flex items-center justify-center transition-all ${
                    navIndex >= navHistory.length - 1
                      ? "opacity-30 cursor-not-allowed text-gray-600"
                      : "hover:bg-black/60 text-gray-400 hover:text-white"
                  }`}
                  title={localized(language, "Adelante", "Go forward", "Aurrera")}
                >
                  <span className="text-sm font-bold">→</span>
                </button>
              </div>

              {/* Rounded Home Button */}
              <button
                onClick={() => {
                  setSelectedArtist(null);
                  setSelectedAlbum(null);
                  setPreviousArtist(null);
                  setActiveTab("home");
                }}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${activeTab === "home" && !selectedArtist && !selectedAlbum
                    ? "bg-white text-black font-bold"
                    : "bg-black/40 text-gray-400 hover:text-white hover:bg-black/60 border border-white/5"
                  }`}
                title={localized(language, "Inicio", "Home", "Hasiera")}
              >
                <Home className="w-5 h-5" />
              </button>

              <div ref={mainSearchRef} className="min-w-0 flex-1"><SearchField value={headerSearchValue} suggestions={searchSuggestions} label={headerSearchLabel} onChange={changeHeaderSearch} onSubmit={submitSearch} /></div>
            </div>

            <div className="flex items-center gap-3">
              {/* Listen Together Dropdown (Desktop) */}
              <div className="relative" ref={listenTogetherDropdownRef}>
                <button
                  onClick={() => setShowListenTogetherDropdown(!showListenTogetherDropdown)}
                  className={`p-2.5 rounded-full border transition-all relative shrink-0 ${
                    roomId 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                      : "bg-white/5 border-white/5 hover:bg-white/10 text-gray-300 hover:text-white"
                  }`}
                  title={localized(language, "Escuchar juntos", "Listen Together", "Entzun elkarrekin")}
                >
                  <Radio className={`w-5 h-5 ${roomId ? "animate-pulse" : ""}`} />
                </button>
                
                {showListenTogetherDropdown && (
                  <div className="absolute right-0 mt-2.5 w-80 z-50 animate-[fadeIn_0.2s_ease]">
                    <ListenTogether />
                  </div>
                )}
              </div>

              {/* View Queue Button */}
              <button
                onClick={() => setShowQueueOverlay(true)}
                className="p-2.5 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all relative shrink-0"
                title={localized(language, "Ver cola", "View Queue", "Ikusi ilara")}
              >
                <ListMusic className="w-5 h-5" />
                {queue.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
                    {queue.length}
                  </span>
                )}
              </button>

              {/* Account / Settings Dropdown */}
              <div className="relative" ref={accountDropdownRef}>
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className={`h-9 flex items-center justify-center font-bold text-xs transition-all border shrink-0 ${
                    user ? "w-9 rounded-xl" : "px-4 rounded-full bg-white text-black border-white hover:bg-white/90"
                  } ${
                    showAccountDropdown && user
                      ? "bg-brand-accent border-brand-accent text-white"
                      : !user
                      ? ""
                      : "bg-white/8 border-white/10 hover:bg-white/12 text-white"
                  }`}
                  title={user ? "Account Settings" : "Login"}
                >
                  {user ? (
                    pfp ? (
                      <img src={pfp} className="w-full h-full object-cover rounded-lg" alt="Profile" />
                    ) : (
                      username.slice(0, 2).toUpperCase()
                    )
                  ) : (
                    "Login"
                  )}
                </button>

                {showAccountDropdown && (
                  <div className="absolute right-0 mt-2.5 w-64 z-50 animate-[fadeIn_0.2s_ease] glass-panel rounded-2xl p-4 flex flex-col gap-3.5 shadow-2xl shadow-black/40 select-none">
                    {/* User profile details (Avatar upload + Username edit) */}
                    <div className="flex flex-col items-center gap-2 pb-3.5 border-b border-white/5">
                      <div 
                        className={`w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative shadow-lg overflow-hidden group ${
                          user ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                        }`}
                        onClick={user ? () => document.getElementById("pfp-upload")?.click() : undefined}
                        title={user ? "Click to upload profile picture" : "Login to customize profile"}
                      >
                        {pfp ? (
                          <img src={pfp} className="w-full h-full object-cover" alt="Profile avatar" />
                        ) : (
                          <span className="text-lg font-bold text-white">{username.slice(0, 2).toUpperCase()}</span>
                        )}
                        {user && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <Plus className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                      <input
                        id="pfp-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              handleUpdatePfp(base64);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      
                      <div className="w-full flex flex-col gap-1 items-center">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => handleUpdateUsername(e.target.value)}
                          placeholder="Username"
                          disabled={!user}
                          className={`w-full bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 rounded-xl px-3 py-1.5 text-center text-xs font-semibold text-white focus:outline-none transition-all ${
                            !user ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                        {user ? (
                          <div className="text-center mt-1">
                            <p className="text-[9px] text-gray-500 truncate max-w-[200px]">{user.email}</p>
                            <p className="text-[9px] text-emerald-400 font-semibold flex items-center justify-center gap-1 mt-0.5">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                              Cloud Synced
                            </p>
                          </div>
                        ) : (
                          <p className="text-[9px] text-gray-500 font-medium mt-1">Offline / Guest Session</p>
                        )}
                      </div>
                    </div>

                    {/* Public Playlists Section */}
                    {user && playlists.some(p => p.isPublic) && (
                      <div className="flex flex-col gap-2 pb-3 border-b border-white/5 max-h-36 overflow-y-auto pr-1">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5 text-left">
                          <Globe className="w-3 h-3 text-brand-accent" /> Public Playlists
                        </span>
                        <div className="flex flex-col gap-1.5 pl-1">
                          {playlists.filter(p => p.isPublic).map(p => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setSelectedPlaylist(p);
                                setActiveTab("playlists");
                                setSelectedArtist(null);
                                setSelectedAlbum(null);
                                setShowAccountDropdown(false);
                              }}
                              className="w-full text-left truncate text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-2 hover:bg-white/5 py-1 px-1.5 rounded-lg"
                            >
                              <ListMusic className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                              <span className="truncate text-left">{p.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Settings toggles */}
                    <div className="flex flex-col gap-2.5 pb-3 border-b border-white/5">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Settings className="w-3 h-3 text-brand-accent" /> Preferences
                      </span>
                      
                      {/* Theme Settings toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-300">Theme</span>
                        <button
                          onClick={() => {
                            const nextTheme = themeSettings.theme === "dark" ? "bright" : themeSettings.theme === "bright" ? "noir" : "dark";
                            if (nextTheme === "noir") setAmbientGlowEnabled(false);
                            setThemeSettings(prev => ({
                              ...prev,
                              theme: nextTheme,
                              bgColor: nextTheme === "noir" ? "#000000" : mapColorBetweenThemes(prev.bgColor, prev.theme, nextTheme)
                            }));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-bold text-white transition-all uppercase"
                        >
                          {themeSettings.theme}
                        </button>
                      </div>
                    </div>

                    {/* Tabs / Navigation */}
                    <div className="flex flex-col gap-2">
                      {user && (
                        <button
                          onClick={() => {
                            setActiveTab("visuals");
                            setSelectedArtist(null);
                            setSelectedAlbum(null);
                            setSelectedPlaylist(null);
                            setShowAccountDropdown(false);
                          }}
                          className={`w-full text-left py-2 px-3 hover:bg-white/5 rounded-xl transition-all text-xs font-semibold flex items-center gap-2.5 ${
                            activeTab === "visuals" && !selectedArtist && !selectedAlbum && !selectedPlaylist
                              ? "text-brand-accent bg-white/5"
                              : "text-gray-300 hover:text-white"
                          }`}
                        >
                          <Sparkles className="w-4 h-4 text-brand-accent" />
                          <span>Visualizer Tab</span>
                        </button>
                      )}

                      {user ? (
                        <button
                          onClick={() => {
                            handleSignOut();
                            setShowAccountDropdown(false);
                          }}
                          className="w-full mt-1.5 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-bold rounded-xl transition-all text-xs text-center cursor-pointer"
                        >
                          Sign Out
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setShowAuthModal(true);
                            setShowAccountDropdown(false);
                          }}
                          className="w-full mt-1.5 py-2 bg-brand-accent hover:bg-brand-accent/90 text-black font-bold rounded-xl transition-all text-xs text-center flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <User className="w-4 h-4 text-black" />
                          <span>{localized(language, "Iniciar sesión", "Login", "Hasi saioa")}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Dynamic Inner Panel View */}
          <div
            key={`${activeTab}-${selectedArtist?.id ?? ""}-${selectedAlbum?.id ?? ""}-${selectedPlaylist?.id ?? ""}`}
            className={
              tabDirection === "forward"
                ? "animate-tab-forward"
                : tabDirection === "backward"
                ? "animate-tab-backward"
                : "animate-mobile-page"
            }
          >
          {shareToken ? (
            <React.Suspense fallback={<LoadingSkeleton layout="detail" label="Cargando lista…" />}>
              <SharedPlaylistView key={shareToken + (userId ?? "")} token={shareToken} account={userId} onPlay={playTrack} onTrackContextMenu={handleTrackContextMenu} onLeave={() => {
                const url = new URL(location.href);
                url.searchParams.delete("share");
                window.history.replaceState(null, "", url);
                setShareToken(null);
                navigateTab("playlists");
              }} />
            </React.Suspense>
          ) : isOpeningPublicPlaylist ? (
            <LoadingSkeleton layout="detail" label="Cargando playlist pública…" />
          ) : selectedArtist ? (
            /* ARTIST PANEL - FULL PAGE SPACE */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-subpage">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => { detailRequest.current++; setSelectedArtist(null); }}
                  className="text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5"
                >
                  ← Back
                </button>
              </div>

              <div
                className="p-6 md:p-8 rounded-[32px] flex flex-col justify-end min-h-[220px] border border-white/5 relative overflow-hidden bg-cover bg-center select-none"
                style={{ backgroundColor: "var(--color-brand-cardBg)" }}
              >
                {selectedArtist.portrait && <img src={selectedArtist.portrait} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full scale-105 object-cover opacity-30 blur-xl" />}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-brand-darkBg via-brand-darkBg/70 to-transparent" />
                {selectedArtist.portrait
                  ? <img src={selectedArtist.portrait} alt="" className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/5 object-contain object-right"
                    onError={() => setSelectedArtist(previous => previous && previous.portrait === selectedArtist.portrait ? { ...previous, portrait: undefined } : previous)} />
                  : <User aria-hidden="true" className="absolute right-10 top-1/2 size-24 -translate-y-1/2 text-gray-400/30" />}
                <div className="relative z-10 flex flex-col items-start gap-3">
                  <h3 className="break-words text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-md md:text-5xl">
                    {selectedArtist.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedArtist.monthlyListeners !== undefined && (
                      <span className="text-xs text-gray-300 font-semibold drop-shadow">
                        {selectedArtist.monthlyListeners.toLocaleString(language)} {localized(language, "oyentes mensuales", "monthly listeners", "hileko entzule")}
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleFollowArtist(selectedArtist)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border uppercase tracking-wider active:scale-95 ${followedArtists.some(a => a.id === selectedArtist.id)
                          ? "bg-white/10 border-white/30 text-white hover:bg-red-500/10 hover:border-red-500 hover:text-red-400"
                          : "bg-brand-accent border-transparent text-black hover:bg-brand-accent/90"
                        }`}
                    >
                      {followedArtists.some(a => a.id === selectedArtist.id) ? localized(language, "Siguiendo", "Following", "Jarraitzen") : localized(language, "Seguir", "Follow", "Jarraitu")}
                    </button>
                    <button className={playlistHeaderButton} onClick={() => void copyLink(buildShareLink("artist", selectedArtist.id, selectedArtist.name))}>
                      <Link className="size-3.5" aria-hidden="true" /> {localized(language, "Compartir", "Share", "Partekatu")}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 border-b border-white/5 px-2 py-3 select-none">
                {(["popular", "albums", "about"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setArtistTab(tab)}
                    aria-pressed={artistTab === tab}
                    className={`pb-1.5 border-b-2 text-xs font-bold uppercase tracking-wider transition-all ${artistTab === tab
                        ? "border-brand-accent text-white"
                        : "border-transparent text-gray-400 hover:text-white"
                      }`}
                  >
                    {tab === "popular" ? localized(language, "Popular", "Popular", "Ezagunak") : tab === "albums" ? localized(language, "Lanzamientos", "Releases", "Argitalpenak") : localized(language, "Información", "About", "Informazioa")}
                  </button>
                ))}
              </div>

              <div className="flex-1">
                {artistTab === "popular" && (
                  isLoadingArtist ? (
                    <LoadingSkeleton layout="tracks" label="Cargando canciones del artista…" />
                  ) : artistTracksError && visibleArtistTracks.length === 0 ? (
                    <button className={playlistHeaderButton} onClick={() => void handleOpenArtist(selectedArtist, false)}>{localized(language, "No se pudieron cargar las canciones. Reintentar", "Couldn't load songs. Retry", "Ezin izan dira abestiak kargatu. Saiatu berriro")}</button>
                  ) : visibleArtistTracks.length === 0 ? (
                    <p className="text-center py-12 text-gray-500 text-sm">{artistTracks.length
                      ? localized(language, "Ninguna canción coincide con el filtro actual.", "No songs match the current filter.", "Ez dago uneko iragazkiarekin bat datorren abestirik.")
                      : localized(language, "No se encontraron canciones de este artista.", "No songs found for this artist.", "Ez da artista honen abestirik aurkitu.")}</p>
                  ) : (
                    <div className="flex flex-col gap-3 animate-[fadeIn_0.3s_ease]">
                      <p className="px-2 text-xs text-gray-400">{artistTracksSource === "top"
                        ? localized(language, "Orden del proveedor.", "Provider order.", "Hornitzailearen ordena.")
                        : artistTracksSource === "catalog"
                        ? localized(language, "Coincidencias del catálogo en orden de búsqueda.", "Catalog matches in search order.", "Katalogoko emaitzak bilaketaren ordenan.")
                        : localized(language, "Solo tu historial y biblioteca. El catálogo no está disponible.", "Your history and library only. The catalog is unavailable.", "Zure historia eta liburutegia soilik. Katalogoa ez dago erabilgarri.")}</p>
                      {artistTracksError && <button className={playlistHeaderButton + " self-start"} onClick={() => void handleOpenArtist(selectedArtist, false)}>{localized(language, "Reintentar catálogo", "Retry catalog", "Saiatu katalogoa berriro")}</button>}
                      {/* Bulk Action Toolbar */}
                      {isSelecting && (
                        <div id="bulk-action-toolbar" className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5 mb-2 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
                          <button
                            onClick={() => handleSelectAll(visibleArtistTracks.slice(0, visibleArtistTracksCount))}
                            className="text-xs text-brand-accent hover:underline font-semibold shrink-0"
                          >
                            {selectedTrackIds.size === visibleArtistTracks.slice(0, visibleArtistTracksCount).length ? "Deselect all" : "Select all"}
                          </button>
                          <span className="text-gray-500 text-xs shrink-0">{selectedTrackIds.size} selected</span>
                          <div className="flex-1" />
                          <button
                            onClick={() => {
                              const sel = visibleArtistTracks.slice(0, visibleArtistTracksCount).filter(t => selectedTrackIds.has(t.id));
                              handleBulkAddToFavorites(sel);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-400 text-xs font-medium transition-all"
                          >
                            <Heart className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Favorites</span>
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setShowBulkPlaylistPicker(prev => !prev)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-brand-accent/20 border border-white/10 text-gray-300 hover:text-brand-accent text-xs font-medium transition-all"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                            </button>
                            {showBulkPlaylistPicker && (
                              <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 z-50 max-h-56 overflow-y-auto animate-[fadeIn_0.15s_ease]">
                                {playlists.length === 0 ? (
                                  <div className="px-4 py-3 text-xs text-gray-500 italic text-center">No playlists yet</div>
                                ) : (
                                  playlists.map(pl => (
                                    <button
                                      key={pl.id}
                                      onClick={() => {
                                        const sel = visibleArtistTracks.slice(0, visibleArtistTracksCount).filter(t => selectedTrackIds.has(t.id));
                                        handleBulkAddToPlaylist(pl.id, sel);
                                      }}
                                      className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-white/5 hover:text-white text-gray-300 text-xs transition-all truncate"
                                    >
                                      <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                      <span className="truncate">{pl.name}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={clearSelection}
                            className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white text-xs transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {visibleArtistTracks.slice(0, visibleArtistTracksCount).map((track, idx) => {
                        const isChecked = selectedTrackIds.has(track.id);
                        return (
                          <div
                            key={`${track.id}-${idx}`}
                            className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                          >
                            {isSelecting && (
                              <div
                                className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                                onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                                title={isChecked ? "Deselect" : "Select"}
                              >
                                <div
                                  className={`rounded-md border-2 flex items-center justify-center transition-all
                                    ${isChecked
                                      ? "border-brand-accent bg-brand-accent"
                                      : "border-white/80 bg-black"
                                    }`}
                                  style={{ width: "18px", height: "18px", minWidth: "18px" }}
                                >
                                  {isChecked && (
                                    <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="1,4 3.5,7 9,1" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <TrackCard
                                track={track}
                                variant="row"
                                tracksQueue={visibleArtistTracks}
                                artistProfile={selectedArtist}
                                onToggleFavorite={handleToggleFavorite}
                                isFavorite={favorites.some((f) => f.id === track.id)}
                                isExplicit={isTrackExplicit(track)}
                                onOpenArtist={handleOpenArtist}
                                onAddToPlaylist={handleOpenAddToPlaylist}
                                onContextMenu={(e) => handleTrackContextMenu(e, track)}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {visibleArtistTracks.length > visibleArtistTracksCount && (
                        <button
                          onClick={() => setVisibleArtistTracksCount(prev => prev + 10)}
                          className="mt-4 py-2.5 px-6 self-center rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-all border border-white/5 hover:border-white/10"
                        >
                          View more
                        </button>
                      )}
                    </div>
                  )
                )}

                {artistTab === "albums" && (
                  isLoadingArtistAlbums ? (
                    <LoadingSkeleton layout="grid" label="Cargando álbumes…" />
                  ) : artistReleasesError && artistAlbums.length === 0 && !artistReleasePage ? (
                    <button className={playlistHeaderButton} onClick={() => void handleOpenArtist(selectedArtist, false, "albums")}>{localized(language, "No se pudieron cargar los lanzamientos. Reintentar", "Couldn't load releases. Retry", "Ezin izan dira argitalpenak kargatu. Saiatu berriro")}</button>
                  ) : artistAlbums.length === 0 && !artistReleasePage ? (
                    <p className="text-center py-12 text-gray-500 text-sm">{localized(language, "No se encontraron lanzamientos.", "No releases found.", "Ez da argitalpenik aurkitu.")}</p>
                  ) : (
                    <div className="grid gap-6">
                      {([
                        ["album", localized(language, "Álbumes", "Albums", "Albumak")],
                        ["ep", "EP"],
                        ["single", localized(language, "Sencillos", "Singles", "Singleak")],
                        ["compilation", localized(language, "Recopilaciones", "Compilations", "Bildumak")],
                        [undefined, localized(language, "Tipo sin confirmar", "Unclassified releases", "Sailkatu gabeko argitalpenak")],
                      ] as const).map(([type, title]) => {
                        const releases = artistAlbums.filter(album => album.releaseType === type);
                        return releases.length > 0 && <section key={title} className="grid gap-3">
                          <h4 className="font-semibold text-white">{title}</h4>
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {releases.map(album => <AlbumCard key={album.id} album={album} onClick={handleOpenAlbum} />)}
                          </div>
                        </section>;
                      })}
                      {artistReleasePage && <button type="button" className={playlistHeaderButton + " justify-self-start"} disabled={isLoadingMoreArtistReleases}
                        onClick={() => void loadMoreArtistReleases()}>
                        {isLoadingMoreArtistReleases ? localized(language, "Cargando…", "Loading…", "Kargatzen…")
                          : artistReleasesError ? localized(language, "Reintentar", "Retry", "Saiatu berriro")
                          : localized(language, "Cargar más lanzamientos", "Load more releases", "Kargatu argitalpen gehiago")}
                      </button>}
                    </div>
                  )
                )}

                {artistTab === "about" && (
                  <div className="flex flex-col gap-4 text-sm text-gray-300 leading-relaxed max-w-xl animate-[fadeIn_0.3s_ease]">
                    {artistCatalogIdentity?.provider === "youtube" && /^UC[\w-]+$/.test(artistCatalogIdentity.id) && (
                      <a href={`https://music.youtube.com/channel/${artistCatalogIdentity.id}`} target="_blank" rel="noreferrer"
                        className="rounded-xl border border-white/10 p-4 font-semibold text-brand-accent hover:underline">
                        {localized(language, "Perfil en YouTube Music", "YouTube Music artist profile", "YouTube Music-eko artistaren profila")}
                      </a>
                    )}
                    {artistCatalogIdentity?.provider === "tidal" && /^\d+$/.test(artistCatalogIdentity.id) && (
                      <a href={`https://tidal.com/artist/${artistCatalogIdentity.id}`} target="_blank" rel="noreferrer"
                        className="rounded-xl border border-white/10 p-4 font-semibold text-brand-accent hover:underline">
                        {localized(language, "Perfil en TIDAL", "TIDAL artist profile", "TIDALeko artistaren profila")}
                      </a>
                    )}
                    {artistCatalogIdentity?.provider === "deezer" && /^\d+$/.test(artistCatalogIdentity.id) && (
                      <div className="rounded-xl border border-white/10 p-4">
                        <a href={`https://www.deezer.com/artist/${artistCatalogIdentity.id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-accent hover:underline">
                          {localized(language, "Ficha en Deezer", "Deezer artist page", "Deezerreko artistaren orria")}
                        </a>
                        {Number.isFinite(artistCatalogIdentity.popularity) && <p>{artistCatalogIdentity.popularity?.toLocaleString()} {localized(language, "fans en Deezer", "Deezer fans", "jarraitzaile Deezer-en")}</p>}
                      </div>
                    )}
                    {selectedArtist.description ? <>
                      <h4 className="text-lg font-bold text-white">{localized(language, "Biografía", "Biography", "Biografia")}</h4>
                      <p className="whitespace-pre-line">{selectedArtist.description}</p>
                    </> : isLoadingArtistAbout ? <LoadingSkeleton layout="text" label={localized(language, "Cargando biografía…", "Loading biography…", "Biografia kargatzen…")} />
                      : <p className="rounded-xl border border-white/10 p-4">{localized(language, "La fuente no ofrece una biografía para este artista. Puedes explorar sus canciones y lanzamientos.", "The source has no biography for this artist. Explore their songs and releases instead.", "Iturriak ez du artista honen biografiarik. Haren abestiak eta argitalpenak araka ditzakezu.")}</p>}
                  </div>
                )}
              </div>
            </section>
          ) : selectedAlbum ? (
            /* ALBUM PANEL - FULL PAGE SPACE */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-subpage">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedAlbum(null);
                    if (previousArtist) {
                      setSelectedArtist(previousArtist);
                      setPreviousArtist(null);
                    }
                  }}
                  className="text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5"
                >
                  ← Back {previousArtist ? `to ${previousArtist.name}` : ""}
                </button>
              </div>

              <div className="p-6 md:p-8 rounded-[32px] bg-gradient-to-br from-white/5 to-transparent border border-white/5 flex flex-col md:flex-row gap-6 items-center">
                <img src={selectedAlbum.thumbnail} className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover shadow-lg" />
                <div className="flex-1 text-center md:text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Album</span>
                  <h3 className="text-xl md:text-3xl font-extrabold text-white mt-1 leading-tight">{selectedAlbum.title}</h3>
                  <button className="mt-2 mr-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white" onClick={() => void copyLink(buildShareLink("album", selectedAlbum.id, selectedAlbum.title, selectedAlbum.artist))}>Compartir álbum</button>
                  <button className="mt-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-white" onClick={() => toggleSavedAlbum(selectedAlbum)}>
                    {savedAlbums.some(album => album.id === selectedAlbum.id) ? "Quitar de biblioteca" : "Guardar álbum"}
                  </button>
                  <p className="text-sm text-gray-400 mt-2">By {selectedAlbum.artist}</p>
                  {selectedAlbum.releaseDate && (
                    <p className="text-xs text-gray-500 mt-1">Released {selectedAlbum.releaseDate}</p>
                  )}
                  <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
                    <button
                      onClick={() => {
                        if (albumTracks.length > 0) {
                          playTrack(albumTracks[0], albumTracks);
                        }
                      }}
                      className="w-12 h-12 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black flex items-center justify-center transition-all shadow-lg shadow-brand-accent/25 active:scale-95 shrink-0"
                      title="Play album"
                    >
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!selectedAlbum) return;
                        setAlbumToAddToPlaylist({ album: selectedAlbum, tracks: albumTracks });
                      }}
                      className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 text-xs font-semibold transition-all border border-white/10 active:scale-95"
                      title="Add album tracks to an existing playlist"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!selectedAlbum) return;
                        handleSaveAlbumAsPlaylist(selectedAlbum, albumTracks);
                      }}
                      className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center gap-2 text-xs font-semibold transition-all border border-white/10 active:scale-95"
                      title="Create a new playlist with this album"
                    >
                      <ListMusic className="w-4 h-4" />
                      <span>Save as playlist</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {isLoadingAlbum ? (
                  <LoadingSkeleton layout="tracks" label="Cargando canciones del álbum…" />
                ) : albumTracks.length === 0 ? (
                  <p className="text-center py-12 text-gray-500 text-sm">No tracks found for this album.</p>
                ) : (
                  <>
                    {/* Bulk Action Toolbar */}
                    {isSelecting && (
                      <div id="bulk-action-toolbar" className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5 mb-2 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
                        <button
                          onClick={() => handleSelectAll(albumTracks)}
                          className="text-xs text-brand-accent hover:underline font-semibold shrink-0"
                        >
                          {selectedTrackIds.size === albumTracks.length ? "Deselect all" : "Select all"}
                        </button>
                        <span className="text-gray-500 text-xs shrink-0">{selectedTrackIds.size} selected</span>
                        <div className="flex-1" />
                        <button
                          onClick={() => {
                            const sel = albumTracks.filter(t => selectedTrackIds.has(t.id));
                            handleBulkAddToFavorites(sel);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-400 text-xs font-medium transition-all"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Favorites</span>
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setShowBulkPlaylistPicker(prev => !prev)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-brand-accent/20 border border-white/10 text-gray-300 hover:text-brand-accent text-xs font-medium transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                          </button>
                          {showBulkPlaylistPicker && (
                            <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 z-50 max-h-56 overflow-y-auto animate-[fadeIn_0.15s_ease]">
                              {playlists.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-gray-500 italic text-center">No playlists yet</div>
                              ) : (
                                playlists.map(pl => (
                                  <button
                                    key={pl.id}
                                    onClick={() => {
                                      const sel = albumTracks.filter(t => selectedTrackIds.has(t.id));
                                      handleBulkAddToPlaylist(pl.id, sel);
                                    }}
                                    className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-white/5 hover:text-white text-gray-300 text-xs transition-all truncate"
                                  >
                                    <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="truncate">{pl.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={clearSelection}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white text-xs transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {filterTracks(albumTracks).map((track, idx) => {
                      const isChecked = selectedTrackIds.has(track.id);
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                        >
                          {isSelecting && (
                            <div
                              className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                              onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                              onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); event.stopPropagation(); handleSelectTrack(track.id); } }}
                              role="checkbox" tabIndex={0} aria-checked={isChecked} aria-label={track.title}
                              title={isChecked ? localized(language, "Deseleccionar", "Deselect", "Kendu hautapena") : localized(language, "Seleccionar", "Select", "Hautatu")}
                            >
                              <div
                                className={`rounded-md border-2 flex items-center justify-center transition-all
                                  ${isChecked
                                    ? "border-brand-accent bg-brand-accent"
                                    : "border-white/80 bg-black"
                                  }`}
                                style={{ width: "18px", height: "18px", minWidth: "18px" }}
                              >
                                {isChecked && (
                                  <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,4 3.5,7 9,1" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <TrackCard
                              track={track}
                              variant="row"
                              tracksQueue={filterTracks(albumTracks)}
                              onToggleFavorite={handleToggleFavorite}
                              isFavorite={favorites.some((f) => f.id === track.id)}
                              isExplicit={isTrackExplicit(track)}
                              onOpenArtist={handleOpenArtist}
                              onAddToPlaylist={handleOpenAddToPlaylist}
                              onContextMenu={(e) => handleTrackContextMenu(e, track)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </section>
          ) : activeTab === "playlists" ? (
            /* PLAYLISTS PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-6 h-6 text-brand-accent" /> {labels.playlists}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" aria-pressed={inListenLater} className={playlistHeaderButton} onClick={() => {
                    setSelectedPlaylist(null);
                    setShowListenLater(!inListenLater);
                    setLibrarySearchQuery("");
                    setListenLaterLimit(50);
                    clearSelection();
                  }}>
                    <Clock className="size-4" /> {listenLaterLabel}
                  </button>
                  <button
                    onClick={() => {
                      setShowSpotifyImportModal(true);
                    }}
                    className="px-4 py-2 rounded-full border border-white/10 hover:border-brand-accent hover:text-white text-xs font-semibold text-gray-300 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> {labels.importPlaylist}
                  </button>
                  <button
                    onClick={() => {
                      setShowPlaylistCreateModal(true);
                    }}
                    className="px-4 py-2 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all active:scale-95 flex items-center gap-1.5 shadow-md shadow-brand-accent/25"
                  >
                    <Plus className="w-3.5 h-3.5" /> {labels.newPlaylist}
                  </button>
                </div>
              </div>

              {inListenLater ? (() => {
                const selected = listenLaterTracks.filter(track => selectedTrackIds.has(track.id));
                return <div className="grid gap-4">
                  <header className="glass-card flex items-center gap-4 rounded-2xl p-5">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-accent">
                      <Clock className="size-6" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{listenLaterLabel}</h3>
                      <p className="mt-1 text-sm text-gray-400">
                        {localized(language, `${listenLater.length} canciones guardadas`, `${listenLater.length} saved tracks`, `${listenLater.length} abesti gordeta`)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {localized(language, "Canciones pendientes de escuchar u organizar.", "Tracks to listen to or organize later.", "Gero entzuteko edo antolatzeko abestiak.")}
                      </p>
                    </div>
                  </header>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={playlistHeaderButton} disabled={!listenLaterTracks.length}
                      onClick={() => playTrack(listenLaterTracks[0], listenLaterTracks, "listen-later")}>
                      <Play className="size-4" /> {localized(language, "Reproducir todo", "Play all", "Erreproduzitu dena")}
                    </button>
                    <button type="button" className={playlistHeaderButton} disabled={!listenLaterTracks.length}
                      onClick={() => playShuffledPlaylist(listenLaterTracks, "listen-later")}>
                      <Shuffle className="size-4" /> {localized(language, "Aleatorio", "Shuffle", "Ausaz")}
                    </button>
                    <select className={playlistHeaderButton} aria-label={localized(language, "Orden", "Sort", "Ordenatu")} value={listenLaterSort}
                      onChange={event => setListenLaterSort(event.target.value)}>
                      <option value="date">{localized(language, "Fecha de guardado", "Date saved", "Gordetze-data")}</option>
                      <option value="title">{localized(language, "Título", "Title", "Izenburua")}</option>
                      <option value="artist">{localized(language, "Artista", "Artist", "Artista")}</option>
                    </select>
                  </div>
                  {userId && (syncState === "error" || syncState === "offline") && <div role="status" className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{syncError || localized(language, "Guardado en este dispositivo", "Saved on this device", "Gailu honetan gordeta")}</span>
                    {syncState === "error" && <button className={playlistHeaderButton} onClick={() => setSyncAttempt(attempt => attempt + 1)}>
                      {localized(language, "Reintentar", "Retry", "Saiatu berriro")}
                    </button>}
                  </div>}
                  {!!selected.length && <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-400">{selected.length}</span>
                    <button type="button" className={playlistHeaderButton} onClick={() => {
                      const ids = new Set(selected.map(track => track.id));
                      setListenLater(entries => entries.filter(entry => !ids.has(entry.id)));
                      clearSelection();
                      showToast(localized(language, "Selección quitada", "Selection removed", "Hautapena kenduta"), "success");
                    }}><Trash2 className="size-4" /> {localized(language, "Quitar", "Remove", "Kendu")}</button>
                    <button type="button" className={playlistHeaderButton} onClick={() => {
                      selected.forEach(track => roomId && !isHost ? proposeRoomTrack(track) : addToQueue(track));
                      clearSelection();
                    }}><ListPlus className="size-4" /> {localized(language, "Añadir a la cola", "Add to queue", "Gehitu ilarara")}</button>
                    <ActionMenu label={localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")} className={playlistHeaderButton}
                      button={<><Plus className="size-4" /> {localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</>}>
                      {close => playlists.map(playlist => <button key={playlist.id} className={menuAction}
                        onClick={() => { handleBulkAddToPlaylist(playlist.id, selected); close(); }}>{playlist.name}</button>)}
                    </ActionMenu>
                    <button type="button" className={playlistHeaderButton} onClick={clearSelection}>
                      {localized(language, "Deseleccionar", "Clear selection", "Garbitu hautapena")}
                    </button>
                  </div>}
                  {!listenLaterTracks.length && <p className="py-10 text-center text-sm text-gray-400">
                    {listenLater.length ? localized(language, "No hay coincidencias visibles.", "No visible matches.", "Ez dago emaitza ikusgairik.")
                      : localized(language, "Guarda canciones desde su menú para encontrarlas aquí.", "Save songs from their menu to find them here.", "Gorde abestiak menutik hemen aurkitzeko.")}
                  </p>}
                  {listenLaterTracks.slice(0, listenLaterLimit).map((track, index) => (
                    <div key={track.id} className="flex items-center gap-2">
                      <input type="checkbox" className="ml-2 accent-brand-accent" checked={selectedTrackIds.has(track.id)}
                        aria-label={`${localized(language, "Seleccionar", "Select", "Hautatu")} ${track.title}`} onChange={() => handleSelectTrack(track.id)} />
                      <div className="min-w-0 flex-1">
                        <TrackCard track={track} trackIndex={index + 1} variant="row" tracksQueue={listenLaterTracks} playlistId="listen-later"
                          onContextMenu={handleTrackContextMenu} isFavorite={favorites.some(item => item.id === track.id)}
                          isExplicit={isTrackExplicit(track)} onToggleFavorite={handleToggleFavorite} onAddToPlaylist={handleOpenAddToPlaylist}
                          onOpenArtist={handleOpenArtist} onOpenAlbum={handleOpenAlbum} />
                      </div>
                      <button type="button" className={playlistHeaderButton} title={localized(language, "Quitar de Escuchar más tarde", "Remove from Listen Later", "Kendu Gero entzutetik")}
                        aria-label={localized(language, "Quitar de Escuchar más tarde", "Remove from Listen Later", "Kendu Gero entzutetik")}
                        onClick={() => toggleListenLater(track)}><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                  {listenLaterTracks.length > listenLaterLimit && <button type="button" className={playlistHeaderButton + " justify-self-center"}
                    onClick={() => setListenLaterLimit(limit => limit + 50)}>
                    {localized(language, "Mostrar más", "Show more", "Erakutsi gehiago")}
                  </button>}
                </div>;
              })() : selectedPlaylist ? (
                /* VIEW SPECIFIC PLAYLIST */
                <div className="flex flex-col gap-6">
                  {/* Playlist Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedPlaylist(null)}
                      className={playlistHeaderButton}
                    >
                      ← Back to Playlists
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {isOwnPlaylist ? (
                        <>
                          {user && (
                            <button
                              onClick={() => {
                                const updated = playlists.map(p => {
                                  if (p.id === selectedPlaylist.id) {
                                    const newPublic = !p.isPublic;
                                    return { ...p, isPublic: newPublic };
                                  }
                                  return p;
                                });
                                savePlaylists(updated);
                                setSelectedPlaylist(prev => prev ? { ...prev, isPublic: !prev.isPublic } : null);
                                showToast(!selectedPlaylist.isPublic ? "Playlist is now Public" : "Playlist is now Private", "success");
                              }}
                              className={`${playlistHeaderControl} ${
                                selectedPlaylist.isPublic
                                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                                  : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                              }`}
                            >
                              {selectedPlaylist.isPublic ? (
                                <>
                                  <Globe className="w-3.5 h-3.5" /> {localized(language, "Pública", "Public", "Publikoa")}
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3.5 h-3.5" /> {localized(language, "Privada", "Private", "Pribatua")}
                                </>
                              )}
                            </button>
                          )}
                          {user && selectedPlaylist.isPublic && (
                            <button
                              onClick={() => void copyLink(getPlaylistShareUrl(selectedPlaylist.id))}
                              className={playlistHeaderButton}
                            >
                              <Link className="w-3.5 h-3.5" /> {localized(language, "Copiar enlace", "Copy link", "Kopiatu esteka")}
                            </button>
                          )}
                          {userId && <button className={playlistHeaderButton} onClick={() => setManageShare(selectedPlaylist)}><Link className="size-3.5" /> {localized(language, "Compartir", "Share", "Partekatu")}</button>}
                          <ActionMenu animated label={localized(language, "Acciones de playlist", "Playlist options", "Zerrendaren aukerak")} button={<MoreVertical className="size-4" />} className={playlistHeaderButton}>
                            {close => <>
                              <section className="playlist-options-group">
                                <h3>{localized(language, "Personalización", "Customization", "Pertsonalizazioa")}</h3>
                                <button className={menuAction} onClick={() => { close(); setEditingPlaylistId(selectedPlaylist.id); setEditingPlaylistName(selectedPlaylist.name); }}><Pencil aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Editar nombre", "Edit playlist name", "Editatu izena")}</button>
                                <button className={menuAction} onClick={() => { close(); openPlaylistCoverPicker(); }}><Image aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Cambiar portada", "Change cover", "Aldatu azala")}</button>
                                <details className="group/cover-fit">
                                  <summary className={menuAction + " cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden"}>
                                    {localized(language, "Ajuste de portada", "Cover fit", "Azalaren egokitzapena")}
                                    <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 motion-safe:transition-transform group-open/cover-fit:rotate-180" />
                                  </summary>
                                  <div className="ml-3 mt-0.5 border-l border-white/10 pl-1.5 motion-safe:animate-[fadeIn_0.15s_ease-out]">
                                    {([
                                      ["cover", localized(language, "Rellenar el espacio", "Fill (crop)", "Bete (moztu)")],
                                      ["contain", localized(language, "Mostrar imagen completa", "Fit whole image", "Egokitu irudi osoa")],
                                      ["scale-down", localized(language, "Centrar sin ampliar", "Center without enlarging", "Erdiratu handitu gabe")],
                                    ] as const).map(([mode, label]) => {
                                      const active = (selectedPlaylist.coverFit ?? "contain") === mode;
                                      return <button key={mode} type="button" aria-pressed={active} className={menuAction + " justify-between"} onClick={() => {
                                        handlePlaylistCoverFit(selectedPlaylist.id, mode);
                                        close();
                                      }}>
                                        {label}
                                        {active && <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-brand-accent" />}
                                      </button>;
                                    })}
                                  </div>
                                </details>
                              </section>
                              <section className="playlist-options-group">
                                <h3>{localized(language, "Organización", "Organization", "Antolaketa")}</h3>
                                <button className={menuAction} onClick={() => { handleTogglePinPlaylist(selectedPlaylist.id); close(); }}>
                                  {pinnedPlaylistIds.has(selectedPlaylist.id)
                                    ? <><PinOff aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Desfijar playlist", "Unpin playlist", "Askatu zerrenda")}</>
                                    : <><Pin aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Fijar playlist", "Pin playlist", "Finkatu zerrenda")}</>}
                                </button>
                                <button className={menuAction} onClick={() => { close(); setPlaylistFolderDraft(selectedPlaylist.folder ?? ""); }}><Folder aria-hidden="true" className="size-4 shrink-0" /> {selectedPlaylist.folder || localized(language, "Asignar a carpeta", "Assign to folder", "Esleitu karpetara")}</button>
                                <button className={menuAction} onClick={() => { close(); setCleanDestination(""); setDuplicateSelection(new Set(duplicateIndices(selectedPlaylist.tracks))); }}><CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Revisar duplicados", "Review duplicates", "Berrikusi bikoiztuak")}</button>
                              </section>
                              <section className="playlist-options-group">
                                <h3>{localized(language, "Gestión", "Management", "Kudeaketa")}</h3>
                                {(["json", "csv", "m3u"] as const).map(format => <button key={format} className={menuAction} onClick={() => { close(); exportPlaylist(selectedPlaylist, format); }}><FileDown aria-hidden="true" className="size-4 shrink-0" />{localized(language, "Exportar", "Export", "Esportatu")} {format.toUpperCase()}</button>)}
                                <button className={menuAction + " !text-red-400 hover:!bg-red-500/20"} onClick={() => { close(); handleDeletePlaylist(selectedPlaylist.id); }}><Trash2 aria-hidden="true" className="size-4 shrink-0" /> {localized(language, "Eliminar playlist", "Delete playlist", "Ezabatu zerrenda")}</button>
                              </section>
                            </>}
                          </ActionMenu>
                          {duplicateSelection !== null && <Modal title="Duplicados de la playlist" onClose={() => setDuplicateSelection(null)}>
                            {duplicateIndices(selectedPlaylist.tracks).length === 0 ? <p className="text-sm text-gray-400">Esta playlist no tiene duplicados por título y artista.</p> : <div className="grid gap-3">
                              <p className="text-xs text-gray-400">Se conserva la primera copia de cada canción.</p>
                              <div className="grid max-h-[40dvh] overflow-auto">
                                {duplicateIndices(selectedPlaylist.tracks).map(index => <label key={index} className={menuAction}>
                                  <input type="checkbox" checked={duplicateSelection.has(index)} onChange={() => setDuplicateSelection(previous => {
                                    const next = new Set(previous ?? []);
                                    if (next.has(index)) next.delete(index); else next.add(index);
                                    return next;
                                  })} />
                                  {selectedPlaylist.tracks[index].title} · {selectedPlaylist.tracks[index].artist}
                                </label>)}
                              </div>
                              <label className="grid gap-1 text-xs text-gray-300">Acción
                                <select className={playlistHeaderButton} value={cleanDestination} onChange={event => setCleanDestination(event.target.value)}>
                                  <option value="">Quitar de esta playlist</option>
                                  {playlists.filter(list => list.id !== selectedPlaylist.id).map(list => <option key={list.id} value={list.id}>Mover a {list.name}</option>)}
                                </select>
                              </label>
                              <button className={playlistHeaderButton} disabled={!duplicateSelection.size} onClick={() => changePlaylistSelection(selectedPlaylist, duplicateSelection, cleanDestination)}>{cleanDestination ? "Mover" : "Quitar"} ({duplicateSelection.size})</button>
                            </div>}
                          </Modal>}
                          {playlistFolderDraft !== null && (
                            <Modal title="Asignar a carpeta" onClose={() => setPlaylistFolderDraft(null)}>
                              <form className="flex flex-col gap-4" onSubmit={event => {
                                event.preventDefault();
                                const folder = playlistFolderDraft.trim();
                                if (folder !== (selectedPlaylist.folder ?? "")) {
                                  const updated = { ...selectedPlaylist, folder };
                                  savePlaylists(playlists.map(item => item.id === updated.id ? updated : item));
                                  setSelectedPlaylist(updated);
                                }
                                setPlaylistFolderDraft(null);
                              }}>
                                <p className="text-sm text-gray-400">Agrupa playlists con el mismo nombre de carpeta y fíltralas en Biblioteca. Déjalo vacío para quitar esta lista de su carpeta.</p>
                                <label className="grid gap-2 text-xs font-semibold text-gray-300">
                                  Nombre de la carpeta
                                  <input autoFocus list="playlist-folder-names" maxLength={50} placeholder="Ej. Para entrenar" value={playlistFolderDraft}
                                    onChange={event => setPlaylistFolderDraft(event.target.value)}
                                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500" />
                                </label>
                                <datalist id="playlist-folder-names">
                                  {[...new Set(playlists.map(item => item.folder).filter(Boolean))].map(folder => <option key={folder} value={folder} />)}
                                </datalist>
                                <div className="flex justify-end gap-2">
                                  <button type="button" className={playlistHeaderButton} onClick={() => setPlaylistFolderDraft(null)}>{localized(language, "Cancelar", "Cancel", "Utzi")}</button>
                                  <button type="submit" className="rounded-full bg-brand-accent px-4 py-2 text-xs font-semibold text-black">Guardar</button>
                                </div>
                              </form>
                            </Modal>
                          )}
                        </>
                      ) : (
                        <>
                          {(() => {
                            const isAlreadyAdded = playlists.some(
                              p => p.name.toLowerCase() === selectedPlaylist.name.toLowerCase() &&
                                   p.tracks.length === selectedPlaylist.tracks.length
                            );
                            return (
                              <button
                                onClick={() => !isAlreadyAdded && handleAddPlaylistToLibrary(selectedPlaylist)}
                                disabled={isAlreadyAdded}
                                className={`${playlistHeaderControl} ${
                                  isAlreadyAdded
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 cursor-default"
                                    : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                                }`}
                              >
                                {isAlreadyAdded ? (
                                  <>
                                    <svg viewBox="0 0 10 8" className="w-3 h-3 stroke-current" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="1,4 3.5,7 9,1" />
                                    </svg>
                                    Added to Library
                                  </>
                                ) : (
                                  <>
                                    <Plus className="w-3.5 h-3.5" /> Add to Library
                                  </>
                                )}
                              </button>
                            );
                          })()}
                          {selectedPlaylist.isPublic && (
                            <button
                              onClick={() => void copyLink(getPlaylistShareUrl(selectedPlaylist.id))}
                              className={playlistHeaderButton}
                            >
                              <Link className="w-3.5 h-3.5" /> Copy Link
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-brand-accent/10 to-transparent border border-white/5 flex flex-col md:flex-row gap-6 items-center">
                    <div
                      className={`w-44 h-44 sm:w-52 sm:h-52 md:w-60 md:h-60 rounded-2xl md:rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center relative shadow-2xl shadow-black/60 overflow-hidden shrink-0 ${isOwnPlaylist ? "group cursor-pointer" : ""}`}
                      onClick={isOwnPlaylist ? openPlaylistCoverPicker : undefined}
                      title={isOwnPlaylist ? localized(language, "Cambiar portada", "Change cover", "Aldatu azala") : undefined}
                    >
                      {selectedPlaylist.coverUrl || (selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && selectedPlaylist.tracks[0].thumbnail) ? (
                        <img src={selectedPlaylist.coverUrl || selectedPlaylist.tracks[0].thumbnail} className="w-full h-full object-contain" style={{ objectFit: selectedPlaylist.coverFit }} alt="Playlist cover" />
                      ) : (
                        <ListMusic className="w-20 h-20 text-brand-accent/70" />
                      )}
                      {isOwnPlaylist && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
                          <Plus className="w-8 h-8 text-white mb-1.5" />
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider">{localized(language, "Cambiar portada", "Change cover", "Aldatu azala")}</span>
                        </div>
                      )}
                    </div>
                    {isOwnPlaylist && (
                      <input
                        id="playlist-cover-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const base64 = event.target?.result as string;
                              handleUpdatePlaylistCover(selectedPlaylist.id, base64);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    )}
                    <div className="flex-1 text-center md:text-left min-w-0 flex flex-col justify-center">
                      <span className="text-xs font-bold uppercase tracking-widest text-brand-accent">Playlist</span>
                      {editingPlaylistId === selectedPlaylist.id ? (
                        <div className="flex items-center gap-2 mt-2 max-w-md mx-auto md:mx-0">
                          <input
                            type="text"
                            value={editingPlaylistName}
                            onChange={(e) => setEditingPlaylistName(e.target.value)}
                            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-base focus:outline-none focus:border-brand-accent"
                          />
                          <button
                            onClick={() => handleRenamePlaylist(selectedPlaylist.id, editingPlaylistName)}
                            className="px-3.5 py-1.5 bg-brand-accent text-black rounded-xl text-xs font-bold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPlaylistId(null)}
                            className="px-3.5 py-1.5 border border-white/10 text-gray-400 rounded-xl text-xs"
                          >
                            {localized(language, "Cancelar", "Cancel", "Utzi")}
                          </button>
                        </div>
                      ) : (
                        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white mt-1.5 tracking-tight break-words line-clamp-2">
                          {selectedPlaylist.name}
                        </h1>
                      )}
                      <p className="text-sm md:text-base font-medium text-gray-400 mt-2.5">
                        {selectedPlaylist.tracks.length} {selectedPlaylist.tracks.length === 1 ? "Song" : "Songs"}
                      </p>
                      {selectedPlaylist.tracks.length > 0 && (
                        <div className="flex items-center gap-4 mt-6 justify-center md:justify-start">
                          <button
                            onClick={() => {
                              const filtered = selectedPlaylist.tracks.filter(track =>
                                track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                                track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                                (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                              );
                              if (filtered.length > 0) {
                                playTrack(filtered[0], filtered, selectedPlaylist.id);
                              }
                            }}
                            className="w-12 h-12 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black flex items-center justify-center transition-all shadow-lg shadow-brand-accent/25 active:scale-95 shrink-0"
                            title="Play playlist"
                          >
                            <Play className="w-5 h-5 fill-current ml-0.5" />
                          </button>
                          <button
                            onClick={() => {
                              const filtered = selectedPlaylist.tracks.filter(track =>
                                track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                                track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                                (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                              );
                              if (filtered.length > 0) {
                                const tracks = filterTracks(filtered);
                                if (tracks.length > 0) playShuffledPlaylist(tracks, selectedPlaylist.id);
                              }
                            }}
                            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/10 active:scale-95 shrink-0"
                            title="Shuffle play playlist"
                          >
                            <Shuffle className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Search Bar for Playlist Tracks */}
                  {selectedPlaylist.tracks.length > 0 && (
                    <div className="relative max-w-md w-full">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder={localized(language, "Buscar en esta playlist…", "Search inside this playlist...", "Bilatu zerrenda honetan…")}
                        value={subSearchQuery}
                        onChange={(e) => setSubSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 rounded-full text-xs text-white placeholder:text-gray-500 focus:outline-none transition-all"
                      />
                      {subSearchQuery && (
                        <button
                          onClick={() => setSubSearchQuery("")}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Playlist Tracks List */}
                  <div className="flex flex-col gap-3">
                    {selectedPlaylist.tracks.length === 0 ? (
                      <div className="text-center py-16 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                        <p className="font-semibold text-gray-400">This playlist has no songs yet</p>
                        <p className="text-xs text-gray-600 mt-1">Search for songs and click the "+" button to add them here</p>
                      </div>
                    ) : (() => {
                      const playlistTracks = filterTracks(selectedPlaylist.tracks);
                      if (playlistTracks.length === 0) {
                        return (
                          <div className="text-center py-16 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                            <p className="font-semibold text-gray-400">{localized(language, "No hay canciones visibles con el filtro actual.", "No songs match the current filter.", "Iragazki honekin ez da abestirik ikusten.")}</p>
                          </div>
                        );
                      }
                      const filtered = playlistTracks.filter(track =>
                        track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                        track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                        (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                            <p className="font-semibold text-gray-400">No results found for "{subSearchQuery}"</p>
                            <p className="text-xs text-gray-600 mt-1">{localized(language, "Revisa la ortografía o busca otra canción", "Try checking for typos or searching a different song", "Egiaztatu ortografia edo bilatu beste abesti bat")}</p>
                          </div>
                        );
                      }

                      // Sort tracks
                      const sortedTracks = [...filtered].sort((a, b) => {
                        if (!sortField) return 0;
                        let valA: any = "";
                        let valB: any = "";

                        if (sortField === "title") {
                          valA = a.title.toLowerCase();
                          valB = b.title.toLowerCase();
                        } else if (sortField === "album") {
                          valA = (a.albumName || "").toLowerCase();
                          valB = (b.albumName || "").toLowerCase();
                        } else if (sortField === "duration") {
                          valA = a.duration;
                          valB = b.duration;
                        } else if (sortField === "dateAdded") {
                          valA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                          valB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
                        }

                        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
                        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
                        return 0;
                      });

                      return (
                        <>
                          {/* Table Header Row */}
                          <div className="hidden md:grid grid-cols-12 gap-4 items-center px-4 py-2 border-b border-white/5 text-[10px] uppercase font-bold tracking-widest text-gray-500 select-none">
                            <div
                              onClick={() => handleSort("title")}
                              className="col-span-5 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
                            >
                              <span>#</span>
                              <span>Title</span>
                              {sortField === "title" && (
                                <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                            <div
                              onClick={() => handleSort("album")}
                              className="col-span-3 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
                            >
                              <span>Album</span>
                              {sortField === "album" && (
                                <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                            <div
                              onClick={() => handleSort("dateAdded")}
                              className="col-span-2 flex items-center gap-1.5 cursor-pointer hover:text-white transition-colors"
                            >
                              <span>Date added</span>
                              {sortField === "dateAdded" && (
                                <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                            <div
                              onClick={() => handleSort("duration")}
                              className="col-span-2 flex items-center justify-end gap-1.5 cursor-pointer hover:text-white transition-colors text-right"
                            >
                              <Clock className="w-3.5 h-3.5" />
                              {sortField === "duration" && (
                                <span>{sortDirection === "asc" ? "▲" : "▼"}</span>
                              )}
                            </div>
                          </div>

                          {/* Bulk Action Toolbar */}
                          {isSelecting && (
                            <div id="bulk-action-toolbar" className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5 mb-2 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
                              <button
                                onClick={() => handleSelectAll(sortedTracks)}
                                className="text-xs text-brand-accent hover:underline font-semibold shrink-0"
                              >
                                {selectedTrackIds.size === sortedTracks.length ? "Deselect all" : "Select all"}
                              </button>
                              <span className="text-gray-500 text-xs shrink-0">{selectedTrackIds.size} selected</span>
                              <div className="flex-1" />
                              {/* Add to Favorites */}
                              <button
                                onClick={() => {
                                  const sel = sortedTracks.filter(t => selectedTrackIds.has(t.id));
                                  handleBulkAddToFavorites(sel);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-400 text-xs font-medium transition-all"
                              >
                                <Heart className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Favorites</span>
                              </button>
                              {/* Add to Playlist */}
                              <div className="relative">
                                <button
                                  onClick={() => setShowBulkPlaylistPicker(prev => !prev)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-brand-accent/20 border border-white/10 text-gray-300 hover:text-brand-accent text-xs font-medium transition-all"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                                </button>
                                {showBulkPlaylistPicker && (
                                  <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 z-50 max-h-56 overflow-y-auto animate-[fadeIn_0.15s_ease]">
                                    {playlists.length === 0 ? (
                                      <div className="px-4 py-3 text-xs text-gray-500 italic text-center">No playlists yet</div>
                                    ) : (
                                      playlists.map(pl => (
                                        <React.Fragment key={pl.id}>
                                        <button
                                          onClick={() => {
                                            const sel = sortedTracks.filter(t => selectedTrackIds.has(t.id));
                                            handleBulkAddToPlaylist(pl.id, sel);
                                          }}
                                          className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-white/5 hover:text-white text-gray-300 text-xs transition-all truncate"
                                        >
                                          <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                          <span className="truncate">Copiar a {pl.name}</span>
                                        </button>
                                        {isOwnPlaylist && pl.id !== selectedPlaylist.id && <button type="button" className={menuAction} onClick={() => changePlaylistSelection(selectedPlaylist, new Set(selectedPlaylist.tracks.flatMap((track, index) => selectedTrackIds.has(track.id) ? [index] : [])), pl.id)}>Mover a {pl.name}</button>}
                                        </React.Fragment>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* Remove from this playlist */}
                              {isOwnPlaylist && (
                                <button
                                  onClick={() => {
                                    changePlaylistSelection(selectedPlaylist, new Set(selectedPlaylist.tracks.flatMap((track, index) => selectedTrackIds.has(track.id) ? [index] : [])));
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-400 hover:text-red-400 text-xs font-medium transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Remove</span>
                                </button>
                              )}
                              {/* Cancel */}
                              <button
                                onClick={clearSelection}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white text-xs transition-all"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}

                          {/* Tracks */}
                          <div className="flex flex-col gap-2 mt-2">
                            {sortedTracks.slice(0, visiblePlaylistCount).map((track, idx) => {
                              const isChecked = selectedTrackIds.has(track.id);
                              return (
                                <div
                                  key={`${track.id}-${idx}`}
                                  draggable={isOwnPlaylist && !sortField && !subSearchQuery && !isSelecting}
                                  onDragStart={event => {
                                    if (!matchMedia("(min-width: 1024px)").matches) { event.preventDefault(); return; }
                                    playlistDrag.current = selectedPlaylist.tracks.indexOf(track);
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", track.title);
                                  }}
                                  onDragOver={event => { if (playlistDrag.current !== null) event.preventDefault(); }}
                                  onDragEnd={() => { playlistDrag.current = null; }}
                                  onDrop={event => {
                                    if (playlistDrag.current === null) return;
                                    event.preventDefault();
                                    reorderPlaylistTracks(selectedPlaylist, playlistDrag.current, selectedPlaylist.tracks.indexOf(track));
                                    playlistDrag.current = null;
                                  }}
                                  className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                                >
                                  {/* Checkbox (only rendered during selection) */}
                                  {isSelecting && (
                                    <div
                                      className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                                      onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                                      title={isChecked ? "Deselect" : "Select"}
                                    >
                                      <div
                                        className={`rounded-md border-2 flex items-center justify-center transition-all
                                          ${isChecked
                                            ? "border-brand-accent bg-brand-accent"
                                            : "border-white/80 bg-black"
                                          }`}
                                        style={{ width: "18px", height: "18px", minWidth: "18px" }}
                                      >
                                        {isChecked && (
                                          <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="1,4 3.5,7 9,1" />
                                          </svg>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <TrackCard
                                      track={track}
                                      variant="row"
                                      tracksQueue={sortedTracks}
                                      onToggleFavorite={handleToggleFavorite}
                                      isFavorite={favorites.some((f) => f.id === track.id)}
                                      isExplicit={isTrackExplicit(track)}

                                      onOpenArtist={handleOpenArtist}
                                      onOpenAlbum={handleOpenAlbum}
                                      onAddToPlaylist={handleOpenAddToPlaylist}
                                      trackIndex={idx + 1}
                                      onContextMenu={(e) => handleTrackContextMenu(e, track, selectedPlaylist?.id)}
                                      playlistId={selectedPlaylist?.id}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {sortedTracks.length > visiblePlaylistCount && (
                            <div
                              ref={playlistSentinelRef}
                              className="h-10 w-full opacity-0 pointer-events-none"
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                /* LIST ALL PLAYLISTS */
                <div className="flex flex-col gap-4">
                  <React.Suspense fallback={null}>
                    <LibraryExtras deleted={deletedPlaylists} onRestore={restorePlaylist} />
                  </React.Suspense>
                  <div className="hidden flex-wrap gap-2 lg:flex">
                    <select aria-label={localized(language, "Orden de biblioteca", "Library sort order", "Liburutegiaren ordena")} className={playlistHeaderButton} value={desktopLibrarySort} onChange={event => setDesktopLibrarySort(event.target.value)}>
                      <option value="default">{localized(language, "Orden habitual", "Default order", "Ohiko ordena")}</option>
                      <option value="name">{localized(language, "Nombre", "Name", "Izena")}</option>
                      <option value="recent">{localized(language, "Modificadas recientemente", "Recently modified", "Duela gutxi aldatuak")}</option>
                      <option value="size">{localized(language, "Número de canciones", "Song count", "Abesti kopurua")}</option>
                    </select>
                    <button type="button" className={playlistHeaderButton} aria-pressed={desktopLibraryLayout === "list"} onClick={() => {
                      const next = desktopLibraryLayout === "list" ? "grid" : "list";
                      setDesktopLibraryLayout(next); localStorage.setItem("ibrastream_desktop_library_layout", next);
                    }}>{desktopLibraryLayout === "list" ? localized(language, "Ver cuadrícula", "Grid view", "Sareta-ikuspegia") : localized(language, "Ver lista compacta", "Compact list", "Zerrenda trinkoa")}</button>
                  </div>
                  {playlists.some(item => item.folder) && (
                    <label className="text-sm text-gray-300">Carpeta
                      <select className="ml-2 rounded-lg bg-brand-darkBg p-2 text-white" value={playlistFolder} onChange={event => setPlaylistFolder(event.target.value)}>
                        <option value="">Todas</option>
                        {[...new Set(playlists.map(item => item.folder).filter(Boolean))].map(folder => <option key={folder}>{folder}</option>)}
                      </select>
                    </label>
                  )}
                  {smartPlaylists.length > 0 && <section className="hidden gap-2 rounded-2xl border border-white/10 p-3 lg:grid">
                    <h3 className="text-sm font-semibold text-white">{localized(language, "Playlists inteligentes", "Smart playlists", "Zerrenda adimendunak")}</h3>
                    <div className="flex flex-wrap gap-2">{smartPlaylists.map(list => <button key={list.id} className={playlistHeaderButton} onClick={() => setSelectedPlaylist(list)}><Sparkles className="size-3.5" />{list.name}</button>)}</div>
                  </section>}
                  {isHydratingPlaylists && playlists.length === 0 && savedAlbums.length === 0 ? (
                    <LoadingSkeleton layout="grid" count={4} label="Cargando biblioteca…" />
                  ) : playlists.length === 0 && savedAlbums.length === 0 ? (
                    <div className="text-center py-16 text-gray-500 glass-panel rounded-3xl p-8 border border-dashed border-gray-800">
                      <ListMusic className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                      <p className="font-semibold text-gray-400">Create your first playlist</p>
                      <p className="text-xs text-gray-600 mt-1">Click the button above to start your curation</p>
                    </div>
                  ) : (() => {
                    const filteredPlaylists = playlists.filter(playlist =>
                      !hiddenPlaylistIds.has(playlist.id) && (!playlistFolder || playlist.folder === playlistFolder)
                    );
                    if (desktopLibrarySort === "name") filteredPlaylists.sort((a, b) => a.name.localeCompare(b.name, language));
                    if (desktopLibrarySort === "size") filteredPlaylists.sort((a, b) => b.tracks.length - a.tracks.length);
                    if (desktopLibrarySort === "recent") {
                      const activity = new Map(filteredPlaylists.map(list => [list.id, list.tracks.reduce(
                        (latest, track) => Math.max(latest, Date.parse(track.dateAdded ?? "") || 0),
                        Date.parse(list.modifiedAt ?? list.createdAt ?? "") || 0,
                      )]));
                      filteredPlaylists.sort((a, b) => (activity.get(b.id) ?? 0) - (activity.get(a.id) ?? 0));
                    }
                    const filteredAlbums = playlistFolder ? [] : savedAlbums;
                    if (filteredPlaylists.length === 0 && filteredAlbums.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                              <p className="font-semibold text-gray-400">{localized(language, "No hay elementos visibles en la biblioteca", "No visible items in your library", "Ez dago ikusgai dagoen elementurik liburutegian")}</p>
                        </div>
                      );
                    }
                    return (
                      <div className={"desktop-library-grid grid grid-cols-2 gap-4 sm:grid-cols-4 " + (desktopLibraryLayout === "list" ? "desktop-library-list" : "")}>
                        {filteredPlaylists.map(playlist => (
                          <button
                            type="button"
                            key={playlist.id}
                            title={playlist.name}
                            onClick={() => setSelectedPlaylist(playlist)}
                            onContextMenu={(e) => handlePlaylistContextMenu(e, playlist)}
                            className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5 border border-white/5"
                          >
                            <div className="relative w-full aspect-square rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden">
                              {playlist.coverUrl || (playlist.tracks && playlist.tracks.length > 0 && playlist.tracks[0].thumbnail) ? (
                                <img src={playlist.coverUrl || playlist.tracks[0].thumbnail} alt="" loading="lazy" decoding="async" className="w-full h-full object-contain" style={{ objectFit: playlist.coverFit }} />
                              ) : (
                                <ListMusic className="w-16 h-16 text-brand-accent transition-transform duration-500 group-hover:scale-110" />
                              )}
                            </div>
                            <div className="w-full text-center min-w-0">
                              <h3 className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white group-hover:text-brand-accent">
                                <span className="min-w-0 truncate">{playlist.name}</span>
                                {pinnedPlaylistIds.has(playlist.id) && <span className="shrink-0 text-[10px] text-brand-accent">{localized(language, "Fijada", "Pinned", "Finkatua")}</span>}
                              </h3>
                              <p className="mt-1 text-[10px] text-gray-400">{playlist.tracks.length} {localized(language, "canciones", "songs", "abesti")}</p>
                            </div>
                          </button>
                        ))}
                        {filteredAlbums.map(album => (
                          <button type="button" key={"album-" + album.id} onClick={() => void handleOpenAlbum(album)} className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5 border border-white/5">
                            <div className="relative w-full aspect-square rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden">
                              {album.thumbnail ? (
                                <img src={album.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              ) : (
                                <Disc className="w-16 h-16 text-brand-accent transition-transform duration-500 group-hover:scale-110" />
                              )}
                            </div>
                            <div className="w-full text-center min-w-0">
                              <h3 className="font-semibold text-sm text-white truncate group-hover:text-brand-accent transition-colors duration-200">{album.title}</h3>
                              <p className="text-[10px] text-gray-400 mt-1 truncate">{album.artist}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>
          ) : activeTab === "search" ? (
            /* SEARCH / EXPLORE PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">

              <div className="md:hidden">
                {!mobileSearchOpen && <SearchField value={headerSearchValue} suggestions={searchSuggestions} label={headerSearchLabel} onChange={changeHeaderSearch} onSubmit={submitSearch} autoFocus={searchQuery === ""} />}
              </div>

              {/* Desktop header */}
              <div className="hidden md:flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Search className="w-6 h-6 text-brand-accent" /> {labels.explore}
                </h2>
              </div>

              {sharedTrack && <article onContextMenu={event => handleTrackContextMenu(event, sharedTrack.track)} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div><h2 className="font-semibold text-white">{sharedTrack.track.title}</h2><p className="text-sm text-gray-300">{sharedTrack.track.artist}</p></div>
                <button onClick={() => playTrack(sharedTrack.track, [sharedTrack.track], null, false, sharedTrack.seconds)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">{sharedTrack.seconds ? "Reproducir desde " + sharedTrack.seconds + " s" : "Reproducir"}</button>
              </article>}
              {!submittedQuery ? (
                <>
                  {/* ── Recent Search History as pills ── */}
                  {searchHistory.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between pl-1">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5" /> Recent Searches
                        </h3>
                        <button onClick={clearSearchHistory} className="text-[10px] text-gray-600 hover:text-white transition-colors hover:bg-white/5 px-2 py-1 rounded-lg">
                          Clear all
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {searchHistory.slice(0, 8).map((queryText, index) => (
                          <button
                            key={`hist-pill-${queryText}-${index}`}
                            className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-white/5 border border-white/8 hover:bg-white/10 active:scale-95 transition-all text-xs font-medium text-gray-300 hover:text-white group"
                            onClick={() => { setSearchQuery(queryText); handleSearch(queryText); }}
                          >
                            {queryText}
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); removeHistoryItem(queryText); }}
                              className="p-0.5 rounded-full text-gray-600 group-hover:text-gray-400 hover:text-white transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Genre / Mood Quick-Search Grid ── */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Browse by mood</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { label: "Pop Hits",      query: "pop hits 2024",             Icon: Music2 },
                        { label: "Hip-Hop",       query: "hip hop rap",               Icon: Mic2 },
                        { label: "R&B / Soul",    query: "rnb soul smooth",           Icon: Waves },
                        { label: "Electronic",    query: "electronic edm dance",      Icon: Zap },
                        { label: "Sad Vibes",     query: "sad emotional heartbreak",  Icon: CloudRain },
                        { label: "Good Energy",   query: "workout motivation upbeat", Icon: Flame },
                        { label: "Chill / Lo-fi", query: "chill lofi relaxing study", Icon: Moon },
                        { label: "Arabic Music",  query: "arabic music اغاني عربي",  Icon: Star },
                      ] as const).map((chip) => (
                        <button
                          key={chip.label}
                          id={`genre-chip-${chip.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                          onClick={() => {
                            setSearchQuery(chip.query);
                            setSearchType("track");
                            handleSearch(chip.query, "track");
                          }}
                          className="relative flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.08] hover:border-white/[0.12] active:scale-95 transition-all text-left overflow-hidden group"
                        >
                          <chip.Icon className="w-4 h-4 shrink-0 text-gray-400 group-hover:text-gray-200 transition-colors" strokeWidth={1.75} />
                          <span className="font-medium text-sm text-gray-300 group-hover:text-white leading-tight transition-colors">{chip.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Recently Played Tracks ── */}
                  {(() => {
                    let recentTracks: Track[] = [];
                    try {
                      const saved = localStorage.getItem("ibrastream_recently_played");
                      const parsed = saved ? JSON.parse(saved) : [];
                      recentTracks = Array.isArray(parsed) && parsed[0]?.title ? parsed : [];
                    } catch { recentTracks = []; }
                    if (recentTracks.length === 0) return null;
                    return (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-brand-accent" /> Recently Played
                        </h3>
                        <div className="flex flex-col gap-1.5">
                          {recentTracks.slice(0, 6).map((track: Track, idx: number) => (
                            <div
                              key={`explore-recent-${track.id}-${idx}`}
                              className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 active:bg-white/8 transition-all cursor-pointer group border border-transparent hover:border-white/5"
                              onClick={() => playTrack(track, recentTracks.slice(0, 10))}
                              onContextMenu={event => handleTrackContextMenu(event, track)}
                            >
                              <div className="relative shrink-0">
                                <img src={track.thumbnail} alt={track.title} className="w-11 h-11 rounded-xl object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                                  <Play className="w-4 h-4 fill-white text-white" />
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate group-hover:text-brand-accent transition-colors">{track.title}</p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{track.artist}</p>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSearchQuery(track.artist); handleSearch(track.artist, "track"); }}
                                className="shrink-0 text-[10px] text-gray-600 hover:text-brand-accent px-2 py-1 rounded-lg hover:bg-white/5 transition-all"
                              >
                                More
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Trending Tracks ── */}
                  {trendingTracks.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                        <Heart className="w-3.5 h-3.5 text-red-500 animate-pulse" /> Trending Now
                      </h3>
                      <div className="flex flex-col gap-2">
                        {filterTracks(trendingTracks).slice(0, 5).map((track, idx) => (
                          <TrackCard
                            key={`explore-trending-${track.id}-${idx}`}
                            track={track}
                            variant="row"
                            tracksQueue={trendingTracks}
                            onToggleFavorite={handleToggleFavorite}
                            isFavorite={favorites.some((f) => f.id === track.id)}
                            isExplicit={isTrackExplicit(track)}

                            onOpenArtist={handleOpenArtist}
                            onAddToPlaylist={handleOpenAddToPlaylist}
                            onContextMenu={(e) => handleTrackContextMenu(e, track)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Featured Playlists ── */}
                  {featuredPlaylists.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-brand-accent" /> Featured Playlists
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {featuredPlaylists.map((pl) => (
                          <div
                            key={`explore-feat-${pl.id}`}
                            onClick={() => {
                              setSelectedPlaylist({ id: String(pl.id), name: pl.name, tracks: pl.tracks || [], coverUrl: pl.pfp });
                              setActiveTab("playlists");
                            }}
                            className="glass-card rounded-2xl p-3.5 flex flex-col gap-2.5 group cursor-pointer active:scale-95 transition-all"
                          >
                            <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/5 overflow-hidden relative shadow-md">
                              {pl.pfp
                                ? <img src={pl.pfp} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300" alt={pl.name} />
                                : <ListMusic className="w-10 h-10 text-brand-accent absolute inset-0 m-auto group-hover:scale-110 transition-all duration-300" />
                              }
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-xl flex items-center justify-center">
                                <Play className="w-8 h-8 fill-white text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-xs text-white truncate group-hover:text-brand-accent transition-colors">{pl.name}</h4>
                              <p className="text-[10px] text-gray-500 mt-0.5">{pl.tracks?.length || 0} songs</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </>
              ) : (
                <>
                  {/* ── Filter Tabs ── */}
                  <div className="flex flex-wrap gap-1 rounded-2xl border border-white/5 bg-white/5 p-1" aria-label="Tipo de búsqueda">
                    {(["all", "track", "album", "artist", "community", "library"] as const).map((type) => (
                      <button
                        key={type}
                        aria-pressed={searchType === type}
                        onClick={() => { if (searchType !== type) void handleSearch(submittedQuery, type); }}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${
                          searchType === type
                            ? "bg-brand-accent text-white shadow-md shadow-brand-accent/20"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        {labels[type === "library" ? "playlists" : type]}
                      </button>
                    ))}
                  </div>

                  {isSearching && <LoadingSkeleton layout={["artist", "album", "community"].includes(searchType) ? "grid" : "tracks"} label={labels.searching} />}
                  {searchError && <div role="alert" className="rounded-xl border border-white/10 p-4 text-sm">No se pudo completar la búsqueda. <button className="underline" onClick={() => handleSearch(submittedQuery)}>{localized(language, "Reintentar", "Retry", "Saiatu berriro")}</button></div>}
                  {(searchType === "all" || searchType === "library") && (artistResults.length > 0 || albumResults.length > 0) && (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {artistResults.slice(0, 2).map(artist => <ArtistCard key={artist.id} artist={artist} onClick={handleOpenArtist} onFollow={handleToggleFollowArtist} followed={followedArtists.some(item => item.id === artist.id)} onShare={item => void copyLink(buildShareLink("artist", item.id, item.name))} />)}
                      {albumResults.filter(album => !releaseYear || album.releaseDate?.startsWith(releaseYear)).slice(0, 2).map(album => <AlbumCard key={album.id} album={album} onClick={handleOpenAlbum} />)}
                    </div>
                  )}
                  {sortedSearchTracks.length > visibleSearchTracks && !isSearching && <button className="order-last self-start rounded-lg border border-white/10 px-3 py-2 text-sm" onClick={() => setVisibleSearchTracks(count => count + 30)}>Mostrar más canciones</button>}
                  {searchType === "all" && isSearchingMore && !isSearching && <LoadingSkeleton layout="grid" count={2} label="Buscando artistas y álbumes…" />}
                  {(searchType === "album" || searchType === "all") && albumResults.length > 0 && (
                    <label className="text-sm text-gray-300">Año de lanzamiento
                      <select value={releaseYear} onChange={event => setReleaseYear(event.target.value)} className="ml-2 rounded-lg bg-brand-darkBg p-2 text-white">
                        <option value="">Todos</option>
                        {[...new Set(albumResults.map(album => album.releaseDate?.slice(0, 4)).filter(Boolean))].sort().reverse().map(year => <option key={year}>{year}</option>)}
                      </select>
                    </label>
                  )}
                  {searchResults.length > 0 && !isSearching && (
                    <label className="text-sm text-gray-300">Disponibilidad
                      <select value={searchVersion} onChange={event => { setSearchVersion(event.target.value); setVisibleSearchTracks(30); }} className="ml-2 rounded-lg bg-brand-darkBg p-2 text-white">
                        <option value="all">Todas</option><option value="clean">Sin marca explícita</option><option value="explicit">Explícitas</option>
                      </select>
                    </label>
                  )}
                  {searchResults.length > 1 && !isSearching && (
                    <label className="self-end text-sm text-gray-300">Orden
                      <select className="ml-2 rounded-lg bg-brand-darkBg p-2 text-white" value={searchSort} onChange={event => setSearchSort(event.target.value)}>
                        <option value="relevance">Relevancia</option><option value="shortest">Menor duración</option><option value="longest">Mayor duración</option>
                      </select>
                    </label>
                  )}
                  {libraryMatches.length > 0 && !isSearching && <section className="grid gap-2">
                    <h3 className="text-sm font-semibold text-white">Playlists de tu biblioteca</h3>
                    {libraryMatches.map(({ list, matches }) => <button key={list.id} className={menuAction} onClick={() => {
                      navigateTab("playlists");
                      setSubSearchQuery("");
                      setSelectedPlaylist(list);
                    }}>
                      <ListMusic className="size-4 shrink-0" />
                      <span className="min-w-0"><span className="block truncate text-white">{list.name}</span>
                        {matches.length > 0 && <span className="block truncate text-[11px] font-normal text-gray-400">{matches.map(track => track.title).slice(0, 3).join(" · ")}{matches.length > 3 ? " · +" + (matches.length - 3) : ""}</span>}
                      </span>
                    </button>)}
                  </section>}

                  {(!isSearching && !searchError && (searchType === "track" || searchType === "all" || searchType === "library")) && (
                    sortedSearchTracks.length === 0 ? (
                      isSearchingMore || (searchType === "all" && (albumResults.length > 0 || artistResults.length > 0)) || (searchType === "library" && (libraryMatches.length || artistResults.length || albumResults.length)) ? null :
                      <div className="text-center py-12 text-gray-500">
                        <p>{language === "es" ? "Sin canciones para" : "No tracks found for"} “{submittedQuery}”</p>
                        <p className="text-xs text-gray-400 mt-1">{language === "es" ? "Prueba con otro término o filtro" : "Try a different term or filter"}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-6">
                        {/* Bulk Action Toolbar */}
                        {isSelecting && (
                          <div id="bulk-action-toolbar" className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5 mb-2 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
                            <button
                              onClick={() => handleSelectAll([...searchResults, ...searchRecommendations])}
                              className="text-xs text-brand-accent hover:underline font-semibold shrink-0"
                            >
                              {selectedTrackIds.size === (searchResults.length + searchRecommendations.length) ? "Deselect all" : "Select all"}
                            </button>
                            <span className="text-gray-500 text-xs shrink-0">{selectedTrackIds.size} selected</span>
                            <div className="flex-1" />
                            <button
                              onClick={() => {
                                const combined = [...searchResults, ...searchRecommendations];
                                const sel = combined.filter(t => selectedTrackIds.has(t.id));
                                handleBulkAddToFavorites(sel);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-300 hover:text-red-400 text-xs font-medium transition-all"
                            >
                              <Heart className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Favorites</span>
                            </button>
                            <div className="relative">
                              <button
                                onClick={() => setShowBulkPlaylistPicker(prev => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-brand-accent/20 border border-white/10 text-gray-300 hover:text-brand-accent text-xs font-medium transition-all"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                              </button>
                              {showBulkPlaylistPicker && (
                                <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 z-50 max-h-56 overflow-y-auto animate-[fadeIn_0.15s_ease]">
                                  {playlists.length === 0 ? (
                                    <div className="px-4 py-3 text-xs text-gray-500 italic text-center">No playlists yet</div>
                                  ) : (
                                    playlists.map(pl => (
                                      <button
                                        key={pl.id}
                                        onClick={() => {
                                          const combined = [...searchResults, ...searchRecommendations];
                                          const sel = combined.filter(t => selectedTrackIds.has(t.id));
                                          handleBulkAddToPlaylist(pl.id, sel);
                                        }}
                                        className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-white/5 hover:text-white text-gray-300 text-xs transition-all truncate"
                                      >
                                        <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                        <span className="truncate">{pl.name}</span>
                                      </button>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={clearSelection}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white text-xs transition-all"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col gap-3">
                          {sortedSearchTracks.slice(0, visibleSearchTracks).map((track, idx) => {
                            const isChecked = selectedTrackIds.has(track.id);
                            return (
                              <div
                                key={`${track.id}-${idx}`}
                                className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                              >
                                {isSelecting && (
                                  <div
                                    className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                                    onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                                    title={isChecked ? "Deselect" : "Select"}
                                  >
                                    <div
                                      className={`rounded-md border-2 flex items-center justify-center transition-all
                                        ${isChecked
                                          ? "border-brand-accent bg-brand-accent"
                                          : "border-white/80 bg-black"
                                        }`}
                                      style={{ width: "18px", height: "18px", minWidth: "18px" }}
                                    >
                                      {isChecked && (
                                        <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="1,4 3.5,7 9,1" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <TrackCard
                                    track={track}
                                    variant="row"
                                    tracksQueue={filterTracks(searchResults)}
                                    onToggleFavorite={handleToggleFavorite}
                                    isFavorite={favorites.some((f) => f.id === track.id)}
                                    isExplicit={isTrackExplicit(track)}
                                    onOpenArtist={handleOpenArtist}
                                    onAddToPlaylist={handleOpenAddToPlaylist}
                                    onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {filterTracks(searchRecommendations).length > 0 && (
                          <div className="mt-4 border-t border-white/5 pt-6 animate-[fadeIn_0.3s_ease]">
                            <h3 className="text-sm font-bold text-gray-400 tracking-wider uppercase mb-3 pl-1">
                              Related to your search
                            </h3>
                            <div className="flex flex-col gap-3">
                              {filterTracks(searchRecommendations).map((track, idx) => {
                                const isChecked = selectedTrackIds.has(track.id);
                                return (
                                  <div
                                    key={`${track.id}-${idx}`}
                                    className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                                  >
                                    {isSelecting && (
                                      <div
                                        className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                                        onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                                        title={isChecked ? "Deselect" : "Select"}
                                      >
                                        <div
                                          className={`rounded-md border-2 flex items-center justify-center transition-all
                                            ${isChecked
                                              ? "border-brand-accent bg-brand-accent"
                                              : "border-white/80 bg-black"
                                            }`}
                                          style={{ width: "18px", height: "18px", minWidth: "18px" }}
                                        >
                                          {isChecked && (
                                            <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                              <polyline points="1,4 3.5,7 9,1" />
                                            </svg>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <TrackCard
                                        track={track}
                                        variant="row"
                                        tracksQueue={searchRecommendations}
                                        onToggleFavorite={handleToggleFavorite}
                                        isFavorite={favorites.some((f) => f.id === track.id)}
                                        isExplicit={isTrackExplicit(track)}
                                        onOpenArtist={handleOpenArtist}
                                        onAddToPlaylist={handleOpenAddToPlaylist}
                                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {!isSearching && !searchError && searchType === "album" && (
                    albumResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No albums found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try entering another keyword</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {albumResults.filter(album => !releaseYear || album.releaseDate?.startsWith(releaseYear)).map((album) => (
                          <AlbumCard key={album.id} album={album} onClick={handleOpenAlbum} />
                        ))}
                      </div>
                    )
                  )}

                  {!isSearching && !searchError && searchType === "artist" && (
                    artistResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No artists found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try entering another keyword</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {artistResults.map((artist) => (
                          <ArtistCard key={artist.id} artist={artist} onClick={handleOpenArtist} onFollow={handleToggleFollowArtist} followed={followedArtists.some(item => item.id === artist.id)} onShare={item => void copyLink(buildShareLink("artist", item.id, item.name))} />
                        ))}
                      </div>
                    )
                  )}

                  {!isSearching && !searchError && searchType === "community" && (
                    communityResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No community playlists found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try another search or make a playlist public</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {communityResults.map((p) => {
                          const isYouTube = !!p.is_youtube;
                          if (p.shareToken) return <button key={p.playlist_id} className="rounded-xl border border-white/10 p-4 text-left text-sm hover:bg-white/10" onClick={() => {
                            const url = new URL(location.pathname, location.origin);
                            url.searchParams.set("share", p.shareToken);
                            window.history.pushState(null, "", url);
                            setShareToken(p.shareToken);
                          }}>{p.name}</button>;
                          const isLoadingThis = loadingYouTubePlaylistId === p.playlist_id;
                          return (
                            <div
                              key={p.playlist_id}
                              onClick={async () => {
                                if (isLoadingThis) return;
                                if (isYouTube) {
                                  setLoadingYouTubePlaylistId(p.playlist_id);
                                  try {
                                    const tracks = await getPublicPlaylistTracks(p.playlist_id);
                                    const sharedPlaylist: Playlist = {
                                      id: `yt_${p.playlist_id}`,
                                      name: p.name,
                                      tracks,
                                      coverUrl: p.cover_url,
                                      isPublic: true
                                    };
                                    setSelectedPlaylist(sharedPlaylist);
                                    setActiveTab("playlists");
                                  } catch (err) {
                                    console.error("Failed to load YouTube playlist tracks:", err);
                                    showToast(localized(language, "No se pudieron cargar las canciones", "Failed to load playlist tracks", "Ezin izan dira abestiak kargatu"), "error");
                                  } finally {
                                    setLoadingYouTubePlaylistId(null);
                                  }
                                } else {
                                  const sharedPlaylist: Playlist = {
                                    id: p.playlist_id,
                                    name: p.name,
                                    tracks: p.tracks || [],
                                    coverUrl: p.cover_url,
                                    isPublic: true
                                  };
                                  setSelectedPlaylist(sharedPlaylist);
                                  setActiveTab("playlists");
                                }
                              }}
                              className="glass-card rounded-2xl p-4 flex flex-col gap-3 group cursor-pointer active:scale-95 transition-all"
                            >
                              <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden relative shadow-md">
                                {p.cover_url || (!isYouTube && p.tracks && p.tracks.length > 0 && p.tracks[0].thumbnail) ? (
                                  <img
                                    src={p.cover_url || p.tracks[0].thumbnail}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                                    alt={p.name}
                                  />
                                ) : (
                                  <ListMusic className="w-10 h-10 text-brand-accent group-hover:scale-105 transition-all duration-300" />
                                )}
                                {/* Source badge */}
                                <div className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                  isYouTube
                                    ? "bg-red-600/90 text-white"
                                    : "bg-brand-accent/80 text-black"
                                }`}>
                                  {isYouTube ? (
                                    <>
                                      <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                                      </svg>
                                      YouTube
                                    </>
                                  ) : "Community"}
                                </div>
                                {/* Loading overlay */}
                                {isLoadingThis && (
                                  <LoadingSkeleton layout="text" count={3} className="absolute inset-0 grid content-center rounded-xl bg-brand-darkBg/90 p-4" label="Cargando playlist…" />
                                )}
                                {/* Play hover overlay */}
                                {!isLoadingThis && (
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors rounded-xl flex items-center justify-center">
                                    <Play className="w-8 h-8 fill-white text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 text-left">
                                <h4 className="font-bold text-sm text-white truncate group-hover:text-brand-accent transition-colors">
                                  {p.name}
                                </h4>
                                <p className="text-[10px] text-gray-400 truncate mt-0.5">
                                  {isYouTube
                                    ? `${p.uploader || "YouTube"}${p.videosCount ? ` • ${p.videosCount} videos` : ""}`
                                    : `By ${p.username || "Anonymous"} • ${p.tracks ? p.tracks.length : 0} Songs`}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}
                </>
              )}
            </section>
          ) : activeTab === "favorites" ? (
            /* FAVORITE PLAYLIST PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Heart className="w-6 h-6 text-brand-accent" /> {labels.yourFavorites}
                  </h2>
                  {favorites.length > 0 && (
                    <button
                      onClick={() => {
                        const filtered = favorites.filter(track =>
                          track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                          track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                          (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                        );
                        if (filtered.length > 0) {
                          playTrack(filtered[0], filtered, "favorites");
                        }
                      }}
                      className="w-10 h-10 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black flex items-center justify-center transition-all shadow-lg shadow-brand-accent/25 active:scale-95 shrink-0"
                      title={labels.playFavorites}
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>
                  )}
                </div>
                {favorites.length > 0 && (
                  <div className="relative max-w-xs w-full">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search inside favorites..."
                      value={subSearchQuery}
                      onChange={(e) => setSubSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 rounded-full text-xs text-white placeholder:text-gray-500 focus:outline-none transition-all"
                    />
                    {subSearchQuery && (
                      <button
                        onClick={() => setSubSearchQuery("")}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isHydratingFavorites && favorites.length === 0 ? (
                <LoadingSkeleton layout="tracks" label={localized(language, "Cargando favoritos…", "Loading favorites…", "Gogokoak kargatzen…")} />
              ) : favorites.length === 0 ? (
                <div className="text-center py-16 text-gray-500 glass-panel rounded-3xl p-8 border border-dashed border-gray-800">
                  <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="font-semibold text-gray-400">{localized(language, "Tu colección está vacía", "Your collection is empty", "Zure bilduma hutsik dago")}</p>
                  <p className="text-xs text-gray-600 mt-1">{localized(language, "Pulsa el corazón de una canción para guardarla aquí", "Click the heart icon on any song to save it here", "Sakatu abesti baten bihotza hemen gordetzeko")}</p>
                </div>
              ) : (() => {
                const favTracks = filterTracks(favorites);
                if (favTracks.length === 0) {
                  return (
                    <div className="text-center py-16 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                      <p className="font-semibold text-gray-400">{localized(language, "No hay canciones visibles con el filtro actual.", "No songs match the current filter.", "Iragazki honekin ez da abestirik ikusten.")}</p>
                    </div>
                  );
                }
                const filtered = favTracks.filter(track =>
                  track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                  track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                  (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                );
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                      <p className="font-semibold text-gray-400">No results found for "{subSearchQuery}"</p>
                      <p className="text-xs text-gray-600 mt-1">{localized(language, "Revisa la ortografía o busca otra canción", "Try checking for typos or searching a different song", "Egiaztatu ortografia edo bilatu beste abesti bat")}</p>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-3">
                    {/* Bulk Action Toolbar */}
                    {isSelecting && (
                      <div id="bulk-action-toolbar" className="sticky top-0 z-30 flex items-center gap-2 px-4 py-2.5 mb-2 rounded-2xl bg-brand-accent/10 border border-brand-accent/30 backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
                        <button
                          onClick={() => handleSelectAll(filtered)}
                          className="text-xs text-brand-accent hover:underline font-semibold shrink-0"
                        >
                          {selectedTrackIds.size === filtered.length ? "Deselect all" : "Select all"}
                        </button>
                        <span className="text-gray-500 text-xs shrink-0">{selectedTrackIds.size} selected</span>
                        <div className="flex-1" />
                        <div className="relative">
                          <button
                            onClick={() => setShowBulkPlaylistPicker(prev => !prev)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-brand-accent/20 border border-white/10 text-gray-300 hover:text-brand-accent text-xs font-medium transition-all"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</span>
                          </button>
                          {showBulkPlaylistPicker && (
                            <div className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-2xl glass-panel border border-white/10 shadow-2xl shadow-black/80 z-50 max-h-56 overflow-y-auto animate-[fadeIn_0.15s_ease]">
                              {playlists.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-gray-500 italic text-center">No playlists yet</div>
                              ) : (
                                playlists.map(pl => (
                                  <button
                                    key={pl.id}
                                    onClick={() => {
                                      const sel = filtered.filter(t => selectedTrackIds.has(t.id));
                                      handleBulkAddToPlaylist(pl.id, sel);
                                    }}
                                    className="w-full px-4 py-2 text-left flex items-center gap-2 hover:bg-white/5 hover:text-white text-gray-300 text-xs transition-all truncate"
                                  >
                                    <ListMusic className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                    <span className="truncate">{pl.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                        {/* Bulk Remove from Favorites */}
                        <button
                          onClick={() => {
                            handleBulkRemoveFromFavorites(Array.from(selectedTrackIds));
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/20 border border-white/10 text-gray-400 hover:text-red-400 text-xs font-medium transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                        <button
                          onClick={clearSelection}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white text-xs transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {filtered.slice(0, visibleFavoritesCount).map((track, idx) => {
                      const isChecked = selectedTrackIds.has(track.id);
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          className={`relative flex items-center group transition-all ${isChecked ? "bg-brand-accent/5 rounded-2xl" : ""}`}
                        >
                          {isSelecting && (
                            <div
                              className="shrink-0 flex items-center justify-center w-8 h-8 ml-1 rounded-full cursor-pointer transition-all opacity-100"
                              onClick={(e) => { e.stopPropagation(); handleSelectTrack(track.id); }}
                              title={isChecked ? "Deselect" : "Select"}
                            >
                              <div
                                className={`rounded-md border-2 flex items-center justify-center transition-all
                                  ${isChecked
                                    ? "border-brand-accent bg-brand-accent"
                                    : "border-white/80 bg-black"
                                  }`}
                                style={{ width: "18px", height: "18px", minWidth: "18px" }}
                              >
                                {isChecked && (
                                  <svg viewBox="0 0 10 8" style={{ width: "11px", height: "9px" }} fill="none" stroke="black" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,4 3.5,7 9,1" />
                                  </svg>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <TrackCard
                              track={track}
                              variant="row"
                              tracksQueue={filtered}
                              onToggleFavorite={handleToggleFavorite}
                              isFavorite={true}
                               isExplicit={isTrackExplicit(track)}
                              onOpenArtist={handleOpenArtist}
                              onOpenAlbum={handleOpenAlbum}
                              onAddToPlaylist={handleOpenAddToPlaylist}
                              onContextMenu={(e) => handleTrackContextMenu(e, track, "favorites")}
                              playlistId="favorites"
                            />
                          </div>
                        </div>
                      );
                    })}
                    {filtered.length > visibleFavoritesCount && (
                      <div
                        ref={favoritesSentinelRef}
                        className="h-10 w-full opacity-0 pointer-events-none"
                      />
                    )}
                  </div>
                );
              })()}
            </section>
          ) : activeTab === "admin" && user?.app_metadata?.ibramusic_admin === true ? (
            /* ADMIN DASHBOARD TAB */
            <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease] animate-mobile-page text-left max-w-4xl select-none">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-brand-accent animate-pulse" /> Admin Dashboard
                </h2>
                <p className="text-xs text-gray-500">Manage featured songs and playlists displayed on the home page for all users.</p>
              </div>

              {/* SECTION: Featured Songs */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-5">
                <h3 className="font-semibold text-sm text-white border-b border-white/5 pb-2.5">Featured Songs (Editor's Picks)</h3>
                
                <div className="flex flex-col gap-3">
                  <span className="text-xs text-gray-400">Search and Add Song to Features:</span>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                  }} className="flex gap-2">
                    <input 
                      type="text" 
                      id="admin-song-search-input"
                      placeholder="Search song to feature..."
                      className="flex-1 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                    />
                    <button 
                      type="button"
                      onClick={async () => {
                        const input = document.getElementById("admin-song-search-input") as HTMLInputElement;
                        if (!input?.value) return;
                        const res = await searchTracks(input.value);
                        setAdminSongSearchResults(res);
                      }}
                      className="px-4 py-2 bg-brand-accent text-black font-semibold rounded-xl text-xs"
                    >
                      Search
                    </button>
                  </form>

                  {adminSongSearchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto bg-black/40 rounded-xl p-2 border border-white/5 flex flex-col gap-1">
                      {adminSongSearchResults.slice(0, 5).map((track) => (
                        <div key={track.id} onContextMenu={event => handleTrackContextMenu(event, track)} className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded-lg text-xs">
                          <span className="text-white font-semibold truncate max-w-[200px]">{track.title} - {track.artist}</span>
                          <button 
                            onClick={async () => {
                              const updated = [...featuredSongs, track];
                              setFeaturedSongs(updated);
                              await handleSaveFeaturedSongs(updated);
                              setAdminSongSearchResults([]);
                              const input = document.getElementById("admin-song-search-input") as HTMLInputElement;
                              if (input) input.value = "";
                            }}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-[10px]"
                          >
                            + Add
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-gray-400">Current Featured Songs:</span>
                  {isLoadingFeatured && featuredSongs.length === 0 ? (
                    <LoadingSkeleton layout="tracks" count={3} label="Cargando canciones destacadas…" />
                  ) : featuredSongs.length === 0 ? (
                    <p className="text-[11px] text-gray-600 italic">No featured songs yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {featuredSongs.map((track, index) => (
                        <div key={track.id + "-" + index} onContextMenu={event => handleTrackContextMenu(event, track)} className="flex items-center justify-between p-2 bg-white/2 rounded-xl text-xs border border-white/5">
                          <span className="text-white truncate">{track.title} - {track.artist}</span>
                          <button 
                            onClick={async () => {
                              const updated = featuredSongs.filter((_, i) => i !== index);
                              setFeaturedSongs(updated);
                              await handleSaveFeaturedSongs(updated);
                            }}
                            className="text-red-400 hover:text-red-300 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Featured Playlists */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-5">
                <h3 className="font-semibold text-sm text-white border-b border-white/5 pb-2.5">Featured Playlists</h3>
                
                <div className="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
                  <span className="text-xs font-semibold text-white">Create New Featured Playlist</span>
                  <div className="flex flex-col md:flex-row gap-4">
                    <div 
                      onClick={() => document.getElementById("admin-pl-pfp")?.click()}
                      className="w-24 h-24 rounded-2xl border border-white/10 bg-white/5 flex flex-col items-center justify-center cursor-pointer overflow-hidden shrink-0 group relative"
                    >
                      {newAdminPlPfp ? (
                        <img src={newAdminPlPfp} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center text-gray-500">
                          <Plus className="w-5 h-5" />
                          <span className="text-[9px]">PFP/Cover</span>
                        </div>
                      )}
                    </div>

                    <input
                      type="file" 
                      id="admin-pl-pfp" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => setNewAdminPlPfp(ev.target?.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                    />

                    <div className="flex-1 flex flex-col gap-3">
                      <input 
                        type="text" 
                        placeholder="Playlist Name" 
                        value={newAdminPlName}
                        onChange={(e) => setNewAdminPlName(e.target.value)}
                        className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                      
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] text-gray-400">Search and Add Songs:</span>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            id="admin-pl-song-search"
                            placeholder="Song name..."
                            className="flex-1 bg-white/5 border border-white/5 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                          />
                          <button 
                            type="button"
                            onClick={async () => {
                              const input = document.getElementById("admin-pl-song-search") as HTMLInputElement;
                              if (!input?.value) return;
                              const res = await searchTracks(input.value);
                              setAdminPlSearchResults(res);
                            }}
                            className="px-3 py-1.5 bg-white/10 rounded-xl text-[10px] font-semibold text-white"
                          >
                            Search
                          </button>
                        </div>

                        {adminPlSearchResults.length > 0 && (
                          <div className="max-h-36 overflow-y-auto bg-black/40 rounded-xl p-1.5 border border-white/5 flex flex-col gap-1">
                            {adminPlSearchResults.slice(0, 5).map((track) => (
                              <div key={track.id} className="flex items-center justify-between p-1 hover:bg-white/5 rounded text-[10px]">
                                <span className="text-white truncate max-w-[180px]">{track.title} - {track.artist}</span>
                                <button 
                                  onClick={() => {
                                    setNewAdminPlTracks([...newAdminPlTracks, track]);
                                    setAdminPlSearchResults([]);
                                    const input = document.getElementById("admin-pl-song-search") as HTMLInputElement;
                                    if (input) input.value = "";
                                  }}
                                  className="text-brand-accent font-semibold"
                                >
                                  + Add
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {newAdminPlTracks.length > 0 && (
                    <div className="flex flex-col gap-1 border-t border-white/5 pt-2">
                      <span className="text-[10px] text-gray-400">Added Tracks ({newAdminPlTracks.length}):</span>
                      <div className="max-h-24 overflow-y-auto flex flex-col gap-1">
                        {newAdminPlTracks.map((t, idx) => (
                          <div key={t.id + "-" + idx} className="flex justify-between items-center text-[10px] text-gray-300">
                            <span className="truncate">{t.title} - {t.artist}</span>
                            <button 
                              onClick={() => setNewAdminPlTracks(newAdminPlTracks.filter((_, i) => i !== idx))}
                              className="text-red-400 hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleCreateFeaturedPlaylist}
                    className="w-full py-2 bg-brand-accent text-black font-semibold rounded-xl text-xs shadow-md shadow-brand-accent/25 mt-2"
                  >
                    Save Playlist
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-gray-400">Featured Playlists List:</span>
                  {isLoadingFeatured && featuredPlaylists.length === 0 ? (
                    <LoadingSkeleton layout="tracks" count={3} label="Cargando playlists destacadas…" />
                  ) : featuredPlaylists.length === 0 ? (
                    <p className="text-[11px] text-gray-600 italic">No featured playlists yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {featuredPlaylists.map((pl) => (
                        <div key={pl.id} className="flex items-center gap-3 p-3 bg-white/2 rounded-2xl border border-white/5 justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            {pl.pfp ? (
                              <img src={pl.pfp} className="w-10 h-10 object-cover rounded-xl" />
                            ) : (
                              <div className="w-10 h-10 bg-white/5 border border-white/5 flex items-center justify-center rounded-xl text-brand-accent font-bold">
                                PL
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-white truncate">{pl.name}</p>
                              <p className="text-[10px] text-gray-400">{pl.tracks?.length || 0} Songs</p>
                            </div>
                          </div>
                          <button 
                            onClick={async () => {
                              await supabase.from("featured_content").delete().eq("id", pl.id);
                              showToast(`Deleted playlist "${pl.name}"`, "info");
                              fetchFeaturedContent();
                            }}
                            className="text-red-400 hover:text-red-300 text-xs font-semibold shrink-0"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION: Hero Banner Settings */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-5">
                <h3 className="font-semibold text-sm text-white border-b border-white/5 pb-2.5">Hero Banner Customization</h3>
                
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Main Title Text</label>
                    <input 
                      type="text" 
                      value={heroTitle}
                      onChange={(e) => setHeroTitle(e.target.value)}
                      placeholder="e.g., Descubre lo que te inspira"
                      className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Animated Subtitle Text</label>
                    <input 
                      type="text" 
                      value={heroSubtitle}
                      onChange={(e) => setHeroSubtitle(e.target.value)}
                      placeholder="e.g., Take You Away"
                      className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Description / Disclaimer Text</label>
                    <textarea 
                      value={heroDescription}
                      onChange={(e) => setHeroDescription(e.target.value)}
                      placeholder="e.g., IbraSexyStream Music Player Free Gay Pro Max."
                      rows={2}
                      className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent transition-colors resize-none"
                    />
                  </div>



                  <section className="grid gap-2 rounded-xl border border-white/10 p-3">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <button className="underline" onClick={() => {
                        const draft = { title: heroTitle, subtitle: heroSubtitle, description: heroDescription, gradient: heroBgGradient, color: heroTextColor };
                        setHeroDraft(draft);
                        StorageService.setItemSync("ibrastream_hero_draft", draft);
                        showToast("Borrador guardado en este navegador.", "success");
                      }}>Guardar borrador</button>
                      {heroDraft && <button className="underline" onClick={() => {
                        setHeroTitle(heroDraft.title); setHeroSubtitle(heroDraft.subtitle); setHeroDescription(heroDraft.description);
                        setHeroBgGradient(heroDraft.gradient); setHeroTextColor(heroDraft.color);
                      }}>Recuperar borrador</button>}
                    </div>
                    <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4">
                      <strong className={"block text-2xl " + heroTextColor}>{heroTitle}</strong>
                      <p className="font-semibold">{heroSubtitle}</p>
                      <p className="mt-2 text-sm text-gray-300">{heroDescription}</p>
                    </div>
                  </section>
                  {/* Text Color Presets */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">Title & Subtitle Color Preset</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { name: "Pure White", class: "text-white" },
                        { name: "Brand Accent", class: "text-brand-accent" },
                        { name: "Muted Silver", class: "text-gray-300" },
                        { name: "Rose Pink", class: "text-rose-400" },
                        { name: "Cyber Green", class: "text-emerald-400" },
                        { name: "Sky Blue", class: "text-sky-400" },
                        { name: "Neon Purple", class: "text-purple-400" },
                        { name: "Gold", class: "text-amber-400" }
                      ].map((color) => (
                        <button
                          key={color.name}
                          type="button"
                          onClick={() => setHeroTextColor(color.class)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all border ${
                            heroTextColor === color.class ? "bg-brand-accent text-black border-brand-accent" : "bg-white/5 text-white border-white/5 hover:bg-white/10"
                          }`}
                        >
                          {color.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Custom Title/Subtitle Text Color Class</label>
                    <input 
                      type="text" 
                      value={heroTextColor}
                      onChange={(e) => setHeroTextColor(e.target.value)}
                      placeholder="e.g., text-white"
                      className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent transition-colors"
                    />
                  </div>

                  <button 
                    onClick={() => handleSaveHeroBanner(heroTitle, heroSubtitle, heroDescription, heroBgGradient, heroTextColor)}
                    className="w-full py-2.5 bg-brand-accent text-black font-bold rounded-xl text-xs shadow-md shadow-brand-accent/25 mt-2 hover:bg-brand-accent/90 active:scale-98 transition-all"
                  >
                    Save Banner Settings
                  </button>
                </div>
              </div>
            </section>
          ) : activeTab === "visuals" ? (
            /* VISUAL STYLING TAB */
            <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease] animate-mobile-page text-left max-w-2xl">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold text-white">Visual Settings</h2>
                <p className="text-xs text-gray-500">Customize your player's theme, corners, and background.</p>
              </div>

              {/* Theme */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-4">
                <h3 className="font-semibold text-sm text-white">Theme</h3>
                <div className="flex gap-3">
                  {(["dark", "bright", "noir"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => {
                        if (t === "noir") setAmbientGlowEnabled(false);
                        setThemeSettings({
                          ...themeSettings,
                          theme: t,
                          bgColor: t === "noir" ? "#000000" : mapColorBetweenThemes(themeSettings.bgColor, themeSettings.theme, t)
                        });
                      }}
                      className={`flex-1 py-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        themeSettings.theme === t
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/3 border-white/5 text-gray-500 hover:text-white hover:bg-white/8"
                      }`}
                    >
                      {t === "dark" ? "Dark" : t === "bright" ? "Bright" : "Noir"} Mode
                    </button>
                  ))}
                </div>
              </div>

              {/* Corners */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-4">
                <h3 className="font-semibold text-sm text-white">Corner Style</h3>
                <div className="flex gap-3">
                  {(["rounded", "soft"] as const).map(c => (
                    <button
                      key={c}
                      onClick={() => setThemeSettings({ ...themeSettings, corners: c })}
                      className={`flex-1 py-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        themeSettings.corners === c
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/3 border-white/5 text-gray-500 hover:text-white hover:bg-white/8"
                      }`}
                    >
                      {c === "rounded" ? "Rounded" : "Soft Angles"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Background */}
              <div className="rounded-2xl bg-white/4 border border-white/5 p-5 flex flex-col gap-5">
                <h3 className="font-semibold text-sm text-white">Background</h3>

                {auraActive ? (
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                    <span aria-hidden="true" className="size-7 shrink-0 rounded-full border border-white/15 bg-brand-darkBg" />
                    <div>
                      <p className="text-xs font-semibold text-white">Fondo automático</p>
                      <p className="mt-1 text-xs text-gray-400">El aura elige los colores de la portada. Desactívala en Ajustes para cambiar el fondo.</p>
                    </div>
                  </div>
                ) : <>
                {/* Default */}
                <div
                  onClick={() => setThemeSettings({ ...themeSettings, bgColor: "", bgImage: "" })}
                  className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    !themeSettings.bgColor && !themeSettings.bgImage
                      ? "bg-white/8 border-white/20 text-white"
                      : "bg-white/3 border-white/5 text-gray-400 hover:bg-white/6"
                  }`}
                >
                  <div>
                    <span className="text-xs font-semibold block">Default</span>
                    <span className="text-[10px] text-gray-500">Pure dark background</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border border-white/20 flex items-center justify-center`}>
                    {!themeSettings.bgColor && !themeSettings.bgImage && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                  </div>
                </div>

                {/* Custom color */}
                <div className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
                  themeSettings.bgColor && !themeSettings.bgImage
                    ? "bg-white/8 border-white/20"
                    : "bg-white/3 border-white/5"
                }`}>
                  <div
                    onClick={() => setThemeSettings({ ...themeSettings, bgColor: themeSettings.bgColor || "#0f0f0f", bgImage: "" })}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-semibold text-white block">Custom Color</span>
                      <span className="text-[10px] text-gray-500">Pick a solid background color</span>
                    </div>
                    <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center">
                      {themeSettings.bgColor && !themeSettings.bgImage && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  {themeSettings.bgColor && !themeSettings.bgImage && (
                    <div className="flex flex-col gap-3">
                      {/* Color grid */}
                      <div className="grid grid-cols-8 gap-1.5">
                        {(themeSettings.theme === "dark" ? [
                          "#0f0f0f","#0f0f1a","#0a0f1e","#0d1117","#0f1923","#10151f","#1a0a0a","#120a0f",
                          "#1e1e2e","#1a1a2e","#16213e","#0d2137","#0a2540","#162032","#2d1b1b","#1f0d24",
                          "#1a0533","#0d0d2b","#00141f","#001a00","#1a1000","#1a0000","#002233","#190019",
                          "#2a0a3a","#0e1f4d","#00261c","#1a2500","#2b1700","#2a0000","#003344","#250038"
                        ] : [
                          "#fafafa","#f1f5f9","#e2e8f0","#f8fafc","#f3f4f6","#e5e7eb","#f9fafb","#eceff1",
                          "#ffe4e6","#ffedd5","#fef9c3","#dcfce7","#ccfbf1","#e0f2fe","#f3e8ff","#fae8ff",
                          "#fecdd3","#fed7aa","#fef08a","#bbf7d0","#99f6e4","#bae6fd","#e9d5ff","#f5d0fe",
                          "#fda4af","#fdbb2d","#ffe066","#a7f3d0","#80f1d5","#7dd3fc","#d8b4fe","#f472b6"
                        ]).map(color => (
                          <button
                            key={color}
                            onClick={() => setThemeSettings({ ...themeSettings, bgColor: color, bgImage: "" })}
                            title={color}
                            style={{ backgroundColor: color }}
                            className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
                              themeSettings.bgColor === color 
                                ? (themeSettings.theme === "bright" ? "border-black scale-110" : "border-white scale-110") 
                                : "border-white/10 hover:border-white/40"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Hex input */}
                      <div className="flex items-center gap-2 bg-black/30 px-3 py-2 rounded-xl border border-white/5">
                        <div style={{ backgroundColor: themeSettings.bgColor }} className="w-6 h-6 rounded-md border border-white/20 shrink-0" />
                        <span className="text-[10px] text-gray-500 font-mono">#</span>
                        <input
                          type="text"
                          maxLength={6}
                          key={themeSettings.bgColor}
                          defaultValue={(themeSettings.bgColor || "#0f0f0f").replace("#", "")}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9a-fA-F]/g, "");
                            if (raw.length === 6) setThemeSettings({ ...themeSettings, bgColor: `#${raw}`, bgImage: "" });
                          }}
                          placeholder="0f0f0f"
                          className="flex-1 bg-transparent text-xs font-mono text-white placeholder:text-gray-600 focus:outline-none uppercase"
                        />
                        <label className="cursor-pointer group">
                          <input
                            type="color"
                            value={themeSettings.bgColor || "#0f0f0f"}
                            onChange={(e) => setThemeSettings({ ...themeSettings, bgColor: e.target.value, bgImage: "" })}
                            className="sr-only"
                          />
                          <div className="w-6 h-6 rounded-md bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-all">
                            <svg viewBox="0 0 16 16" fill="none" className="w-3 h-3 text-gray-400">
                              <path d="M11.013 2.5a1.657 1.657 0 0 1 2.344 2.344L5.88 12.32l-3.458.62.62-3.458 7.97-7.981Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload image */}
                <div className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
                  themeSettings.bgImage ? "bg-white/8 border-white/20" : "bg-white/3 border-white/5"
                }`}>
                  <div
                    onClick={() => { if (!themeSettings.bgImage) { const el = document.getElementById("bg-file-upload"); if (el) el.click(); } }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="text-xs font-semibold text-white block">Custom Wallpaper</span>
                      <span className="text-[10px] text-gray-500">Upload a background image</span>
                    </div>
                    <div className="w-4 h-4 rounded-full border border-white/20 flex items-center justify-center">
                      {themeSettings.bgImage && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </div>
                  </div>

                  <input
                    type="file" id="bg-file-upload" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const result = ev.target?.result as string;
                          if (result) setThemeSettings({ ...themeSettings, bgImage: result, bgColor: "" });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />

                  {themeSettings.bgImage ? (
                    <div className="flex flex-col gap-2">
                      <img src={themeSettings.bgImage} alt="Background" className="h-20 w-full object-cover rounded-xl border border-white/5" />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { const el = document.getElementById("bg-file-upload"); if (el) el.click(); }}
                          className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 border border-white/8 rounded-lg text-[10px] font-semibold text-white transition-all"
                        >
                          Change
                        </button>
                        <button
                          onClick={() => setThemeSettings({ ...themeSettings, bgImage: "" })}
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-[10px] font-semibold text-red-400 transition-all"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { const el = document.getElementById("bg-file-upload"); if (el) el.click(); }}
                      className="py-3 border border-dashed border-white/15 hover:border-white/30 rounded-xl text-[10px] font-semibold text-gray-500 hover:text-white transition-all"
                    >
                      Click to Upload Image
                    </button>
                  )}
                </div>
                </>}
              </div>
            </section>
          ) : activeTab === "stats" ? (
            /* STATS PANEL */
            <React.Suspense fallback={<LoadingSkeleton layout="stats" count={4} label="Cargando estadísticas…" />}>
              <StatsPanel accumulatedStats={accumulatedStats} entries={listeningEntries} playTrack={playTrack} showToast={showToast} onTrackContextMenu={handleTrackContextMenu} />
            </React.Suspense>
          ) : activeTab === "wrapped" ? (
            /* WRAPPED PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page text-left max-w-2xl">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Gift className="w-6 h-6 text-brand-accent animate-bounce" /> Your Year in Sound
                </h2>
                <p className="text-xs text-gray-500">Uncover your listening habits, top tracks, and music personality.</p>
              </div>

              <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col items-center text-center gap-5 relative overflow-hidden bg-cover bg-center">
                {/* Decorative background lights */}
                <div className="absolute -top-24 -left-24 w-48 h-48 bg-brand-accent/25 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />

                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-brand-accent shadow-md">
                  <Sparkles className="w-8 h-8 animate-pulse" />
                </div>

                <div className="flex flex-col gap-2 relative z-10 max-w-md">
                  <h3 className="text-xl font-bold text-white">Ready for your Wrapped?</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Discover your top artists, most played tracks, total listening time, and your music personality archetype. 
                  </p>
                </div>

                <button
                  onClick={() => setIsWrappedModalOpen(true)}
                  className="py-3 px-8 bg-brand-accent hover:bg-brand-accent/90 text-black font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-brand-accent/25 z-10"
                >
                  Launch Wrapped Experience
                </button>
              </div>

              {/* Quick Stats overview */}
              {history.length >= 5 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  <div className="glass-panel p-5 rounded-2xl border border-white/15 flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Total plays logged</span>
                    <span className="text-2xl font-black text-white">{history.length} songs</span>
                  </div>
                  <div className="glass-panel p-5 rounded-2xl border border-white/15 flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Unique tracks</span>
                    <span className="text-2xl font-black text-white">{new Set(history.map(t => t.id)).size} tracks</span>
                  </div>
                </div>
              )}
            </section>
          ) : activeTab === "settings" ? (
            <React.Suspense fallback={<LoadingSkeleton layout="settings" count={4} className="mx-auto max-w-4xl p-4 sm:p-6" label={localized(language, "Cargando ajustes…", "Loading settings…", "Ezarpenak kargatzen…")} />}>
              <SettingsPanel
                ambientMode={ambientMode}
                onAmbientModeChange={setAmbientMode}
                liquidGlassEnabled={liquidGlassEnabled}
                onToggleLiquidGlass={() => {
                  const next = !liquidGlassEnabled;
                  localStorage.setItem("ibrastream_desktop_hero_glass", next ? "on" : "off");
                  setLiquidGlassEnabled(next);
                }}
                themeSettings={themeSettings}
                setThemeSettings={setThemeSettings}
                filterExplicit={filterExplicit}
                onToggleFilterExplicit={handleToggleFilterExplicit}
                userId={userId}
                language={language}
                onLanguageChange={setLanguage}
                syncState={syncState}
                syncError={syncError}
                onRetrySync={() => {
                  setSyncState("pending");
                  setSyncAttempt(attempt => attempt + 1);
                }}
                rankingPreference={rankingPreference}
                rankingBusy={rankingBusy}
                onChangeRanking={(pref) => void changeRanking(pref)}
                onDeleteAccount={() => { setDeleteWord(""); setDeleteAccount(true); }}
                hiddenPlaylists={playlists.filter(playlist => hiddenPlaylistIds.has(playlist.id))}
                onShowPlaylist={playlist => handleToggleHidePlaylist(playlist.id)}
                onOpenHiddenPlaylist={playlist => {
                  navigateTab("playlists");
                  setSubSearchQuery("");
                  setSelectedPlaylist(playlist);
                }}
                onExportLibrary={() => downloadFile("ibramusic-biblioteca.json", JSON.stringify({ playlists, favorites, followedArtists, savedAlbums, listeningEntries }, null, 2))}
                onClearHistory={() => {
                  if (window.confirm("¿Borrar el historial de escucha y búsqueda?")) {
                    clearListeningHistory();
                    clearSearchHistory();
                    setRecentlyPlayed([]);
                    void StorageService.removeItem("ibrastream_recently_played_items");
                  }
                }}
                hasCustomRecommendations={hiddenTracks.length > 0 || mutedArtists.length > 0 || radioSeeds.length > 0}
                onResetRecommendations={() => {
                  setHiddenTracks([]);
                  setMutedArtists([]);
                  setRadioSeeds([]);
                  for (const key of ["hidden_recommendations", "muted_recommendations", "radio_seeds"]) void StorageService.removeItem("ibrastream_" + key);
                }}
                canInstall={!!installPrompt}
                onInstall={() => {
                  if (installPrompt) void installPrompt.prompt().then(() => setInstallPrompt(null)).catch(() => setInstallHelp(true));
                  else setInstallHelp(value => !value);
                }}
                installHelp={installHelp}
                onToggleInstallHelp={() => setInstallHelp(value => !value)}
              />
            </React.Suspense>
          ) : (
            /* MAIN HOME VIEW */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">

              {followedArtists.length > 0 && <React.Suspense fallback={null}><FollowedReleases artists={followedArtists} onOpen={handleOpenAlbum} /></React.Suspense>}
              {/* Spotify Wrapped Banner */}
              {new Date().getMonth() === 11 && (
                <div 
                  onClick={() => setIsWrappedModalOpen(true)}
                  className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-950 p-6 md:p-8 border border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 cursor-pointer group hover:border-brand-accent/30 transition-all duration-300 select-none text-left"
                >
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-accent/25 rounded-full blur-3xl pointer-events-none group-hover:bg-brand-accent/35 transition-colors"></div>
                  <div className="flex flex-col gap-2 relative z-10">
                    <span className="text-[10px] font-bold tracking-widest text-brand-accent uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 animate-spin animate-mobile-subpage" style={{ animationDuration: '4s' }} />
                      Now Available
                    </span>
                    <h3 className="text-2xl font-black text-white leading-tight">Tu Wrapped {wrappedYear}</h3>
                    <p className="text-xs text-gray-300 max-w-sm mt-1">
                      Discover your year in sound. Top tracks, listening minutes, music personality, and more.
                    </p>
                  </div>
                  <button
                    className="py-3 px-6 bg-brand-accent group-hover:bg-brand-accent/90 text-black font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-brand-accent/20 shrink-0 z-10"
                  >
                    Explore Wrapped
                  </button>
                </div>
              )}

              <section aria-label={heroTitle} className={"home-hero relative flex min-h-[200px] items-center overflow-hidden rounded-[24px] p-5 sm:px-8 lg:min-h-[132px] " + (!liquidGlassEnabled ? "home-hero-matte" : "")}>
                <div aria-hidden="true" className="home-hero-glare pointer-events-none absolute inset-x-0 top-0 h-px" />
                <div className="relative grid max-w-xl gap-2">
                  <h2 className={"home-hero-title text-2xl font-bold tracking-tight md:text-3xl " + heroTextColor}>{heroTitle}</h2>
                  {heroSubtitle && <p className="text-base font-semibold text-white">{heroSubtitle}</p>}
                  {heroDescription && <p className="text-sm leading-relaxed text-gray-300">{heroDescription}</p>}
                </div>
              </section>

              {!privateSession && <DesktopListeningHome onTrackContextMenu={handleTrackContextMenu} entries={listeningEntries} recent={recentlyPlayed.filter(item => item.type === "playlist" && playlists.some(list => list.id === item.id))}
                resume={savedPlaybackQueue} onTrack={track => playTrack(track)}
                onResume={() => { if (savedPlaybackQueue && !roomId) restoreQueue(savedPlaybackQueue.track, savedPlaybackQueue.upcoming, savedPlaybackQueue.manual, savedPlaybackQueue.playlistId, savedPlaybackQueue.seconds); }}
                onList={item => { const list = playlists.find(candidate => candidate.id === item.id); if (list) { navigateTab("playlists"); setSelectedPlaylist(list); } }}
                onArtist={handleOpenArtist} />}
              {isRefreshingHome && visibleHomeRecommendations.length === 0 && <LoadingSkeleton layout="grid" label="Cargando recomendaciones…" />}
              {visibleHomeRecommendations.length === 0 && !isRefreshingHome && !currentTrack && (
                <div className="glass-panel rounded-[var(--app-radius-xl)] border border-white/5 p-4 sm:p-5">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div><h1 className="text-lg font-bold text-white">{localized(language, "Descubre música", "Discover music", "Aurkitu musika")}</h1><p className="mt-1 text-sm text-gray-300">{localized(language, "Elige una canción para empezar.", "Choose a song to get started.", "Aukeratu abesti bat hasteko.")}</p></div>
                    <button onClick={() => navigateTab("search")} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">{localized(language, "Buscar música", "Search music", "Bilatu musika")}</button>
                  </div>
                  {!user && <p className="mb-3 text-sm text-gray-300">Como invitado puedes guardar favoritos y listas en este navegador. Inicia sesión para sincronizarlos y seguir escuchando.</p>}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {starterTracks.map(track => (
                      <button key={track.id} onContextMenu={event => handleTrackContextMenu(event, track)} onClick={() => playTrack(track, starterTracks, "starter")} className="flex gap-3 glass-card rounded-[var(--app-radius-lg)] border border-white/5 p-3 text-left text-white hover:bg-white/10">
                        <Play aria-hidden="true" className="m-1 size-4 shrink-0" />
                        <span><strong className="block text-sm">{track.title}</strong><span className="text-xs text-gray-300">{track.artist}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Escuchas recientes */}
              {visibleHomeRecommendations.length > 0 && (
                <div className="animate-[fadeIn_0.3s_ease]">
                  <div className="flex items-center justify-between mb-4 pl-1 pr-1">
                    <h2 className="text-2xl font-bold text-white tracking-wide">
                      {localized(language, "Recomendaciones para ti", "Recommendations for you", "Zuretzako gomendioak")}
                    </h2>
                    <button
                      onClick={() => refreshHomeRecs(true)}
                      disabled={isRefreshingHome}
                      className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-all duration-300 disabled:opacity-50 flex items-center justify-center cursor-pointer"
                      title={localized(language, "Refrescar recomendaciones", "Refresh recommendations", "Eguneratu gomendioak")}
                      aria-label={localized(language, "Refrescar recomendaciones", "Refresh recommendations", "Eguneratu gomendioak")}
                    >
                      <RotateCw className={`w-4 h-4 ${isRefreshingHome ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {/* 8 quick-access cards using square variant */}
                    {visibleHomeRecommendations.slice(0, 8).map((track, idx) => (
                      <TrackCard
                        key={`quick-${track.id}-${idx}`}
                        track={track}
                        variant="square"
                        tracksQueue={visibleHomeRecommendations}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        isExplicit={isTrackExplicit(track)}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={handleOpenAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Descubre más */}
              {visibleHomeRecommendations.length > 8 && (
                <div className="animate-[fadeIn_0.4s_ease] mt-4">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-accent" /> {localized(language, "Descubre canciones nuevas", "Discover new songs", "Aurkitu abesti berriak")}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {visibleHomeRecommendations.slice(8, 12).map((track, idx) => (
                      <TrackCard
                        key={`discover-${track.id}-${idx}`}
                        track={track}
                        variant="square"
                        tracksQueue={visibleHomeRecommendations}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        isExplicit={isTrackExplicit(track)}

                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={handleOpenAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Ibra's Pick Section */}
              {(featuredPlaylists.length > 0 || featuredSongs.length > 0) && (
                <div className="animate-[fadeIn_0.4s_ease]">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Sparkles className="w-4.5 h-4.5 text-brand-accent animate-pulse" /> Ibra's Pick
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {/* Featured Playlists */}
                    {featuredPlaylists.map((pl) => (
                      <div
                        key={`feat-pl-${pl.id}`}
                        onClick={() => {
                          setSelectedPlaylist({
                            id: String(pl.id),
                            name: pl.name,
                            tracks: pl.tracks || [],
                            coverUrl: pl.pfp
                          });
                          setActiveTab("playlists");
                        }}
                        className="glass-card rounded-2xl p-4 flex flex-col gap-3 group cursor-pointer"
                      >
                        <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden relative shadow-md">
                          {pl.pfp ? (
                            <img
                              src={pl.pfp}
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              alt={pl.name}
                            />
                          ) : (
                            <ListMusic className="w-10 h-10 text-brand-accent group-hover:scale-105 transition-all duration-300" />
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <h4 className="font-bold text-xs text-white truncate group-hover:text-brand-accent transition-colors">
                            {pl.name}
                          </h4>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Curated • {pl.tracks?.length || 0} Songs
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Featured Songs */}
                    {filterTracks(featuredSongs).map((track, idx) => (
                      <TrackCard
                        key={`feat-song-${track.id}-${idx}`}
                        track={track}
                        variant="square"
                        tracksQueue={featuredSongs}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        isExplicit={isTrackExplicit(track)}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={handleOpenAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recently Played */}
              {user && recentlyPlayed.length > 0 && (
                <div className="animate-[fadeIn_0.4s_ease] mt-8">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand-accent" /> Recently Played
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {recentlyPlayed.slice(0, 6).map((item, idx) => (
                      <div
                        key={`recent-${item.type}-${item.id}-${idx}`}
                        onClick={() => {
                          if (item.type === "playlist") {
                            setSelectedPlaylist({
                              id: item.id,
                              name: item.name,
                              tracks: item.tracks,
                              coverUrl: item.coverUrl
                            });
                            setActiveTab("playlists");
                          } else {
                            const albumObj: Album = {
                              id: item.id,
                              title: item.name,
                              thumbnail: item.coverUrl || "",
                              artist: item.artistName || ""
                            };
                            handleOpenAlbum(albumObj);
                          }
                        }}
                        className="glass-card rounded-2xl p-4 flex flex-col gap-3 group cursor-pointer"
                      >
                        <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden relative shadow-md">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                              alt={item.name}
                            />
                          ) : (
                            <ListMusic className="w-10 h-10 text-brand-accent group-hover:scale-105 transition-all duration-300" />
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <h4 className="font-bold text-xs text-white truncate group-hover:text-brand-accent transition-colors">
                            {item.name}
                          </h4>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5 capitalize">
                            {item.type} {item.artistName ? `• ${item.artistName}` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </section>
          )}
          </div>{/* end transition wrapper */}

        </main>

        <button type="button" aria-label={desktopPanelVisible ? "Ocultar panel del reproductor" : "Mostrar panel del reproductor"}
          title={desktopPanelVisible ? "Ocultar panel" : "Mostrar panel"} onClick={() => setDesktopPanelVisible(value => !value)}
          className="fixed bottom-[6.5rem] right-3 z-40 hidden rounded-full border border-white/10 bg-brand-darkBg p-2.5 text-gray-300 hover:text-white lg:grid">
          <PanelRight className="size-4" />
        </button>
        {currentTrack && <button type="button" title="Modo inmersivo" aria-label="Modo inmersivo" onClick={() => setImmersivePlayer(true)} className="fixed bottom-[6.5rem] right-14 z-40 hidden rounded-full border border-white/10 bg-brand-darkBg p-2.5 text-gray-300 hover:text-white lg:grid"><Maximize2 className="size-4" /></button>}
        {immersivePlayer && currentTrack && <Modal title={localized(language, "Modo inmersivo", "Immersive mode", "Murgiltze-modua")} fullscreen onClose={() => setImmersivePlayer(false)}><React.Suspense fallback={<LoadingSkeleton layout="player" />}><PlayerPanel immersive onTrackContextMenu={handleTrackContextMenu} immersivePalette={(advancedAmbient ? palette?.ambient : palette?.saturation) ? "color" : undefined} /></React.Suspense></Modal>}
        {/* PC Right Player Sidebar panel */}
        <aside ref={desktopPanelRef} aria-label="Reproductor" className={"ambient-chrome ambient-player-panel fixed right-0 top-0 bottom-[var(--desktop-playback-height)] z-10 hidden w-[var(--desktop-player-size)] overflow-hidden border-l border-white/5 bg-brand-darkBg/95 backdrop-blur-md " + (desktopPanelVisible ? "lg:block" : "")}>
          <div role="separator" aria-label="Ancho del reproductor" aria-orientation="vertical" aria-valuemin={300} aria-valuemax={640} aria-valuenow={desktopPanelWidth} tabIndex={0}
            className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize select-none hover:bg-white/10"
            onPointerDown={event => { panelDrag.current = { x: event.clientX, width: desktopPanelRef.current?.clientWidth ?? desktopPanelWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (panelDrag.current) resizeDesktopPanel(panelDrag.current.width + panelDrag.current.x - event.clientX); }}
            onLostPointerCapture={() => { panelDrag.current = null; }}
            onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resizeDesktopPanel(desktopPanelWidth + (event.key === "ArrowLeft" ? 16 : -16)); } }} />
          {showQueueOverlay ? (
            <div className="h-full flex flex-col p-6 select-none overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-brand-accent animate-pulse" />
                  <span className="text-xs uppercase tracking-widest font-bold text-gray-200">
                    Cola de reproducción
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <QueueSessionActions notify={showToast} saved={savedPlaybackQueue} onSave={setSavedPlaybackQueue} />
                  {queue.length > 0 && (
                    <>
                      {canSaveQueueAsPlaylist && (
                        <button
                          onClick={() => {
                            setSaveQueueMode(true);
                            setNewPlaylistName("Play Queue");
                            setShowPlaylistCreateModal(true);
                          }}
                          className="p-1.5 text-[10px] text-brand-accent hover:text-black hover:bg-brand-accent transition-all flex items-center gap-1 font-semibold border border-brand-accent/30 rounded-lg bg-brand-accent/10 px-2"
                          title="Convert queue to playlist"
                        >
                          <Plus className="w-3 h-3" /> Convert to Playlist
                        </button>
                      )}
                      <button
                        onClick={clearQueue}
                        className="p-1.5 text-xs text-gray-400 hover:text-brand-accent hover:underline transition-colors flex items-center gap-1 font-semibold"
                        title="Clear Queue"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowQueueOverlay(false)}
                    className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all"
                    title="Close Queue"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Queue List Container */}
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 min-h-0">
                {queue.length === 0 ? (
                  <div className="text-center py-16 text-gray-500 rounded-3xl p-6 border border-dashed border-gray-800/80">
                    <ListMusic className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                    <p className="font-semibold text-gray-400 text-sm">{localized(language, "La cola está vacía", "Queue is empty", "Ilara hutsik dago")}</p>
                    <p className="text-xs text-gray-600 mt-1">Play songs to build a queue</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {currentTrack && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-brand-accent tracking-wider pl-1">
                          Now Playing
                        </span>
                        <div onContextMenu={event => handleTrackContextMenu(event, currentTrack)} className="p-3 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl flex items-center gap-3">
                          <img src={currentTrack.thumbnail} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-xs text-white truncate">{currentTrack.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{currentTrack.artist}</p>
                          </div>
                          <span className="text-[10px] text-brand-accent font-bold animate-pulse">{localized(language, "Reproduciendo", "Playing", "Erreproduzitzen")}</span>
                        </div>
                      </div>
                    )}

                    {userAddedItems.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between pl-1 mt-2">
                          <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">
                            {localized(language, "Añadidas a mano", "Added manually", "Eskuz gehituak")}
                          </span>
                          <button
                            onClick={clearManualQueue}
                            className="text-[10px] font-bold text-gray-400 hover:text-brand-accent transition-colors"
                          >
                            Vaciar cola
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {userAddedItems.map(({ track, originalIdx }) => {
                            const isDragged = originalIdx === draggedIndex;
                            return (
                              <div
                                key={`${track.id}-${originalIdx}`}
                                draggable={true}
                                onDragStart={(e) => {
                                  setDraggedIndex(originalIdx);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                }}
                                onDragEnter={(e) => {
                                  e.preventDefault();
                                  if (draggedIndex !== null && draggedIndex !== originalIdx) {
                                    reorderQueue(draggedIndex, originalIdx);
                                    setDraggedIndex(originalIdx);
                                  }
                                }}
                                onDragEnd={() => {
                                  setDraggedIndex(null);
                                }}
                                className={`group flex items-center gap-3 p-2 rounded-xl transition-all border cursor-grab active:cursor-grabbing ${
                                  isDragged
                                      ? "bg-brand-accent/20 border-brand-accent/30 scale-95 opacity-50"
                                      : "hover:bg-white/5 border-transparent hover:border-white/5"
                                  }`}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  handleTrackContextMenu(e, track);
                                }}
                                onClick={() => playTrack(track)}
                              >
                                <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-xs text-white truncate">
                                    {originalIdx === currentIndex + 1 && <span className="mr-1.5 text-[9px] text-gray-400">{localized(language, "SIGUIENTE", "NEXT", "HURRENGOA")}</span>}{track.title}
                                  </h4>
                                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{track.artist}</p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromQueue(track.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all ml-auto shrink-0"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {playlistItems.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider pl-1 mt-2">
                          Sigue desde: {queueSourceName}
                        </span>
                        <div className="flex flex-col gap-2">
                          {playlistItems.map(({ track, originalIdx }) => {
                            const isDragged = originalIdx === draggedIndex;
                            return (
                              <div
                                key={`${track.id}-${originalIdx}`}
                                draggable={true}
                                onDragStart={(e) => {
                                  setDraggedIndex(originalIdx);
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                }}
                                onDragEnter={(e) => {
                                  e.preventDefault();
                                  if (draggedIndex !== null && draggedIndex !== originalIdx) {
                                    reorderQueue(draggedIndex, originalIdx);
                                    setDraggedIndex(originalIdx);
                                  }
                                }}
                                onDragEnd={() => {
                                  setDraggedIndex(null);
                                }}
                                className={`group flex items-center gap-3 p-2 rounded-xl transition-all border cursor-grab active:cursor-grabbing ${
                                  isDragged
                                      ? "bg-brand-accent/20 border-brand-accent/30 scale-95 opacity-50"
                                      : "hover:bg-white/5 border-transparent hover:border-white/5"
                                  }`}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  handleTrackContextMenu(e, track);
                                }}
                                onClick={() => playTrack(track)}
                              >
                                <span className="text-[10px] font-medium text-gray-500 w-4 text-right shrink-0">{originalIdx - currentIndex}</span>
                                <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-semibold text-xs text-white truncate">
                                    {originalIdx === currentIndex + 1 && <span className="mr-1.5 text-[9px] text-gray-400">{localized(language, "SIGUIENTE", "NEXT", "HURRENGOA")}</span>}{track.title}
                                  </h4>
                                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{track.artist}</p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFromQueue(track.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-all ml-auto shrink-0"
                                  title="Remove"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <React.Suspense fallback={<LoadingSkeleton layout="player" className="p-5" label="Cargando reproductor…" />}>
            <PlayerPanel
              desktopLyricsRequest={desktopLyricsRequest}
              onTrackContextMenu={handleTrackContextMenu}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={currentTrack ? favorites.some((f) => f.id === currentTrack.id) : false}
              isExplicit={currentTrack ? isTrackExplicit(currentTrack) : false}

              onOpenArtist={handleOpenArtist}
              onOpenAlbum={handleOpenAlbum}
            />
            </React.Suspense>
          )}
        </aside>

        {/* Mobile Full Screen Now Playing — PlayerPanel (has Lyrics, Overview, all controls) */}
        {showMobilePlayer && currentTrack && (
          <div className="lg:hidden fixed inset-0 bg-brand-darkBg z-50 overflow-hidden flex flex-col animate-[slideUp_0.2s_cubic-bezier(0.16,1,0.3,1)]">
            <React.Suspense fallback={<LoadingSkeleton layout="player" className="p-5" label="Cargando reproductor…" />}>
            <PlayerPanel
              onToggleFavorite={handleToggleFavorite}
              isFavorite={favorites.some((f) => f.id === currentTrack.id)}
              onClose={() => setShowMobilePlayer(false)}
              isExplicit={isTrackExplicit(currentTrack)}

              onOpenArtist={handleOpenArtist}
            />
            </React.Suspense>
          </div>
        )}

        {playbackError && (
          <div
            role="alert"
            className="fixed left-4 right-4 z-[55] bottom-[calc(9rem+var(--safe-bottom))] md:left-auto md:right-6 md:bottom-28 md:max-w-md flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl text-xs text-white animate-[slideUp_0.25s_ease]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate text-gray-200">{playbackError}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition-all flex items-center gap-1"
                onClick={() => retryPlayback()}
                title="Reintentar reproducción"
              >
                <RotateCw className="w-3 h-3" />
                <span>{localized(language, "Reintentar", "Retry", "Saiatu berriro")}</span>
              </button>
              {currentTrack && !currentTrack.id.startsWith("local-") && (
                <button
                  className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white font-medium transition-all"
                  onClick={() => submitSearch(currentTrack.title + " " + currentTrack.artist)}
                  title="Buscar otra versión en catálogo"
                >
                  Buscar versión
                </button>
              )}
              {queue.length > 1 && (
                <button
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition-all"
                  onClick={nextTrack}
                  title="Saltar a la siguiente pista"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                className="p-1.5 text-gray-400 hover:text-white transition-all"
                onClick={() => setPlaybackError(null)}
                title="Cerrar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        {/* Toast Notification overlay */}
        {copyNotice !== null && createPortal(
          <div role="status" className="glass-panel pointer-events-none fixed left-1/2 top-4 z-[120] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 px-3.5 py-2 text-xs font-semibold text-white shadow-xl animate-[fadeIn_0.15s_ease]">
            <CheckCircle2 className="size-4 text-emerald-400" aria-hidden="true" /> Enlace copiado
          </div>,
          document.body,
        )}

        {toast && (
          <div role="status" className={`fixed md:bottom-6 right-6 px-5 py-3 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-3 animate-[slideUp_0.2s_ease] z-50 transition-all mobile-toast ${currentTrack ? 'has-player' : ''} ${toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : toast.type === "error"
                ? "bg-red-500/10 border-red-500/25 text-red-400"
                : "bg-white/10 border-white/10 text-gray-300"
            }`}>
            <div className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-emerald-400" : toast.type === "error" ? "bg-red-400" : "bg-brand-accent"
              } animate-pulse`} />
            <span className="text-xs font-semibold">{toast.message}</span>
            {undoQueue && <button onClick={undoQueue} className="text-xs font-semibold underline">{localized(language, "Deshacer cambio de cola", "Undo queue change", "Desegin ilarako aldaketa")}</button>}
          </div>
        )}


        {/* Mobile Queue Overlay */}
        {showQueueOverlay && (
          <div className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg/95 border border-white/10 rounded-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative mt-12">
              <button
                onClick={() => setShowQueueOverlay(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 flex items-center justify-between border-b border-white/5 bg-gradient-to-br from-white/5 to-transparent">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-6 h-6 text-brand-accent" /> Cola
                </h3>
                <div className="flex flex-wrap items-center justify-end gap-2 pr-8">
                  <QueueSessionActions notify={showToast} saved={savedPlaybackQueue} onSave={setSavedPlaybackQueue} />
                  {upcomingItems.length > 0 && (
                    <>
                      {canSaveQueueAsPlaylist && (
                        <button
                          onClick={() => {
                            setSaveQueueMode(true);
                            setNewPlaylistName("Play Queue");
                            setShowPlaylistCreateModal(true);
                          }}
                          className="px-2.5 py-1.5 rounded-full border border-brand-accent/30 bg-brand-accent/15 text-brand-accent hover:bg-brand-accent hover:text-black text-[10px] font-bold transition-all flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Convert
                        </button>
                      )}
                      <button
                        onClick={clearQueue}
                        className="px-3 py-1.5 rounded-full border border-white/10 hover:border-brand-accent/50 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {!currentTrack && upcomingItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 text-sm">{localized(language, "La cola está vacía", "Queue is empty", "Ilara hutsik dago")}</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Now Playing Section */}
                    {currentTrack && (
                      <div className="flex flex-col gap-2 text-left">
                        <span className="text-[10px] font-bold uppercase text-brand-accent tracking-wider pl-1">
                          Now Playing
                        </span>
                        <div onContextMenu={event => handleTrackContextMenu(event, currentTrack)} className="p-3 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl flex items-center gap-3">
                          <img src={currentTrack.thumbnail} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-xs text-white truncate">{currentTrack.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{currentTrack.artist}</p>
                          </div>
                          <span className="text-[10px] text-brand-accent font-bold animate-pulse shrink-0">{localized(language, "Reproduciendo", "Playing", "Erreproduzitzen")}</span>
                        </div>
                      </div>
                    )}

                    {/* Añadidas a mano Section */}
                    {userAddedItems.length > 0 && (
                      <div className="flex flex-col gap-2 text-left">
                        <div className="flex items-center justify-between border-b border-white/5 pb-1">
                          <span className="text-xs font-bold text-gray-400">{localized(language, "Añadidas a mano", "Added manually", "Eskuz gehituak")}</span>
                          <button
                            onClick={clearManualQueue}
                            className="text-xs font-semibold text-brand-accent hover:underline"
                          >
                            Vaciar cola
                          </button>
                        </div>
                        <div className="flex flex-col gap-2">
                          {userAddedItems.map(({ track, originalIdx }) => (
                            <div
                              key={`${track.id}-${originalIdx}`}
                              className="flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent hover:bg-white/5"
                              onContextMenu={event => handleTrackContextMenu(event, track)}
                              onClick={() => {
                                playTrack(track);
                                setShowQueueOverlay(false);
                              }}
                            >
                              <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate text-white">{originalIdx === currentIndex + 1 && <span className="mr-1.5 text-[9px] text-gray-400">{localized(language, "SIGUIENTE", "NEXT", "HURRENGOA")}</span>}{track.title}</p>
                                <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {originalIdx > 0 && (
                                  <button
                                    onClick={() => reorderQueue(originalIdx, originalIdx - 1)}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Move up"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </button>
                                )}
                                {originalIdx < queue.length - 1 && (
                                  <button
                                    onClick={() => reorderQueue(originalIdx, originalIdx + 1)}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Move down"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => handleTrackContextMenu(e, track)}
                                  className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                  title="Actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeFromQueue(track.id)}
                                  className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors"
                                  title="Remove from queue"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Next from Context Section */}
                    {playlistItems.length > 0 && (
                      <div className="flex flex-col gap-2 text-left">
                        <div className="border-b border-white/5 pb-1">
                          <span className="text-xs font-bold text-gray-400">Sigue desde: {queueSourceName}</span>
                        </div>
                        <div className="flex flex-col gap-2">
                          {playlistItems.map(({ track, originalIdx }) => (
                            <div
                              key={`${track.id}-${originalIdx}`}
                              className="flex items-center gap-3 p-2 rounded-xl transition-all border border-transparent hover:bg-white/5"
                              onContextMenu={event => handleTrackContextMenu(event, track)}
                              onClick={() => {
                                playTrack(track);
                                setShowQueueOverlay(false);
                              }}
                            >
                              <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate text-white">{originalIdx === currentIndex + 1 && <span className="mr-1.5 text-[9px] text-gray-400">{localized(language, "SIGUIENTE", "NEXT", "HURRENGOA")}</span>}{track.title}</p>
                                <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {originalIdx > 0 && (
                                  <button
                                    onClick={() => reorderQueue(originalIdx, originalIdx - 1)}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Move up"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </button>
                                )}
                                {originalIdx < queue.length - 1 && (
                                  <button
                                    onClick={() => reorderQueue(originalIdx, originalIdx + 1)}
                                    className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                    title="Move down"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={(e) => handleTrackContextMenu(e, track)}
                                  className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                  title="Actions"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeFromQueue(track.id)}
                                  className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors"
                                  title="Remove from queue"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Mobile Listen Together Overlay */}
        {showListenTogetherOverlay && (
          <div className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg/95 border border-white/10 rounded-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative mt-12">
              <button
                onClick={() => setShowListenTogetherOverlay(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all z-10"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="p-6 overflow-y-auto">
                <ListenTogether alwaysOpen={true} />
              </div>
            </div>
          </div>
        )}

        {/* Mobile Account / Settings Overlay */}
        {showAccountDropdown && (
          <div ref={mobileAccountOverlayRef} className="md:hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-md animate-fadeIn">
            <div className="glass-panel w-full max-w-sm rounded-[var(--app-radius-xl)] p-5 flex flex-col gap-4 relative shadow-2xl text-left max-h-[85vh] overflow-y-auto">
              <button 
                onClick={() => setShowAccountDropdown(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              {/* Profile details */}
              <div className="flex flex-col items-center gap-2 pb-3.5 border-b border-white/5">
                <div 
                  className={`w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center relative shadow-lg overflow-hidden group ${
                    user ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                  }`}
                  onClick={user ? () => document.getElementById("pfp-upload-mobile")?.click() : undefined}
                >
                  {pfp ? (
                    <img src={pfp} className="w-full h-full object-cover" alt="Profile avatar" />
                  ) : (
                    <span className="text-lg font-bold text-white">{username.slice(0, 2).toUpperCase()}</span>
                  )}
                  {user && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Plus className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <input
                  id="pfp-upload-mobile"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        handleUpdatePfp(base64);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                
                <div className="w-full flex flex-col gap-1 items-center">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => handleUpdateUsername(e.target.value)}
                    placeholder="Username"
                    disabled={!user}
                    className="w-full bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 rounded-xl px-3 py-1.5 text-center text-xs font-semibold text-white focus:outline-none transition-all"
                  />
                  <div className="text-center mt-1">
                    <p className="text-[9px] text-gray-500 truncate max-w-[200px]">{user?.email}</p>
                    <p className="text-[9px] text-emerald-400 font-semibold flex items-center justify-center gap-1 mt-0.5">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                      Cloud Synced
                    </p>
                  </div>
                </div>
              </div>

              {/* Public Playlists */}
              {playlists.some(p => p.isPublic) && (
                <div className="flex flex-col gap-2 pb-3 border-b border-white/5 max-h-36 overflow-y-auto pr-1">
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5 text-left">
                    <Globe className="w-3 h-3 text-brand-accent" /> Public Playlists
                  </span>
                  <div className="flex flex-col gap-1.5 pl-1">
                    {playlists.filter(p => p.isPublic).map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedPlaylist(p);
                          setActiveTab("playlists");
                          setSelectedArtist(null);
                          setSelectedAlbum(null);
                          setShowAccountDropdown(false);
                        }}
                        className="w-full text-left truncate text-xs font-semibold text-gray-300 hover:text-white transition-all flex items-center gap-2 hover:bg-white/5 py-1 px-1.5 rounded-lg"
                      >
                        <ListMusic className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                        <span className="truncate text-left">{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Preferences */}
              <div className="flex flex-col gap-2.5 pb-3 border-b border-white/5">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1.5 text-left">
                  <Settings className="w-3 h-3 text-brand-accent" /> Preferences
                </span>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-300">Theme</span>
                  <button
                    onClick={() => {
                      const nextTheme = themeSettings.theme === "dark" ? "bright" : themeSettings.theme === "bright" ? "noir" : "dark";
                      if (nextTheme === "noir") setAmbientGlowEnabled(false);
                      setThemeSettings(prev => ({
                        ...prev,
                        theme: nextTheme,
                        bgColor: nextTheme === "noir" ? "#000000" : mapColorBetweenThemes(prev.bgColor, prev.theme, nextTheme)
                      }));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-[10px] font-bold text-white transition-all uppercase"
                  >
                    {themeSettings.theme}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    setActiveTab("visuals");
                    setSelectedArtist(null);
                    setSelectedAlbum(null);
                    setSelectedPlaylist(null);
                    setShowAccountDropdown(false);
                  }}
                  className="w-full text-left py-2 px-3 hover:bg-white/5 rounded-xl transition-all text-xs font-semibold flex items-center gap-2.5 text-gray-300 hover:text-white"
                >
                  <Sparkles className="w-4 h-4 text-brand-accent" />
                  <span>Visualizer Tab</span>
                </button>

                <button
                  onClick={() => {
                    handleSignOut();
                    setShowAccountDropdown(false);
                  }}
                  className="w-full mt-1.5 py-2 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-bold rounded-xl transition-all text-xs text-center cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Playlist Create Modal */}
        {showPlaylistCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
              <button
                onClick={() => {
                  setShowPlaylistCreateModal(false);
                  setSaveQueueMode(false);
                  setTrackPendingNewPlaylist(null);
                }}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-white">
                {saveQueueMode ? "Guardar cola como lista" : "Crear lista"}
              </h3>
              {saveQueueMode && currentTrack && <label className="flex gap-2 text-sm"><input type="checkbox" checked={includeCurrentInQueue} onChange={event => setIncludeCurrentInQueue(event.target.checked)} /> Incluir la canción actual</label>}
              <input
                type="text"
                aria-label="Nombre de la lista"
                placeholder="Nombre de la lista…"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 text-white text-sm focus:outline-none transition-all placeholder:text-gray-500"
                autoFocus
              />
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => {
                    setShowPlaylistCreateModal(false);
                    setSaveQueueMode(false);
                    setTrackPendingNewPlaylist(null);
                  }}
                  className="flex-1 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                >
                  {localized(language, "Cancelar", "Cancel", "Utzi")}
                </button>
                <button
                  onClick={() => handleCreatePlaylist(newPlaylistName)}
                  className="flex-1 py-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all shadow-md shadow-brand-accent/25"
                >
                  {saveQueueMode ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Track to Playlist Selector Modal */}
        {trackToAddToPlaylist && createPortal(
          <>
            {/* Backdrop for click outside */}
            <div
              className="fixed inset-0 z-[99] bg-black/60 md:bg-transparent backdrop-blur-[2px] md:backdrop-blur-none"
              onClick={() => {
                setTrackToAddToPlaylist(null);
                setPlaylistPopoverCoords(null);
                setPlaylistSearchQuery("");
              }}
            />

            <div
              onClick={(e) => e.stopPropagation()}
              style={playlistPopoverPosition ?? undefined}
              className={playlistPopoverPosition
                ? "fixed z-[100] w-80 animate-[fadeIn_0.2s_ease]"
                : "fixed inset-0 z-[100] animate-[fadeIn_0.2s_ease] md:bottom-28 md:left-6 md:top-auto md:right-auto md:w-80 max-md:flex max-md:items-center max-md:justify-center max-md:bg-black/80 max-md:backdrop-blur-sm"}
            >
              <div ref={playlistPopoverRef} className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col gap-4 rounded-3xl border border-white/10 bg-brand-darkBg p-5 shadow-2xl md:max-w-none">
              <button
                onClick={() => {
                  setTrackToAddToPlaylist(null);
                  setPlaylistSearchQuery("");
                }}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              
              <h3 className="text-sm font-bold text-white pr-6 text-left">{localized(language, "Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}</h3>

              {/* Search playlist */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder={localized(language, "Busca una playlist", "Find a playlist", "Bilatu zerrenda bat")}
                  value={playlistSearchQuery}
                  onChange={(e) => setPlaylistSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/5 focus:border-brand-accent/50 text-white text-xs placeholder:text-gray-500 focus:outline-none transition-all"
                />
              </div>

              {/* Create new playlist inside modal */}
              <button
                onClick={() => {
                  setTrackPendingNewPlaylist(trackToAddToPlaylist);
                  setTrackToAddToPlaylist(null);
                  setPlaylistSearchQuery("");
                  setNewPlaylistName("");
                  setShowPlaylistCreateModal(true);
                }}
                className="flex items-center gap-2 px-1 text-xs font-bold text-gray-300 hover:text-white transition-all text-left"
              >
                <Plus className="w-4 h-4 text-gray-400" />
                {localized(language, "Nueva playlist", "New playlist", "Zerrenda berria")}
              </button>

              {/* List of playlists */}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 max-h-[35vh]">
                {playlists.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">{localized(language, "Todavía no hay playlists.", "No playlists created yet.", "Ez dago zerrendarik oraindik.")}</p>
                ) : (() => {
                  const filtered = playlists.filter(p => p.name.toLowerCase().includes(playlistSearchQuery.toLowerCase()));
                  const savedIn = filtered.filter(p => p.tracks.some(t => t.id === trackToAddToPlaylist.id));
                  const others = filtered.filter(p => !p.tracks.some(t => t.id === trackToAddToPlaylist.id));

                  if (filtered.length === 0) {
                    return <p className="text-xs text-gray-500 py-4 text-center">{localized(language, "No se encontraron playlists.", "No playlists found.", "Ez da zerrendarik aurkitu.")}</p>;
                  }

                  return (
                    <>
                      {savedIn.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest text-left">{localized(language, "Guardada en", "Saved In", "Hemen gordeta")}</span>
                          {savedIn.map(playlist => (
                            <button
                              key={playlist.id}
                              onClick={() => handleToggleTrackPlaylist(playlist.id, trackToAddToPlaylist)}
                              className="w-full text-left p-1.5 rounded-xl hover:bg-white/5 transition-all text-xs font-semibold text-white flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                                  {playlist.coverUrl || playlist.tracks?.[0]?.thumbnail ? (
                                    <img src={playlist.coverUrl || playlist.tracks?.[0]?.thumbnail} className="w-full h-full object-cover" />
                                  ) : (
                                    <Music2 className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-white text-xs font-bold">{playlist.name}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{playlist.tracks.length} songs</p>
                                </div>
                              </div>
                              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 fill-emerald-500/20 shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      )}

                      {others.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] text-gray-500 font-extrabold uppercase tracking-widest text-left">{localized(language, "Actualizadas recientemente", "Recently updated", "Duela gutxi eguneratuak")}</span>
                          {others.map(playlist => (
                            <button
                              key={playlist.id}
                              onClick={() => handleToggleTrackPlaylist(playlist.id, trackToAddToPlaylist)}
                              className="w-full text-left p-1.5 rounded-xl hover:bg-white/5 transition-all text-xs font-semibold text-white flex items-center justify-between group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                                  {playlist.coverUrl || playlist.tracks?.[0]?.thumbnail ? (
                                    <img src={playlist.coverUrl || playlist.tracks?.[0]?.thumbnail} className="w-full h-full object-cover" />
                                  ) : (
                                    <Music2 className="w-4 h-4 text-gray-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-white text-xs font-bold">{playlist.name}</p>
                                  <p className="text-[10px] text-gray-400 mt-0.5">{playlist.tracks.length} songs</p>
                                </div>
                              </div>
                              <div className="w-4.5 h-4.5 rounded-full border border-gray-600 group-hover:border-white transition-colors shrink-0 ml-2" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Bottom Cancel button */}
              <div className="flex justify-end border-t border-white/5 pt-3">
                <button
                  onClick={() => {
                    setTrackToAddToPlaylist(null);
                    setPlaylistSearchQuery("");
                  }}
                  className="px-4 py-1.5 rounded-full hover:bg-white/5 text-xs font-bold text-gray-400 hover:text-white transition-all"
                >
                  {localized(language, "Cancelar", "Cancel", "Utzi")}
                </button>
              </div>

            </div>
          </div>
          </>, document.body,
        )}

        {/* Add Album to Playlist Selector Modal */}
        {albumToAddToPlaylist && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg border border-white/10 rounded-3xl p-5 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
              <button
                onClick={() => {
                  setAlbumToAddToPlaylist(null);
                  setPlaylistSearchQuery("");
                }}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              
              <div>
                <h3 className="text-sm font-bold text-white pr-6 text-left">{localized(language, "Añadir álbum a playlist", "Add album to playlist", "Gehitu albuma zerrendara")}</h3>
                <p className="text-[11px] text-gray-400 text-left mt-0.5 truncate">
                  {albumToAddToPlaylist.album.title} • {(albumToAddToPlaylist.tracks.length > 0 ? albumToAddToPlaylist.tracks.length : albumTracks.length > 0 ? albumTracks.length : (albumToAddToPlaylist.album.numberOfTracks || 0))} tracks
                </p>
              </div>

              {/* Search playlist */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search playlist..."
                  value={playlistSearchQuery}
                  onChange={(e) => setPlaylistSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/5 border border-white/5 focus:border-brand-accent/50 text-white text-xs placeholder:text-gray-500 focus:outline-none transition-all"
                />
              </div>

              {/* Save directly as new playlist shortcut */}
              <button
                onClick={() => {
                  handleSaveAlbumAsPlaylist(albumToAddToPlaylist.album, albumToAddToPlaylist.tracks);
                  setAlbumToAddToPlaylist(null);
                  setPlaylistSearchQuery("");
                }}
                className="flex items-center gap-2 px-1 text-xs font-bold text-brand-accent hover:underline transition-all text-left"
              >
                <Plus className="w-4 h-4" />
                Create new playlist with this album
              </button>

              {/* List of playlists */}
              <div className="flex flex-col gap-2 max-h-[35vh] overflow-y-auto pr-1">
                {playlists.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">{localized(language, "Todavía no hay playlists.", "No playlists created yet.", "Ez dago zerrendarik oraindik.")}</p>
                ) : (() => {
                  const filtered = playlists.filter(p => p.name.toLowerCase().includes(playlistSearchQuery.toLowerCase()));

                  if (filtered.length === 0) {
                    return <p className="text-xs text-gray-500 py-4 text-center">{localized(language, "No se encontraron playlists.", "No playlists found.", "Ez da zerrendarik aurkitu.")}</p>;
                  }

                  return filtered.map(playlist => (
                    <button
                      key={playlist.id}
                      onClick={() => handleAddAlbumTracksToPlaylist(playlist.id, albumToAddToPlaylist.album, albumToAddToPlaylist.tracks)}
                      className="w-full text-left p-2 rounded-xl hover:bg-white/5 transition-all text-xs font-semibold text-white flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                          {playlist.coverUrl || playlist.tracks?.[0]?.thumbnail ? (
                            <img src={playlist.coverUrl || playlist.tracks?.[0]?.thumbnail} className="w-full h-full object-cover" />
                          ) : (
                            <ListMusic className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-white text-xs font-bold">{playlist.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{playlist.tracks.length} tracks</p>
                        </div>
                      </div>
                      <Plus className="w-4 h-4 text-gray-400 group-hover:text-brand-accent transition-colors shrink-0 ml-2" />
                    </button>
                  ));
                })()}
              </div>

              {/* Bottom Cancel button */}
              <div className="flex justify-end border-t border-white/5 pt-3">
                <button
                  onClick={() => {
                    setAlbumToAddToPlaylist(null);
                    setPlaylistSearchQuery("");
                  }}
                  className="px-4 py-1.5 rounded-full hover:bg-white/5 text-xs font-bold text-gray-400 hover:text-white transition-all"
                >
                  {localized(language, "Cancelar", "Cancel", "Utzi")}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Spotify Playlist Import Modal */}
        {showSpotifyImportModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
              <button
                onClick={() => {
                  if (!isImportingSpotify) setShowSpotifyImportModal(false);
                }}
                disabled={isImportingSpotify}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-white">{localized(language, "Importar playlist", "Import playlist", "Inportatu zerrenda")}</h3>
              {importProgress && <p role="status" className="flex items-center gap-2 text-sm">{importProgress.done} de {importProgress.total}<progress aria-label={localized(language, "Progreso de importación", "Import progress", "Inportazioaren aurrerapena")} value={importProgress.done} max={Math.max(1, importProgress.total)} /><button className="underline" onClick={() => importAbort.current?.abort()}>{localized(language, "Cancelar", "Cancel", "Utzi")}</button></p>}
              {importPreview && (
                <div className="grid gap-3 rounded-xl border border-white/10 p-3">
                  <input aria-label="Nombre de la lista importada" className="w-full rounded-lg bg-white/5 p-2 text-sm" value={importPreview.name} onChange={event => setImportPreview({ ...importPreview, name: event.target.value })} />
                  <p className="text-sm text-gray-300">{importPreview.tracks.length} pistas en la vista previa</p>
                  <ul className="max-h-44 overflow-auto">
                    {importPreview.tracks.map((track, index) => <li key={track.id + index} onContextMenu={event => handleTrackContextMenu(event, track)} className="flex items-center justify-between gap-2 border-t border-white/5 py-1.5 text-xs">
                      <span>{track.title} · {track.artist}{track.id.startsWith("m3u-") && <span className="block text-amber-300">{localized(language, "Coincidencia pendiente", "Match pending", "Bat-etortzea zain")}</span>}</span>
                      <button aria-label={"Quitar " + track.title} className="p-2" onClick={() => setImportPreview({ ...importPreview, tracks: importPreview.tracks.filter((_, position) => position !== index) })}><X className="size-4" /></button>
                    </li>)}
                  </ul>
                  <button className="rounded-lg bg-white p-2 text-sm font-semibold text-black" disabled={!importPreview.name.trim() || !importPreview.tracks.length} onClick={() => {
                    savePlaylists([...playlists, { ...importPreview, name: importPreview.name.trim() }]);
                    setSpotifyLink("");
                    setShowSpotifyImportModal(false);
                    showToast("Lista importada.", "success");
                  }}>{localized(language, "Guardar lista", "Save playlist", "Gorde zerrenda")}</button>
                </div>
              )}

              {/* Tab controls */}
              <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 mb-1">
                <button
                  onClick={() => setImportTab("spotify")}
                  disabled={isImportingSpotify}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${importTab === "spotify"
                      ? "bg-brand-accent text-black shadow-md"
                      : "text-gray-400 hover:text-white"
                    }`}
                >
                  Spotify Link
                </button>
                <button
                  onClick={() => setImportTab("m3u")}
                  disabled={isImportingSpotify}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${importTab === "m3u"
                      ? "bg-brand-accent text-black shadow-md"
                      : "text-gray-400 hover:text-white"
                    }`}
                >
                  M3U / M3U8 File
                </button>
              </div>

              {importTab === "spotify" ? (
                <>
                  <p className="text-xs text-gray-400">{localized(language, "Pega el enlace público de Spotify para importar sus canciones.", "Paste the Spotify public playlist link below to import its tracks.", "Itsatsi Spotifyko zerrenda publikoaren esteka abestiak inportatzeko.")}</p>
                  <input
                    type="text"
                    placeholder="https://open.spotify.com/playlist/..."
                    value={spotifyLink}
                    onChange={(e) => setSpotifyLink(e.target.value)}
                    disabled={isImportingSpotify}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 text-white text-sm focus:outline-none transition-all placeholder:text-gray-500 disabled:opacity-50"
                    autoFocus
                  />

                  {/* Spotify integration settings for unlimited mode */}
                  <div className="mt-2 border-t border-white/5 pt-3 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-gray-300">Spotify Web API Integration (to import &gt; 100 songs)</span>
                    {spotifyToken ? (
                      <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-bold text-emerald-400">Connected to Spotify</span>
                          <span className="text-[10px] text-gray-400">Unlimited import active</span>
                        </div>
                        <button
                          onClick={async () => {
                            const { clearSpotifyStorage } = await import("./services/spotifyImporter");
                            clearSpotifyStorage();
                            setSpotifyTokenState(null);
                            showToast("Disconnected from Spotify", "info");
                          }}
                          className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[10px] font-semibold text-gray-300 hover:text-white transition-all"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 bg-white/5 border border-white/5 rounded-2xl p-3">
                        <p className="text-[10px] text-gray-400 leading-normal">
                          Spotify limits public links to the first 100 tracks. Enter your free **Spotify Client ID** below to import playlists of any length:
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Spotify Client ID"
                            value={spotifyClientId}
                            onChange={(e) => {
                              setSpotifyClientId(e.target.value);
                              localStorage.setItem("ibrastream_spotify_client_id", e.target.value);
                            }}
                            className="flex-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/5 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-accent/40"
                          />
                          <button
                            onClick={async () => {
                              if (!spotifyClientId.trim()) {
                                showToast("Please enter your Client ID first.", "error");
                                return;
                              }
                              try {
                                const { initiateSpotifyPKCELogin } = await import("./services/spotifyImporter");
                                await initiateSpotifyPKCELogin(spotifyClientId.trim(), getSpotifyRedirectUri());
                              } catch (err: any) {
                                showToast(err.message, "error");
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent/90 text-xs font-bold text-black transition-all shadow-md shadow-brand-accent/20"
                          >
                            Connect
                          </button>
                        </div>
                        <a
                          href="https://developer.spotify.com/dashboard"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-brand-accent hover:underline text-right"
                        >
                          Get ID from Developer Dashboard (set Redirect URL to {getSpotifyRedirectUri()})
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-400">{localized(language, "Selecciona un archivo con canciones o una playlist.", "Select any file containing tracks or a playlist to import.", "Hautatu abestiak edo zerrenda bat dituen fitxategia.")}</p>
                  
                  {importFileError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col gap-2 relative animate-[fadeIn_0.2s_ease]">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-red-400">{localized(language, "No se pudo leer el archivo", "Could not read file", "Ezin izan da fitxategia irakurri")}</p>
                          <p className="text-[11px] text-gray-300 mt-1 leading-normal break-words">
                            {importFileError}
                          </p>
                        </div>
                        <button
                          onClick={() => setImportFileError(null)}
                          className="p-1 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/10 transition-all cursor-pointer relative group min-h-[140px]">
                    <input
                      type="file"
                      disabled={isImportingSpotify}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setImportFileError(null);
                        const reader = new FileReader();
                        
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          
                          // 1. Try to parse it as JSON (like your extracted file)
                          try {
                            const parsedData = JSON.parse(content);
                            
                            // Check if it matches the structure you uploaded
                            if (parsedData && Array.isArray(parsedData.songs)) {
                              const mappedTracks: Track[] = parsedData.songs.map((song: any) => ({
                                id: song.id || String(Math.random()),
                                title: song.title || "Unknown Title",
                                artist: song.artistName || "Unknown Artist",
                                albumName: song.albumTitle,
                                thumbnail: song.artwork || song.artistImage || "", // Use artwork, fallback to artist image
                                duration: song.duration || 0,
                                artistId: song.artistId,
                                albumId: song.albumId
                              }));

                              if (mappedTracks.length === 0) {
                                throw new Error("JSON file has no songs.");
                              }

                              const playlistName = parsedData.title || file.name.replace(/\.[^/.]+$/, "");

                              const newPlaylist: Playlist = {
                                id: String(Date.now()),
                                name: playlistName,
                                tracks: mappedTracks
                              };

                              const updated = [...playlists, newPlaylist];
                              savePlaylists(updated);
                              setShowSpotifyImportModal(false);
                              showToast(`Imported "${playlistName}" successfully! (${mappedTracks.length} songs)`, "success");
                              return; // Exit early if JSON parsing was successful
                            }
                          } catch (err) {
                            // Not a JSON file, silently ignore and fall through to M3U logic
                          }

                          // 2. Fallback to standard M3U parsing
                          handleImportM3U(file.name, content);
                        };
                        
                        reader.onerror = () => {
                          setImportFileError("Failed to read the file content.");
                        };
                        
                        reader.readAsText(file);
                        e.target.value = ""; // Reset the input value so onChange fires again
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <ListMusic className="w-8 h-8 text-brand-accent group-hover:scale-110 transition-all duration-300 mb-2" />
                    <span className="text-xs font-bold text-white mb-0.5">{localized(language, "Elegir archivo", "Click to choose a file", "Aukeratu fitxategia")}</span>
                    <span className="text-[10px] text-gray-500">Supports .m3u, .m3u8, .csv, .json, .txt, etc.</span>
                  </div>
                </>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowSpotifyImportModal(false)}
                  disabled={isImportingSpotify}
                  className="flex-1 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-xs font-semibold text-gray-400 hover:text-white transition-all disabled:opacity-50"
                >
                  {localized(language, "Cancelar", "Cancel", "Utzi")}
                </button>
                {importTab === "spotify" && (
                  <button
                    onClick={() => handleImportSpotify(spotifyLink)}
                    disabled={isImportingSpotify || !spotifyLink.trim()}
                    className="flex-1 py-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all shadow-md shadow-brand-accent/25 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isImportingSpotify ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                        Importing...
                      </>
                    ) : (
                      "Import"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Update Checker Modal */}
        {showUpdateModal && updateInfo && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 select-none animate-fadeIn backdrop-blur-md">
            <div className="bg-[#121212] border border-white/10 w-full max-w-md rounded-[var(--app-radius-xl)] p-6 shadow-2xl relative">
              <button 
                onClick={() => {
                  if (updateInfo) {
                    sessionStorage.setItem(`ibrastream_dismissed_update_${updateInfo.latestVersion}`, "true");
                  }
                  setShowUpdateModal(false);
                }}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent mb-4 animate-bounce">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{localized(language, "Hay una actualización disponible", "New Update Available!", "Eguneratze bat dago eskuragarri")}</h3>
                <p className="text-xs text-gray-400 mb-4">
                  Version {updateInfo.latestVersion} is now available (You have {updateInfo.currentVersion}).
                </p>

                {updateInfo.releaseNotes && (
                  <div className="w-full text-left bg-white/5 border border-white/5 rounded-[var(--app-radius-lg)] p-4 mb-5 max-h-40 overflow-y-auto custom-scrollbar">
                    <p className="text-xs font-semibold text-gray-300 mb-1">What's new:</p>
                    <p className="text-[11px] text-gray-400 whitespace-pre-wrap leading-relaxed">
                      {updateInfo.releaseNotes}
                    </p>
                  </div>
                )}

                <div className="flex w-full gap-3">
                  <button
                    onClick={() => {
                      if (updateInfo) {
                        sessionStorage.setItem(`ibrastream_dismissed_update_${updateInfo.latestVersion}`, "true");
                      }
                      setShowUpdateModal(false);
                    }}
                    className="flex-1 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                  >
                    Later
                  </button>
                  <button
                    onClick={() => {
                      redirectToUpdate(updateInfo.apkUrl || updateInfo.releaseUrl);
                      setShowUpdateModal(false);
                    }}
                    className="flex-1 py-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all shadow-md shadow-brand-accent/25"
                  >
                    Update Now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Supabase Authentication Modal */}
        {showAuthModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 select-none backdrop-blur-xl animate-[fadeIn_0.2s_ease]">
            <div className="relative w-full max-w-sm overflow-hidden rounded-[var(--app-radius-xl)] shadow-2xl shadow-black/80">

              {/* Gradient header banner */}
              <div className="relative bg-gradient-to-br from-brand-accent/30 via-purple-600/20 to-black px-8 pt-10 pb-8 flex flex-col items-center text-center border-b border-white/5">
                {/* Decorative glow orb */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full bg-brand-accent/20 blur-3xl pointer-events-none" />

                {/* Logo / icon */}
                <div className="relative w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg p-2 overflow-hidden mb-4">
                  <Logo className="w-full h-full" />
                </div>

                <h3 className="text-2xl font-black text-white tracking-tight">
                  {authRecovery ? "Cambiar contraseña" : authIsSignUp ? "Crear cuenta de IbraMusic" : "Iniciar sesión"}
                </h3>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-[220px]">
                  {authIsSignUp
                    ? "Sync your library & playlists across all devices."
                    : "Sign in to access your cloud library."
                  }
                </p>

                {/* Close button */}
                {!isAuthModalForced && (
                  <button
                    onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthEmail(""); setAuthPassword(""); }}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white p-1.5 hover:bg-white/10 rounded-full transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Form body */}
              <div className="bg-[#0e0e0e] px-8 py-7 flex flex-col gap-5">

                {!authRecovery && authEmail.includes("@") && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <button onClick={() => sendPasswordReset(authEmail).then(() => showToast("Si la cuenta existe, recibirás un enlace.", "info")).catch(() => setAuthError("No se pudo enviar el correo. Reintenta en unos minutos."))}>{localized(language, "Recuperar contraseña", "Reset password", "Berreskuratu pasahitza")}</button>
                    <button onClick={() => resendConfirmation(authEmail).then(() => showToast("Solicitud de confirmación enviada.", "info")).catch(() => setAuthError("No se pudo reenviar la confirmación."))}>{localized(language, "Reenviar confirmación", "Resend confirmation", "Bidali berriro baieztapena")}</button>
                  </div>
                )}
                {authError && (
                  <div role="alert" className="bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-xl p-3 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthLoading(true);
                  setAuthError(null);
                  try {
                    if (authRecovery) {
                      await updatePassword(authPassword);
                      setAuthRecovery(false);
                      showToast("Contraseña actualizada.", "success");
                    } else if (authIsSignUp) {
                      await signUp(authEmail, authPassword);
                      showToast(localized(language, "Cuenta creada. Revisa tu correo.", "Account created! Check your email.", "Kontua sortu da. Begiratu zure posta."), "success");
                    } else {
                      await signIn(authEmail, authPassword);
                      showToast(localized(language, "Sesión iniciada", "Signed in successfully!", "Saioa hasi da"), "success");
                    }
                    setShowAuthModal(false);
                    setAuthEmail("");
                    setAuthPassword("");
                  } catch (err: any) {
                    setAuthError(err.message || "An authentication error occurred.");
                  } finally {
                    setAuthLoading(false);
                  }
                }} className="flex flex-col gap-4">

                  {/* Email */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">{localized(language, "Correo electrónico", "Email", "Helbide elektronikoa")}</label>
                    <input
                      type="email"
                      aria-label="Correo electrónico"
                      autoComplete="email"
                      required={!authRecovery}
                      hidden={authRecovery}
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-accent focus:bg-white/8 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-accent),transparent_85%)] transition-all"
                    />
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">{localized(language, "Contraseña", "Password", "Pasahitza")}</label>
                    <input
                      type="password"
                      aria-label="Contraseña"
                      autoComplete={authRecovery || authIsSignUp ? "new-password" : "current-password"}
                      required
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-accent focus:bg-white/8 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-brand-accent),transparent_85%)] transition-all"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3.5 mt-1 rounded-xl bg-brand-accent hover:brightness-110 active:scale-[0.98] text-sm font-black text-black transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-brand-accent/25"
                  >
                    {authLoading ? (
                      <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    ) : (
                      authIsSignUp ? "Create Account" : "Sign In"
                    )}
                  </button>
                </form>

                {/* Toggle sign in / register */}
                <p className="text-center text-xs text-gray-500">
                  {authIsSignUp ? "Already have an account? " : "Don't have an account? "}
                  <button
                    onClick={() => { setAuthIsSignUp(!authIsSignUp); setAuthError(null); }}
                    className="text-brand-accent hover:underline font-semibold transition-all"
                  >
                    {authIsSignUp ? "Sign In" : "Register"}
                  </button>
                </p>
              </div>
            </div>
          </div>
        )}

      </div>



      {/* ═══ MOBILE MINI-PLAYER (above bottom nav) ═══ */}
      {playlistUndo && createPortal(<div role="status" className="fixed bottom-36 left-1/2 z-[115] flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/10 bg-brand-darkBg px-4 py-2 text-xs text-white shadow-xl">Playlist actualizada <button className="font-semibold underline" onClick={undoPlaylistChange}>{localized(language, "Deshacer", "Undo", "Desegin")}</button></div>, document.body)}
      <MobileMiniPlayer
        copyTrackLink={copyLink}
        favorites={favorites}
        handleToggleFavorite={handleToggleFavorite}
        showMobilePlayer={showMobilePlayer}
        setShowMobilePlayer={setShowMobilePlayer}
      />

      {/* ═══ DESKTOP BOTTOM PLAYBACK BAR ═══ */}
      <DesktopPlaybackBar
        onTrackContextMenu={handleTrackContextMenu}
        copyTrackLink={copyLink}
        favorites={favorites}
        handleToggleFavorite={handleToggleFavorite}
        handleOpenAlbum={handleOpenAlbum}
        handleOpenArtist={(artist, seed) => void handleOpenArtist(artist, true, "popular", seed)}
        showQueueOverlay={showQueueOverlay}
        setShowQueueOverlay={setShowQueueOverlay}
        playlists={playlists}
        onAddToPlaylist={handleOpenAddToPlaylist}
      />

      {playlistContextMenu && (
        <PlaylistContextMenu
          x={playlistContextMenu.x}
          y={playlistContextMenu.y}
          playlist={playlistContextMenu.playlist}
          playlists={playlists}
          isOwnPlaylist={playlists.some((p) => p.id === playlistContextMenu.playlist.id)}
          isHidden={hiddenPlaylistIds.has(playlistContextMenu.playlist.id)}
          isAllExplicit={
            playlistContextMenu.playlist.tracks &&
            playlistContextMenu.playlist.tracks.length > 0 &&
            playlistContextMenu.playlist.tracks.every((t) => isTrackExplicit(t))
          }
          onClose={() => setPlaylistContextMenu(null)}
          onPlay={() => handlePlayPlaylist(playlistContextMenu.playlist)}
          isPinned={pinnedPlaylistIds.has(playlistContextMenu.playlist.id)}
          onTogglePin={() => handleTogglePinPlaylist(playlistContextMenu.playlist.id)}
          onAddToQueue={() => handleAddPlaylistToQueue(playlistContextMenu.playlist)}
          onAddPlaylistToPlaylist={(targetId) => handleMergePlaylists(playlistContextMenu.playlist, targetId)}
          onToggleHide={() => handleToggleHidePlaylist(playlistContextMenu.playlist.id)}
          onToggleExplicit={(makeExplicit) => handleTogglePlaylistExplicit(playlistContextMenu.playlist, makeExplicit)}
          onDelete={
            playlists.some((p) => p.id === playlistContextMenu.playlist.id)
              ? () => handleDeletePlaylist(playlistContextMenu.playlist.id)
              : undefined
          }
          onShare={() => {
            if (!playlistContextMenu.playlist.isPublic) {
              showToast("Haz pública la lista antes de compartirla.", "info");
              return;
            }
            void copyLink(getPlaylistShareUrl(playlistContextMenu.playlist.id));
          }}
        />
      )}

      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          anchor={contextMenu.anchor}
          track={contextMenu.track}
          isFavorite={favorites.some((f) => f.id === contextMenu.track.id)}
          isExplicit={isTrackExplicit(contextMenu.track)}
          playlists={playlists}
          currentPlaylistId={contextMenu.currentPlaylistId}
          onClose={closeTrackContextMenu}
          onToggleFavorite={() => handleToggleFavorite(contextMenu.track)}
          isSavedForLater={isSavedForLater(contextMenu.track)}
          listenLaterBlocked={isInPersonalLibrary(contextMenu.track)}
          onToggleListenLater={() => toggleListenLater(contextMenu.track)}
          onToggleExplicit={() => handleToggleExplicit(contextMenu.track)}
          onAddToQueue={() => { if (roomId && !isHost) proposeRoomTrack(contextMenu.track); else addToQueue(contextMenu.track); }}
          queueActionLabel={roomId && !isHost ? "Proponer a la sala" : undefined}
          onPlayNext={!roomId || isHost ? () => playNext(contextMenu.track) : undefined}
          onWrongSong={!roomId && !contextMenu.track.id.startsWith("local-") ? () => {
            const track = contextMenu.track;
            setSourceMenuTrack(currentTrack?.id === track.id ? currentTrack : {
              ...track,
              isExplicit: isTrackExplicit(track),
            });
          } : undefined}
          onGoToArtist={(targetArtist?: Artist) => {
            if (targetArtist) {
              handleOpenArtist(targetArtist, true, "popular", contextMenu.track);
              return;
            }
            if (contextMenu.track.artistId || contextMenu.track.artist) {
              handleOpenArtist({
                id: contextMenu.track.artistId || `artist-${encodeURIComponent(contextMenu.track.artist)}`,
                name: contextMenu.track.artist,
                thumbnail: ""
              }, true, "popular", contextMenu.track);
            }
          }}
          onGoToAlbum={contextMenu.track.albumId || contextMenu.track.albumName ? () => {
            handleOpenAlbum({
              id: contextMenu.track.albumId || "",
              title: contextMenu.track.albumName || contextMenu.track.title || "Album",
              artist: contextMenu.track.artist,
              thumbnail: contextMenu.track.thumbnail
            });
          } : undefined}
          onShare={!contextMenu.track.id.startsWith("local-") ? () => {
            const track = contextMenu.track;
            const saved = StorageService.getItemSync<{ id: string; seconds: number }>("ibrastream_resume_position");
            const seconds = currentTrack?.id === track.id && saved?.id === track.id ? saved.seconds : undefined;
            void copyLink(buildShareLink("track", track.id, track.title, track.artist, seconds));
          } : undefined}

          onAddToPlaylist={(playlistId) => handleAddTrackToPlaylist(playlistId, contextMenu.track)}
          onRemoveFromPlaylist={
            contextMenu.currentPlaylistId && playlists.some(p => p.id === contextMenu.currentPlaylistId)
              ? () => handleRemoveTrackFromPlaylist(contextMenu.currentPlaylistId!, contextMenu.track.id)
              : undefined
          }
          onStartRadio={() => void startRadio(contextMenu.track)}
          onStartArtistRadio={() => void startRadio(contextMenu.track, true)}
          onDiscoveryAction={privateSession ? undefined : action => {
            const track = contextMenu.track;
            if (action === "more") {
              const next = [track, ...radioSeeds.filter(item => item.id !== track.id)].slice(0, 12);
              setRadioSeeds(next);
              StorageService.setItemSync("ibrastream_radio_seeds", next);
            } else if (action === "hide") {
              const next = [...new Set([...hiddenTracks, track.id])];
              setHiddenTracks(next);
              StorageService.setItemSync("ibrastream_hidden_recommendations", next);
            } else {
              const next = [...new Set([...mutedArtists, normalizeSearch(track.artist)])];
              setMutedArtists(next);
              StorageService.setItemSync("ibrastream_muted_recommendations", next);
            }
            showToast("Preferencia de descubrimiento guardada.", "success");
          }}
          onSelect={!contextMenu.anchor || contextMenu.anchor.closest("[data-track-row]")
            ? () => handleSelectTrack(contextMenu.track.id) : undefined}
        />
      )}
      {sourceMenuTrack && !roomId && <WrongSongMenu track={sourceMenuTrack} onClose={() => setSourceMenuTrack(null)} />}
      {deleteAccount && userId && <Modal title="Eliminar mi cuenta" onClose={() => setDeleteAccount(false)}>
        <p className="mb-3 text-sm text-gray-300">Se borrarán la cuenta, la biblioteca sincronizada, tus copias compartidas y la clasificación. Escribe ELIMINAR para confirmarlo.</p>
        <input aria-label="Escribe ELIMINAR" value={deleteWord} onChange={event => setDeleteWord(event.target.value)} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm" />
        <button className="ml-2 rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={deleteWord !== "ELIMINAR"} onClick={async () => {
          setDeleteWord("");
          const result = await supabase.rpc("ibramusic_delete_account");
          if (result.error) { showToast("No se pudo eliminar la cuenta.", "error"); return; }
          await supabase.auth.signOut({ scope: "local" });
          clearGuestData();
          clearListeningHistory();
          setDeleteAccount(false);
          showToast("Cuenta eliminada.", "info");
        }}>Eliminar de forma permanente</button>
      </Modal>}
      {manageShare && userId && <React.Suspense fallback={<LoadingSkeleton layout="text" count={3} className="fixed inset-x-8 top-1/4 z-[100] mx-auto max-w-sm rounded-3xl bg-brand-darkBg p-5" label="Cargando permisos…" />}><SharePlaylistManager playlist={manageShare} account={userId} onClose={() => setManageShare(null)} /></React.Suspense>}
      {isWrappedModalOpen && <React.Suspense fallback={<LoadingSkeleton layout="stats" count={2} className="fixed inset-x-8 top-1/4 z-[100] mx-auto max-w-lg rounded-3xl bg-brand-darkBg p-5" label="Cargando Wrapped…" />}><WrappedModal
        isOpen={isWrappedModalOpen}
        onClose={() => setIsWrappedModalOpen(false)}
        entries={listeningEntries}
        onTrackContextMenu={handleTrackContextMenu}
        onSavePlaylist={(name, tracks) => {
          savePlaylists([...playlists, { id: crypto.randomUUID(), name, tracks }]);
          showToast("Lista de Wrapped guardada en tu biblioteca.", "success");
        }}
      /></React.Suspense>}
    </div>
  );
};

function DesktopListeningHome({ entries, recent, resume, onTrack, onResume, onList, onArtist, onTrackContextMenu }: {
  entries: import("./services/listeningHistory").ListeningEntry[]; recent: RecentItem[]; resume: SavedPlaybackQueue | null;
  onTrackContextMenu: (event: React.MouseEvent, track: Track) => void;
  onTrack: (track: Track) => void; onResume: () => void; onList: (item: RecentItem) => void; onArtist: (artist: Artist) => void;
}) {
  const { language } = useLanguage();
  const latest = React.useMemo(() => [...new Map(entries.slice(-100).reverse().map(item => [item.track.id, item.track])).values()].slice(0, 4), [entries]);
  const artists = React.useMemo(() => Object.values(statsFor(entries).artists).sort((a, b) => b.seconds - a.seconds).slice(0, 4), [entries]);
  const label = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const tile = "flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs font-medium text-white transition-colors hover:bg-white/5";
  return <div className="desktop-home-history hidden gap-3 lg:grid">
    {resume && <section className="rounded-2xl border border-white/5 p-3"><h3 className="mb-2 text-sm font-semibold">{label("Seguir escuchando", "Continue listening", "Jarraitu entzuten")}</h3><button className={tile} onContextMenu={event => onTrackContextMenu(event, resume.track)} onClick={onResume}><Play className="size-4" /><span className="truncate">{resume.track.title} · {formatQueueTime(resume.seconds)}</span></button></section>}
    {latest.length > 0 && <section className="rounded-2xl border border-white/5 p-3"><h3 className="mb-2 text-sm font-semibold">{label("Escuchado recientemente", "Recently played", "Duela gutxi entzuna")}</h3>{latest.map(track => <button key={track.id} className={tile} onContextMenu={event => onTrackContextMenu(event, track)} onClick={() => onTrack(track)}><img alt="" src={track.thumbnail} loading="lazy" className="size-7 rounded-md object-cover" /><span className="truncate" title={track.title}>{track.title}</span></button>)}</section>}
    {artists.length > 0 && <section className="rounded-2xl border border-white/5 p-3"><h3 className="mb-2 text-sm font-semibold">{label("Tus artistas más escuchados", "Top artists", "Gehien entzundako artistak")}</h3>{artists.map(artist => <button key={artist.name} className={tile} onClick={() => onArtist({ id: "artist-" + encodeURIComponent(artist.name), name: artist.name, thumbnail: artist.thumbnail })}><img alt="" src={artist.thumbnail} loading="lazy" className="size-7 rounded-full object-cover" /><span className="truncate" title={artist.name}>{artist.name}</span></button>)}</section>}
    {recent.length > 0 && <section className="rounded-2xl border border-white/5 p-3"><h3 className="mb-2 text-sm font-semibold">{label("Playlists recientes", "Recent playlists", "Azken zerrendak")}</h3>{recent.slice(0, 4).map(item => <button key={item.id} className={tile} onClick={() => onList(item)}><ListMusic className="size-4" /><span className="truncate" title={item.name}>{item.name}</span></button>)}</section>}
  </div>;
}

interface SavedPlaybackQueue {
  track: Track;
  seconds: number;
  upcoming: Track[];
  manual: Track[];
  playlistId: string | null;
}

const savedQueueKey = "ibrastream_saved_playback_queue";

function QueueSessionActions({ notify, saved, onSave }: {
  notify: (message: string, type: "success" | "error" | "info") => void;
  saved: SavedPlaybackQueue | null;
  onSave: (snapshot: SavedPlaybackQueue) => void;
}) {
  const { currentTrack, queue, currentIndex, playingPlaylistId, restoreQueue, roomId } = useAudio();
  const { currentTime } = useAudioProgress();
  if (roomId || (!currentTrack && !saved)) return null;
  return <ActionMenu label="Guardar o retomar cola" className={playlistHeaderButton} button={<><Clock className="size-3.5" /> Sesión</>}>
    {close => <>
      {currentTrack && <button className={menuAction} onClick={() => {
        const next = queue.slice(currentIndex + 1);
        const snapshot = { track: currentTrack, seconds: currentTime, upcoming: next.filter(track => !track.isUserAdded),
          manual: next.filter(track => track.isUserAdded), playlistId: playingPlaylistId };
        StorageService.setItemSync(savedQueueKey, snapshot);
        onSave(snapshot);
        close();
        notify("Cola guardada para más tarde.", "success");
      }}>{saved ? "Reemplazar cola guardada" : "Guardar cola para más tarde"}</button>}
      {saved && <button className={menuAction} onClick={() => {
        close();
        restoreQueue(saved.track, saved.upcoming, saved.manual, saved.playlistId, saved.seconds);
      }}><Play className="size-4 shrink-0" /><span className="min-w-0">Retomar cola<span className="block truncate text-gray-400">{saved.track.title} · {formatQueueTime(saved.seconds)}</span></span></button>}
    </>}
  </ActionMenu>;
}

function formatQueueTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
}

function PlaybackShareMenu({ track, time, copy }: { track: Track; time: number; copy: (url: URL) => void }) {
  return <ActionMenu label="Compartir canción" button={<Link className="size-4" />}
    className="shrink-0 rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white">
    {close => <>
      <button className={menuAction} onClick={() => { close(); copy(buildShareLink("track", track.id, track.title, track.artist)); }}><Link className="size-4" /> Desde el principio</button>
      <button className={menuAction} onClick={() => { close(); copy(buildShareLink("track", track.id, track.title, track.artist, Math.floor(Math.max(0, time)))); }}><Clock className="size-4" /> Desde {formatQueueTime(time)}</button>
    </>}
  </ActionMenu>;
}

interface MobileMiniPlayerProps {
  copyTrackLink: (url: URL) => void;
  favorites: Track[];
  handleToggleFavorite: (track: Track) => void;
  showMobilePlayer: boolean;
  setShowMobilePlayer: (show: boolean) => void;
}

const MobileMiniPlayer: React.FC<MobileMiniPlayerProps> = React.memo(({
  copyTrackLink,
  favorites,
  handleToggleFavorite,
  showMobilePlayer,
  setShowMobilePlayer
}) => {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    isLoading,
    nextTrack,
    roomId,
    isHost
  } = useAudio();

  const { currentTime, duration } = useAudioProgress();

  if (!currentTrack || showMobilePlayer) return null;

  return (
    <div
      className="md:hidden fixed left-0 right-0 z-40 px-3 pb-2 bottom-20"
      style={{ bottom: 'calc(64px + var(--safe-bottom))' }}
    >
      <div
        onClick={() => setShowMobilePlayer(true)}
        className="flex items-center gap-3 bg-brand-darkBg/90 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2.5 shadow-xl shadow-black/50 cursor-pointer select-none"
      >
        {/* Album thumb */}
        <div className="relative shrink-0">
          <img
            src={currentTrack.thumbnail}
            alt={currentTrack.title}
            className="w-11 h-11 rounded-xl object-cover"
          />
          {isPlaying && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate leading-tight">{currentTrack.title}</p>
          <p className="text-xs text-gray-500 truncate mt-0.5 leading-tight">{currentTrack.artist}</p>
          {/* Mini progress bar */}
          <div className="h-0.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
            <div
              className="h-full bg-brand-accent rounded-full transition-all"
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : "0%" }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
          {!currentTrack.id.startsWith("local-") && <PlaybackShareMenu track={currentTrack} time={currentTime} copy={copyTrackLink} />}
          <button
            onClick={() => handleToggleFavorite(currentTrack)}
            className={`p-2 ${favorites.some(f => f.id === currentTrack.id) ? "text-red-500" : "text-gray-500"}`}
          >
            <Heart className="w-4.5 h-4.5" fill={favorites.some(f => f.id === currentTrack.id) ? "currentColor" : "none"} />
          </button>
          <button
            onClick={togglePlay}
            disabled={isLoading || (roomId !== null && !isHost)}
            className="aura-play-button w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4.5 h-4.5 fill-current" />
            ) : (
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={nextTrack}
            disabled={roomId !== null && !isHost}
            className="p-2 text-gray-400 active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <SkipForward className="w-4.5 h-4.5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
});

interface DesktopPlaybackBarProps {
  onTrackContextMenu: (event: React.MouseEvent, track: Track) => void;
  copyTrackLink: (url: URL) => void;
  favorites: Track[];
  handleToggleFavorite: (track: Track) => void;
  handleOpenAlbum: (album: Album) => void;
  handleOpenArtist: (artist: Artist, seed?: Track) => void;
  showQueueOverlay: boolean;
  setShowQueueOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  playlists: Playlist[];
  onAddToPlaylist: (track: Track, e: React.MouseEvent<HTMLButtonElement>) => void;
}

const DesktopPlaybackBar: React.FC<DesktopPlaybackBarProps> = React.memo(({
  onTrackContextMenu,
  copyTrackLink,
  favorites,
  handleToggleFavorite,
  handleOpenAlbum,
  handleOpenArtist,
  showQueueOverlay,
  setShowQueueOverlay,
  playlists,
  onAddToPlaylist
}) => {
  const { language } = useLanguage();
  const copy = (es: string, en: string, eu: string) => localized(language, es, en, eu);
  const {
    currentTrack,
    isPlaying,
    isLoading,
    volume,
    isMuted,
    isShuffle,
    isRepeat,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    changeVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat,
    seamlessTransitions,
    setSeamlessTransitions,
    roomId,
    isHost
  } = useAudio();

  const { currentTime, duration } = useAudioProgress();

  if (!currentTrack) return null;

  return (
    <footer className="desktop-playback-bar hidden md:flex h-[var(--desktop-playback-height)] border-t items-center justify-between px-6 fixed bottom-0 left-0 right-0 z-40 select-none">
      {/* Left: Track Info */}
      <div className="flex items-center gap-4 w-1/3 min-w-[200px]" onContextMenu={event => onTrackContextMenu(event, currentTrack)}>
        <img
          src={currentTrack.thumbnail}
          alt={currentTrack.title}
          className="w-14 h-14 rounded-lg object-cover shadow-md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4
              onClick={() => {
                if (handleOpenAlbum && currentTrack.albumId) {
                  handleOpenAlbum({ id: currentTrack.albumId, title: currentTrack.albumName || "Album", artist: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                }
              }}
              className="text-sm font-semibold text-white truncate hover:underline cursor-pointer"
              title={currentTrack.title}
            >
              {currentTrack.title}
            </h4>
            <button
              onClick={(e) => onAddToPlaylist(currentTrack, e)}
              className={`shrink-0 hover:bg-white/5 transition-all rounded-full p-0.5 ${
                playlists.some(p => p.tracks.some(t => t.id === currentTrack.id))
                  ? "text-emerald-500"
                  : "text-gray-400 hover:text-white"
              }`}
              title={copy("Añadir a playlist", "Add to playlist", "Gehitu zerrendara")}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </button>
            {!currentTrack.id.startsWith("local-") && <PlaybackShareMenu track={currentTrack} time={currentTime} copy={copyTrackLink} />}
          </div>
          <div className="text-xs text-gray-400 truncate mt-0.5 flex flex-wrap gap-x-1 select-none">
            {(() => {
              const artistList = getArtistsFromTrack(currentTrack);
              return artistList.map((art, i) => (
                <React.Fragment key={art.id || i}>
                  <span
                    onClick={() => {
                      if (handleOpenArtist) {
                        handleOpenArtist({ id: art.id, name: art.name, thumbnail: "" }, currentTrack);
                      }
                    }}
                    className="hover:underline cursor-pointer hover:text-brand-accent transition-colors"
                  >
                    {art.name}
                  </span>
                  {i < artistList.length - 1 && <span>,</span>}
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
        <button
          onClick={() => handleToggleFavorite(currentTrack)}
          aria-label={copy("Favorito", "Favorite", "Gogokoa")}
          aria-pressed={favorites.some(f => f.id === currentTrack.id)}
          className={`p-2 rounded-full hover:bg-white/5 transition-all ${favorites.some(f => f.id === currentTrack.id) ? "text-red-500" : "text-gray-400 hover:text-white"}`}
        >
          <Heart className="w-4.5 h-4.5" fill={favorites.some(f => f.id === currentTrack.id) ? "currentColor" : "none"} />
        </button>
      </div>

      {/* Center: Playback Controls & Slider */}
      <div className="flex flex-col items-center gap-2 w-1/3 max-w-[600px]">
        <div className="flex items-center gap-5">
          <button
            onClick={toggleShuffle}
            disabled={roomId !== null && !isHost}
            className={`p-1.5 transition-all ${isShuffle ? "aura-active-icon text-white" : "text-gray-600 hover:text-white"} disabled:opacity-30 disabled:cursor-not-allowed`}
            title={copy("Aleatorio", "Shuffle", "Ausaz")}
          >
            <Shuffle className="w-4 h-4" />
          </button>
          <button 
            onClick={prevTrack} 
            disabled={roomId !== null && !isHost}
            className="p-1.5 text-gray-400 hover:text-white transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed" 
            title={copy("Anterior", "Previous", "Aurrekoa")}
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>
          <button
            onClick={togglePlay}
            disabled={isLoading || (roomId !== null && !isHost)}
            className="aura-play-button w-10 h-10 rounded-full bg-white text-black transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            title={isPlaying ? copy("Pausar", "Pause", "Pausatu") : copy("Reproducir", "Play", "Erreproduzitu")}
          >
            {isLoading ? (
              <div className="w-4.5 h-4.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4.5 h-4.5 fill-current" />
            ) : (
              <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
            )}
          </button>
          <button 
            onClick={nextTrack} 
            disabled={roomId !== null && !isHost}
            className="p-1.5 text-gray-400 hover:text-white transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed" 
            title={copy("Siguiente", "Next", "Hurrengoa")}
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
          <button
            onClick={toggleRepeat}
            disabled={roomId !== null && !isHost}
            className={`p-1.5 relative transition-all ${isRepeat !== "none" ? "aura-active-icon text-white" : "text-gray-600 hover:text-white"} disabled:opacity-30 disabled:cursor-not-allowed`}
            title={copy("Repetir", "Repeat", "Errepikatu")}
          >
            <Repeat className="w-4 h-4" />
            {isRepeat === "one" && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 text-[7px] font-black bg-white text-black rounded-full flex items-center justify-center">1</span>
            )}
          </button>
        </div>
        <div className="w-full flex items-center gap-3 text-xs text-gray-500 font-medium tabular-nums">
          <span>{Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, "0")}</span>
          <input
            type="range" min={0} max={duration || 100} value={currentTime}
            aria-label={copy("Posición de reproducción", "Playback position", "Erreprodukzio-posizioa")}
            onChange={(e) => seek(parseFloat(e.target.value))}
            disabled={roomId !== null && !isHost}
            className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer playback-range accent-white focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
          />
          <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, "0")}</span>
        </div>
      </div>

      {/* Right: Queue / Volume */}
      <div className="flex items-center justify-end gap-3 w-1/3 min-w-[200px]">
        <button
          onClick={() => setSeamlessTransitions(!seamlessTransitions)}
          className={`p-2 rounded-full transition-all relative group ${
            seamlessTransitions 
              ? "text-white bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.2)]" 
              : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
          }`}
          aria-pressed={seamlessTransitions}
          title={copy("Transición fluida", "Crossfade", "Trantsizio leuna")}
        >
          <Waves className="w-4.5 h-4.5" />
          {seamlessTransitions && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full animate-pulse ring-2 ring-brand-darkBg" />
          )}
        </button>
        <button
          onClick={() => setShowQueueOverlay(prev => !prev)}
          className={`p-2 rounded-full hover:bg-white/5 transition-all ${showQueueOverlay ? "text-white bg-white/5" : "text-gray-400 hover:text-white"}`}
          title={copy("Cola", "Queue", "Ilara")}
        >
          <ListMusic className="w-4.5 h-4.5" />
        </button>
        {true && (
          <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
            <button aria-label={isMuted ? copy("Activar sonido", "Unmute", "Aktibatu soinua") : copy("Silenciar", "Mute", "Isilarazi")} onClick={toggleMute} className="text-gray-400 hover:text-white transition-all">
              {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
            </button>
            <input
              type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
              aria-label={copy("Volumen", "Volume", "Bolumena")}
              onChange={(e) => changeVolume(parseFloat(e.target.value))}
              className="w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer playback-range accent-white"
            />
          </div>
        )}
      </div>
    </footer>
  );
});

export const App: React.FC = () => {
  return (
    <AudioProvider>
      <MainLayout />
    </AudioProvider>
  );
};

export default App;
