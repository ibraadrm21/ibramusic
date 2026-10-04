import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';

/// The three supported visual themes.
enum AppThemeMode { dark, noir, bright }

/// Builds a full [ThemeData] for the given [AppThemeMode].
class AppTheme {
  AppTheme._();

  static ThemeData build(AppThemeMode mode) {
    switch (mode) {
      case AppThemeMode.dark:
        return _buildTheme(
          brightness: Brightness.dark,
          background: AppColors.darkBackground,
          surface: AppColors.darkSurface,
          surfaceVariant: AppColors.darkSurfaceVariant,
          border: AppColors.darkBorder,
          accent: AppColors.darkAccent,
          textPrimary: AppColors.darkTextPrimary,
          textSecondary: AppColors.darkTextSecondary,
          statusBarBrightness: Brightness.light,
        );
      case AppThemeMode.noir:
        return _buildTheme(
          brightness: Brightness.dark,
          background: AppColors.noirBackground,
          surface: AppColors.noirSurface,
          surfaceVariant: AppColors.noirSurfaceVariant,
          border: AppColors.noirBorder,
          accent: AppColors.noirAccent,
          textPrimary: AppColors.noirTextPrimary,
          textSecondary: AppColors.noirTextSecondary,
          statusBarBrightness: Brightness.light,
        );
      case AppThemeMode.bright:
        return _buildTheme(
          brightness: Brightness.light,
          background: AppColors.brightBackground,
          surface: AppColors.brightSurface,
          surfaceVariant: AppColors.brightSurfaceVariant,
          border: AppColors.brightBorder,
          accent: AppColors.brightAccent,
          textPrimary: AppColors.brightTextPrimary,
          textSecondary: AppColors.brightTextSecondary,
          statusBarBrightness: Brightness.dark,
        );
    }
  }

  static ThemeData _buildTheme({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color surfaceVariant,
    required Color border,
    required Color accent,
    required Color textPrimary,
    required Color textSecondary,
    required Brightness statusBarBrightness,
  }) {
    return ThemeData(
      brightness: brightness,
      scaffoldBackgroundColor: background,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: accent,
        onPrimary: brightness == Brightness.dark ? Colors.black : Colors.white,
        secondary: accent,
        onSecondary: brightness == Brightness.dark ? Colors.black : Colors.white,
        error: AppColors.error,
        onError: Colors.white,
        surface: surface,
        onSurface: textPrimary,
        surfaceContainerHighest: surfaceVariant,
        outline: border,
      ),
      cardColor: surface,
      dividerColor: border,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarBrightness: statusBarBrightness,
          statusBarIconBrightness: statusBarBrightness == Brightness.dark
              ? Brightness.dark
              : Brightness.light,
          systemNavigationBarColor: background,
        ),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surface,
        selectedItemColor: accent,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      iconTheme: IconThemeData(color: textPrimary, size: 24),
      textTheme: TextTheme(
        headlineLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
        headlineMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
        headlineSmall: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(color: textPrimary),
        bodyMedium: TextStyle(color: textPrimary),
        bodySmall: TextStyle(color: textSecondary),
        labelLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w600),
        labelMedium: TextStyle(color: textSecondary),
        labelSmall: TextStyle(color: textSecondary),
      ),
      splashColor: accent.withValues(alpha: 0.1),
      highlightColor: accent.withValues(alpha: 0.05),
    );
  }
}
