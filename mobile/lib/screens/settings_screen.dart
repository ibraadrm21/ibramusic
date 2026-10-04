import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../providers/settings_provider.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Ajustes', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        children: [
          // Audio Section
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(
              'REPRODUCCIÓN Y AUDIO',
              style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
            ),
          ),
          SwitchListTile(
            title: const Text('Crossfade continuo'),
            subtitle: const Text('Mezcla el final de una pista con el inicio de la siguiente'),
            value: settings.crossfadeEnabled,
            activeColor: accent,
            onChanged: (val) =>
                ref.read(settingsProvider.notifier).setCrossfadeEnabled(val),
          ),
          if (settings.crossfadeEnabled) ...[
            ListTile(
              title: const Text('Duración del Crossfade'),
              subtitle: Text('${settings.crossfadeDuration} segundos'),
              trailing: SizedBox(
                width: 150,
                child: Slider(
                  value: settings.crossfadeDuration.toDouble(),
                  min: 1.0,
                  max: 12.0,
                  divisions: 11,
                  activeColor: accent,
                  onChanged: (val) =>
                      ref.read(settingsProvider.notifier).setCrossfadeDuration(val.toInt()),
                ),
              ),
            ),
          ],

          const Divider(),

          // Appearance Section
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(
              'APARIENCIA',
              style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
            ),
          ),
          RadioListTile<AppThemeMode>(
            title: const Text('Oscuro (Dark)'),
            value: AppThemeMode.dark,
            groupValue: settings.themeMode,
            activeColor: accent,
            onChanged: (mode) {
              if (mode != null) ref.read(settingsProvider.notifier).setTheme(mode);
            },
          ),
          RadioListTile<AppThemeMode>(
            title: const Text('Negro Puro (Noir / AMOLED)'),
            value: AppThemeMode.noir,
            groupValue: settings.themeMode,
            activeColor: accent,
            onChanged: (mode) {
              if (mode != null) ref.read(settingsProvider.notifier).setTheme(mode);
            },
          ),
          RadioListTile<AppThemeMode>(
            title: const Text('Claro (Bright)'),
            value: AppThemeMode.bright,
            groupValue: settings.themeMode,
            activeColor: accent,
            onChanged: (mode) {
              if (mode != null) ref.read(settingsProvider.notifier).setTheme(mode);
            },
          ),

          const Divider(),

          // About Section
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Text(
              'ACERCA DE',
              style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.2),
            ),
          ),
          const ListTile(
            leading: Icon(LucideIcons.sparkles),
            title: Text('IbraMusic Mobile'),
            subtitle: Text('Versión 1.2.0 • Audio Presolve++ Engine'),
          ),
        ],
      ),
    );
  }
}
