/// Data model for synced and plain lyrics from LRCLIB.
class LyricsData {
  /// LRC-formatted synced lyrics, e.g. "[00:12.34] Some words..."
  final String? syncedLyrics;

  /// Plain-text lyrics without timestamps.
  final String? plainLyrics;

  const LyricsData({this.syncedLyrics, this.plainLyrics});

  bool get hasSyncedLyrics =>
      syncedLyrics != null && syncedLyrics!.isNotEmpty;

  bool get hasLyrics =>
      hasSyncedLyrics ||
      (plainLyrics != null && plainLyrics!.isNotEmpty);

  /// The best available lyrics string.
  String? get bestLyrics => syncedLyrics ?? plainLyrics;
}
