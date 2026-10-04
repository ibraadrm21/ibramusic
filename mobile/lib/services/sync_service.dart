import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/logger.dart';
import '../models/track.dart';
import '../models/playlist.dart';
import '../models/artist.dart';

const _tag = 'SyncService';

/// Data structure for cloud sync, matching the web app's SyncData.
class SyncData {
  final List<Track>? favorites;
  final List<Playlist>? playlists;
  final List<Artist>? followedArtists;
  final Map<String, dynamic>? themeSettings;
  final Map<String, dynamic>? accumulatedStats;

  const SyncData({
    this.favorites,
    this.playlists,
    this.followedArtists,
    this.themeSettings,
    this.accumulatedStats,
  });

  Map<String, dynamic> toJson() => {
        if (favorites != null)
          'favorites': favorites!.map((t) => t.toJson()).toList(),
        if (playlists != null)
          'playlists': playlists!.map((p) => p.toJson()).toList(),
        if (followedArtists != null)
          'followedArtists': followedArtists!.map((a) => a.toJson()).toList(),
        if (themeSettings != null) 'themeSettings': themeSettings,
        if (accumulatedStats != null) 'accumulatedStats': accumulatedStats,
      };

  factory SyncData.fromJson(Map<String, dynamic> json) => SyncData(
        favorites: (json['favorites'] as List<dynamic>?)
            ?.map((t) => Track.fromJson(t as Map<String, dynamic>))
            .toList(),
        playlists: (json['playlists'] as List<dynamic>?)
            ?.map((p) => Playlist.fromJson(p as Map<String, dynamic>))
            .toList(),
        followedArtists: (json['followedArtists'] as List<dynamic>?)
            ?.map((a) => Artist.fromJson(a as Map<String, dynamic>))
            .toList(),
        themeSettings: json['themeSettings'] as Map<String, dynamic>?,
        accumulatedStats: json['accumulatedStats'] as Map<String, dynamic>?,
      );
}

/// Supabase cloud sync service.
/// Saves/loads user data to/from the `user_sync` table (same as the web app).
class SyncService {
  SyncService._();

  static SupabaseClient get _client => Supabase.instance.client;

  /// Save user data to cloud.
  static Future<void> saveUserData(SyncData data) async {
    final user = _client.auth.currentUser;
    if (user == null) return;

    try {
      await _client.from('user_sync').upsert({
        'id': user.id,
        'updated_at': DateTime.now().toIso8601String(),
        'data': data.toJson(),
      });
      Log.d(_tag, 'Synced data to cloud for ${user.email}');
    } catch (e) {
      Log.e(_tag, 'Failed to save sync data', e);
      rethrow;
    }
  }

  /// Load user data from cloud.
  static Future<SyncData?> getUserData() async {
    final user = _client.auth.currentUser;
    if (user == null) return null;

    try {
      final response = await _client
          .from('user_sync')
          .select('data')
          .eq('id', user.id)
          .single();

      final rawData = response['data'];
      if (rawData is Map<String, dynamic>) {
        Log.d(_tag, 'Loaded sync data from cloud for ${user.email}');
        return SyncData.fromJson(rawData);
      }
    } on PostgrestException catch (e) {
      if (e.code == 'PGRST116') {
        // Record doesn't exist yet — not an error
        return null;
      }
      Log.e(_tag, 'Failed to fetch sync data', e);
      rethrow;
    } catch (e) {
      Log.e(_tag, 'Failed to fetch sync data', e);
      rethrow;
    }
    return null;
  }
}
