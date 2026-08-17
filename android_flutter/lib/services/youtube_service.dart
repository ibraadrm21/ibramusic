import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:youtube_explode_dart/youtube_explode_dart.dart';

class TrackModel {
  final String id;
  final String title;
  final String artist;
  final String album;
  final String coverUrl;
  final Duration duration;

  TrackModel({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.coverUrl,
    required this.duration,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'album': album,
        'coverUrl': coverUrl,
        'durationMs': duration.inMilliseconds,
      };

  factory TrackModel.fromJson(Map<String, dynamic> json) => TrackModel(
        id: json['id'] ?? '',
        title: json['title'] ?? 'Unknown Track',
        artist: json['artist'] ?? 'Unknown Artist',
        album: json['album'] ?? '',
        coverUrl: json['coverUrl'] ?? '',
        duration: Duration(milliseconds: json['durationMs'] ?? 0),
      );
}

class YouTubeAudioExtractor {
  static final YoutubeExplode _yt = YoutubeExplode();
  static final List<String> _pipedInstances = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.yt",
    "https://pipedapi.moe.xyz",
    "https://pipedapi.lvk.li",
    "https://api.piped.private.coffee",
  ];
  static int _currentPipedIndex = 0;

  /// Resolves direct audio stream URL using Piped API (CORS-friendly for Web & Android)
  static Future<String?> getAudioStreamUrl(String queryOrId) async {
    for (int attempts = 0; attempts < _pipedInstances.length; attempts++) {
      final pipedHost = _pipedInstances[_currentPipedIndex];
      try {
        String videoId = queryOrId;

        // Search for track on Piped API if query contains spaces
        if (queryOrId.contains(' ') || queryOrId.length != 11) {
          final searchRes = await http.get(Uri.parse("$pipedHost/search?q=${Uri.encodeComponent(queryOrId)}&filter=music_songs")).timeout(const Duration(seconds: 3));
          if (searchRes.statusCode == 200) {
            final sData = json.decode(searchRes.body);
            final items = sData['items'] as List<dynamic>?;
            if (items != null && items.isNotEmpty) {
              final url = items.first['url'] ?? '';
              videoId = url.replaceAll('/watch?v=', '');
            }
          }
        }

        if (videoId.length == 11) {
          final res = await http.get(Uri.parse("$pipedHost/streams/$videoId")).timeout(const Duration(seconds: 4));
          if (res.statusCode == 200) {
            final data = json.decode(res.body);
            final audioStreams = data['audioStreams'] as List<dynamic>?;
            if (audioStreams != null && audioStreams.isNotEmpty) {
              return audioStreams.first['url'];
            }
          }
        }
      } catch (_) {
        _currentPipedIndex = (_currentPipedIndex + 1) % _pipedInstances.length;
      }
    }

    // Fallback to YoutubeExplode
    try {
      String videoId = queryOrId;
      if (queryOrId.contains(' ') || queryOrId.length != 11) {
        final searchResults = await _yt.search.search(queryOrId);
        if (searchResults.isNotEmpty) {
          videoId = searchResults.first.id.value;
        }
      }

      if (videoId.length == 11) {
        final manifest = await _yt.videos.streamsClient.getManifest(videoId);
        final audioStreams = manifest.audioOnly;
        if (audioStreams.isNotEmpty) {
          return audioStreams.withHighestBitrate().url.toString();
        }
      }
    } catch (_) {}

    return null;
  }

  /// Searches tracks on YouTube matching a query
  static Future<List<TrackModel>> searchTracks(String query) async {
    try {
      final searchResults = await _yt.search.search(query);
      return searchResults.map((video) {
        return TrackModel(
          id: video.id.value,
          title: video.title,
          artist: video.author,
          album: "YouTube Music",
          coverUrl: video.thumbnails.highResUrl,
          duration: video.duration ?? Duration.zero,
        );
      }).toList();
    } catch (e) {
      print("Error searching tracks: $e");
      return [];
    }
  }

  static void dispose() {
    _yt.close();
  }
}
