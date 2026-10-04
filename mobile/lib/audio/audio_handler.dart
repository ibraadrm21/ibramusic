import 'package:audio_service/audio_service.dart';
import '../models/track.dart';
import 'audio_player_manager.dart';

/// Background audio handler that bridges [AudioPlayerManager] with OS notifications (Android MediaSession & iOS Control Center).
class IbraAudioHandler extends BaseAudioHandler with SeekHandler {
  final AudioPlayerManager _playerManager = AudioPlayerManager();

  IbraAudioHandler() {
    _listenToPlayerChanges();
  }

  void _listenToPlayerChanges() {
    _playerManager.currentTrackStream.listen((track) {
      if (track != null) {
        mediaItem.add(MediaItem(
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.albumName ?? 'IbraMusic',
          duration: Duration(seconds: track.duration),
          artUri: Uri.tryParse(track.thumbnail),
        ));
      } else {
        mediaItem.add(null);
      }
    });

    _playerManager.isPlayingStream.listen((playing) {
      _updatePlaybackState(playing);
    });

    _playerManager.positionStream.listen((pos) {
      _updatePlaybackState(_playerManager.isPlayingSubject.value, position: pos);
    });
  }

  void _updatePlaybackState(bool isPlaying, {Duration? position}) {
    playbackState.add(playbackState.value.copyWith(
      controls: [
        MediaControl.skipToPrevious,
        isPlaying ? MediaControl.pause : MediaControl.play,
        MediaControl.skipToNext,
        MediaControl.stop,
      ],
      systemActions: const {
        MediaAction.seek,
        MediaAction.seekForward,
        MediaAction.seekBackward,
      },
      androidCompactActionIndices: const [0, 1, 2],
      processingState: AudioProcessingState.ready,
      playing: isPlaying,
      updatePosition: position ?? playbackState.value.position,
    ));
  }

  @override
  Future<void> play() async => await _playerManager.play();

  @override
  Future<void> pause() async => await _playerManager.pause();

  @override
  Future<void> stop() async => await _playerManager.pause();

  @override
  Future<void> skipToNext() async => await _playerManager.next();

  @override
  Future<void> skipToPrevious() async => await _playerManager.previous();

  @override
  Future<void> seek(Duration position) async => await _playerManager.seek(position);
}
