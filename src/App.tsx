import React, { useState, useEffect } from "react";
import {
  Search, Heart, Sparkles, Play, Pause, Trash2, ListMusic, X, Plus, Home,
  SkipBack, SkipForward, Shuffle, Repeat, Volume2, VolumeX, Clock
} from "lucide-react";
import { AudioProvider, useAudio } from "./context/AudioContext";
import Sidebar from "./components/Sidebar";
import PlayerPanel from "./components/PlayerPanel";
import TrackCard from "./components/TrackCard";
import TrackContextMenu from "./components/TrackContextMenu";
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

interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
}

interface ThemeSettings {
  theme: "dark" | "bright";
  corners: "rounded" | "soft";
  bgColor: string;
  bgImage: string;
}

const MainLayout: React.FC = () => {
  const {
    currentTrack, isPlaying, togglePlay, playTrack,
    queue, currentIndex, removeFromQueue, clearQueue, reorderQueue,
    toast, showToast,
    isLoading, currentTime, duration, volume, isMuted,
    isShuffle, isRepeat, nextTrack, prevTrack, seek,
    changeVolume, toggleMute, toggleShuffle, toggleRepeat,
    playNext
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchType, setSearchType] = useState<"track" | "album" | "artist">("track");
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
  const [isSearching, setIsSearching] = useState<boolean>(false);


  const [favorites, setFavorites] = useState<Track[]>([]);
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

  const [showQueueOverlay, setShowQueueOverlay] = useState<boolean>(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Playlists state
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showPlaylistCreateModal, setShowPlaylistCreateModal] = useState<boolean>(false);
  const [newPlaylistName, setNewPlaylistName] = useState<string>("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState<string>("");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);

  // Spotify import states
  const [showSpotifyImportModal, setShowSpotifyImportModal] = useState<boolean>(false);
  const [spotifyLink, setSpotifyLink] = useState<string>("");
  const [isImportingSpotify, setIsImportingSpotify] = useState<boolean>(false);
  const [spotifyToken, setSpotifyTokenState] = useState<string | null>(() => localStorage.getItem("ibrastream_spotify_token"));
  const [spotifyClientId, setSpotifyClientId] = useState<string>(() => localStorage.getItem("ibrastream_spotify_client_id") || "4af2775b763e4e2e80bd63dcf5ea3c23");
  const [importTab, setImportTab] = useState<"spotify" | "m3u">("spotify");
  const [subSearchQuery, setSubSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<"title" | "album" | "dateAdded" | "duration" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Reset sub-search filter and sorting when switching tabs, playlists, albums, or artists
  useEffect(() => {
    setSubSearchQuery("");
    setSortField(null);
    setSortDirection("asc");
  }, [activeTab, selectedPlaylist, selectedAlbum, selectedArtist]);

  // Recommendation states
  const [homeRecommendations, setHomeRecommendations] = useState<Track[]>([]);
  const [searchRecommendations, setSearchRecommendations] = useState<Track[]>([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);

  // Load Playlists on mount
  useEffect(() => {
    const saved = localStorage.getItem("ibrastream_playlists");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const validated = Array.isArray(parsed) ? parsed.map((p: any) => ({
          ...p,
          tracks: Array.isArray(p.tracks) ? p.tracks : []
        })) : [];
        setPlaylists(validated);
      } catch (e) {
        console.error("Failed to parse playlists", e);
      }
    }
  }, []);

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
    if (!name.trim()) return;
    const newPlaylist: Playlist = {
      id: String(Date.now()),
      name: name.trim(),
      tracks: []
    };
    const updated = [...playlists, newPlaylist];
    savePlaylists(updated);
    setNewPlaylistName("");
    setShowPlaylistCreateModal(false);
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
          showToast(`Auth import failed: ${authErr.message || authErr}. Using guest mode (100 tracks max).`, "warning");
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
    if (!content.trim()) return;
    setIsImportingSpotify(true);
    try {
      const { importM3UPlaylist } = await import("./services/spotifyImporter");
      const defaultName = fileName.replace(/\.[^/.]+$/, ""); // Strip file extension
      const { name, tracks } = await importM3UPlaylist(defaultName, content);

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
      showToast(err.message || "Failed to import playlist file.", "error");
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

  // Load Favorites from LocalStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ibrastream_favorites");
    if (saved) {
      try {
        setFavorites(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse favorites", e);
      }
    }
  }, []);

  // Fetch home recommendations when favorites list or currentTrack changes
  useEffect(() => {
    const loadHomeRecs = async () => {
      setIsLoadingRecommendations(true);
      try {
        const recs = await getHomeRecommendations(favorites, currentTrack);
        setHomeRecommendations(recs);
      } catch (err) {
        console.error("Failed to load home recommendations", err);
      } finally {
        setIsLoadingRecommendations(false);
      }
    };
    loadHomeRecs();
  }, [favorites, currentTrack]);

  // Run initial search
  useEffect(() => {
    handleSearch("");
  }, []);

  const handleToggleFavorite = (track: Track) => {
    let updated;
    if (favorites.some((t) => t.id === track.id)) {
      updated = favorites.filter((t) => t.id !== track.id);
    } else {
      updated = [...favorites, track];
    }
    setFavorites(updated);
    localStorage.setItem("ibrastream_favorites", JSON.stringify(updated));
  };

  const handleSearch = async (query: string, type: "track" | "album" | "artist" = searchType) => {
    setIsSearching(true);
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

  const handleQuickPlayHero = () => {
    if (searchResults.length > 0) {
      playTrack(searchResults[0], searchResults);
    }
  };

  const [mobileSearchOpen, setMobileSearchOpen] = React.useState(false);

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden relative"
      style={{
        backgroundColor: "var(--app-bg-color-val, #0f0f0f)",
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
          }}
          playlists={playlists}
          followedArtists={followedArtists}
          onSelectPlaylist={(p) => {
            setSelectedArtist(null);
            setSelectedAlbum(null);
            setPreviousArtist(null);
            setActiveTab("playlists");
            setSelectedPlaylist(p);
          }}
          onSelectArtist={(a) => {
            handleOpenArtist(a);
          }}
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-white/7 border border-white/8 text-white text-sm focus:outline-none placeholder:text-gray-500"
                />
              </form>
              <button
                onClick={() => { setMobileSearchOpen(false); setSearchQuery(""); }}
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
                  onClick={() => window.history.back()}
                  className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 border border-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-all"
                  title="Go back"
                >
                  <span className="text-sm font-bold">←</span>
                </button>
                <button
                  onClick={() => window.history.forward()}
                  className="w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 border border-white/5 text-gray-400 hover:text-white flex items-center justify-center transition-all"
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white/5 border border-white/5 focus:border-brand-accent/50 focus:bg-white/10 text-white text-sm focus:outline-none transition-all placeholder:text-gray-500"
                  />
                </form>
              </div>
            </div>

            <div className="flex items-center gap-3">
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

              <div className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center font-bold text-white text-xs">
                IB
              </div>
            </div>
          </header>

          {/* Dynamic Inner Panel View */}
          {selectedArtist ? (
            /* ARTIST PANEL - FULL PAGE SPACE */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease]">
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
                      {artistTracks.slice(0, 8).map((track, idx) => (
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
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease]">
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
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease]">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <ListMusic className="w-6 h-6 text-brand-accent" /> Playlists
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowSpotifyImportModal(true)}
                    className="px-4 py-2 rounded-full border border-white/10 hover:border-brand-accent hover:text-white text-xs font-semibold text-gray-300 transition-all active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> Import Spotify Link
                  </button>
                  <button
                    onClick={() => setShowPlaylistCreateModal(true)}
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
                    <div className="w-28 h-28 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center relative shadow-lg">
                      <ListMusic className="w-12 h-12 text-brand-accent" />
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
                                playTrack(filtered[0], filtered);
                              }
                            }}
                            className="w-12 h-12 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-black flex items-center justify-center transition-all shadow-lg shadow-brand-accent/25 active:scale-95 shrink-0"
                            title="Play playlist"
                          >
                            <Play className="w-5 h-5 fill-current ml-0.5" />
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

                          {/* Tracks */}
                          <div className="flex flex-col gap-2 mt-2">
                            {sortedTracks.map((track, idx) => (
                              <TrackCard
                                key={`${track.id}-${idx}`}
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
                              />
                            ))}
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
                            <div className="relative w-full aspect-square rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shadow-lg shadow-black/40">
                              <ListMusic className="w-16 h-16 text-brand-accent transition-transform duration-500 group-hover:scale-110" />
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
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease]">
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

              {/* Filter Tabs */}
              <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-2xl w-fit self-start">
                {(["track", "album", "artist"] as const).map((type) => (
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
                    {type}s
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
            </section>
          ) : activeTab === "favorites" ? (
            /* FAVORITE PLAYLIST PANEL */
            <section className="flex flex-col gap-6 animate-[fadeIn_0.3s_ease]">
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
                          playTrack(filtered[0], filtered);
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
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
          ) : activeTab === "visuals" ? (
            /* VISUAL STYLING TAB */
            <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease] text-left max-w-2xl">
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
                      onClick={() => setThemeSettings({ ...themeSettings, theme: t })}
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
                        {[
                          "#0f0f0f","#0f0f1a","#0a0f1e","#0d1117","#0f1923","#10151f","#1a0a0a","#120a0f",
                          "#1e1e2e","#1a1a2e","#16213e","#0d2137","#0a2540","#162032","#2d1b1b","#1f0d24",
                          "#ff6b6b","#f97316","#fbbf24","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899",
                          "#ff4757","#ff7043","#ffca28","#00e676","#00bcd4","#2979ff","#7c3aed","#e91e63",
                          "#1a0533","#0d0d2b","#00141f","#001a00","#1a1000","#1a0000","#002233","#190019",
                          "#2a0a3a","#0e1f4d","#00261c","#1a2500","#2b1700","#2a0000","#003344","#250038",
                        ].map(color => (
                          <button
                            key={color}
                            onClick={() => setThemeSettings({ ...themeSettings, bgColor: color, bgImage: "" })}
                            title={color}
                            style={{ backgroundColor: color }}
                            className={`w-full aspect-square rounded-md border-2 transition-all hover:scale-110 ${
                              themeSettings.bgColor === color ? "border-white scale-110" : "border-white/10 hover:border-white/40"
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
            <section className="flex flex-col gap-8 animate-[fadeIn_0.3s_ease]">

              {/* Recent Section / 2x4 Quick Access Grid */}
              {searchResults.length > 0 && (
                <div className="animate-[fadeIn_0.3s_ease]">
                  <h2 className="text-2xl font-bold text-white tracking-wide mb-4 pl-1">
                    Good Afternoon
                  </h2>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* 8 quick-access cards */}
                    {searchResults.slice(0, 8).map((track) => (
                      <div
                        key={`quick-${track.id}`}
                        onClick={() => playTrack(track, searchResults)}
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

              {/* Let the music take you away - Hero Card */}
              <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-accent/20 via-pink-500/10 to-transparent p-6 md:p-10 border border-white/5 flex flex-col justify-between min-h-[220px]">
                <div className="absolute -top-12 -right-12 w-48 h-48 bg-brand-accent/20 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="max-w-md relative z-10 flex flex-col gap-3">
                  <span className="inline-block font-semibold bg-gradient-to-r from-gray-400 via-white to-gray-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-[shine_4s_linear_infinite] text-3xl md:text-4xl font-extrabold tracking-wide" style={{ animationDuration: "4s" }}>Let The Music</span>
                  <span className="inline-flex flex-wrap text-3xl md:text-4xl font-extrabold text-white tracking-wide">
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "0ms", opacity: 1, whiteSpace: "normal" }}>T</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "40ms", opacity: 1, whiteSpace: "normal" }}>a</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "80ms", opacity: 1, whiteSpace: "normal" }}>k</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "120ms", opacity: 1, whiteSpace: "normal" }}>e</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "160ms", opacity: 1, whiteSpace: "pre" }}> </span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "200ms", opacity: 1, whiteSpace: "normal" }}>Y</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "240ms", opacity: 1, whiteSpace: "normal" }}>o</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "280ms", opacity: 1, whiteSpace: "normal" }}>u</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "320ms", opacity: 1, whiteSpace: "pre" }}> </span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "360ms", opacity: 1, whiteSpace: "normal" }}>A</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "400ms", opacity: 1, whiteSpace: "normal" }}>w</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "440ms", opacity: 1, whiteSpace: "normal" }}>a</span>
                    <span className="inline-block transition-all duration-300 hover:scale-110 hover:text-brand-accent cursor-default select-none animate-[fadeIn_0.4s_ease]" style={{ animationDelay: "480ms", opacity: 1, whiteSpace: "normal" }}>y</span>
                  </span>
                  <p className="text-xs md:text-sm text-gray-400 mt-2 leading-relaxed">IbraSexyStream Music Player Free Gay Pro Max.</p>
                </div>
              </div>

              {/* Recent Section */}
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide mb-4 pl-1">
                  Recent Albums
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {searchResults.slice(0, 4).map((track, idx) => (
                    <TrackCard
                      key={`${track.id}-${idx}`}
                      track={track}
                      variant="square"
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
              </div>

              {/* Recommended for You */}
              {homeRecommendations.length > 0 && (
                <div className="animate-[fadeIn_0.4s_ease]">
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
                    <button
                      onClick={clearQueue}
                      className="p-1.5 text-xs text-gray-400 hover:text-brand-accent hover:underline transition-colors flex items-center gap-1 font-semibold"
                      title="Clear Queue"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
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
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    className="px-3 py-1.5 rounded-full border border-white/10 hover:border-brand-accent/50 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                  >
                    Clear
                  </button>
                )}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Playlist Create Modal */}
        {showPlaylistCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-[fadeIn_0.2s_ease]">
            <div className="bg-brand-darkBg border border-white/10 rounded-3xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl relative">
              <button
                onClick={() => setShowPlaylistCreateModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-lg font-bold text-white">Create Playlist</h3>
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
                  onClick={() => setShowPlaylistCreateModal(false)}
                  className="flex-1 py-2.5 rounded-full border border-white/10 hover:bg-white/5 text-xs font-semibold text-gray-400 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleCreatePlaylist(newPlaylistName)}
                  className="flex-1 py-2.5 rounded-full bg-brand-accent hover:bg-brand-accent/90 text-xs font-semibold text-black transition-all shadow-md shadow-brand-accent/25"
                >
                  Create
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
                  <p className="text-xs text-gray-400">Select a `.m3u` or `.m3u8` playlist file to import all its tracks.</p>
                  <div className="flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/10 transition-all cursor-pointer relative group min-h-[140px]">
                    <input
                      type="file"
                      accept=".m3u,.m3u8,.txt,.csv"
                      disabled={isImportingSpotify}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          handleImportM3U(file.name, content);
                        };
                        reader.readAsText(file);
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <ListMusic className="w-8 h-8 text-brand-accent group-hover:scale-110 transition-all duration-300 mb-2" />
                    <span className="text-xs font-bold text-white mb-0.5">Click to choose a file</span>
                    <span className="text-[10px] text-gray-500">Supports .m3u, .m3u8, .csv, or plain text lists</span>
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

      </div>

      {/* ═══ MOBILE MINI-PLAYER (above bottom nav) ═══ */}
      {currentTrack && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-40 px-3">
          <div
            onClick={() => setShowMobilePlayer(true)}
            className="flex items-center gap-3 bg-[#1a1a1a] border border-white/8 rounded-2xl px-3 py-2.5 shadow-xl shadow-black/60 cursor-pointer select-none"
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
                  className="h-full bg-white/50 rounded-full transition-all"
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
                disabled={isLoading}
                className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-90 disabled:opacity-60 transition-all"
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
                className="p-2 text-gray-400 active:scale-90"
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
              <p
                onClick={() => {
                  if (handleOpenArtist && currentTrack.artistId) {
                    handleOpenArtist({ id: currentTrack.artistId, name: currentTrack.artist, thumbnail: currentTrack.thumbnail });
                  }
                }}
                className="text-xs text-gray-400 truncate mt-0.5 hover:underline cursor-pointer"
              >
                {currentTrack.artist}
              </p>
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
                className={`p-1.5 transition-all ${isShuffle ? "text-white" : "text-gray-600 hover:text-white"}`}
                title="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>
              <button onClick={prevTrack} className="p-1.5 text-gray-400 hover:text-white transition-all active:scale-90" title="Previous">
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={togglePlay}
                disabled={isLoading}
                className="w-10 h-10 rounded-full bg-white text-black transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center"
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
              <button onClick={nextTrack} className="p-1.5 text-gray-400 hover:text-white transition-all active:scale-90" title="Next">
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={toggleRepeat}
                className={`p-1.5 relative transition-all ${isRepeat !== "none" ? "text-white" : "text-gray-600 hover:text-white"}`}
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
                className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white focus:outline-none"
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
            const shareText = `Listening to "${contextMenu.track.title}" by ${contextMenu.track.artist} on IbraStream!`;
            navigator.clipboard.writeText(shareText);
            showToast("Copied track sharing info to clipboard!", "success");
          }}
          onAddToPlaylist={(playlistId) => handleAddTrackToPlaylist(playlistId, contextMenu.track)}
          onRemoveFromPlaylist={() => {
            if (contextMenu.currentPlaylistId) {
              handleRemoveTrackFromPlaylist(contextMenu.currentPlaylistId, contextMenu.track.id);
            }
          }}
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
