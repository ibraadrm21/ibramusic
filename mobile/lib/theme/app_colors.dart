import 'package:flutter/material.dart';

/// All color palettes for the three app themes (dark, noir, bright).
/// These match the web app's CSS variables.
class AppColors {
  AppColors._();

  // ───────────────── Dark Theme ─────────────────
  static const darkBackground = Color(0xFF09090B);
  static const darkSurface = Color(0xFF121214);
  static const darkSurfaceVariant = Color(0xFF1A1A1E);
  static const darkBorder = Color(0xFF27272A);
  static const darkAccent = Color(0xFF1DB954);
  static const darkTextPrimary = Color(0xFFFFFFFF);
  static const darkTextSecondary = Color(0xFFA1A1AA);
  static const darkTextTertiary = Color(0xFF71717A);

  // ───────────────── Noir Theme ─────────────────
  static const noirBackground = Color(0xFF000000);
  static const noirSurface = Color(0xFF0A0A0A);
  static const noirSurfaceVariant = Color(0xFF141414);
  static const noirBorder = Color(0xFF1F1F1F);
  static const noirAccent = Color(0xFFFFFFFF);
  static const noirTextPrimary = Color(0xFFFFFFFF);
  static const noirTextSecondary = Color(0xFF999999);
  static const noirTextTertiary = Color(0xFF666666);

  // ───────────────── Bright Theme ─────────────────
  static const brightBackground = Color(0xFFF5F5F7);
  static const brightSurface = Color(0xFFFFFFFF);
  static const brightSurfaceVariant = Color(0xFFE8E8EC);
  static const brightBorder = Color(0xFFD4D4D8);
  static const brightAccent = Color(0xFF1DB954);
  static const brightTextPrimary = Color(0xFF09090B);
  static const brightTextSecondary = Color(0xFF52525B);
  static const brightTextTertiary = Color(0xFF71717A);

  // ───────────────── Shared ─────────────────
  static const error = Color(0xFFEF4444);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const explicit = Color(0xFFEF4444);
}
