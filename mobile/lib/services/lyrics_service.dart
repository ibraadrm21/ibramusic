import '../core/constants.dart';
import '../core/exceptions.dart';
import '../core/extensions/string_ext.dart';
import '../core/logger.dart';
import '../models/lyrics.dart';
import '../models/track.dart';
import 'http_client.dart';

const _tag = 'LyricsService';

/// In-memory lyrics cache.
final Map<String, LyricsData> _cache = {};

/// Fetches synced/plain lyrics for a track from LRCLIB.
///
/// Matching the web app's `getLyricsForTrack()` logic:
/// 1. Exact match with duration
/// 2. Match without duration (lenient)
/// 3. Search query (most lenient)
Future<LyricsData> getLyricsForTrack(Track track) async {
  if (_cache.containsKey(track.id)) return _cache[track.id]!;

  final cleanTitle = track.title.cleanTitle;

  // ─── Tier 1: Exact match with duration ───
  try {
    final url = ApiConstants.lrclibGetExact(
        cleanTitle, track.artist, track.duration);
    final response = await HttpClient.getJson(url);
    if (response != null) {
      final data = LyricsData(
        syncedLyrics: response['syncedLyrics'] as String?,
        plainLyrics: response['plainLyrics'] as String?,
      );
      if (data.hasLyrics) {
        _cache[track.id] = data;
        return data;
      }
    }
  } catch (e) {
    Log.w(_tag, 'Exact lyrics match failed', e);
  }

  // ─── Tier 2: Match without duration ───
  try {
    final url = ApiConstants.lrclibGetLenient(cleanTitle, track.artist);
    final response = await HttpClient.getJson(url);
    if (response != null) {
      final data = LyricsData(
        syncedLyrics: response['syncedLyrics'] as String?,
        plainLyrics: response['plainLyrics'] as String?,
      );
      if (data.hasLyrics) {
        _cache[track.id] = data;
        return data;
      }
    }
  } catch (e) {
    Log.w(_tag, 'Lenient lyrics match failed', e);
  }

  // ─── Tier 3: Search query ───
  try {
    final url = ApiConstants.lrclibSearch('${track.artist} $cleanTitle');
    final response = await HttpClient.get(url);
    if (response.statusCode == 200 && response.data is List) {
      final results = response.data as List;
      if (results.isNotEmpty) {
        // Prefer result with synced lyrics
        final best = results.firstWhere(
          (r) => (r as Map)['syncedLyrics'] != null,
          orElse: () => results.first,
        ) as Map<String, dynamic>;
        final data = LyricsData(
          syncedLyrics: best['syncedLyrics'] as String?,
          plainLyrics: best['plainLyrics'] as String?,
        );
        if (data.hasLyrics) {
          _cache[track.id] = data;
          return data;
        }
      }
    }
  } catch (e) {
    Log.w(_tag, 'Lyrics search failed', e);
  }

  throw const LyricsNotFoundException();
}
