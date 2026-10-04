import 'package:youtube_explode_dart/youtube_explode_dart.dart';

import '../core/constants.dart';
import '../core/exceptions.dart';
import '../core/logger.dart';
import 'http_client.dart';

const _tag = 'StreamResolver';

/// Cached healthy Cobalt hosts.
List<String> _cobaltHosts = [];
DateTime _lastCobaltFetch = DateTime(2000);

/// Lazily initialized YouTube Explode client.
YoutubeExplode? _ytClient;
YoutubeExplode get _yt => _ytClient ??= YoutubeExplode();

/// Resolves a YouTube video ID to a direct audio stream URL.
///
/// Matching the web app's `getYouTubeAudioStream()` logic:
/// 1. youtube_explode_dart direct stream manifest
/// 2. Piped API `/streams/{id}` endpoint
/// 3. Cobalt API POST (audio download)
Future<String> resolveAudioStream(String videoId) async {
  // ─── Tier 1: youtube_explode_dart direct stream ───
  try {
    Log.d(_tag, 'Resolving stream via youtube_explode for $videoId...');
    final manifest = await _yt.videos.streamsClient.getManifest(VideoId(videoId));
    final audioStreams = manifest.audioOnly.sortByBitrate();
    if (audioStreams.isNotEmpty) {
      // Prefer M4A (audio/mp4) over WebM for better compatibility
      final best = audioStreams.firstWhere(
        (s) => s.container.name == 'mp4',
        orElse: () => audioStreams.first,
      );
      Log.d(_tag, 'youtube_explode resolved: ${best.url} (${best.bitrate}bps)');
      return best.url.toString();
    }
  } catch (e) {
    Log.w(_tag, 'youtube_explode stream failed, trying Piped', e);
  }

  // ─── Tier 2: Piped API streams ───
  for (final host in ApiConstants.pipedHosts) {
    try {
      Log.d(_tag, 'Trying Piped stream: $host/streams/$videoId');
      final response = await HttpClient.getJson(
        '$host/streams/$videoId',
        timeout: ApiConstants.streamTimeout,
      );
      final audioStreams =
          (response?['audioStreams'] as List<dynamic>?) ?? [];
      if (audioStreams.isNotEmpty) {
        // Prefer audio/mp4 (M4A) for best compatibility
        final best = audioStreams.firstWhere(
          (s) => (s['mimeType'] as String?)?.contains('audio/mp4') == true,
          orElse: () => audioStreams.first,
        );
        final streamUrl = best['url'] as String?;
        if (streamUrl != null && streamUrl.isNotEmpty) {
          Log.d(_tag, 'Piped resolved stream from $host');
          return streamUrl;
        }
      }
    } catch (e) {
      Log.w(_tag, 'Piped stream $host failed', e);
    }
  }

  // ─── Tier 3: Cobalt API ───
  final cobaltEndpoints = await _getHealthyCobaltHosts();
  for (final endpoint in cobaltEndpoints) {
    try {
      Log.d(_tag, 'Trying Cobalt: $endpoint');
      final response = await HttpClient.post(
        endpoint,
        data: {
          'url': 'https://www.youtube.com/watch?v=$videoId',
          'downloadMode': 'audio',
          'audioFormat': 'mp3',
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': 'https://cobalt.tools',
          'Referer': 'https://cobalt.tools/',
        },
        timeout: ApiConstants.cobaltTimeout,
      );
      if (response.statusCode == 200 && response.data != null) {
        final data = response.data is Map ? response.data as Map : null;
        final streamUrl = data?['url'] as String?;
        if (streamUrl != null && streamUrl.isNotEmpty) {
          Log.d(_tag, 'Cobalt resolved stream from $endpoint');
          return streamUrl;
        }
      }
    } catch (e) {
      Log.w(_tag, 'Cobalt $endpoint failed', e);
    }
  }

  throw const StreamResolutionException('Failed to retrieve audio stream URL.');
}

/// Fetches the latest healthy Cobalt hosts from the directory API,
/// falling back to the hardcoded list.
Future<List<String>> _getHealthyCobaltHosts() async {
  final now = DateTime.now();
  if (_cobaltHosts.isNotEmpty &&
      now.difference(_lastCobaltFetch).inMinutes < 15) {
    return _cobaltHosts;
  }

  try {
    final response = await HttpClient.getJson(ApiConstants.cobaltDirectoryUrl);
    final hosts = (response?['data']?['youtube'] as List<dynamic>?) ?? [];
    if (hosts.isNotEmpty) {
      _cobaltHosts = hosts.map((h) {
        final s = h.toString();
        return s.endsWith('/') ? s : '$s/';
      }).toList();
      _lastCobaltFetch = now;
      return _cobaltHosts;
    }
  } catch (e) {
    Log.w(_tag, 'Failed to fetch Cobalt directory', e);
  }

  return ApiConstants.cobaltFallbackHosts;
}
