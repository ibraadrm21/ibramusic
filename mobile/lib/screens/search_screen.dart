import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../providers/audio_provider.dart';
import '../providers/search_provider.dart';
import '../widgets/track_tile.dart';

class SearchScreen extends ConsumerWidget {
  const SearchScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final searchState = ref.watch(searchProvider);
    final audioState = ref.watch(audioStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          autofocus: false,
          decoration: InputDecoration(
            hintText: 'Buscar canciones, artistas o álbumes...',
            hintStyle: theme.textTheme.bodyMedium?.copyWith(
              color: theme.textTheme.bodySmall?.color,
            ),
            border: InputBorder.none,
            prefixIcon: const Icon(LucideIcons.search, size: 20),
          ),
          onChanged: (text) => ref.read(searchProvider.notifier).onQueryChanged(text),
        ),
      ),
      body: Builder(
        builder: (context) {
          if (searchState.isLoading) {
            return const Center(child: CircularProgressIndicator());
          }

          if (searchState.error != null) {
            return Center(
              child: Text(
                searchState.error!,
                style: const TextStyle(color: Colors.redAccent),
              ),
            );
          }

          if (searchState.query.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(LucideIcons.music, size: 64, color: theme.colorScheme.outline),
                  const SizedBox(height: 16),
                  Text(
                    'Encuentra tu música favorita',
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Busca por título, artista o enlace de YouTube',
                    style: theme.textTheme.bodySmall,
                  ),
                ],
              ),
            );
          }

          if (searchState.tracks.isEmpty) {
            return const Center(child: Text('No se encontraron resultados'));
          }

          return ListView.builder(
            padding: const EdgeInsets.only(bottom: 80),
            itemCount: searchState.tracks.length,
            itemBuilder: (context, index) {
              final track = searchState.tracks[index];
              final isCurrent = audioState.currentTrack?.id == track.id;

              return TrackTile(
                track: track,
                isPlaying: isCurrent && audioState.isPlaying,
                onTap: () {
                  ref.read(audioStateProvider.notifier).playQueue(
                        searchState.tracks,
                        initialIndex: index,
                      );
                },
              );
            },
          );
        },
      ),
    );
  }
}
