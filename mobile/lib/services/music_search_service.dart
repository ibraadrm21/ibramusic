import 'package:youtube_explode_dart/youtube_explode_dart.dart';

import '../core/constants.dart';
import '../core/logger.dart';
import '../models/track.dart';
import '../models/album.dart';
import '../models/artist.dart';
import '../models/track.dart' show ArtistRef;
import 'http_client.dart';

const _tag = 'MusicSearchService';

/// Current Monochrome host index for round-robin failover.
int _monochromeHostIndex = 0;
String get _monochromeHost =>
    ApiConstants.monochromeHosts[_monochromeHostIndex];
void _nextMonochromeHost() {
  _monochromeHostIndex =
      (_monochromeHostIndex + 1) % ApiConstants.monochromeHosts.length;
}

/// Lazily initialized YouTube Explode client.
YoutubeExplode? _ytClient;
YoutubeExplode get _yt => _ytClient ??= YoutubeExplode();

/// Searches for tracks across multiple APIs with tiered fallback.
///
/// Tier order (matching the web app):
/// 1. **Deezer API** — best metadata & HD cover art
/// 2. **YouTube Music** via youtube_explode_dart
/// 3. **iTunes Search API**
/// 4. **Monochrome API** (Tidal proxy)
Future<List<Track>> searchTracks(String query) async {
  final cleanQuery = query.trim();
  if (cleanQuery.isEmpty) return [];

  // ─── YouTube link detection ───
  final ytVideoId = _extractYouTubeVideoId(cleanQuery);
  if (ytVideoId != null) {
    return _resolveYouTubeDirectLink(ytVideoId);
  }

  // ─── Tier 1: Deezer API ───
  try {
    final url = ApiConstants.deezerSearchTracks(cleanQuery);
    final response = await HttpClient.getJson(url, timeout: ApiConstants.searchTimeout);
    final items = (response?['data'] as List<dynamic>?) ?? [];
    if (items.isNotEmpty) {
      final tracks = items
          .map((item) => Track.fromDeezerJson(item as Map<String, dynamic>))
          .toList();
      Log.d(_tag, 'Deezer returned ${tracks.length} tracks');
      return tracks;
    }
  } catch (e) {
    Log.w(_tag, 'Deezer search failed, trying YouTube Music', e);
  }

  // ─── Tier 2: YouTube Music via youtube_explode_dart ───
  try {
    final searchList = await _yt.search.search(cleanQuery);
    final tracks = <Track>[];
    for (final result in searchList) {
      if (result is SearchVideo) {
        tracks.add(Track(
          id: result.id.value,
          title: result.title,
          artist: result.author,
          duration: result.duration?.inSeconds ?? 180,
          thumbnail: result.thumbnails.highResUrl,
          youtubeUrl: 'https://www.youtube.com/watch?v=${result.id.value}',
        ));
      }
      if (tracks.length >= 30) break;
    }
    if (tracks.isNotEmpty) {
      Log.d(_tag, 'YouTube Music returned ${tracks.length} tracks');
      return tracks;
    }
  } catch (e) {
    Log.w(_tag, 'YouTube Music search failed, trying iTunes', e);
  }

  // ─── Tier 3: iTunes Search API ───
  try {
    final url = ApiConstants.itunesSearch(cleanQuery);
    final response = await HttpClient.getJson(url, timeout: ApiConstants.searchTimeout);
    final results = (response?['results'] as List<dynamic>?) ?? [];
    if (results.isNotEmpty) {
      final tracks = results.map((r) {
        final item = r as Map<String, dynamic>;
        return Track(
          id: 'itunes-${item['trackId']}',
          title: item['trackName'] as String? ?? 'Unknown Title',
          artist: item['artistName'] as String? ?? 'Unknown Artist',
          artistId: item['artistId']?.toString(),
          albumName: item['collectionName'] as String?,
          albumId: item['collectionId']?.toString(),
          duration: ((item['trackTimeMillis'] as int?) ?? 180000) ~/ 1000,
          thumbnail: (item['artworkUrl100'] as String? ?? '')
              .replaceAll('100x100bb', '600x600bb'),
          audioUrl: item['previewUrl'] as String? ?? '',
          isExplicit: item['trackExplicitness'] == 'explicit',
        );
      }).toList();
      Log.d(_tag, 'iTunes returned ${tracks.length} tracks');
      return tracks;
    }
  } catch (e) {
    Log.w(_tag, 'iTunes search failed, trying Monochrome', e);
  }

  // ─── Tier 4: Monochrome API ───
  for (int retry = 0; retry < 2; retry++) {
    try {
      final url = '$_monochromeHost/search/?s=${Uri.encodeComponent(cleanQuery)}';
      final response = await HttpClient.getJson(url, timeout: const Duration(seconds: 3));
      final items = (response?['data']?['items'] as List<dynamic>?) ?? [];
      if (items.isNotEmpty) {
        final tracks = items.map((item) {
          final m = item as Map<String, dynamic>;
          final album = m['album'] as Map<String, dynamic>?;
          String coverUrl = ApiConstants.defaultPlaceholderImage;
          if (album?['cover'] != null) {
            final pathUuid = (album!['cover'] as String).replaceAll('-', '/');
            coverUrl = 'https://resources.tidal.com/images/$pathUuid/640x640.jpg';
          }
          final artists = (m['artists'] as List<dynamic>?)
              ?.map((a) => ArtistRef(
                    id: (a['id'] ?? '').toString(),
                    name: a['name'] as String? ?? '',
                  ))
              .toList();
          final artistName = artists?.isNotEmpty == true
              ? artists!.map((a) => a.name).join(', ')
              : (m['artist']?['name'] as String? ?? 'Unknown Artist');

          return Track(
            id: m['id'].toString(),
            title: m['title'] as String? ?? 'Unknown Title',
            artist: artistName,
            artistId: (m['artist']?['id'] ?? m['artists']?[0]?['id'] ?? '').toString(),
            artists: artists,
            albumName: album?['title'] as String? ?? '',
            albumId: album?['id']?.toString(),
            duration: m['duration'] as int? ?? 180,
            thumbnail: coverUrl,
          );
        }).toList();
        Log.d(_tag, 'Monochrome returned ${tracks.length} tracks');
        return tracks;
      }
    } catch (e) {
      Log.w(_tag, 'Monochrome host $_monochromeHost failed', e);
      _nextMonochromeHost();
    }
  }

  return [];
}

/// Searches for albums — Deezer primary, with basic fallback.
Future<List<Album>> searchAlbums(String query) async {
  final cleanQuery = query.trim();
  if (cleanQuery.isEmpty) return [];

  try {
    final url = ApiConstants.deezerSearchAlbums(cleanQuery);
    final response = await HttpClient.getJson(url, timeout: ApiConstants.searchTimeout);
    final items = (response?['data'] as List<dynamic>?) ?? [];
    return items
        .map((item) => Album.fromDeezerJson(item as Map<String, dynamic>))
        .toList();
  } catch (e) {
    Log.w(_tag, 'Album search failed', e);
    return [];
  }
}

/// Searches for artists — Deezer primary, with basic fallback.
Future<List<Artist>> searchArtists(String query) async {
  final cleanQuery = query.trim();
  if (cleanQuery.isEmpty) return [];

  try {
    final url = ApiConstants.deezerSearchArtists(cleanQuery);
    final response = await HttpClient.getJson(url, timeout: ApiConstants.searchTimeout);
    final items = (response?['data'] as List<dynamic>?) ?? [];
    return items
        .map((item) => Artist.fromDeezerJson(item as Map<String, dynamic>))
        .toList();
  } catch (e) {
    Log.w(_tag, 'Artist search failed', e);
    return [];
  }
}

/// Fetches all tracks from a Deezer album.
Future<List<Track>> getAlbumTracks(String albumId) async {
  try {
    final url = ApiConstants.deezerAlbumTracks(albumId);
    final response = await HttpClient.getJson(url);

    // Also fetch album info for cover art
    final albumInfo = await HttpClient.getJson(ApiConstants.deezerAlbumInfo(albumId));
    final albumCover = albumInfo?['cover_xl'] ??
        albumInfo?['cover_big'] ??
        albumInfo?['cover_medium'] ?? '';
    final albumTitle = albumInfo?['title'] as String? ?? '';

    final items = (response?['data'] as List<dynamic>?) ?? [];
    return items.map((item) {
      final m = item as Map<String, dynamic>;
      final artistMap = m['artist'] as Map<String, dynamic>?;
      return Track(
        id: m['id'].toString(),
        title: m['title'] as String? ?? 'Unknown Title',
        artist: artistMap?['name'] as String? ?? 'Unknown Artist',
        artistId: artistMap?['id']?.toString(),
        albumName: albumTitle,
        albumId: albumId,
        duration: m['duration'] as int? ?? 180,
        thumbnail: albumCover as String,
        audioUrl: m['preview'] as String? ?? '',
        isExplicit: m['explicit_lyrics'] as bool? ?? false,
      );
    }).toList();
  } catch (e) {
    Log.e(_tag, 'getAlbumTracks failed for $albumId', e);
    return [];
  }
}

/// Fetches top tracks for a Deezer artist.
Future<List<Track>> getArtistTracks(String artistId) async {
  try {
    final url = ApiConstants.deezerArtistTopTracks(artistId);
    final response = await HttpClient.getJson(url);
    final items = (response?['data'] as List<dynamic>?) ?? [];
    return items
        .map((item) => Track.fromDeezerJson(item as Map<String, dynamic>))
        .toList();
  } catch (e) {
    Log.e(_tag, 'getArtistTracks failed for $artistId', e);
    return [];
  }
}

// ─── Private Helpers ───

/// Extracts a YouTube video ID from a URL string, or returns null.
String? _extractYouTubeVideoId(String input) {
  final patterns = [
    RegExp(r'(?:youtu\.be/)([a-zA-Z0-9_-]{11})'),
    RegExp(
        r'(?:youtube\.com|music\.youtube\.com|m\.youtube\.com)/(?:watch\?(?:.*&)?v=|embed/|v/|shorts/|live/)([a-zA-Z0-9_-]{11})'),
    RegExp(r'[?&]v=([a-zA-Z0-9_-]{11})'),
  ];
  for (final pattern in patterns) {
    final match = pattern.firstMatch(input);
    if (match != null) return match.group(1);
  }
  return null;
}

/// Resolves a direct YouTube link into a single-element Track list.
Future<List<Track>> _resolveYouTubeDirectLink(String videoId) async {
  String title = 'YouTube Track';
  String artist = 'YouTube Channel';
  int duration = 180;
  String thumbnail = 'https://i.ytimg.com/vi/$videoId/hqdefault.jpg';

  try {
    final video = await _yt.videos.get(VideoId(videoId));
    title = video.title;
    artist = video.author;
    duration = video.duration?.inSeconds ?? 180;
    if (video.thumbnails.highResUrl.isNotEmpty) {
      thumbnail = video.thumbnails.highResUrl;
    }
  } catch (e) {
    Log.w(_tag, 'Failed to resolve YouTube video metadata', e);
  }

  return [
    Track(
      id: 'yt-$videoId',
      title: title,
      artist: artist,
      duration: duration,
      thumbnail: thumbnail,
      youtubeUrl: 'https://www.youtube.com/watch?v=$videoId',
    ),
  ];
}
