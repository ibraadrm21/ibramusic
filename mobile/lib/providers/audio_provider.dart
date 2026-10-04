import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../audio/audio_player_manager.dart';
import '../audio/queue_manager.dart';
import '../models/track.dart';

final audioPlayerManagerProvider = Provider<AudioPlayerManager>((ref) {
  return AudioPlayerManager();
});

class AudioPlaybackState {
  final Track? currentTrack;
  final bool isPlaying;
  final Duration position;
  final Duration duration;
  final bool isShuffle;
  final RepeatMode repeatMode;

  const AudioPlaybackState({
    this.currentTrack,
    this.isPlaying = false,
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.isShuffle = false,
    this.repeatMode = RepeatMode.off,
  });

  AudioPlaybackState copyWith({
    Track? currentTrack,
    bool? isPlaying,
    Duration? position,
    Duration? duration,
    bool? isShuffle,
    RepeatMode? repeatMode,
  }) {
    return AudioPlaybackState(
      currentTrack: currentTrack ?? this.currentTrack,
      isPlaying: isPlaying ?? this.isPlaying,
      position: position ?? this.position,
      duration: duration ?? this.duration,
      isShuffle: isShuffle ?? this.isShuffle,
      repeatMode: repeatMode ?? this.repeatMode,
    );
  }
}

class AudioNotifier extends StateNotifier<AudioPlaybackState> {
  final AudioPlayerManager _manager;

  AudioNotifier(this._manager) : super(const AudioPlaybackState()) {
    _manager.currentTrackStream.listen((track) {
      state = state.copyWith(currentTrack: track);
    });
    _manager.isPlayingStream.listen((playing) {
      state = state.copyWith(isPlaying: playing);
    });
    _manager.positionStream.listen((pos) {
      state = state.copyWith(position: pos);
    });
    _manager.durationStream.listen((dur) {
      state = state.copyWith(duration: dur);
    });
  }

  Future<void> playTrack(Track track) => _manager.playTrack(track);
  Future<void> playQueue(List<Track> tracks, {int initialIndex = 0}) =>
      _manager.playQueue(tracks, initialIndex: initialIndex);
  Future<void> togglePlayPause() => _manager.togglePlayPause();
  Future<void> next() => _manager.next();
  Future<void> previous() => _manager.previous();
  Future<void> seek(Duration pos) => _manager.seek(pos);

  void toggleShuffle() {
    final shuffle = _manager.queue.toggleShuffle();
    state = state.copyWith(isShuffle: shuffle);
  }

  void cycleRepeatMode() {
    final mode = _manager.queue.cycleRepeatMode();
    state = state.copyWith(repeatMode: mode);
  }
}

final audioStateProvider =
    StateNotifierProvider<AudioNotifier, AudioPlaybackState>((ref) {
  final manager = ref.watch(audioPlayerManagerProvider);
  return AudioNotifier(manager);
});
