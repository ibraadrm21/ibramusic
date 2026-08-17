import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_theme.dart';

class StatsPanelWidget extends StatelessWidget {
  const StatsPanelWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Banner
          Container(
            padding: const EdgeInsets.all(20),
            decoration: AppTheme.glassBoxDecoration(
              borderRadius: 20,
              color: AppTheme.accentPurple.withValues(alpha: 0.15),
            ),
            child: const Row(
              children: [
                Icon(LucideIcons.trophy, color: Colors.amber, size: 36),
                SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Listening Stats & Leaderboard",
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    SizedBox(height: 4),
                    Text(
                      "Track your top songs, artists & monthly rank",
                      style: TextStyle(color: Colors.white60, fontSize: 13),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Overview Cards Grid
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
                  child: const Column(
                    children: [
                      Icon(LucideIcons.clock, color: Colors.purpleAccent, size: 28),
                      SizedBox(height: 8),
                      Text("0 mins", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                      Text("Total Time", style: TextStyle(color: Colors.white54, fontSize: 12)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
                  child: const Column(
                    children: [
                      Icon(LucideIcons.music, color: Colors.pinkAccent, size: 28),
                      SizedBox(height: 8),
                      Text("0", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
                      Text("Total Plays", style: TextStyle(color: Colors.white54, fontSize: 12)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          const Text(
            "Monthly Leaderboard",
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 12),

          Container(
            padding: const EdgeInsets.all(24),
            decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
            child: const Center(
              child: Text(
                "Sign in to compete in the monthly community leaderboard!",
                style: TextStyle(color: Colors.white54),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
