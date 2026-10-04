import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

class SettingsState {
  final AppThemeMode themeMode;
  final bool crossfadeEnabled;
  final int crossfadeDuration;
  final double volume;

  const SettingsState({
    this.themeMode = AppThemeMode.dark,
    this.crossfadeEnabled = true,
    this.crossfadeDuration = 4,
    this.volume = 1.0,
  });

  SettingsState copyWith({
    AppThemeMode? themeMode,
    bool? crossfadeEnabled,
    int? crossfadeDuration,
    double? volume,
  }) {
    return SettingsState(
      themeMode: themeMode ?? this.themeMode,
      crossfadeEnabled: crossfadeEnabled ?? this.crossfadeEnabled,
      crossfadeDuration: crossfadeDuration ?? this.crossfadeDuration,
      volume: volume ?? this.volume,
    );
  }
}

class SettingsNotifier extends StateNotifier<SettingsState> {
  SettingsNotifier()
      : super(SettingsState(
          themeMode: _parseTheme(StorageService.themeMode),
          crossfadeEnabled: StorageService.crossfadeEnabled,
          crossfadeDuration: StorageService.crossfadeDuration,
          volume: StorageService.volume,
        ));

  static AppThemeMode _parseTheme(String val) {
    switch (val) {
      case 'noir':
        return AppThemeMode.noir;
      case 'bright':
        return AppThemeMode.bright;
      default:
        return AppThemeMode.dark;
    }
  }

  void setTheme(AppThemeMode mode) {
    String strMode = 'dark';
    if (mode == AppThemeMode.noir) strMode = 'noir';
    if (mode == AppThemeMode.bright) strMode = 'bright';
    StorageService.themeMode = strMode;
    state = state.copyWith(themeMode: mode);
  }

  void setCrossfadeEnabled(bool enabled) {
    StorageService.crossfadeEnabled = enabled;
    state = state.copyWith(crossfadeEnabled: enabled);
  }

  void setCrossfadeDuration(int seconds) {
    StorageService.crossfadeDuration = seconds;
    state = state.copyWith(crossfadeDuration: seconds);
  }

  void setVolume(double val) {
    StorageService.volume = val;
    state = state.copyWith(volume: val);
  }
}

final settingsProvider =
    StateNotifierProvider<SettingsNotifier, SettingsState>((ref) {
  return SettingsNotifier();
});
