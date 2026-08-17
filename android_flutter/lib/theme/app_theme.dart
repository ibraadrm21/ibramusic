import 'package:flutter/material.dart';

class AppTheme {
  static const Color darkBackground = Color(0xFF0F0F1A);
  static const Color cardSurface = Color(0xFF161626);
  static const Color playerSurface = Color(0xFF1E1E30);
  static const Color accentPurple = Color(0xFF8B5CF6);
  static const Color accentPink = Color(0xFFEC4899);

  static BoxDecoration glassBoxDecoration({
    double borderRadius = 16.0,
    Color? color,
    Color? borderColor,
  }) {
    return BoxDecoration(
      color: color ?? Colors.white.withOpacity(0.06),
      borderRadius: BorderRadius.circular(borderRadius),
      border: Border.all(
        color: borderColor ?? Colors.white.withOpacity(0.12),
        width: 1.0,
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.25),
          blurRadius: 16,
          offset: const Offset(0, 4),
        ),
      ],
    );
  }

  static RadialGradient backgroundGradient = const RadialGradient(
    center: Alignment(-0.7, -0.7),
    radius: 1.4,
    colors: [
      Color(0xFF231638),
      Color(0xFF0F0F1A),
    ],
  );
}
