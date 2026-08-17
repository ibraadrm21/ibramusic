import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../theme/app_theme.dart';

class SettingsPanelWidget extends StatelessWidget {
  const SettingsPanelWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Settings",
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Colors.white),
          ),
          const SizedBox(height: 16),

          // Audio Quality Setting
          Container(
            decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
            child: ListTile(
              leading: const Icon(LucideIcons.sliders, color: Colors.white70),
              title: const Text("Audio Quality", style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              subtitle: const Text("High (320kbps YouTube Stream)", style: TextStyle(color: Colors.white54)),
              trailing: const Icon(LucideIcons.chevronRight, color: Colors.white38),
              onTap: () {},
            ),
          ),
          const SizedBox(height: 12),

          // Theme Settings
          Container(
            decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
            child: ListTile(
              leading: const Icon(LucideIcons.palette, color: Colors.white70),
              title: const Text("Theme Style", style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              subtitle: const Text("Dark Glassmorphism", style: TextStyle(color: Colors.white54)),
              trailing: const Icon(LucideIcons.chevronRight, color: Colors.white38),
              onTap: () {},
            ),
          ),
          const SizedBox(height: 12),

          // Account Sync
          Container(
            decoration: AppTheme.glassBoxDecoration(borderRadius: 16),
            child: ListTile(
              leading: const Icon(LucideIcons.user, color: Colors.white70),
              title: const Text("Cloud Account", style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              subtitle: const Text("Guest User (Tap to Sign In)", style: TextStyle(color: Colors.white54)),
              trailing: const Icon(LucideIcons.chevronRight, color: Colors.white38),
              onTap: () {},
            ),
          ),
        ],
      ),
    );
  }
}
