import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/track.dart';
import '../services/download_service.dart';
import '../services/storage_service.dart';

class DownloadStateModel {
  final List<Track> downloadedTracks;
  final Map<String, double> activeProgress; // trackId -> 0.0..1.0

  const DownloadStateModel({
    this.downloadedTracks = const [],
    this.activeProgress = const {},
  });

  DownloadStateModel copyWith({
    List<Track>? downloadedTracks,
    Map<String, double>? activeProgress,
  }) {
    return DownloadStateModel(
      downloadedTracks: downloadedTracks ?? this.downloadedTracks,
      activeProgress: activeProgress ?? this.activeProgress,
    );
  }
}

class DownloadNotifier extends StateNotifier<DownloadStateModel> {
  DownloadNotifier() : super(const DownloadStateModel()) {
    refresh();
  }

  void refresh() {
    state = state.copyWith(
      downloadedTracks: StorageService.getDownloadedTracks(),
    );
  }

  bool isDownloaded(String trackId) => StorageService.isDownloaded(trackId);
  bool isDownloading(String trackId) => state.activeProgress.containsKey(trackId);

  Future<void> download(Track track) async {
    if (isDownloaded(track.id) || isDownloading(track.id)) return;

    final updated = Map<String, double>.from(state.activeProgress);
    updated[track.id] = 0.0;
    state = state.copyWith(activeProgress: updated);

    try {
      await DownloadService.downloadTrack(
        track,
        onProgress: (p) {
          final current = Map<String, double>.from(state.activeProgress);
          current[track.id] = p;
          state = state.copyWith(activeProgress: current);
        },
      );
    } finally {
      final current = Map<String, double>.from(state.activeProgress);
      current.remove(track.id);
      state = state.copyWith(
        activeProgress: current,
        downloadedTracks: StorageService.getDownloadedTracks(),
      );
    }
  }

  Future<void> remove(String trackId) async {
    await DownloadService.deleteDownload(trackId);
    refresh();
  }
}

final downloadProvider =
    StateNotifierProvider<DownloadNotifier, DownloadStateModel>((ref) {
  return DownloadNotifier();
});
