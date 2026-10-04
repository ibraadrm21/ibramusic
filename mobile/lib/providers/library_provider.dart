import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/artist.dart';
import '../models/playlist.dart';
import '../models/track.dart';
import '../services/storage_service.dart';

class LibraryState {
  final List<Track> favorites;
  final List<Playlist> playlists;
  final List<Track> recentlyPlayed;
  final List<Artist> followedArtists;

  const LibraryState({
    this.favorites = const [],
    this.playlists = const [],
    this.recentlyPlayed = const [],
    this.followedArtists = const [],
  });

  LibraryState copyWith({
    List<Track>? favorites,
    List<Playlist>? playlists,
    List<Track>? recentlyPlayed,
    List<Artist>? followedArtists,
  }) {
    return LibraryState(
      favorites: favorites ?? this.favorites,
      playlists: playlists ?? this.playlists,
      recentlyPlayed: recentlyPlayed ?? this.recentlyPlayed,
      followedArtists: followedArtists ?? this.followedArtists,
    );
  }
}

class LibraryNotifier extends StateNotifier<LibraryState> {
  LibraryNotifier() : super(const LibraryState()) {
    loadLibrary();
  }

  void loadLibrary() {
    state = LibraryState(
      favorites: StorageService.getFavorites(),
      playlists: StorageService.getPlaylists(),
      recentlyPlayed: StorageService.getRecentlyPlayed(),
      followedArtists: StorageService.getFollowedArtists(),
    );
  }

  Future<void> toggleFavorite(Track track) async {
    if (StorageService.isFavorite(track.id)) {
      await StorageService.removeFavorite(track.id);
    } else {
      await StorageService.addFavorite(track);
    }
    state = state.copyWith(favorites: StorageService.getFavorites());
  }

  bool isFavorite(String trackId) => StorageService.isFavorite(trackId);

  Future<void> createPlaylist(String name) async {
    final newPlaylist = Playlist(
      id: 'pl_${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      tracks: [],
    );
    await StorageService.savePlaylist(newPlaylist);
    state = state.copyWith(playlists: StorageService.getPlaylists());
  }

  Future<void> addTrackToPlaylist(String playlistId, Track track) async {
    final playlist = state.playlists.firstWhere((p) => p.id == playlistId);
    if (!playlist.tracks.any((t) => t.id == track.id)) {
      final updated = playlist.copyWith(tracks: [...playlist.tracks, track]);
      await StorageService.savePlaylist(updated);
      state = state.copyWith(playlists: StorageService.getPlaylists());
    }
  }

  Future<void> deletePlaylist(String playlistId) async {
    await StorageService.deletePlaylist(playlistId);
    state = state.copyWith(playlists: StorageService.getPlaylists());
  }
}

final libraryProvider = StateNotifierProvider<LibraryNotifier, LibraryState>((ref) {
  return LibraryNotifier();
});
