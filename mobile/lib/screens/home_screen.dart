import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../models/track.dart';
import '../providers/audio_provider.dart';
import '../providers/library_provider.dart';
import '../services/recommendation_service.dart';
import '../widgets/track_tile.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  List<Track> _recommendations = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchRecommendations();
  }

  Future<void> _fetchRecommendations() async {
    final library = ref.read(libraryProvider);
    final audio = ref.read(audioStateProvider);

    try {
      final recs = await RecommendationService.getRecommendations(
        favorites: library.favorites,
        recentlyPlayed: library.recentlyPlayed,
        currentTrack: audio.currentTrack,
        limit: 20,
      );
      if (mounted) {
        setState(() {
          _recommendations = recs;
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final audio = ref.watch(audioStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(LucideIcons.sparkles, color: theme.colorScheme.primary, size: 22),
            const SizedBox(width: 8),
            const Text(
              'IbraMusic',
              style: TextStyle(fontWeight: FontWeight.w800, letterSpacing: -0.5),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.refreshCw, size: 18),
            onPressed: () {
              setState(() => _isLoading = true);
              _fetchRecommendations();
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _fetchRecommendations,
              child: ListView(
                padding: const EdgeInsets.only(bottom: 90),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                    child: Text(
                      'Recomendado para ti',
                      style: theme.textTheme.headlineSmall,
                    ),
                  ),
                  if (_recommendations.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No hay recomendaciones disponibles aún'),
                    )
                  else
                    ..._recommendations.asMap().entries.map((entry) {
                      final index = entry.key;
                      final track = entry.value;
                      return TrackTile(
                        track: track,
                        isPlaying: audio.currentTrack?.id == track.id && audio.isPlaying,
                        onTap: () {
                          ref.read(audioStateProvider.notifier).playQueue(
                                _recommendations,
                                initialIndex: index,
                              );
                        },
                      );
                    }),
                ],
              ),
            ),
    );
  }
}
