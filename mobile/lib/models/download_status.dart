/// Download state for a track.
enum DownloadState {
  notDownloaded,
  downloading,
  downloaded,
}

/// Download status snapshot for a single track.
class DownloadStatus {
  final DownloadState state;

  /// Progress from 0.0 to 1.0 (only meaningful when [state] is [DownloadState.downloading]).
  final double progress;

  /// Absolute local file path (only set when [state] is [DownloadState.downloaded]).
  final String? localPath;

  const DownloadStatus({
    this.state = DownloadState.notDownloaded,
    this.progress = 0.0,
    this.localPath,
  });

  bool get isDownloaded => state == DownloadState.downloaded;
  bool get isDownloading => state == DownloadState.downloading;
}
