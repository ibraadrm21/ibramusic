import 'dart:io';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';

import '../core/logger.dart';
import '../models/download_status.dart';
import '../models/track.dart';
import 'stream_resolver_service.dart';
import 'video_id_resolver_service.dart';
import 'storage_service.dart';

const _tag = 'DownloadService';

/// Callbacks for progress tracking
typedef ProgressCallback = void Function(double progress);

/// Service for downloading tracks locally for offline playback.
///
/// Features:
/// - Resolves track -> videoId -> audio stream URL
/// - Downloads audio chunk-by-chunk to the app documents directory
/// - Updates local Hive metadata registry in [StorageService]
/// - Provides progress callbacks and cancel tokens
class DownloadService {
  DownloadService._();

  static final Map<String, CancelToken> _activeDownloads = {};
  static final Map<String, double> _downloadProgress = {};

  /// Current progress for in-flight download (0.0 to 1.0).
  static double getProgress(String trackId) => _downloadProgress[trackId] ?? 0.0;

  /// Check if a track download is currently in progress.
  static bool isDownloading(String trackId) => _activeDownloads.containsKey(trackId);

  /// Downloads [track] to local storage.
  /// Throws an exception if stream resolution or network download fails.
  static Future<String> downloadTrack(
    Track track, {
    ProgressCallback? onProgress,
  }) async {
    if (StorageService.isDownloaded(track.id)) {
      final existingPath = StorageService.getDownloadPath(track.id);
      if (existingPath != null && File(existingPath).existsSync()) {
        Log.d(_tag, 'Track ${track.title} already downloaded at $existingPath');
        return existingPath;
      }
    }

    if (isDownloading(track.id)) {
      Log.w(_tag, 'Download already running for ${track.id}');
      throw StateError('Download already in progress');
    }

    final cancelToken = CancelToken();
    _activeDownloads[track.id] = cancelToken;
    _downloadProgress[track.id] = 0.0;

    try {
      Log.d(_tag, 'Resolving audio stream for download: ${track.title}...');
      final videoId = await resolveVideoId(track);
      final streamUrl = await resolveAudioStream(videoId);

      final appDocDir = await getApplicationDocumentsDirectory();
      final musicDir = Directory('${appDocDir.path}/offline_music');
      if (!musicDir.existsSync()) {
        await musicDir.create(recursive: true);
      }

      // Default extension is .m4a
      final filePath = '${musicDir.path}/${track.id}.m4a';
      final dio = Dio();

      Log.d(_tag, 'Starting file download to $filePath');
      await dio.download(
        streamUrl,
        filePath,
        cancelToken: cancelToken,
        onReceiveProgress: (received, total) {
          if (total > 0) {
            final progress = (received / total).clamp(0.0, 1.0);
            _downloadProgress[track.id] = progress;
            onProgress?.call(progress);
          }
        },
      );

      // Verify file exists and has size
      final downloadedFile = File(filePath);
      if (!downloadedFile.existsSync() || downloadedFile.lengthSync() == 0) {
        throw StateError('Downloaded audio file is missing or empty');
      }

      // Save registry entry to Hive
      await StorageService.saveDownloadedTrack(track, filePath);
      Log.d(_tag, 'Successfully downloaded ${track.title} -> $filePath');

      return filePath;
    } catch (e, stack) {
      Log.e(_tag, 'Failed to download ${track.title}', e, stack);
      // Clean up partial file
      try {
        final appDocDir = await getApplicationDocumentsDirectory();
        final partial = File('${appDocDir.path}/offline_music/${track.id}.m4a');
        if (partial.existsSync()) {
          await partial.delete();
        }
      } catch (_) {}
      rethrow;
    } finally {
      _activeDownloads.remove(track.id);
      _downloadProgress.remove(track.id);
    }
  }

  /// Cancels an active download.
  static void cancelDownload(String trackId) {
    if (_activeDownloads.containsKey(trackId)) {
      _activeDownloads[trackId]?.cancel('Cancelled by user');
      _activeDownloads.remove(trackId);
      _downloadProgress.remove(trackId);
      Log.d(_tag, 'Download cancelled for $trackId');
    }
  }

  /// Removes a downloaded track from storage and disk.
  static Future<void> deleteDownload(String trackId) async {
    final localPath = StorageService.getDownloadPath(trackId);
    if (localPath != null) {
      final file = File(localPath);
      if (file.existsSync()) {
        try {
          await file.delete();
          Log.d(_tag, 'Deleted local file $localPath');
        } catch (e) {
          Log.w(_tag, 'Failed to delete file on disk $localPath', e);
        }
      }
    }
    await StorageService.removeDownloadedTrack(trackId);
  }

  /// Returns total space used by offline downloads in bytes.
  static Future<int> getOfflineStorageBytes() async {
    try {
      final appDocDir = await getApplicationDocumentsDirectory();
      final musicDir = Directory('${appDocDir.path}/offline_music');
      if (!musicDir.existsSync()) return 0;

      int total = 0;
      await for (final entity in musicDir.list(recursive: true, followLinks: false)) {
        if (entity is File) {
          total += await entity.length();
        }
      }
      return total;
    } catch (e) {
      Log.w(_tag, 'Error calculating storage size', e);
      return 0;
    }
  }
}
