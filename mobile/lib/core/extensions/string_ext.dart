/// String utilities for cleaning track titles and building search queries.
extension StringCleanExt on String {
  /// Removes "(feat. ...)", "[feat. ...]", "(with ...)" and other parenthesized
  /// noise from track titles, matching the web app's cleaning logic.
  String get cleanTitle => this
      .replaceAll(RegExp(r'\(feat\..*?\)', caseSensitive: false), '')
      .replaceAll(RegExp(r'\[feat\..*?\]', caseSensitive: false), '')
      .replaceAll(RegExp(r'\(with.*?\)', caseSensitive: false), '')
      .replaceAll(RegExp(r'\(.*?\)'), '')
      .trim();

  /// Truncates a string to [maxLength] and appends "..." if needed.
  String truncate(int maxLength) {
    if (length <= maxLength) return this;
    return '${substring(0, maxLength)}...';
  }
}
