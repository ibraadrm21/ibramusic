/// Custom exception types for consistent error handling across the app.

class StreamResolutionException implements Exception {
  final String message;
  const StreamResolutionException(this.message);
  @override
  String toString() => 'StreamResolutionException: $message';
}

class VideoIdResolutionException implements Exception {
  final String message;
  const VideoIdResolutionException(this.message);
  @override
  String toString() => 'VideoIdResolutionException: $message';
}

class SearchException implements Exception {
  final String message;
  const SearchException(this.message);
  @override
  String toString() => 'SearchException: $message';
}

class LyricsNotFoundException implements Exception {
  final String message;
  const LyricsNotFoundException([this.message = 'Lyrics not found']);
  @override
  String toString() => 'LyricsNotFoundException: $message';
}

class SyncException implements Exception {
  final String message;
  const SyncException(this.message);
  @override
  String toString() => 'SyncException: $message';
}

class DownloadException implements Exception {
  final String message;
  const DownloadException(this.message);
  @override
  String toString() => 'DownloadException: $message';
}
