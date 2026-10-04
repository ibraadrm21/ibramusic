import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../audio/queue_manager.dart';
import '../core/extensions/duration_ext.dart';
import '../providers/audio_provider.dart';
import '../providers/download_provider.dart';
import '../providers/library_provider.dart';

class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final audioState = ref.watch(audioStateProvider);
    final currentTrack = audioState.currentTrack;

    if (currentTrack == null) {
      return const Scaffold(body: Center(child: Text('No song playing')));
    }

    final theme = Theme.of(context);
    final accent = theme.colorScheme.primary;
    final library = ref.watch(libraryProvider);
    final isFav = library.favorites.any((t) => t.id == currentTrack.id);
    final downloadState = ref.watch(downloadProvider);
    final isDownloaded = downloadState.downloadedTracks.any((t) => t.id == currentTrack.id);

    final position = audioState.position;
    final duration = audioState.duration;
    final maxMs = duration.inMilliseconds.toDouble();
    final curMs = position.inMilliseconds.toDouble().clamp(0.0, maxMs > 0 ? maxMs : 1.0);

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.chevronDown),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Column(
          children: [
            Text(
              'REPRODUCIENDO',
              style: theme.textTheme.labelSmall?.copyWith(letterSpacing: 1.5, fontSize: 10),
            ),
            Text(
              currentTrack.albumName ?? 'IbraMusic',
              style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(LucideIcons.ellipsisVertical),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              // Artwork
              Hero(
                tag: 'track_art_${currentTrack.id}',
                child: Center(
                  child: Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.5),
                          blurRadius: 28,
                          offset: const Offset(0, 14),
                        ),
                      ],
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: CachedNetworkImage(
                        imageUrl: currentTrack.thumbnail,
                        width: MediaQuery.of(context).size.width * 0.75,
                        height: MediaQuery.of(context).size.width * 0.75,
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                ),
              ),

              // Title, Artist and Favorite
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          currentTrack.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          currentTrack.artist,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.textTheme.bodySmall?.color,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      isFav ? LucideIcons.heart : LucideIcons.heart,
                      color: isFav ? Colors.redAccent : theme.iconTheme.color,
                    ),
                    onPressed: () => ref.read(libraryProvider.notifier).toggleFavorite(currentTrack),
                  ),
                  IconButton(
                    icon: Icon(
                      isDownloaded ? LucideIcons.checkCircle2 : LucideIcons.download,
                      color: isDownloaded ? accent : theme.iconTheme.color,
                    ),
                    onPressed: () => ref.read(downloadProvider.notifier).download(currentTrack),
                  ),
                ],
              ),

              // Progress Bar
              Column(
                children: [
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                      trackHeight: 4,
                      activeTrackColor: accent,
                      inactiveTrackColor: theme.colorScheme.outline.withValues(alpha: 0.3),
                      thumbColor: accent,
                    ),
                    child: Slider(
                      value: curMs,
                      min: 0.0,
                      max: maxMs > 0 ? maxMs : 1.0,
                      onChanged: (val) {
                        ref.read(audioStateProvider.notifier).seek(Duration(milliseconds: val.toInt()));
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(position.formatted, style: theme.textTheme.bodySmall),
                        Text(duration.formatted, style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),

              // Controls: Shuffle, Previous, Play/Pause, Next, Repeat
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: Icon(
                      LucideIcons.shuffle,
                      color: audioState.isShuffle ? accent : theme.iconTheme.color?.withValues(alpha: 0.5),
                    ),
                    onPressed: () => ref.read(audioStateProvider.notifier).toggleShuffle(),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.skipBack, size: 32),
                    onPressed: () => ref.read(audioStateProvider.notifier).previous(),
                  ),
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: accent,
                    ),
                    child: IconButton(
                      icon: Icon(
                        audioState.isPlaying ? LucideIcons.pause : LucideIcons.play,
                        color: Colors.black,
                        size: 32,
                      ),
                      onPressed: () => ref.read(audioStateProvider.notifier).togglePlayPause(),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(LucideIcons.skipForward, size: 32),
                    onPressed: () => ref.read(audioStateProvider.notifier).next(),
                  ),
                  IconButton(
                    icon: Icon(
                      audioState.repeatMode == RepeatMode.one
                          ? LucideIcons.repeat1
                          : LucideIcons.repeat,
                      color: audioState.repeatMode != RepeatMode.off
                          ? accent
                          : theme.iconTheme.color?.withValues(alpha: 0.5),
                    ),
                    onPressed: () => ref.read(audioStateProvider.notifier).cycleRepeatMode(),
                  ),
                ],
              ),

              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
