import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/music_models.dart';
import '../theme/app_theme.dart';

class TrackCard extends StatelessWidget {
  final Track track;
  final VoidCallback onTap;
  final VoidCallback? onFavoriteToggle;
  final VoidCallback? onMoreOptions;

  const TrackCard({
    super.key,
    required this.track,
    required this.onTap,
    this.onFavoriteToggle,
    this.onMoreOptions,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: AppTheme.glassBoxDecoration(
        borderRadius: 12,
        color: Colors.white.withValues(alpha: 0.04),
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(12),
        child: ListTile(
          onTap: onTap,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          leading: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: CachedNetworkImage(
              imageUrl: track.coverUrl,
              width: 48,
              height: 48,
              fit: BoxFit.cover,
              errorWidget: (_, __, ___) => Container(
                color: Colors.white10,
                child: const Icon(LucideIcons.music, color: Colors.white70),
              ),
            ),
          ),
          title: Text(
            track.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 15,
              color: Colors.white,
            ),
          ),
          subtitle: Text(
            track.artist,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 13,
            ),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (onFavoriteToggle != null)
                IconButton(
                  icon: Icon(
                    track.isFavorite ? LucideIcons.heart : LucideIcons.heart,
                    color: track.isFavorite ? Colors.redAccent : Colors.white38,
                    size: 20,
                  ),
                  onPressed: onFavoriteToggle,
                ),
              if (onMoreOptions != null)
                IconButton(
                  icon: const Icon(LucideIcons.ellipsisVertical, color: Colors.white38, size: 20),
                  onPressed: onMoreOptions,
                ),
            ],
          ),
        ),
      ),
    );
  }
}
