import React, { useState, useEffect } from "react";
import {
  Search, Heart, Sparkles, Play, Pause, Trash2, ListMusic, X, Plus, Home,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Clock,
  ChevronUp, ChevronDown, MoreVertical, Radio, AlertCircle, Settings,
  User, Globe, Lock, Link
} from "lucide-react";
import { AudioProvider, useAudio } from "./context/AudioContext";
import { Capacitor } from "@capacitor/core";

const isAndroid = Capacitor.getPlatform() === "android";
import Sidebar from "./components/Sidebar";
import PlayerPanel from "./components/PlayerPanel";
import TrackCard from "./components/TrackCard";
import TrackContextMenu from "./components/TrackContextMenu";
import { ListenTogether } from "./components/ListenTogether";
import { getHomeRecommendations, getSearchRecommendations } from "./services/recommendationEngine";
import {
  searchTracks, MOCK_LIBRARY,
  searchAlbums, searchArtists,
  getAlbumTracks, getArtistTracks,
  getSpotifyArtistStats, getSpotifyAlbumStats
} from "./services/musicApi";
import type { Track, Album, Artist } from "./services/musicApi";
import AlbumCard from "./components/AlbumCard";
import ArtistCard from "./components/ArtistCard";
import { checkForUpdates, redirectToUpdate } from "./services/updateChecker";
import type { UpdateInfo } from "./services/updateChecker";
import { signUp, signIn, signOut, saveUserData, getUserData } from "./services/authSync";
import { supabase } from "./services/supabaseClient";



interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  coverUrl?: string;
  isPublic?: boolean;
}

interface RecentItem {
  id: string;
  type: "playlist" | "album";
  name: string;
  coverUrl?: string;
  artistName?: string;
  tracks: Track[];
}

interface ThemeSettings {
  theme: "dark" | "bright";
  corners: "rounded" | "soft";
  bgColor: string;
  bgImage: string;
}

const mapColorBetweenThemes = (color: string, fromTheme: "dark" | "bright", toTheme: "dark" | "bright") => {
  if (!color) return "";
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
  
  const fromList = fromTheme === "dark" ? darkPresets : brightPresets;
  const toList = toTheme === "dark" ? darkPresets : brightPresets;
  
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
    let h = 0, s = 0, l = (max + min) / 2;
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
    return { h: h * 360, s: s * 100, l: l * 100 };
  };

  // Convert HSL to Hex
  const hslToHex = (h: number, s: number, l: number) => {
    s /= 100; l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  };

  try {
    const rgb = parseHex(color);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    if (toTheme === "dark") {
      // Make it a dark color: set Lightness between 5% and 15%
      const newL = Math.max(5, Math.min(15, hsl.l * 0.15));
      return hslToHex(hsl.h, Math.max(30, hsl.s), newL);
    } else {
      // Make it a pastel/bright color: set Lightness between 85% and 95%
      const newL = Math.max(85, Math.min(95, 100 - (100 - hsl.l) * 0.15));
      return hslToHex(hsl.h, Math.max(20, Math.min(60, hsl.s)), newL);
    }
  } catch {
    return toTheme === "dark" ? "#0f0f0f" : "#fafafa";
  }
};

const MainLayout: React.FC = () => {
  const {
    currentTrack, isPlaying, togglePlay, playTrack,
    queue, currentIndex, removeFromQueue, clearQueue, reorderQueue,
    toast, showToast,
    isLoading, currentTime, duration, volume, isMuted,
    isShuffle, isRepeat, nextTrack, prevTrack, seek,
    changeVolume, toggleMute, toggleShuffle, toggleRepeat,
    playNext,
    addToQueue,
    playingPlaylistId,
    roomId,
    isHost,
    updateUserIdentity
  } = useAudio();
  const [activeTab, setActiveTab] = useState<string>(() => localStorage.getItem("ibrastream_active_tab") || "home");

  // Theme settings state
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem("ibrastream_theme_settings");
    const defaults: ThemeSettings = { theme: "dark", corners: "rounded", bgColor: "", bgImage: "" };
    try { return saved ? { ...defaults, ...JSON.parse(saved) } : defaults; } catch { return defaults; }
  });

  useEffect(() => {
    localStorage.setItem("ibrastream_theme_settings", JSON.stringify(themeSettings));
    document.documentElement.setAttribute("data-theme", themeSettings.theme);
    const r = document.documentElement.style;
    if (themeSettings.corners === "rounded") {
      r.setProperty("--app-radius-xl", "28px"); r.setProperty("--app-radius-lg", "20px");
      r.setProperty("--app-radius-md", "12px"); r.setProperty("--app-radius-sm", "8px");
    } else {
      r.setProperty("--app-radius-xl", "8px"); r.setProperty("--app-radius-lg", "6px");
      r.setProperty("--app-radius-md", "4px"); r.setProperty("--app-radius-sm", "2px");
    }
    if (themeSettings.bgImage) {
      r.setProperty("--app-bg-image-val", `url(${themeSettings.bgImage})`);
      r.setProperty("--app-bg-color-val", "transparent");
    } else if (themeSettings.bgColor) {
      r.setProperty("--app-bg-image-val", "none");
      r.setProperty("--app-bg-color-val", themeSettings.bgColor);
    } else {
      r.removeProperty("--app-bg-image-val"); r.removeProperty("--app-bg-color-val");
    }
  }, [themeSettings]);
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem("ibrastream_search_history");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const saveSearchToHistory = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
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

  const [searchType, setSearchType] = useState<"track" | "album" | "artist" | "community">("track");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    track: Track;
    currentPlaylistId?: string | null;
  } | null>(null);

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
  const [searchResults, setSearchResults] = useState<Track[]>(MOCK_LIBRARY);
  const [albumResults, setAlbumResults] = useState<Album[]>([]);
  const [artistResults, setArtistResults] = useState<Artist[]>([]);
  const [communityResults, setCommunityResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentItem[]>(() => {
    const saved = localStorage.getItem("ibrastream_recently_played");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const addToRecentlyPlayed = (item: RecentItem) => {
    if (!user) return;
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(r => !(r.id === item.id && r.type === item.type));
      const updated = [item, ...filtered].slice(0, 12);
      localStorage.setItem("ibrastream_recently_played", JSON.stringify(updated));
      return updated;
    });
  };


  const [favorites, setFavorites] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_favorites");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [showMobilePlayer, setShowMobilePlayer] = useState<boolean>(false);

  // Detail overlays state
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isLoadingAlbum, setIsLoadingAlbum] = useState<boolean>(false);

  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [previousArtist, setPreviousArtist] = useState<Artist | null>(null);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [isLoadingArtist, setIsLoadingArtist] = useState<boolean>(false);
  const [artistTab, setArtistTab] = useState<"popular" | "albums" | "about">("popular");
  const [artistAlbums, setArtistAlbums] = useState<Album[]>([]);
  const [isLoadingArtistAlbums, setIsLoadingArtistAlbums] = useState<boolean>(false);
  const [visibleArtistTracksCount, setVisibleArtistTracksCount] = useState<number>(8);

  const [showQueueOverlay, setShowQueueOverlay] = useState<boolean>(false);
  const [showListenTogetherOverlay, setShowListenTogetherOverlay] = useState<boolean>(false);
  const [showListenTogetherDropdown, setShowListenTogetherDropdown] = useState<boolean>(false);
  const listenTogetherDropdownRef = React.useRef<HTMLDivElement>(null);
  const [showAccountDropdown, setShowAccountDropdown] = useState<boolean>(false);
  const accountDropdownRef = React.useRef<HTMLDivElement>(null);
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
      localStorage.setItem("ibrastream_username", metaUsername);
      localStorage.setItem("ibrastream_pfp", metaPfp);
    } else {
      setUsername("Guest");
      setPfp("");
    }
  }, [user]);

  const handleUpdatePfp = async (base64Data: string) => {
    setPfp(base64Data);
    localStorage.setItem("ibrastream_pfp", base64Data);
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
    } catch {
      return [];
    }
  });
  const [showPlaylistCreateModal, setShowPlaylistCreateModal] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState<string>("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);
  const [saveQueueMode, setSaveQueueMode] = useState<boolean>(false);

  // Multi-select state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [showBulkPlaylistPicker, setShowBulkPlaylistPicker] = useState<boolean>(false);
  const isSelecting = selectedTrackIds.size > 0;

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
    const handleClickOutside = (event: MouseEvent) => {
      if (
        listenTogetherDropdownRef.current &&
        !listenTogetherDropdownRef.current.contains(event.target as Node)
      ) {
        setShowListenTogetherDropdown(false);
      }
      if (
        accountDropdownRef.current &&
        !accountDropdownRef.current.contains(event.target as Node)
      ) {
        setShowAccountDropdown(false);
      }
      // Close bulk playlist picker if click is outside the toolbar
      const toolbar = document.getElementById("bulk-action-toolbar");
      if (toolbar && !toolbar.contains(event.target as Node)) {
        setShowBulkPlaylistPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
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
  const [showSpotifyImportModal, setShowSpotifyImportModal] = useState<boolean>(false);
  const [spotifyLink, setSpotifyLink] = useState<string>("");
  const [isImportingSpotify, setIsImportingSpotify] = useState<boolean>(false);
  const [spotifyToken, setSpotifyTokenState] = useState<string | null>(() => localStorage.getItem("ibrastream_spotify_token"));
  const [spotifyClientId, setSpotifyClientId] = useState<string>(() => localStorage.getItem("ibrastream_spotify_client_id") || "4af2775b763e4e2e80bd63dcf5ea3c23");
  const [importTab, setImportTab] = useState<"spotify" | "m3u">("spotify");
  const [importFileError, setImportFileError] = useState<string | null>(null);
  const [subSearchQuery, setSubSearchQuery] = useState<string>("");
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

  // Hero Banner State
  const [heroTitle, setHeroTitle] = useState<string>("Let The Music");
  const [heroSubtitle, setHeroSubtitle] = useState<string>("Take You Away");
  const [heroDescription, setHeroDescription] = useState<string>("IbraSexyStream Music Player Free Gay Pro Max.");
  const [heroBgGradient, setHeroBgGradient] = useState<string>("from-brand-accent/20 via-pink-500/10 to-transparent");
  const [heroTextColor, setHeroTextColor] = useState<string>("text-white");

  const fetchFeaturedContent = async () => {
    try {
      const { data, error } = await supabase.from("featured_content").select("*");
      if (error) throw error;
      if (data) {
        const songsEntry = data.find((item: any) => item.type === "songs");
        setFeaturedSongs(songsEntry ? songsEntry.tracks : []);
        setFeaturedPlaylists(data.filter((item: any) => item.type === "playlist"));

        const heroEntry = data.find((item: any) => item.type === "hero_banner");
        if (heroEntry) {
          setHeroTitle(heroEntry.name || "Let The Music");
          setHeroSubtitle(heroEntry.pfp || "Take You Away");
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
    }
  };

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
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearGuestData = () => {
    // Reset all local user states
    setPlaylists([]);
    setFavorites([]);
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
      "ibrastream_theme_settings",
      "ibrastream_playing_playlist_id",
      "ibrastream_queue",
      "ibrastream_original_queue",
      "ibrastream_current_index",
      "ibrastream_current_track",
      "ibrastream_guest_tracks_played"
    ];
    keysToClear.forEach(key => localStorage.removeItem(key));
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
  }, [showSpotifyImportModal, importTab]);

  // Reset sub-search filter and sorting when switching tabs, playlists, albums, or artists
  useEffect(() => {
    setSubSearchQuery("");
    setSortField(null);
    setSortDirection("asc");
  }, [activeTab, selectedPlaylist, selectedAlbum, selectedArtist]);

  // Recommendation states
  const [homeRecommendations, setHomeRecommendations] = useState<Track[]>(() => {
    const saved = localStorage.getItem("ibrastream_home_recommendations");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
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
    setPlaylists(updated);
    localStorage.setItem("ibrastream_playlists", JSON.stringify(updated));
  };

  const handleCreatePlaylist = (name: string) => {
    if (!user) {
      showToast("Please login to create playlists", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    if (!name.trim()) return;
    const newPlaylist: Playlist = {
      id: String(Date.now()),
      name: name.trim(),
      tracks: saveQueueMode ? [...queue] : []
    };
    const updated = [...playlists, newPlaylist];
    savePlaylists(updated);
    setNewPlaylistName("");
    setShowPlaylistCreateModal(false);
    setSaveQueueMode(false);
    showToast(`Created playlist "${newPlaylist.name}"`, "success");
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

      const newPlaylist: Playlist = {
        id: String(Date.now()),
        name: name,
        tracks: tracks
      };

      const updated = [...playlists, newPlaylist];
      savePlaylists(updated);
      setSpotifyLink("");
      setShowSpotifyImportModal(false);
      showToast(`Imported "${name}" successfully! (${tracks.length} songs)`, "success");
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
    try {
      const { importM3UPlaylist } = await import("./services/spotifyImporter");
      const defaultName = fileName.replace(/\.[^/.]+$/, ""); // Strip file extension
      const { name, tracks } = await importM3UPlaylist(defaultName, content);

      if (!tracks || tracks.length === 0) {
        throw new Error("No tracks could be parsed. Make sure the file format is valid (e.g. M3U, CSV, JSON).");
      }

      const newPlaylist: Playlist = {
        id: String(Date.now()),
        name: name,
        tracks: tracks
      };

      const updated = [...playlists, newPlaylist];
      savePlaylists(updated);
      setShowSpotifyImportModal(false);
      showToast(`Imported "${name}" successfully! (${tracks.length} songs)`, "success");
    } catch (err: any) {
      console.error(err);
      setImportFileError(err.message || "Failed to parse the file format.");
    } finally {
      setIsImportingSpotify(false);
    }
  };

  const handleDeletePlaylist = (id: string) => {
    const updated = playlists.filter(p => p.id !== id);
    savePlaylists(updated);
    if (selectedPlaylist?.id === id) {
      setSelectedPlaylist(null);
    }
    showToast("Deleted playlist", "info");
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
    showToast("Removed track from playlist", "info");
  };

  // Bulk action handlers
  const handleBulkAddToFavorites = (tracks: Track[]) => {
    const toAdd = tracks.filter(t => !favorites.some(f => f.id === t.id));
    if (toAdd.length === 0) {
      showToast("All selected tracks are already in favorites", "info");
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
        showToast("All selected tracks are already in this playlist", "info");
        return p;
      }
      showToast(`Added ${newTracks.length} track${newTracks.length > 1 ? "s" : ""} to "${p.name}"`, "success");
      return { ...p, tracks: [...p.tracks, ...newTracks] };
    });
    savePlaylists(updated);
    clearSelection();
    setShowBulkPlaylistPicker(false);
  };

  const handleBulkRemoveFromPlaylist = (playlistId: string, trackIds: string[]) => {
    const idSet = new Set(trackIds);
    const updated = playlists.map(p => {
      if (p.id !== playlistId) return p;
      return { ...p, tracks: p.tracks.filter(t => !idSet.has(t.id)) };
    });
    savePlaylists(updated);
    const updatedSel = updated.find(p => p.id === playlistId) || null;
    setSelectedPlaylist(updatedSel);
    showToast(`Removed ${trackIds.length} track${trackIds.length > 1 ? "s" : ""} from playlist`, "info");
    clearSelection();
  };

  // Fetch home recommendations only once on mount
  useEffect(() => {
    const loadHomeRecs = async () => {
      try {
        const savedRecent = localStorage.getItem("ibrastream_recently_played");
        const recent: Track[] = savedRecent ? JSON.parse(savedRecent) : [];
        
        // Grab current favorites list from localStorage for mount-time recommendation seeding
        const savedFavs = localStorage.getItem("ibrastream_favorites");
        const favs: Track[] = savedFavs ? JSON.parse(savedFavs) : [];

        const [recs, trending] = await Promise.all([
          getHomeRecommendations(favs, recent, null),
          import("./services/recommendationEngine").then(m => m.getTrendingRecommendations(favs, recent))
        ]);

        setHomeRecommendations(recs);
        setTrendingTracks(trending);
        localStorage.setItem("ibrastream_home_recommendations", JSON.stringify(recs));
      } catch (err) {
        console.error("Failed to load home recommendations", err);
      }
    };
    loadHomeRecs();
  }, []);



  // Run initial search
  useEffect(() => {
    handleSearch("");
  }, []);

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates().then((info) => {
      if (info && info.hasUpdate) {
        setUpdateInfo(info);
        setShowUpdateModal(true);
      }
    });
    fetchFeaturedContent();
  }, []);

  // Check for shared track ID in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get("track");
    if (trackId) {
      import("./services/musicApi").then(({ resolveTidalTrackById }) => {
        showToast("Loading shared track...", "info");
        resolveTidalTrackById(trackId).then((track) => {
          if (track) {
            playTrack(track);
            // Clear URL param without reloading the page
            window.history.replaceState(null, "", window.location.pathname + window.location.hash);
            showToast(`Playing shared song: "${track.title}"`, "success");
          } else {
            showToast("Failed to load shared track.", "error");
          }
        });
      });
    }
  }, []);


  // Listen to auth state changes and get current session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) {
        clearGuestData();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT" || !session) {
        clearGuestData();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Close account dropdown when user logs out
  useEffect(() => {
    if (!user) {
      setShowAccountDropdown(false);
    }
  }, [user]);

  // Load cloud data and merge on login
  useEffect(() => {
    if (!user) return;

    getUserData().then((cloudData) => {
      if (cloudData) {
        if (cloudData.favorites) {
          setFavorites(cloudData.favorites);
          localStorage.setItem("ibrastream_favorites", JSON.stringify(cloudData.favorites));
        }
        if (cloudData.playlists) {
          setPlaylists(cloudData.playlists);
          localStorage.setItem("ibrastream_playlists", JSON.stringify(cloudData.playlists));
        }
        if (cloudData.followedArtists) {
          setFollowedArtists(cloudData.followedArtists);
          localStorage.setItem("ibrastream_followed_artists", JSON.stringify(cloudData.followedArtists));
        }
        if (cloudData.themeSettings) {
          setThemeSettings(cloudData.themeSettings);
          localStorage.setItem("ibrastream_theme_settings", JSON.stringify(cloudData.themeSettings));
        }
        showToast("Settings synchronized from cloud!", "success");
      } else {
        // Cloud is empty, push local data to cloud
        const localData = {
          favorites,
          playlists,
          followedArtists,
          themeSettings
        };
        saveUserData(localData).catch(err => {
          console.error("Failed to push initial local state to cloud:", err);
        });
      }
    }).catch((err) => {
      console.error("Failed to fetch cloud sync data on login:", err);
    });
  }, [user]);

  // Debounced cloud sync on settings change
  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      const syncData = {
        favorites,
        playlists,
        followedArtists,
        themeSettings
      };
      saveUserData(syncData).catch((err) => {
        console.error("Auto-sync failed:", err);
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [favorites, playlists, followedArtists, themeSettings, user]);

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
              tracks: lp.tracks,
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
    const sharedPlaylistId = params.get("playlistId");
    if (sharedPlaylistId) {
      const fetchSharedPlaylist = async () => {
        try {
          const { data, error } = await supabase
            .from("public_playlists")
            .select("*")
            .eq("playlist_id", sharedPlaylistId)
            .single();

          if (error) {
            showToast("Failed to load shared playlist", "error");
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
        }
      };

      fetchSharedPlaylist();
    }
  }, []);

  // Update recently played when playlist is viewed
  useEffect(() => {
    if (selectedPlaylist) {
      addToRecentlyPlayed({
        id: selectedPlaylist.id,
        type: "playlist",
        name: selectedPlaylist.name,
        coverUrl: selectedPlaylist.coverUrl || (selectedPlaylist.tracks?.[0]?.thumbnail),
        tracks: selectedPlaylist.tracks || []
      });
    }
  }, [selectedPlaylist]);

  // Update recently played when album is viewed
  useEffect(() => {
    if (selectedAlbum) {
      addToRecentlyPlayed({
        id: selectedAlbum.id,
        type: "album",
        name: selectedAlbum.title,
        coverUrl: selectedAlbum.thumbnail,
        artistName: selectedAlbum.artist,
        tracks: albumTracks || []
      });
    }
  }, [selectedAlbum, albumTracks]);



  const handleSignOut = async () => {
    try {
      await signOut();
      clearGuestData();
      showToast("Signed out successfully!", "info");
    } catch (err: any) {
      showToast(`Sign out failed: ${err.message}`, "error");
    }
  };



  const handleToggleFavorite = (track: Track) => {
    if (!user) {
      showToast("Please login to add tracks to favorites", "error");
      window.dispatchEvent(new Event("ibrastream_force_login"));
      return;
    }
    let updated;
    if (favorites.some((t) => t.id === track.id)) {
      updated = favorites.filter((t) => t.id !== track.id);
    } else {
      updated = [...favorites, track];
    }
    setFavorites(updated);
    localStorage.setItem("ibrastream_favorites", JSON.stringify(updated));
  };

  const handleSearch = async (query: string, type: "track" | "album" | "artist" | "community" = searchType) => {
    setIsSearching(true);
    const trimmed = query.trim();
    if (trimmed) {
      saveSearchToHistory(trimmed);
    }
    try {
      if (type === "track") {
        const results = await searchTracks(query);
        setSearchResults(results);
        if (results.length > 0) {
          const recs = await getSearchRecommendations(query, results);
          setSearchRecommendations(recs);
        } else {
          setSearchRecommendations([]);
        }
      } else if (type === "album") {
        const results = await searchAlbums(query);
        const sorted = [...results].sort((a, b) => {
          const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
          const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
          return dateB - dateA;
        });
        setAlbumResults(sorted);
      } else if (type === "artist") {
        const results = await searchArtists(query);
        setArtistResults(results);
      } else if (type === "community") {
        const { data, error } = await supabase
          .from("public_playlists")
          .select("*")
          .ilike("name", `%${query}%`);
        if (error) {
          console.error("Failed to query public playlists:", error);
          setCommunityResults([]);
        } else {
          setCommunityResults(data || []);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenAlbum = async (album: Album) => {
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
      fetchedTracks = await getAlbumTracks(album.id);
      setAlbumTracks(fetchedTracks);
    } catch (e) {
      console.error("Failed to load album tracks", e);
    } finally {
      setIsLoadingAlbum(false);
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

  const handleOpenArtist = async (artist: Artist) => {
    setSelectedArtist(artist);
    setPreviousArtist(null);
    setSelectedAlbum(null);
    setArtistTracks([]);
    setArtistAlbums([]);
    setIsLoadingArtist(true);
    setVisibleArtistTracksCount(8);
    setIsLoadingArtistAlbums(true);
    setArtistTab("popular");

    // Fetch actual artist profile image
    const fetchArtistImage = async () => {
      // 1. Try Spotify first
      const token = localStorage.getItem("ibrastream_spotify_token");
      if (token) {
        try {
          const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (res.ok) {
            const sData = await res.json();
            const spotifyArtist = sData.artists?.items?.[0];
            if (spotifyArtist && spotifyArtist.images && spotifyArtist.images.length > 0) {
              const pfp = spotifyArtist.images[0].url;
              setSelectedArtist(prev => prev && prev.id === artist.id ? { ...prev, thumbnail: pfp } : prev);
              return;
            }
          }
        } catch (err) {
          console.warn("Failed to update artist thumbnail with Spotify image:", err);
        }
      }

      // 2. Fallback to Tidal/Monochrome artist picture
      try {
        const results = await searchArtists(artist.name);
        if (results && results.length > 0) {
          const match = results.find(a => a.name.toLowerCase() === artist.name.toLowerCase()) || results[0];
          if (match && match.thumbnail) {
            setSelectedArtist(prev => prev && prev.id === artist.id ? { ...prev, thumbnail: match.thumbnail } : prev);
          }
        }
      } catch (err) {
        console.warn("Failed to fallback search artist image:", err);
      }
    };

    fetchArtistImage();

    // Fetch tracks
    let fetchedTracks: Track[] = [];
    try {
      fetchedTracks = await getArtistTracks(artist.id);
      setArtistTracks(fetchedTracks);
    } catch (e) {
      console.error("Failed to load artist tracks", e);
    } finally {
      setIsLoadingArtist(false);
    }

    // Fetch Spotify stats from RapidAPI
    getSpotifyArtistStats(artist.name).then((stats) => {
      if (stats) {
        setSelectedArtist(prev => {
          if (prev && prev.id === artist.id) {
            return {
              ...prev,
              description: stats.biography || prev.description,
              monthlyListeners: stats.monthlyListeners
            };
          }
          return prev;
        });

        if (stats.topTracks && stats.topTracks.length > 0 && fetchedTracks.length > 0) {
          const formatStreamCount = (count: number): string => {
            if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
            if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
            if (count >= 1e3) return `${(count / 1e3).toFixed(1)}K`;
            return String(count);
          };

          const updatedTracks = fetchedTracks.map(t => {
            const match = stats.topTracks!.find(tt =>
              tt.name.toLowerCase().includes(t.title.toLowerCase()) ||
              t.title.toLowerCase().includes(tt.name.toLowerCase())
            );
            if (match) {
              return { ...t, plays: formatStreamCount(match.streamCount) };
            }
            return t;
          });

          setArtistTracks(updatedTracks);
        }
      }
    }).catch(err => {
      console.warn("Failed to merge Spotify stats:", err);
    });

    // Fetch albums in parallel using artist name search
    try {
      const albums = await searchAlbums(artist.name);
      // Filter albums to make sure they match the artist
      const filtered = albums.filter(al => al.artist.toLowerCase().includes(artist.name.toLowerCase()));
      const sorted = [...filtered].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateB - dateA;
      });
      setArtistAlbums(sorted);
    } catch (e) {
      console.error("Failed to load artist albums", e);
    } finally {
      setIsLoadingArtistAlbums(false);
    }
  };

  const handleTrackContextMenu = (e: React.MouseEvent, track: Track, currentPlaylistId?: string | null) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      track,
      currentPlaylistId
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTab("search");
    handleSearch(searchQuery);
  };

  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={{
        backgroundColor: themeSettings.theme === "bright" ? "var(--app-bg-color-val, #fafafa)" : "var(--app-bg-color-val, #0f0f0f)",
        backgroundImage: "var(--app-bg-image-val, none)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="flex-1 flex overflow-hidden relative w-full">

        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setSelectedArtist(null);
            setSelectedAlbum(null);
            setPreviousArtist(null);
            setActiveTab(tab);
            setShowMobilePlayer(false);
            clearSelection();
          }}
          playlists={playlists}
          followedArtists={followedArtists}
          onSelectPlaylist={(p) => {
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
          userEmail={user?.email}
        />


        {/* ═══ MOBILE STICKY TOP BAR ═══ */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-brand-darkBg/95 backdrop-blur-md border-b border-white/5">
          {mobileSearchOpen ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <form onSubmit={handleSearchSubmit} className="flex-1">
                <input
                  type="text"
                  autoFocus
                  placeholder="Search songs, artists, albums..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim() === "") {
                      setSearchResults([]);
                      setSearchRecommendations([]);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/7 border border-white/8 text-white text-sm focus:outline-none placeholder:text-gray-500"
                />
              </form>
              <button
                onClick={() => {
                  setMobileSearchOpen(false);
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchRecommendations([]);
                }}
                className="text-gray-400 hover:text-white text-sm font-medium shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-base font-semibold text-white tracking-tight">ibrastream</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMobileSearchOpen(true)}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                >
                  <Search className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => {
                    if (user) {
                      setShowAccountDropdown(true);
                    } else {
                      setAuthIsSignUp(false);
                      setShowAuthModal(true);
                    }
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    user ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20" : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                  title={user ? `Signed in as ${user.email} (Click to sign out)` : "Sign in to sync"}
                >
                  <User className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={() => setShowListenTogetherOverlay(true)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                    roomId ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-white/5 text-gray-400 hover:text-white"
                  }`}
                >
                  <Radio className={`w-4.5 h-4.5 ${roomId ? "animate-pulse" : ""}`} />
                </button>
                <button
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
        <main className="flex-1 overflow-y-auto pt-[60px] px-4 pb-[148px] md:pt-8 md:px-8 md:pb-40 md:ml-64 lg:mr-[380px] transition-all duration-300">

          {/* Desktop-only Top Header Bar */}
          <header className="hidden md:flex items-center justify-between gap-4 mb-8">
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
                  title="Go back"
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
                  title="Go forward"
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
                title="Home"
              >
                <Home className="w-5 h-5" />
              </button>

              {/* Search Input */}
              <div className="flex-1 relative">
                <form onSubmit={handleSearchSubmit}>
                  <Search className="w-4.5 h-4.5 text-gray-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="What do you want to play?"
                    value={searchQuery}
                    onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (e.target.value.trim() === "") {
                      setSearchResults([]);
                      setSearchRecommendations([]);
                    }
                  }}
                    className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 text-white text-sm focus:outline-none transition-all placeholder:text-gray-500"
                  />
                </form>
              </div>
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
                  title="Listen Together"
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
                title="View Queue"
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
                            const newTheme = themeSettings.theme === "dark" ? "bright" : "dark";
                            setThemeSettings(prev => ({
                              ...prev,
                              theme: newTheme,
                              bgColor: mapColorBetweenThemes(prev.bgColor, prev.theme, newTheme)
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
                          <span>Login</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Dynamic Inner Panel View */}
          {selectedArtist ? (
            /* ARTIST PANEL - FULL PAGE SPACE */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-subpage">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedArtist(null)}
                  className="text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5"
                >
                  ← Back
                </button>
              </div>

              <div
                className="p-6 md:p-8 rounded-[32px] flex flex-col justify-end min-h-[220px] border border-white/5 relative overflow-hidden bg-cover bg-center select-none"
                style={{ backgroundImage: `linear-gradient(to bottom, rgba(18,18,18,0.2) 0%, rgba(18,18,18,0.95) 100%), url(${selectedArtist.thumbnail})` }}
              >
                <div className="relative z-10 flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    <span className="w-4 h-4 bg-sky-500 rounded-full flex items-center justify-center text-white text-[8px]">✓</span> Verified Artist
                  </span>
                  <h3 className="text-3xl md:text-5xl font-extrabold text-white leading-tight drop-shadow-md">
                    {selectedArtist.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    {selectedArtist.monthlyListeners !== undefined && (
                      <span className="text-xs text-gray-300 font-semibold drop-shadow">
                        {selectedArtist.monthlyListeners.toLocaleString()} monthly listeners
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleFollowArtist(selectedArtist)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border uppercase tracking-wider active:scale-95 ${followedArtists.some(a => a.id === selectedArtist.id)
                          ? "bg-white/10 border-white/30 text-white hover:bg-red-500/10 hover:border-red-500 hover:text-red-400"
                          : "bg-brand-accent border-transparent text-black hover:bg-brand-accent/90"
                        }`}
                    >
                      {followedArtists.some(a => a.id === selectedArtist.id) ? "Following" : "Follow"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 border-b border-white/5 px-2 py-3 select-none">
                {(["popular", "albums", "about"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setArtistTab(tab)}
                    className={`pb-1.5 border-b-2 text-xs font-bold uppercase tracking-wider transition-all ${artistTab === tab
                        ? "border-brand-accent text-white"
                        : "border-transparent text-gray-400 hover:text-white"
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex-1">
                {artistTab === "popular" && (
                  isLoadingArtist ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                      <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading popular songs...</span>
                    </div>
                  ) : artistTracks.length === 0 ? (
                    <p className="text-center py-12 text-gray-500 text-sm">No tracks found for this artist.</p>
                  ) : (
                    <div className="flex flex-col gap-3 animate-[fadeIn_0.3s_ease]">
                      {artistTracks.slice(0, visibleArtistTracksCount).map((track, idx) => (
                        <TrackCard
                          key={`${track.id}-${idx}`}
                          track={track}
                          variant="row"
                          tracksQueue={artistTracks}
                          onToggleFavorite={handleToggleFavorite}
                          isFavorite={favorites.some((f) => f.id === track.id)}
                          onOpenAlbum={handleOpenAlbum}
                          onOpenArtist={handleOpenArtist}
                          onAddToPlaylist={setTrackToAddToPlaylist}
                          onContextMenu={(e) => handleTrackContextMenu(e, track)}
                        />
                      ))}
                      {artistTracks.length > visibleArtistTracksCount && (
                        <button
                          onClick={() => setVisibleArtistTracksCount(prev => prev + 10)}
                          className="mt-4 py-2.5 px-6 self-center rounded-full bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white transition-all border border-white/5 hover:border-white/10"
                        >
                          Ver más
                        </button>
                      )}
                    </div>
                  )
                )}

                {artistTab === "albums" && (
                  isLoadingArtistAlbums ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                      <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">Loading albums...</span>
                    </div>
                  ) : artistAlbums.length === 0 ? (
                    <p className="text-center py-12 text-gray-500 text-sm">No albums found for this artist.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-[fadeIn_0.3s_ease]">
                      {artistAlbums.map((album) => (
                        <AlbumCard
                          key={album.id}
                          album={album}
                          onClick={handleOpenAlbum}
                        />
                      ))}
                    </div>
                  )
                )}

                {artistTab === "about" && (
                  <div className="flex flex-col gap-4 text-sm text-gray-300 leading-relaxed max-w-xl animate-[fadeIn_0.3s_ease]">
                    <div className="relative overflow-hidden rounded-2xl aspect-video w-full mb-2 bg-cover bg-center" style={{ backgroundImage: `url(${selectedArtist.thumbnail})` }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-brand-darkBg via-black/35 to-transparent" />
                    </div>
                    <h4 className="text-lg font-bold text-white">Biography</h4>
                    <p>
                      {selectedArtist.description ||
                        `Explore popular tracks, albums, and biography details for ${selectedArtist.name} directly on their profile.`
                      }
                    </p>
                    {selectedArtist.monthlyListeners !== undefined && (
                      <div className="grid grid-cols-1 gap-4 mt-4 border-t border-white/5 pt-4">
                        <div>
                          <span className="text-xs text-gray-500 block">Monthly Listeners</span>
                          <span className="text-base font-bold text-white">{selectedArtist.monthlyListeners.toLocaleString()}</span>
                        </div>
                      </div>
                    )}
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

              <div className="p-6 md:p-8 rounded-[32px] bg-gradient-to-br from-brand-accent/10 to-transparent border border-white/5 flex flex-col md:flex-row gap-6 items-center">
                <img src={selectedAlbum.thumbnail} className="w-32 h-32 md:w-40 md:h-40 rounded-2xl object-cover shadow-lg" />
                <div className="flex-1 text-center md:text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Album</span>
                  <h3 className="text-xl md:text-3xl font-extrabold text-white mt-1 leading-tight">{selectedAlbum.title}</h3>
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
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {isLoadingAlbum ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                    <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Loading tracks...</span>
                  </div>
                ) : albumTracks.length === 0 ? (
                  <p className="text-center py-12 text-gray-500 text-sm">No tracks found for this album.</p>
                ) : (
                  albumTracks.map((track, idx) => (
                    <TrackCard
                      key={`${track.id}-${idx}`}
                      track={track}
                      variant="row"
                      tracksQueue={albumTracks}
                      onToggleFavorite={handleToggleFavorite}
                      isFavorite={favorites.some((f) => f.id === track.id)}
                      onOpenAlbum={handleOpenAlbum}
                      onOpenArtist={handleOpenArtist}
                      onAddToPlaylist={setTrackToAddToPlaylist}
                      onContextMenu={(e) => handleTrackContextMenu(e, track)}
                    />
                  ))
                )}
              </div>
            </section>
          ) : activeTab === "playlists" ? (
            /* PLAYLISTS PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-6 h-6 text-brand-accent" /> Playlists
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (!user) {
                        showToast("Please login to import playlists", "error");
                        window.dispatchEvent(new Event("ibrastream_force_login"));
                        return;
                      }
                      setShowSpotifyImportModal(true);
                    }}
                    className="px-4 py-2 rounded-full border border-white/10 hover:border-brand-accent hover:text-white text-xs font-semibold text-gray-300 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Import Spotify Link
                  </button>
                  <button
                    onClick={() => {
                      if (!user) {
                        showToast("Please login to create playlists", "error");
                        window.dispatchEvent(new Event("ibrastream_force_login"));
                        return;
                      }
                      setShowPlaylistCreateModal(true);
                    }}
                    className="px-4 py-2 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all active:scale-95 flex items-center gap-1.5 shadow-md shadow-brand-accent/25"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create Playlist
                  </button>
                </div>
              </div>

              {selectedPlaylist ? (
                /* VIEW SPECIFIC PLAYLIST */
                <div className="flex flex-col gap-6">
                  {/* Playlist Header */}
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setSelectedPlaylist(null)}
                      className="text-xs text-gray-400 hover:text-white transition-all flex items-center gap-1"
                    >
                      ← Back to Playlists
                    </button>
                    <div className="flex items-center gap-2">
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
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            selectedPlaylist.isPublic
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                              : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
                          }`}
                        >
                          {selectedPlaylist.isPublic ? (
                            <>
                              <Globe className="w-3.5 h-3.5" /> Public
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Private
                            </>
                          )}
                        </button>
                      )}
                      {user && selectedPlaylist.isPublic && (
                        <button
                          onClick={() => {
                            const link = `${window.location.origin}${window.location.pathname}?playlistId=${selectedPlaylist.id}`;
                            navigator.clipboard.writeText(link);
                            showToast("Link copied to clipboard!", "success");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-gray-400 hover:text-white transition-all flex items-center gap-1.5"
                        >
                          <Link className="w-3.5 h-3.5" /> Copy Link
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setEditingPlaylistId(selectedPlaylist.id);
                          setEditingPlaylistName(selectedPlaylist.name);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-white/10 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                        className="px-3 py-1.5 rounded-xl border border-red-500/25 hover:border-red-500 text-xs font-semibold text-red-400 hover:text-red-300 transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-brand-accent/10 to-transparent border border-white/5 flex flex-col md:flex-row gap-6 items-center">
                    <div
                      className="w-28 h-28 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center relative shadow-lg overflow-hidden group cursor-pointer"
                      onClick={() => document.getElementById("playlist-cover-upload")?.click()}
                      title="Click to upload custom cover photo"
                    >
                      {selectedPlaylist.coverUrl || (selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && selectedPlaylist.tracks[0].thumbnail) ? (
                        <img src={selectedPlaylist.coverUrl || selectedPlaylist.tracks[0].thumbnail} className="w-full h-full object-cover" alt="Playlist cover" />
                      ) : (
                        <ListMusic className="w-12 h-12 text-brand-accent" />
                      )}
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Plus className="w-6 h-6 text-white mb-1" />
                        <span className="text-[9px] font-bold text-white uppercase tracking-wider">Change Cover</span>
                      </div>
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
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-brand-accent">Playlist</span>
                      {editingPlaylistId === selectedPlaylist.id ? (
                        <div className="flex items-center gap-2 mt-2 max-w-md mx-auto md:mx-0">
                          <input
                            type="text"
                            value={editingPlaylistName}
                            onChange={(e) => setEditingPlaylistName(e.target.value)}
                            className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-accent"
                          />
                          <button
                            onClick={() => handleRenamePlaylist(selectedPlaylist.id, editingPlaylistName)}
                            className="px-3 py-1.5 bg-brand-accent text-black rounded-xl text-xs font-bold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingPlaylistId(null)}
                            className="px-3 py-1.5 border border-white/10 text-gray-400 rounded-xl text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <h3 className="text-xl md:text-3xl font-extrabold text-white mt-1">{selectedPlaylist.name}</h3>
                      )}
                      <p className="text-xs text-gray-400 mt-2">{selectedPlaylist.tracks.length} Songs</p>
                      {selectedPlaylist.tracks.length > 0 && (
                        <div className="flex items-center gap-4 mt-4 justify-center md:justify-start">
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
                                const shuffled = [...filtered].sort(() => Math.random() - 0.5);
                                playTrack(shuffled[0], shuffled, selectedPlaylist.id);
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
                        placeholder="Search inside this playlist..."
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
                      const filtered = selectedPlaylist.tracks.filter(track =>
                        track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                        track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                        (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                            <p className="font-semibold text-gray-400">No results found for "{subSearchQuery}"</p>
                            <p className="text-xs text-gray-600 mt-1">Try checking for typos or searching a different song</p>
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
                                  <span className="hidden sm:inline">Add to playlist</span>
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
                                            const sel = sortedTracks.filter(t => selectedTrackIds.has(t.id));
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
                              {/* Remove from this playlist */}
                              {selectedPlaylist && (
                                <button
                                  onClick={() => {
                                    handleBulkRemoveFromPlaylist(selectedPlaylist.id, Array.from(selectedTrackIds));
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
                            {sortedTracks.map((track, idx) => {
                              const isChecked = selectedTrackIds.has(track.id);
                              return (
                                <div
                                  key={`${track.id}-${idx}`}
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
                                      onOpenAlbum={handleOpenAlbum}
                                      onOpenArtist={handleOpenArtist}
                                      onAddToPlaylist={setTrackToAddToPlaylist}
                                      trackIndex={idx + 1}
                                      onContextMenu={(e) => handleTrackContextMenu(e, track, selectedPlaylist?.id)}
                                      playlistId={selectedPlaylist?.id}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                /* LIST ALL PLAYLISTS */
                <div className="flex flex-col gap-6">
                  {playlists.length > 0 && (
                    <div className="relative max-w-md w-full">
                      <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search playlists..."
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

                  {playlists.length === 0 ? (
                    <div className="text-center py-16 text-gray-500 glass-panel rounded-3xl p-8 border border-dashed border-gray-800">
                      <ListMusic className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                      <p className="font-semibold text-gray-400">Create your first playlist</p>
                      <p className="text-xs text-gray-600 mt-1">Click the button above to start your curation</p>
                    </div>
                  ) : (() => {
                    const filteredPlaylists = playlists.filter(p =>
                      p.name.toLowerCase().includes(subSearchQuery.toLowerCase())
                    );
                    if (filteredPlaylists.length === 0) {
                      return (
                        <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                          <p className="font-semibold text-gray-400">No playlists found for "{subSearchQuery}"</p>
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {filteredPlaylists.map((playlist) => (
                          <div
                            key={playlist.id}
                            onClick={() => setSelectedPlaylist(playlist)}
                            className="group relative flex flex-col items-center gap-3 p-4 rounded-2xl glass-card cursor-pointer select-none transition-all duration-300 hover:bg-white/5 border border-white/5"
                          >
                            <div className="relative w-full aspect-square rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shadow-lg shadow-black/40 overflow-hidden">
                              {playlist.coverUrl || (playlist.tracks && playlist.tracks.length > 0 && playlist.tracks[0].thumbnail) ? (
                                <img src={playlist.coverUrl || playlist.tracks[0].thumbnail} alt={playlist.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                              ) : (
                                <ListMusic className="w-16 h-16 text-brand-accent transition-transform duration-500 group-hover:scale-110" />
                              )}
                            </div>
                            <div className="w-full text-center min-w-0">
                              <h3 className="font-semibold text-sm text-white truncate group-hover:text-brand-accent transition-colors duration-200">
                                {playlist.name}
                              </h3>
                              <p className="text-[10px] text-gray-500 mt-1">{playlist.tracks.length} Songs</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </section>
          ) : activeTab === "search" ? (
            /* SEARCH EXPLORER PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease] animate-mobile-page">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Search className="w-6 h-6 text-brand-accent" /> Search Explorer
                </h2>
                {isSearching && (
                  <div className="flex items-center gap-2 text-xs text-brand-accent">
                    <span className="w-2 h-2 rounded-full bg-brand-accent animate-ping" />
                    Searching...
                  </div>
                )}
              </div>

              {searchQuery.trim() === "" ? (
                searchHistory.length > 0 ? (
                  <div className="bg-white/4 border border-white/5 rounded-3xl p-6 flex flex-col gap-4 animate-[fadeIn_0.3s_ease]">
                    <div className="flex items-center justify-between pl-1">
                      <h3 className="text-sm font-bold text-white tracking-wider uppercase flex items-center gap-2">
                        <Clock className="w-4 h-4 text-brand-accent" /> Recent Searches
                      </h3>
                      <button
                        onClick={clearSearchHistory}
                        className="text-xs text-gray-500 hover:text-white transition-colors cursor-pointer font-medium px-3 py-1 rounded-lg hover:bg-white/5 border border-white/5"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {searchHistory.map((queryText, index) => (
                        <div
                          key={`${queryText}-${index}`}
                          className="flex items-center justify-between group p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5"
                          onClick={() => {
                            setSearchQuery(queryText);
                            handleSearch(queryText);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Clock className="w-4 h-4 text-gray-500 group-hover:text-brand-accent transition-colors" />
                            <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition-colors truncate">
                              {queryText}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeHistoryItem(queryText);
                            }}
                            className="p-1 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all cursor-pointer"
                            title="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-500 bg-white/4 border border-white/5 rounded-3xl p-8 border-dashed border-gray-800">
                    <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="font-semibold text-gray-400">Search for songs, albums, or artists</p>
                    <p className="text-xs text-gray-600 mt-1">Your recent searches will appear here</p>
                  </div>
                )
              ) : (
                <>
                  {/* Filter Tabs */}
                  <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl w-fit self-start">
                    {(["track", "album", "artist", "community"] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setSearchType(type);
                          handleSearch(searchQuery, type);
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all ${searchType === type
                            ? "bg-brand-accent text-white shadow-md shadow-brand-accent/20"
                            : "text-gray-400 hover:text-white"
                          }`}
                      >
                        {type === "community" ? "Community" : type + "s"}
                      </button>
                    ))}
                  </div>

                  {searchType === "track" && (
                    searchResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No tracks found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try entering another keyword</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-3">
                          {searchResults.map((track, idx) => (
                            <TrackCard
                              key={`${track.id}-${idx}`}
                              track={track}
                              variant="row"
                              tracksQueue={searchResults}
                              onToggleFavorite={handleToggleFavorite}
                              isFavorite={favorites.some((f) => f.id === track.id)}
                              onOpenAlbum={handleOpenAlbum}
                              onOpenArtist={handleOpenArtist}
                              onAddToPlaylist={setTrackToAddToPlaylist}
                              onContextMenu={(e) => handleTrackContextMenu(e, track)}
                            />
                          ))}
                        </div>

                        {/* Related search recommendations */}
                        {searchRecommendations.length > 0 && (
                          <div className="mt-4 border-t border-white/5 pt-6 animate-[fadeIn_0.3s_ease]">
                            <h3 className="text-sm font-bold text-gray-400 tracking-wider uppercase mb-3 pl-1">
                              Related to your search
                            </h3>
                            <div className="flex flex-col gap-3">
                              {searchRecommendations.map((track, idx) => (
                                <TrackCard
                                  key={`${track.id}-${idx}`}
                                  track={track}
                                  variant="row"
                                  tracksQueue={searchRecommendations}
                                  onToggleFavorite={handleToggleFavorite}
                                  isFavorite={favorites.some((f) => f.id === track.id)}
                                  onOpenAlbum={handleOpenAlbum}
                                  onOpenArtist={handleOpenArtist}
                                  onAddToPlaylist={setTrackToAddToPlaylist}
                                  onContextMenu={(e) => handleTrackContextMenu(e, track)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {searchType === "album" && (
                    albumResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No albums found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try entering another keyword</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {albumResults.map((album) => (
                          <AlbumCard
                            key={album.id}
                            album={album}
                            onClick={handleOpenAlbum}
                          />
                        ))}
                      </div>
                    )
                  )}

                  {searchType === "artist" && (
                    artistResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No artists found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try entering another keyword</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {artistResults.map((artist) => (
                          <ArtistCard
                            key={artist.id}
                            artist={artist}
                            onClick={handleOpenArtist}
                          />
                        ))}
                      </div>
                    )
                  )}

                  {searchType === "community" && (
                    communityResults.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <p>No community playlists found matching "{searchQuery}"</p>
                        <p className="text-xs text-gray-600 mt-1">Try another search or make a playlist public</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {communityResults.map((p) => (
                          <div
                            key={p.playlist_id}
                            onClick={() => {
                              const sharedPlaylist: Playlist = {
                                id: p.playlist_id,
                                name: p.name,
                                tracks: p.tracks || [],
                                coverUrl: p.cover_url,
                                isPublic: true
                              };
                              setSelectedPlaylist(sharedPlaylist);
                              setActiveTab("playlists");
                            }}
                            className="glass-card rounded-2xl p-4 flex flex-col gap-3 group cursor-pointer"
                          >
                            <div className="aspect-square w-full rounded-xl bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden relative shadow-md">
                              {p.cover_url || (p.tracks && p.tracks.length > 0 && p.tracks[0].thumbnail) ? (
                                <img
                                  src={p.cover_url || p.tracks[0].thumbnail}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300"
                                  alt={p.name}
                                />
                              ) : (
                                <ListMusic className="w-10 h-10 text-brand-accent group-hover:scale-105 transition-all duration-300" />
                              )}
                            </div>
                            <div className="min-w-0 text-left">
                              <h4 className="font-bold text-sm text-white truncate group-hover:text-brand-accent transition-colors">
                                {p.name}
                              </h4>
                              <p className="text-[10px] text-gray-400 truncate mt-0.5">
                                By {p.username || "Anonymous"} • {p.tracks ? p.tracks.length : 0} Songs
                              </p>
                            </div>
                          </div>
                        ))}
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
                    <Heart className="w-6 h-6 text-brand-accent" /> Your Favorites
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
                      title="Play favorites"
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

              {favorites.length === 0 ? (
                <div className="text-center py-16 text-gray-500 glass-panel rounded-3xl p-8 border border-dashed border-gray-800">
                  <Heart className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                  <p className="font-semibold text-gray-400">Your collection is empty</p>
                  <p className="text-xs text-gray-600 mt-1">Click the heart icon on any song to save it here</p>
                </div>
              ) : (() => {
                const filtered = favorites.filter(track =>
                  track.title.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                  track.artist.toLowerCase().includes(subSearchQuery.toLowerCase()) ||
                  (track.albumName && track.albumName.toLowerCase().includes(subSearchQuery.toLowerCase()))
                );
                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-gray-500 rounded-3xl p-8 border border-dashed border-gray-800">
                      <p className="font-semibold text-gray-400">No results found for "{subSearchQuery}"</p>
                      <p className="text-xs text-gray-600 mt-1">Try checking for typos or searching a different song</p>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-3">
                    {filtered.map((track) => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        variant="row"
                        tracksQueue={filtered}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={true}
                        onOpenAlbum={handleOpenAlbum}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={setTrackToAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                        playlistId="favorites"
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
          ) : activeTab === "admin" && user?.email === "ibradramee123@gmail.com" ? (
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
                        <div key={track.id} className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded-lg text-xs">
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
                  {featuredSongs.length === 0 ? (
                    <p className="text-[11px] text-gray-600 italic">No featured songs yet.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {featuredSongs.map((track, index) => (
                        <div key={track.id + "-" + index} className="flex items-center justify-between p-2 bg-white/2 rounded-xl text-xs border border-white/5">
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
                  {featuredPlaylists.length === 0 ? (
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
                      placeholder="e.g., Let The Music"
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

                  {/* Gradient Presets */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">Select Background Gradient Preset</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {[
                        { name: "Default Glow", class: "from-brand-accent/20 via-pink-500/10 to-transparent" },
                        { name: "Sunset Sparkle", class: "from-orange-500/20 via-rose-500/15 to-transparent" },
                        { name: "Cyberpunk Violet", class: "from-purple-600/20 via-fuchsia-500/15 to-transparent" },
                        { name: "Emerald Aurora", class: "from-emerald-500/20 via-teal-500/10 to-transparent" },
                        { name: "Ocean Breeze", class: "from-blue-600/20 via-cyan-500/15 to-transparent" }
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setHeroBgGradient(preset.class)}
                          className={`p-2 rounded-xl text-[10px] font-semibold transition-all border ${
                            heroBgGradient === preset.class ? "bg-brand-accent text-black border-brand-accent" : "bg-white/5 text-white border-white/5 hover:bg-white/10"
                          }`}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Custom Gradient Tailwind Classes</label>
                    <input 
                      type="text" 
                      value={heroBgGradient}
                      onChange={(e) => setHeroBgGradient(e.target.value)}
                      placeholder="e.g., from-brand-accent/20 via-pink-500/10 to-transparent"
                      className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-accent transition-colors"
                    />
                  </div>

                  {/* Text Color Presets */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-gray-400">Title & Subtitle Color Preset</label>
                    <div className="flex gap-2">
                      {[
                        { name: "Pure White", class: "text-white" },
                        { name: "Brand Accent", class: "text-brand-accent" },
                        { name: "Muted Silver", class: "text-gray-300" },
                        { name: "Rose Pink", class: "text-rose-400" }
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
                  {(["dark", "bright"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setThemeSettings({
                        ...themeSettings,
                        theme: t,
                        bgColor: mapColorBetweenThemes(themeSettings.bgColor, themeSettings.theme, t)
                      })}
                      className={`flex-1 py-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        themeSettings.theme === t
                          ? "bg-white/10 border-white/30 text-white"
                          : "bg-white/3 border-white/5 text-gray-500 hover:text-white hover:bg-white/8"
                      }`}
                    >
                      {t === "dark" ? "Dark" : "Bright"} Mode
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
              </div>
            </section>
          ) : (
            /* MAIN HOME VIEW */
            <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease] animate-mobile-page">

              {/* Customizable Hero Card */}
              <div className={`relative overflow-hidden rounded-[32px] bg-gradient-to-br ${heroBgGradient} p-6 md:p-10 border border-white/5 flex flex-col justify-between min-h-[220px]`}>
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="max-w-md relative z-10 flex flex-col gap-3">
                  <span className={`inline-block font-semibold bg-gradient-to-r from-gray-400 via-white to-gray-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-[shine_4s_linear_infinite] text-3xl md:text-4xl font-extrabold tracking-wide ${heroTextColor}`} style={{ animationDuration: "4s" }}>{heroTitle}</span>
                  <span className={`inline-flex flex-wrap text-3xl md:text-4xl font-extrabold tracking-wide ${heroTextColor}`}>
                    {heroSubtitle.split("").map((char, index) => (
                      <span
                        key={index}
                        className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]"
                        style={{
                          animationDelay: `${index * 40}ms`,
                          opacity: 1,
                          whiteSpace: char === " " ? "pre" : "normal"
                        }}
                      >
                        {char}
                      </span>
                    ))}
                  </span>
                  <p className="text-xs md:text-sm text-gray-400 mt-2 leading-relaxed">{heroDescription}</p>
                </div>
              </div>

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
                    {featuredSongs.map((track, idx) => (
                      <TrackCard
                        key={`feat-song-${track.id}-${idx}`}
                        track={track}
                        variant="square"
                        tracksQueue={featuredSongs}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        onOpenAlbum={handleOpenAlbum}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={setTrackToAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Section / 2x4 Quick Access Grid */}
              {homeRecommendations.length > 0 && (
                <div className="animate-[fadeIn_0.3s_ease]">
                  <h2 className="text-2xl font-bold text-white tracking-wide mb-4 pl-1">
                    Good Afternoon
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 8 quick-access cards */}
                    {homeRecommendations.slice(0, 8).map((track) => (
                      <div
                        key={`quick-${track.id}`}
                        onClick={() => playTrack(track, homeRecommendations)}
                        className="group relative flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-lg overflow-hidden cursor-pointer transition-all border border-white/5 select-none pr-12"
                      >
                        <img src={track.thumbnail} className="w-20 h-20 object-cover shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-sm text-white truncate block group-hover:text-brand-accent transition-colors">
                            {track.title}
                          </span>
                          <span className="text-xs text-gray-400 truncate block mt-0.5">
                            {track.artist}
                          </span>
                        </div>
                        {/* Tiny hover play button on the right */}
                        <button
                          className="absolute right-4 p-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black shadow-lg shadow-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center scale-95 hover:scale-105 active:scale-95"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discover Weekly */}
              {homeRecommendations.length > 6 && (
                <div className="animate-[fadeIn_0.4s_ease] mt-4">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-accent" /> Discover Weekly
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {homeRecommendations.slice(6, 12).map((track, idx) => (
                      <TrackCard
                        key={`discover-${track.id}-${idx}`}
                        track={track}
                        variant="square"
                        tracksQueue={homeRecommendations}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        onOpenAlbum={handleOpenAlbum}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={setTrackToAddToPlaylist}
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

              {/* Trending Hits */}
              {trendingTracks.length > 0 && (
                <div className="animate-[fadeIn_0.4s_ease] mt-4">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500 animate-pulse" /> Trending Now
                  </h2>
                  <div className="flex flex-col gap-3">
                    {trendingTracks.slice(0, 6).map((track, idx) => (
                      <TrackCard
                        key={`trending-${track.id}-${idx}`}
                        track={track}
                        variant="row"
                        tracksQueue={trendingTracks}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        onOpenAlbum={handleOpenAlbum}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={setTrackToAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Curated for You */}
              {homeRecommendations.length > 0 && (
                <div className="animate-[fadeIn_0.4s_ease] mt-4">
                  <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand-accent animate-pulse" /> Curated for You
                  </h2>
                  <div className="flex flex-col gap-3">
                    {homeRecommendations.slice(0, 6).map((track, idx) => (
                      <TrackCard
                        key={`${track.id}-${idx}`}
                        track={track}
                        variant="row"
                        tracksQueue={homeRecommendations}
                        onToggleFavorite={handleToggleFavorite}
                        isFavorite={favorites.some((f) => f.id === track.id)}
                        onOpenAlbum={handleOpenAlbum}
                        onOpenArtist={handleOpenArtist}
                        onAddToPlaylist={setTrackToAddToPlaylist}
                        onContextMenu={(e) => handleTrackContextMenu(e, track)}
                      />
                    ))}
                  </div>
                </div>
              )}



            </section>
          )}

        </main>

        {/* PC Right Player Sidebar panel */}
        <aside className="hidden lg:block fixed right-0 top-0 w-[380px] h-[calc(100vh-96px)] z-10 overflow-y-auto border-l border-white/5 bg-brand-darkBg/95 backdrop-blur-md">
          {showQueueOverlay ? (
            <div className="h-full flex flex-col p-6 select-none">
              {/* Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <ListMusic className="w-5 h-5 text-brand-accent animate-pulse" />
                  <span className="text-xs uppercase tracking-widest font-bold text-gray-200">
                    Play Queue
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {queue.length > 0 && (
                    <>
                      {canSaveQueueAsPlaylist && (
                        <button
                          onClick={() => {
                            setSaveQueueMode(true);
                            setNewPlaylistName("Cola de reproducción");
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
                    <p className="font-semibold text-gray-400 text-sm">Queue is empty</p>
                    <p className="text-xs text-gray-600 mt-1">Play songs to build a queue</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {currentTrack && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold uppercase text-brand-accent tracking-wider pl-1">
                          Now Playing
                        </span>
                        <div className="p-3 bg-brand-accent/10 border border-brand-accent/20 rounded-2xl flex items-center gap-3">
                          <img src={currentTrack.thumbnail} className="w-10 h-10 rounded-lg object-cover" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-xs text-white truncate">{currentTrack.title}</h4>
                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{currentTrack.artist}</p>
                          </div>
                          <span className="text-[10px] text-brand-accent font-bold animate-pulse">Playing</span>
                        </div>
                      </div>
                    )}

                    <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider pl-1 mt-2">
                      Next Up ({queue.length})
                    </span>
                    <div className="flex flex-col gap-2">
                      {queue.map((track, idx) => {
                        const isPlayingNow = idx === currentIndex;
                        const isDragged = idx === draggedIndex;
                        return (
                          <div
                            key={`${track.id}-${idx}`}
                            draggable={true}
                            onDragStart={(e) => {
                              setDraggedIndex(idx);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDragEnter={(e) => {
                              e.preventDefault();
                              if (draggedIndex !== null && draggedIndex !== idx) {
                                reorderQueue(draggedIndex, idx);
                                setDraggedIndex(idx);
                              }
                            }}
                            onDragEnd={() => {
                              setDraggedIndex(null);
                            }}
                            className={`group flex items-center gap-3 p-2 rounded-xl transition-all border cursor-grab active:cursor-grabbing ${isPlayingNow
                                ? "bg-white/5 border-white/10"
                                : isDragged
                                  ? "bg-brand-accent/20 border-brand-accent/30 scale-95 opacity-50"
                                  : "hover:bg-white/5 border-transparent hover:border-white/5"
                              }`}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              handleTrackContextMenu(e, track);
                            }}
                            onClick={() => playTrack(track)}
                          >
                            <span className={`text-[10px] font-bold w-4 text-center ${isPlayingNow ? "text-brand-accent" : "text-gray-500"}`}>
                              {idx + 1}
                            </span>
                            <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-semibold text-xs truncate transition-colors ${isPlayingNow ? "text-brand-accent" : "text-white group-hover:text-brand-accent"}`}>
                                {track.title}
                              </h4>
                              <p className="text-[10px] text-gray-400 truncate mt-0.5">{track.artist}</p>
                            </div>

                            {!isPlayingNow && (
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <PlayerPanel
              onToggleFavorite={handleToggleFavorite}
              isFavorite={currentTrack ? favorites.some((f) => f.id === currentTrack.id) : false}
              onOpenAlbum={handleOpenAlbum}
              onOpenArtist={handleOpenArtist}
            />
          )}
        </aside>

        {/* Mobile Full Screen Now Playing — PlayerPanel (has Lyrics, Overview, all controls) */}
        {showMobilePlayer && currentTrack && (
          <div className="lg:hidden fixed inset-0 bg-brand-darkBg z-50 overflow-hidden flex flex-col animate-[slideUp_0.35s_cubic-bezier(0.32,0.72,0,1)]">
            <PlayerPanel
              onToggleFavorite={handleToggleFavorite}
              isFavorite={favorites.some((f) => f.id === currentTrack.id)}
              onClose={() => setShowMobilePlayer(false)}
              onOpenAlbum={handleOpenAlbum}
              onOpenArtist={handleOpenArtist}
            />
          </div>
        )}

        {/* Toast Notification overlay */}
        {toast && (
          <div className={`fixed bottom-20 md:bottom-6 right-6 px-5 py-3 rounded-2xl border backdrop-blur-md shadow-2xl flex items-center gap-3 animate-[slideUp_0.2s_ease] z-50 transition-all ${toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400"
              : toast.type === "error"
                ? "bg-red-500/10 border-red-500/25 text-red-400"
                : "bg-white/10 border-white/10 text-gray-300"
            }`}>
            <div className={`w-2 h-2 rounded-full ${toast.type === "success" ? "bg-emerald-400" : toast.type === "error" ? "bg-red-400" : "bg-brand-accent"
              } animate-pulse`} />
            <span className="text-xs font-semibold">{toast.message}</span>
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
              <div className="p-6 flex items-center justify-between border-b border-white/5 bg-gradient-to-br from-brand-accent/10 to-transparent">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-6 h-6 text-brand-accent" /> Play Queue
                </h3>
                <div className="flex items-center gap-2 pr-8">
                  {queue.length > 0 && (
                    <>
                      {canSaveQueueAsPlaylist && (
                        <button
                          onClick={() => {
                            setSaveQueueMode(true);
                            setNewPlaylistName("Cola de reproducción");
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
                {queue.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 text-sm">Queue is empty</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {queue.map((track, idx) => {
                      const isPlayingNow = idx === currentIndex;
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          className={`flex items-center gap-3 p-2 rounded-xl transition-all border ${isPlayingNow ? "bg-white/5 border-white/10" : "bg-transparent border-transparent"
                            }`}
                          onClick={() => {
                            playTrack(track);
                            setShowQueueOverlay(false);
                          }}
                        >
                          <img src={track.thumbnail} className="w-8 h-8 rounded object-cover" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${isPlayingNow ? "text-brand-accent" : "text-white"}`}>{track.title}</p>
                            <p className="text-[10px] text-gray-400 truncate">{track.artist}</p>
                          </div>
                          {/* Reordering and Actions container */}
                          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Move Up */}
                            {idx > 0 && (
                              <button
                                onClick={() => reorderQueue(idx, idx - 1)}
                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Move up"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                            )}
                            
                            {/* Move Down */}
                            {idx < queue.length - 1 && (
                              <button
                                onClick={() => reorderQueue(idx, idx + 1)}
                                className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                title="Move down"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            )}

                            {/* Context Menu Button */}
                            <button
                              onClick={(e) => {
                                handleTrackContextMenu(e, track);
                              }}
                              className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                              title="Actions"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Remove Button */}
                            {!isPlayingNow && (
                              <button
                                onClick={() => removeFromQueue(track.id)}
                                className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300 transition-colors"
                                title="Remove from queue"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
                <ListenTogether />
              </div>
            </div>
          </div>
        )}

        {/* Mobile Account / Settings Overlay */}
        {showAccountDropdown && (
          <div className="md:hidden fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-md animate-fadeIn">
            <div className="glass-panel w-full max-w-sm rounded-[var(--app-radius-xl)] p-5 flex flex-col gap-4 relative shadow-2xl text-left">
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
                      const newTheme = themeSettings.theme === "dark" ? "bright" : "dark";
                      setThemeSettings(prev => ({
                        ...prev,
                        theme: newTheme,
                        bgColor: mapColorBetweenThemes(prev.bgColor, prev.theme, newTheme)
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
                }}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-white">
                {saveQueueMode ? "Save Queue as Playlist" : "Create Playlist"}
              </h3>
              <input
                type="text"
                placeholder="Playlist name..."
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
                  }}
                  className="flex-1 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCreatePlaylist(newPlaylistName)}
                  className="flex-1 py-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all shadow-md shadow-brand-accent/25"
                >
                  {saveQueueMode ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Track to Playlist Selector Modal */}
        {trackToAddToPlaylist && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
              <button
                onClick={() => setTrackToAddToPlaylist(null)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-white truncate pr-6">Add to Playlist</h3>
              <p className="text-xs text-gray-400 truncate">Select playlist for "{trackToAddToPlaylist.title}"</p>

              <div className="flex flex-col gap-2 max-h-[30vh] overflow-y-auto pr-1">
                {playlists.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">No playlists created yet.</p>
                ) : (
                  playlists.map((playlist) => (
                    <button
                      key={playlist.id}
                      onClick={() => handleAddTrackToPlaylist(playlist.id, trackToAddToPlaylist)}
                      className="w-full text-left p-3 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-sm font-semibold text-white flex items-center justify-between"
                    >
                      <span>{playlist.name}</span>
                      <span className="text-[10px] text-gray-500 font-normal">{playlist.tracks.length} Songs</span>
                    </button>
                  ))
                )}
              </div>

              <button
                onClick={() => {
                  setShowPlaylistCreateModal(true);
                }}
                className="w-full py-2.5 rounded-full border border-dashed border-white/15 hover:border-white/40 text-xs font-semibold text-gray-400 hover:text-white transition-all mt-2"
              >
                + Create New Playlist
              </button>
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
              <h3 className="text-lg font-bold text-white">Import Playlist</h3>

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
                  <p className="text-xs text-gray-400">Paste the Spotify public playlist link below to import its tracks.</p>
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
                  <p className="text-xs text-gray-400">Select any file containing tracks or a playlist to import.</p>
                  
                  {importFileError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col gap-2 relative animate-[fadeIn_0.2s_ease]">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-red-400">Could not read file</p>
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
                    <span className="text-xs font-bold text-white mb-0.5">Click to choose a file</span>
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
                  Cancel
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
                onClick={() => setShowUpdateModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white p-1 hover:bg-white/5 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent mb-4 animate-bounce">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1">New Update Available!</h3>
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
                    onClick={() => setShowUpdateModal(false)}
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
                <div className="relative w-14 h-14 rounded-2xl bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/40 mb-4">
                  <Sparkles className="w-7 h-7 text-black" />
                </div>

                <h3 className="text-2xl font-black text-white tracking-tight">
                  {authIsSignUp ? "Join IbraStream" : "Welcome back"}
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

                {authError && (
                  <div className="bg-red-500/10 border border-red-500/25 text-red-400 text-xs rounded-xl p-3 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setAuthLoading(true);
                  setAuthError(null);
                  try {
                    if (authIsSignUp) {
                      await signUp(authEmail, authPassword);
                      showToast("Account created! Check your email.", "success");
                    } else {
                      await signIn(authEmail, authPassword);
                      showToast("Signed in successfully!", "success");
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
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Email</label>
                    <input
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-accent focus:bg-white/8 focus:shadow-[0_0_0_3px_rgba(var(--brand-accent-rgb,168,85,247),0.15)] transition-all"
                    />
                  </div>

                  {/* Password */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/8 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-brand-accent focus:bg-white/8 focus:shadow-[0_0_0_3px_rgba(var(--brand-accent-rgb,168,85,247),0.15)] transition-all"
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
      {currentTrack && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-3">
          <div
            onClick={() => setShowMobilePlayer(true)}
            className="flex items-center gap-3 glass-panel rounded-2xl px-3 py-2.5 shadow-xl shadow-black/30 cursor-pointer select-none"
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
            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleToggleFavorite(currentTrack)}
                className={`p-2 ${favorites.some(f => f.id === currentTrack.id) ? "text-red-500" : "text-gray-500"}`}
              >
                <Heart className="w-4.5 h-4.5" fill={favorites.some(f => f.id === currentTrack.id) ? "currentColor" : "none"} />
              </button>
              <button
                onClick={togglePlay}
                disabled={isLoading || (roomId !== null && !isHost)}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
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
      )}

      {/* ═══ DESKTOP BOTTOM PLAYBACK BAR ═══ */}
      {currentTrack && (
        <footer className="hidden md:flex h-24 bg-brand-darkBg/95 border-t border-white/5 items-center justify-between px-6 fixed bottom-0 left-0 right-0 z-40 select-none backdrop-blur-md">
          {/* Left: Track Info */}
          <div className="flex items-center gap-4 w-1/3 min-w-[200px]">
            <img
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              className="w-14 h-14 rounded-lg object-cover shadow-md"
            />
            <div className="min-w-0 flex-1">
              <h4
                onClick={() => {
                  if (handleOpenAlbum && currentTrack.albumId) {
                    handleOpenAlbum({ id: currentTrack.albumId, title: currentTrack.albumName || "Album", artist: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                  }
                }}
                className="text-sm font-semibold text-white truncate hover:underline cursor-pointer"
              >
                {currentTrack.title}
              </h4>
              <div className="text-xs text-gray-400 truncate mt-0.5 flex flex-wrap gap-x-1 select-none">
                {currentTrack.artists && currentTrack.artists.length > 0 ? (
                  currentTrack.artists.map((art, i) => (
                    <React.Fragment key={art.id}>
                      <span
                        onClick={() => {
                          if (handleOpenArtist) {
                            handleOpenArtist({ id: art.id, name: art.name, thumbnail: currentTrack.thumbnail });
                          }
                        }}
                        className="hover:underline cursor-pointer hover:text-brand-accent transition-colors"
                      >
                        {art.name}
                      </span>
                      {i < currentTrack.artists!.length - 1 && <span>,</span>}
                    </React.Fragment>
                  ))
                ) : (
                  <span
                    onClick={() => {
                      if (handleOpenArtist && currentTrack.artistId) {
                        handleOpenArtist({ id: currentTrack.artistId, name: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                      }
                    }}
                    className="hover:underline cursor-pointer hover:text-brand-accent transition-colors"
                  >
                    {currentTrack.artist}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleToggleFavorite(currentTrack)}
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
                className={`p-1.5 transition-all ${isShuffle ? "text-white" : "text-gray-600 hover:text-white"} disabled:opacity-30 disabled:cursor-not-allowed`}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button 
                onClick={prevTrack} 
                disabled={roomId !== null && !isHost}
                className="p-1.5 text-gray-400 hover:text-white transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed" 
                title="Previous"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                disabled={isLoading || (roomId !== null && !isHost)}
                className="w-10 h-10 rounded-full bg-white text-black transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                title={isPlaying ? "Pause" : "Play"}
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
                title="Next"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={toggleRepeat}
                disabled={roomId !== null && !isHost}
                className={`p-1.5 relative transition-all ${isRepeat !== "none" ? "text-white" : "text-gray-600 hover:text-white"} disabled:opacity-30 disabled:cursor-not-allowed`}
                title="Repeat"
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
                onChange={(e) => seek(parseFloat(e.target.value))}
                disabled={roomId !== null && !isHost}
                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed"
              />
              <span>{Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, "0")}</span>
            </div>
          </div>

          {/* Right: Queue / Volume */}
          <div className="flex items-center justify-end gap-3 w-1/3 min-w-[200px]">
            <button
              onClick={() => setShowQueueOverlay(prev => !prev)}
              className={`p-2 rounded-full hover:bg-white/5 transition-all ${showQueueOverlay ? "text-white bg-white/5" : "text-gray-400 hover:text-white"}`}
              title="Queue"
            >
              <ListMusic className="w-4.5 h-4.5" />
            </button>
            {!isAndroid && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-all">
                  {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
                </button>
                <input
                  type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume}
                  onChange={(e) => changeVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                />
              </div>
            )}
          </div>
        </footer>
      )}

      {contextMenu && (
        <TrackContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          isFavorite={favorites.some((f) => f.id === contextMenu.track.id)}
          playlists={playlists}
          currentPlaylistId={contextMenu.currentPlaylistId}
          onClose={() => setContextMenu(null)}
          onToggleFavorite={() => handleToggleFavorite(contextMenu.track)}
          onAddToQueue={() => addToQueue(contextMenu.track)}
          onPlayNext={() => playNext(contextMenu.track)}
          onGoToArtist={() => {
            if (contextMenu.track.artistId) {
              handleOpenArtist({
                id: contextMenu.track.artistId,
                name: contextMenu.track.artist,
                thumbnail: contextMenu.track.thumbnail
              });
            }
          }}
          onGoToAlbum={() => {
            if (contextMenu.track.albumId) {
              handleOpenAlbum({
                id: contextMenu.track.albumId,
                title: contextMenu.track.albumName || "Album",
                artist: contextMenu.track.artist,
                thumbnail: contextMenu.track.thumbnail
              });
            }
          }}
          onShare={() => {
            const shareUrl = `${window.location.origin}/?track=${contextMenu.track.id}`;
            navigator.clipboard.writeText(shareUrl);
            showToast("Copied track share link to clipboard!", "success");
          }}

          onAddToPlaylist={(playlistId) => handleAddTrackToPlaylist(playlistId, contextMenu.track)}
          onRemoveFromPlaylist={() => {
            if (contextMenu.currentPlaylistId) {
              handleRemoveTrackFromPlaylist(contextMenu.currentPlaylistId, contextMenu.track.id);
            }
          }}
          onSelect={contextMenu.currentPlaylistId ? () => handleSelectTrack(contextMenu.track.id) : undefined}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AudioProvider>
      <MainLayout />
    </AudioProvider>
  );
};

export default App;