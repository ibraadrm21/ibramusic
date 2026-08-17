import 'dart:convert';
import 'package:http/http.dart' as http;

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

class MonochromeSearchService {
  static const List<String> _hosts = [
    "https://monochrome-api.samidy.com",
    "https://us-west.monochrome.tf",
    "https://eu-central.monochrome.tf",
    "https://api.monochrome.tf",
  ];

  static int _currentHostIndex = 0;

  /// Performs track search against Monochrome API or resolves YouTube / SoundCloud URLs
  static Future<List<TrackModel>> searchTracks(String query) async {
    final trimmedQuery = query.trim();
    if (trimmedQuery.isEmpty) return [];

    // 1. YouTube Link Detection (standard, music, shorts, youtu.be)
    final ytRegex = RegExp(r'(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})');
    final ytMatch = ytRegex.firstMatch(trimmedQuery);
    if (ytMatch != null) {
      final videoId = ytMatch.group(1)!;
      try {
        final res = await http.get(Uri.parse("https://noembed.com/embed?url=https://www.youtube.com/watch?v=$videoId")).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final data = json.decode(res.body);
          final title = data['title'] ?? 'YouTube Track';
          final author = data['author_name'] ?? 'YouTube Channel';
          final thumbnail = data['thumbnail_url'] ?? "https://img.youtube.com/vi/$videoId/hqdefault.jpg";

          return [
            TrackModel(
              id: videoId,
              title: title.toString(),
              artist: author.toString(),
              album: "YouTube Music",
              coverUrl: thumbnail.toString(),
              duration: const Duration(minutes: 3),
            )
          ];
        }
      } catch (_) {
        return [
          TrackModel(
            id: videoId,
            title: "YouTube Video ($videoId)",
            artist: "YouTube",
            album: "YouTube Link",
            coverUrl: "https://img.youtube.com/vi/$videoId/hqdefault.jpg",
            duration: const Duration(minutes: 3),
          )
        ];
      }
    }

    // 2. SoundCloud Link Detection
    if (trimmedQuery.contains("soundcloud.com/")) {
      try {
        final res = await http.get(Uri.parse("https://soundcloud.com/oembed?format=json&url=${Uri.encodeComponent(trimmedQuery)}")).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final data = json.decode(res.body);
          final title = data['title'] ?? 'SoundCloud Track';
          final author = data['author_name'] ?? 'SoundCloud Artist';
          final thumbnail = data['thumbnail_url'] ?? "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";

          return [
            TrackModel(
              id: "sc_${trimmedQuery.hashCode}",
              title: title.toString(),
              artist: author.toString(),
              album: "SoundCloud",
              coverUrl: thumbnail.toString(),
              duration: const Duration(minutes: 3),
            )
          ];
        }
      } catch (_) {}
    }

    for (int attempts = 0; attempts < _hosts.length; attempts++) {
      final host = _hosts[_currentHostIndex];
      try {
        final url = Uri.parse("$host/search/?s=${Uri.encodeComponent(query)}");
        final response = await http.get(url).timeout(const Duration(seconds: 4));

        if (response.statusCode == 200) {
          final data = json.decode(response.body);
          final items = data['data']?['items'] as List<dynamic>? ?? [];

          return items.map((item) {
            final albumCover = item['album']?['cover'];
            String coverUrl = "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80";
            if (albumCover != null && albumCover.toString().isNotEmpty) {
              final formattedUuid = albumCover.toString().replaceAll('-', '/');
              coverUrl = "https://resources.tidal.com/images/$formattedUuid/640x640.jpg";
            }

            final artistsList = item['artists'] as List<dynamic>?;
            final artistName = item['artist']?['name'] ??
                (artistsList != null && artistsList.isNotEmpty ? artistsList[0]['name'] : "Unknown Artist");

            return TrackModel(
              id: item['id']?.toString() ?? '',
              title: item['title'] ?? 'Unknown Track',
              artist: artistName.toString(),
              album: item['album']?['title'] ?? 'Single',
              coverUrl: coverUrl,
              duration: Duration(seconds: item['duration'] ?? 180),
            );
          }).toList();
        }
      } catch (e) {
        // Rotate host on error
        _currentHostIndex = (_currentHostIndex + 1) % _hosts.length;
      }
    }

    return [];
  }
}
