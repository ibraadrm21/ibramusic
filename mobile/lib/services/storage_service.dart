import 'dart:io';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';

import '../core/constants.dart';
import '../core/logger.dart';
import '../models/album.dart';
import '../models/artist.dart';
import '../models/playlist.dart';
import '../models/track.dart';

const _tag = 'StorageService';

/// Local offline persistence service using Hive and SharedPreferences.
///
/// Handles:
/// - Favorites list (Tracks)
/// - Custom playlists (Playlists)
/// - Recently played tracks (last 100)
/// - Followed artists
/// - Downloaded track registry & local file paths
/// - User settings (crossfade, theme, volume)
class StorageService {
  StorageService._();

  static const String boxFavorites = 'favorites';
  static const String boxPlaylists = 'playlists';
  static const String boxRecent = 'recently_played';
  static const String boxFollowedArtists = 'followed_artists';
  static const String boxDownloads = 'downloads_registry';
  static const String boxSettings = 'user_settings';

  static late Box<Map> _favBox;
  static late Box<Map> _playlistBox;
  static late Box<Map> _recentBox;
  static late Box<Map> _artistBox;
  static late Box<Map> _downloadsBox;
  static late Box _settingsBox;

  static bool _initialized = false;

  /// Initialize Hive boxes and local directories.
  static Future<void> init() async {
    if (_initialized) return;

    try {
      await Hive.initFlutter();

      _favBox = await Hive.openBox<Map>(boxFavorites);
      _playlistBox = await Hive.openBox<Map>(boxPlaylists);
      _recentBox = await Hive.openBox<Map>(boxRecent);
      _artistBox = await Hive.openBox<Map>(boxFollowedArtists);
      _downloadsBox = await Hive.openBox<Map>(boxDownloads);
      _settingsBox = await Hive.openBox(boxSettings);

      _initialized = true;
      Log.d(_tag, 'Hive boxes initialized successfully');
    } catch (e, stack) {
      Log.e(_tag, 'Failed to initialize Hive', e, stack);
      rethrow;
    }
  }

  // ────────────────────────── FAVORITES ──────────────────────────

  static List<Track> getFavorites() {
    return _favBox.values
        .map((e) => Track.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static bool isFavorite(String trackId) {
    return _favBox.containsKey(trackId);
  }

  static Future<void> addFavorite(Track track) async {
    final trackToSave = track.dateAdded != null
        ? track
        : track.copyWith(dateAdded: DateTime.now().toIso8601String());
    await _favBox.put(track.id, trackToSave.toJson());
  }

  static Future<void> removeFavorite(String trackId) async {
    await _favBox.delete(trackId);
  }

  static Future<void> setFavorites(List<Track> tracks) async {
    await _favBox.clear();
    final map = {for (final t in tracks) t.id: t.toJson()};
    await _favBox.putAll(map);
  }

  // ────────────────────────── PLAYLISTS ──────────────────────────

  static List<Playlist> getPlaylists() {
    return _playlistBox.values
        .map((e) => Playlist.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<void> savePlaylist(Playlist playlist) async {
    await _playlistBox.put(playlist.id, playlist.toJson());
  }

  static Future<void> deletePlaylist(String playlistId) async {
    await _playlistBox.delete(playlistId);
  }

  static Future<void> setPlaylists(List<Playlist> playlists) async {
    await _playlistBox.clear();
    final map = {for (final p in playlists) p.id: p.toJson()};
    await _playlistBox.putAll(map);
  }

  // ────────────────────── RECENTLY PLAYED ──────────────────────

  static List<Track> getRecentlyPlayed() {
    final list = _recentBox.values
        .map((e) => Track.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    // Return in reverse order (most recent first)
    return list.reversed.toList();
  }

  static Future<void> addRecentlyPlayed(Track track) async {
    // If it already exists, remove it so it moves to the top
    await _recentBox.delete(track.id);
    await _recentBox.put(track.id, track.toJson());

    // Prune if over limit
    if (_recentBox.length > ApiConstants.maxRecentlyPlayed) {
      final keysToRemove = _recentBox.keys
          .take(_recentBox.length - ApiConstants.maxRecentlyPlayed)
          .toList();
      for (final key in keysToRemove) {
        await _recentBox.delete(key);
      }
    }
  }

  static Future<void> clearRecentlyPlayed() async {
    await _recentBox.clear();
  }

  // ────────────────────── FOLLOWED ARTISTS ─────────────────────

  static List<Artist> getFollowedArtists() {
    return _artistBox.values
        .map((e) => Artist.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static bool isFollowingArtist(String artistId) {
    return _artistBox.containsKey(artistId);
  }

  static Future<void> followArtist(Artist artist) async {
    await _artistBox.put(artist.id, artist.toJson());
  }

  static Future<void> unfollowArtist(String artistId) async {
    await _artistBox.delete(artistId);
  }

  static Future<void> setFollowedArtists(List<Artist> artists) async {
    await _artistBox.clear();
    final map = {for (final a in artists) a.id: a.toJson()};
    await _artistBox.putAll(map);
  }

  // ───────────────────── DOWNLOADED TRACKS ─────────────────────

  static List<Track> getDownloadedTracks() {
    return _downloadsBox.values
        .map((e) => Track.fromJson(Map<String, dynamic>.from(e['track'] as Map)))
        .toList();
  }

  static bool isDownloaded(String trackId) {
    return _downloadsBox.containsKey(trackId);
  }

  static String? getDownloadPath(String trackId) {
    final entry = _downloadsBox.get(trackId);
    if (entry == null) return null;
    return entry['localPath'] as String?;
  }

  static Future<void> saveDownloadedTrack(Track track, String localPath) async {
    await _downloadsBox.put(track.id, {
      'track': track.toJson(),
      'localPath': localPath,
      'savedAt': DateTime.now().toIso8601String(),
    });
  }

  static Future<void> removeDownloadedTrack(String trackId) async {
    await _downloadsBox.delete(trackId);
  }

  // ────────────────────────── SETTINGS ─────────────────────────

  static T? getSetting<T>(String key, [T? defaultValue]) {
    return (_settingsBox.get(key, defaultValue: defaultValue) as T?) ?? defaultValue;
  }

  static Future<void> setSetting<T>(String key, T value) async {
    await _settingsBox.put(key, value);
  }

  // Common quick settings getters/setters
  static bool get crossfadeEnabled =>
      getSetting<bool>('crossfade_enabled', true) ?? true;
  static set crossfadeEnabled(bool val) =>
      setSetting<bool>('crossfade_enabled', val);

  static int get crossfadeDuration =>
      getSetting<int>('crossfade_duration', ApiConstants.defaultCrossfadeDuration) ??
      ApiConstants.defaultCrossfadeDuration;
  static set crossfadeDuration(int val) =>
      setSetting<int>('crossfade_duration', val);

  static String get themeMode =>
      getSetting<String>('theme_mode', 'dark') ?? 'dark';
  static set themeMode(String val) =>
      setSetting<String>('theme_mode', val);

  static double get volume =>
      getSetting<double>('player_volume', 1.0) ?? 1.0;
  static set volume(double val) =>
      setSetting<double>('player_volume', val);
}
