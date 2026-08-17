import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import 'youtube_service.dart';

/// Background Audio Handler powered by just_audio & audio_service (Harmony-Music Architecture)
class HarmonyAudioHandler extends BaseAudioHandler with QueueHandler, SeekHandler {
  final _player = AudioPlayer();
  final List<TrackModel> _playlist = [];
  int _currentIndex = -1;

  HarmonyAudioHandler() {
    _initPlayerListeners();
  }

  void _initPlayerListeners() {
    _player.playbackEventStream.listen((PlaybackEvent event) {
      final playing = _player.playing;
      playbackState.add(playbackState.value.copyWith(
        controls: [
          MediaControl.skipToPrevious,
          if (playing) MediaControl.pause else MediaControl.play,
          MediaControl.skipToNext,
          MediaControl.stop,
        ],
        systemActions: const {
          MediaAction.seek,
          MediaAction.seekForward,
          MediaAction.seekBackward,
        },
        androidCompactActionIndices: const [0, 1, 2],
        processingState: const {
          ProcessingState.idle: AudioProcessingState.idle,
          ProcessingState.loading: AudioProcessingState.loading,
          ProcessingState.buffering: AudioProcessingState.buffering,
          ProcessingState.ready: AudioProcessingState.ready,
          ProcessingState.completed: AudioProcessingState.completed,
        }[_player.processingState]!,
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: event.currentIndex,
      ));
    });

    _player.processingStateStream.listen((state) {
      if (state == ProcessingState.completed) {
        skipToNext();
      }
    });
  }

  Future<void> playTrack(TrackModel track, {List<TrackModel>? queue}) async {
    if (queue != null && queue.isNotEmpty) {
      _playlist.clear();
      _playlist.addAll(queue);
      this.queue.add(_playlist.map((t) => MediaItem(
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            artUri: Uri.tryParse(t.coverUrl),
            duration: t.duration,
          )).toList());
    }

    _currentIndex = _playlist.indexWhere((t) => t.id == track.id);
    if (_currentIndex == -1) {
      _playlist.add(track);
      _currentIndex = _playlist.length - 1;
    }

    mediaItem.add(MediaItem(
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artUri: Uri.tryParse(track.coverUrl),
      duration: track.duration,
    ));

    final streamUrl = await YouTubeAudioExtractor.getAudioStreamUrl(track.id);
    if (streamUrl != null) {
      await _player.setUrl(streamUrl);
      await _player.play();
    }
  }

  @override
  Future<void> play() => _player.play();

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> seek(Duration position) => _player.seek(position);

  @override
  Future<void> stop() async {
    await _player.stop();
    await super.stop();
  }

  @override
  Future<void> skipToNext() async {
    if (_playlist.isEmpty || _currentIndex >= _playlist.length - 1) return;
    _currentIndex++;
    await playTrack(_playlist[_currentIndex]);
  }

  @override
  Future<void> skipToPrevious() async {
    if (_playlist.isEmpty || _currentIndex <= 0) return;
    _currentIndex--;
    await playTrack(_playlist[_currentIndex]);
  }
}
