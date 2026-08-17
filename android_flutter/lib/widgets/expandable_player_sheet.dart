import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'dart:ui';
import '../models/music_models.dart';
import '../theme/app_theme.dart';

class ExpandablePlayerSheet extends StatefulWidget {
  final Track currentTrack;
  final bool isPlaying;
  final Duration position;
  final Duration duration;
  final VoidCallback onPlayPause;
  final VoidCallback onSkipNext;
  final VoidCallback onSkipPrevious;
  final ValueChanged<Duration> onSeek;
  final VoidCallback onToggleFavorite;

  const ExpandablePlayerSheet({
    super.key,
    required this.currentTrack,
    required this.isPlaying,
    required this.position,
    required this.duration,
    required this.onPlayPause,
    required this.onSkipNext,
    required this.onSkipPrevious,
    required this.onSeek,
    required this.onToggleFavorite,
  });

  @override
  State<ExpandablePlayerSheet> createState() => _ExpandablePlayerSheetState();
}

class _ExpandablePlayerSheetState extends State<ExpandablePlayerSheet> {
  bool _showLyrics = false;

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return "$minutes:$seconds";
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.9,
      decoration: BoxDecoration(
        color: AppTheme.darkBackground.withOpacity(0.96),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
      ),
      child: Stack(
        children: [
          // Background Glow
          Positioned(
            top: -100,
            left: 50,
            right: 50,
            height: 300,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.accentPurple.withOpacity(0.35),
              ),
              child: BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
                child: Container(),
              ),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
              child: Column(
                children: [
                  // Handle Bar & Header
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: const Icon(LucideIcons.chevronDown, color: Colors.white70),
                        onPressed: () => Navigator.pop(context),
                      ),
                      Text(
                        _showLyrics ? "LYRICS" : "PLAYING FROM SEARCH",
                        style: const TextStyle(
                          color: Colors.white54,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2,
                        ),
                      ),
                      IconButton(
                        icon: Icon(
                          _showLyrics ? LucideIcons.disc : LucideIcons.mic,
                          color: _showLyrics ? AppTheme.accentPink : Colors.white70,
                        ),
                        onPressed: () => setState(() => _showLyrics = !_showLyrics),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Cover Art or Lyrics View
                  Expanded(
                    child: _showLyrics
                        ? Container(
                            alignment: Alignment.center,
                            padding: const EdgeInsets.all(24),
                            decoration: AppTheme.glassBoxDecoration(borderRadius: 24),
                            child: const SingleChildScrollView(
                              child: Text(
                                "♪ Music lyrics display feature...\n\nTap mic button to return to track view",
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 18,
                                  height: 1.6,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          )
                        : Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(24),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.5),
                                  blurRadius: 30,
                                  offset: const Offset(0, 12),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(24),
                              child: Image.network(
                                widget.currentTrack.coverUrl,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  color: Colors.white10,
                                  child: const Icon(LucideIcons.music, size: 80, color: Colors.white38),
                                ),
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(height: 32),

                  // Track Info Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.currentTrack.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 22,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              widget.currentTrack.artist,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white60,
                                fontSize: 16,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Icon(
                          widget.currentTrack.isFavorite ? LucideIcons.heart : LucideIcons.heart,
                          color: widget.currentTrack.isFavorite ? Colors.redAccent : Colors.white54,
                          size: 28,
                        ),
                        onPressed: widget.onToggleFavorite,
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Audio Scrubber / Slider
                  Column(
                    children: [
                      SliderTheme(
                        data: SliderThemeData(
                          trackHeight: 4,
                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                          overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                          activeTrackColor: Colors.white,
                          inactiveTrackColor: Colors.white24,
                          thumbColor: Colors.white,
                        ),
                        child: Slider(
                          value: widget.position.inSeconds.toDouble().clamp(0.0, widget.duration.inSeconds.toDouble()),
                          max: widget.duration.inSeconds > 0 ? widget.duration.inSeconds.toDouble() : 1.0,
                          onChanged: (val) => widget.onSeek(Duration(seconds: val.toInt())),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(_formatDuration(widget.position), style: const TextStyle(color: Colors.white38, fontSize: 12)),
                            Text(_formatDuration(widget.duration), style: const TextStyle(color: Colors.white38, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Media Controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      IconButton(
                        icon: const Icon(LucideIcons.shuffle, color: Colors.white38),
                        onPressed: () {},
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.skipBack, color: Colors.white, size: 36),
                        onPressed: widget.onSkipPrevious,
                      ),
                      Container(
                        width: 64,
                        height: 64,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                        ),
                        child: IconButton(
                          icon: Icon(
                            widget.isPlaying ? LucideIcons.pause : LucideIcons.play,
                            color: Colors.black,
                            size: 32,
                          ),
                          onPressed: widget.onPlayPause,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.skipForward, color: Colors.white, size: 36),
                        onPressed: widget.onSkipNext,
                      ),
                      IconButton(
                        icon: const Icon(LucideIcons.repeat, color: Colors.white38),
                        onPressed: () {},
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
