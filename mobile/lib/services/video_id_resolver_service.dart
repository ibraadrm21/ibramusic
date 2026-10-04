import 'package:youtube_explode_dart/youtube_explode_dart.dart';

import '../core/constants.dart';
import '../core/exceptions.dart';
import '../core/extensions/string_ext.dart';
import '../core/logger.dart';
import '../models/track.dart';
import 'http_client.dart';

const _tag = 'VideoIdResolver';

/// In-memory resolution cache: trackId → videoId.
final Map<String, String> _cache = {};

/// Lazily initialized YouTube Explode client (shared with search service).
YoutubeExplode? _ytClient;
YoutubeExplode get _yt => _ytClient ??= YoutubeExplode();

/// Resolves a [Track] to its YouTube video ID using multi-tier fallback.
///
/// Matching the web app's `getYouTubeVideoId()` logic:
/// 1. Extract from track.id if it starts with "yt-" or is an 11-char ID
/// 2. Extract from track.youtubeUrl if present
/// 3. Search YouTube Music via youtube_explode_dart
/// 4. Fallback to Piped API search
/// 5. Fallback to Invidious API search
Future<String> resolveVideoId(Track track) async {
  // Check cache first
  if (_cache.containsKey(track.id)) return _cache[track.id]!;

  // Direct extraction from ID
  if (track.id.startsWith('yt-')) {
    final id = track.id.substring(3);
    _cache[track.id] = id;
    return id;
  }
  if (RegExp(r'^[a-zA-Z0-9_-]{11}$').hasMatch(track.id)) {
    _cache[track.id] = track.id;
    return track.id;
  }

  // Extract from youtubeUrl
  if (track.youtubeUrl != null && track.youtubeUrl!.isNotEmpty) {
    final match = RegExp(
            r'(?:youtu\.be/|(?:youtube\.com|music\.youtube\.com)/(?:watch\?(?:.*&)?v=|embed/|v/|shorts/|live/))([a-zA-Z0-9_-]{11})')
        .firstMatch(track.youtubeUrl!);
    if (match != null) {
      _cache[track.id] = match.group(1)!;
      return _cache[track.id]!;
    }
    final paramMatch = RegExp(r'[?&]v=([a-zA-Z0-9_-]{11})').firstMatch(track.youtubeUrl!);
    if (paramMatch != null) {
      _cache[track.id] = paramMatch.group(1)!;
      return _cache[track.id]!;
    }
  }

  // Build search query
  final cleanTitle = track.title.cleanTitle;
  final query = '${track.artist} $cleanTitle';

  // ─── Tier 1: YouTube Music via youtube_explode_dart ───
  try {
    final searchList = await _yt.search.search(query);
    for (final result in searchList) {
      if (result is SearchVideo) {
        final videoId = result.id.value;
        Log.d(_tag, 'Resolved via youtube_explode: ${result.title} ($videoId)');
        _cache[track.id] = videoId;
        return videoId;
      }
    }
  } catch (e) {
    Log.w(_tag, 'youtube_explode search failed, trying Piped', e);
  }

  // ─── Tier 2: Piped API search ───
  for (final host in ApiConstants.pipedHosts) {
    try {
      final url = '$host/search?q=${Uri.encodeComponent(query)}&filter=music_songs';
      final response = await HttpClient.getJson(
        url,
        timeout: ApiConstants.pipedTimeout,
        headers: {
          'Referer': 'https://piped.video/',
          'Origin': 'https://piped.video',
        },
      );
      final items = (response?['items'] as List<dynamic>?) ??
          (response?['relatedStreams'] as List<dynamic>?) ??
          [];
      for (final item in items) {
        final m = item as Map<String, dynamic>;
        if (m['type'] == 'stream' || m['url'] != null) {
          final urlStr = m['url'] as String? ?? '';
          final vidMatch = RegExp(r'[?&]v=([^&]+)').firstMatch(urlStr) ??
              RegExp(r'v=([^&]+)').firstMatch(urlStr);
          final videoId =
              vidMatch?.group(1) ?? urlStr.replaceAll('/watch?v=', '');
          if (videoId.isNotEmpty) {
            Log.d(_tag, 'Resolved via Piped $host: $videoId');
            _cache[track.id] = videoId;
            return videoId;
          }
        }
      }
    } catch (e) {
      Log.w(_tag, 'Piped $host failed', e);
    }
  }

  // ─── Tier 3: Invidious API search ───
  for (final host in ApiConstants.invidiousHosts) {
    try {
      final url = '$host/api/v1/search?q=${Uri.encodeComponent(query)}&type=video';
      final response = await HttpClient.get(url, timeout: ApiConstants.pipedTimeout);
      if (response.statusCode == 200 && response.data is List) {
        for (final item in response.data as List) {
          final m = item as Map<String, dynamic>;
          final videoId = m['videoId'] as String? ?? m['id'] as String? ?? '';
          if (videoId.isNotEmpty) {
            Log.d(_tag, 'Resolved via Invidious $host: $videoId');
            _cache[track.id] = videoId;
            return videoId;
          }
        }
      }
    } catch (e) {
      Log.w(_tag, 'Invidious $host failed', e);
    }
  }

  throw const VideoIdResolutionException(
      'Failed to retrieve video ID for this track.');
}

/// Pre-resolves a video ID for a track (for crossfade pre-cueing).
/// Returns the video ID or null if resolution fails silently.
Future<String?> preResolveVideoId(Track track) async {
  try {
    return await resolveVideoId(track);
  } catch (e) {
    Log.w(_tag, 'Pre-resolve failed for ${track.title}', e);
    return null;
  }
}

/// Clears the resolution cache.
void clearVideoIdCache() => _cache.clear();
