import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/album.dart';
import '../models/artist.dart';
import '../models/track.dart';
import '../services/music_search_service.dart';

class SearchState {
  final String query;
  final bool isLoading;
  final List<Track> tracks;
  final List<Album> albums;
  final List<Artist> artists;
  final String? error;

  const SearchState({
    this.query = '',
    this.isLoading = false,
    this.tracks = const [],
    this.albums = const [],
    this.artists = const [],
    this.error,
  });

  SearchState copyWith({
    String? query,
    bool? isLoading,
    List<Track>? tracks,
    List<Album>? albums,
    List<Artist>? artists,
    String? error,
  }) {
    return SearchState(
      query: query ?? this.query,
      isLoading: isLoading ?? this.isLoading,
      tracks: tracks ?? this.tracks,
      albums: albums ?? this.albums,
      artists: artists ?? this.artists,
      error: error,
    );
  }
}

class SearchNotifier extends StateNotifier<SearchState> {
  Timer? _debounceTimer;

  SearchNotifier() : super(const SearchState());

  void onQueryChanged(String query) {
    _debounceTimer?.cancel();
    if (query.trim().isEmpty) {
      state = const SearchState();
      return;
    }

    state = state.copyWith(query: query, isLoading: true, error: null);

    _debounceTimer = Timer(const Duration(milliseconds: 350), () {
      _performSearch(query);
    });
  }

  Future<void> _performSearch(String query) async {
    try {
      final results = await Future.wait([
        searchTracks(query),
        searchAlbums(query),
        searchArtists(query),
      ]);

      state = state.copyWith(
        isLoading: false,
        tracks: results[0] as List<Track>,
        albums: results[1] as List<Album>,
        artists: results[2] as List<Artist>,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: 'Error buscando música: $e',
      );
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    super.dispose();
  }
}

final searchProvider = StateNotifierProvider<SearchNotifier, SearchState>((ref) {
  return SearchNotifier();
});
