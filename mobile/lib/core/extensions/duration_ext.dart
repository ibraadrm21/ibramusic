/// Extension on [Duration] for human-readable formatting.
extension DurationExt on Duration {
  /// Formats a Duration as "m:ss" (e.g. "3:07") or "h:mm:ss" if ≥ 1 hour.
  String get formatted {
    final hours = inHours;
    final minutes = inMinutes.remainder(60);
    final seconds = inSeconds.remainder(60);
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }
}

/// Converts seconds (int) to a formatted string.
extension IntDurationExt on int {
  String get asTrackDuration => Duration(seconds: this).formatted;
}
