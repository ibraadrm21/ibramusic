import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../providers/audio_provider.dart';
import '../providers/download_provider.dart';
import '../providers/library_provider.dart';
import '../widgets/track_tile.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key});

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final library = ref.watch(libraryProvider);
    final downloads = ref.watch(downloadProvider);
    final audio = ref.watch(audioStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tu Biblioteca', style: TextStyle(fontWeight: FontWeight.bold)),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: theme.colorScheme.primary,
          tabs: const [
            Tab(text: 'Favoritos'),
            Tab(text: 'Descargas'),
            Tab(text: 'Recientes'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Favoritos
          library.favorites.isEmpty
              ? _buildEmptyState(theme, 'Sin favoritos aún', 'Marca canciones con el corazón')
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 80),
                  itemCount: library.favorites.length,
                  itemBuilder: (context, index) {
                    final track = library.favorites[index];
                    return TrackTile(
                      track: track,
                      isPlaying: audio.currentTrack?.id == track.id && audio.isPlaying,
                      onTap: () {
                        ref.read(audioStateProvider.notifier).playQueue(
                              library.favorites,
                              initialIndex: index,
                            );
                      },
                    );
                  },
                ),

          // Descargas
          downloads.downloadedTracks.isEmpty
              ? _buildEmptyState(theme, 'Sin música descargada', 'Descarga canciones para oírlas sin conexión')
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 80),
                  itemCount: downloads.downloadedTracks.length,
                  itemBuilder: (context, index) {
                    final track = downloads.downloadedTracks[index];
                    return TrackTile(
                      track: track,
                      isPlaying: audio.currentTrack?.id == track.id && audio.isPlaying,
                      onTap: () {
                        ref.read(audioStateProvider.notifier).playQueue(
                              downloads.downloadedTracks,
                              initialIndex: index,
                            );
                      },
                    );
                  },
                ),

          // Recientes
          library.recentlyPlayed.isEmpty
              ? _buildEmptyState(theme, 'Sin historial', 'Las canciones que reproduzcas aparecerán aquí')
              : ListView.builder(
                  padding: const EdgeInsets.only(bottom: 80),
                  itemCount: library.recentlyPlayed.length,
                  itemBuilder: (context, index) {
                    final track = library.recentlyPlayed[index];
                    return TrackTile(
                      track: track,
                      isPlaying: audio.currentTrack?.id == track.id && audio.isPlaying,
                      onTap: () {
                        ref.read(audioStateProvider.notifier).playQueue(
                              library.recentlyPlayed,
                              initialIndex: index,
                            );
                      },
                    );
                  },
                ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(ThemeData theme, String title, String subtitle) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.folderHeart, size: 54, color: theme.colorScheme.outline),
          const SizedBox(height: 16),
          Text(title, style: theme.textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(subtitle, style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}
