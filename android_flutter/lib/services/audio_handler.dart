import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import '../models/music_models.dart';
import 'youtube_service.dart';

/// Global AudioHandler instance for background playback across entire app
late HarmonyAudioHandler audioHandler;

/// Background Audio Handler powered by just_audio & audio_service (ExoPlayer foreground service)
class HarmonyAudioHandler extends BaseAudioHandler with QueueHandler, SeekHandler {
  final AudioPlayer _player = AudioPlayer();
  final List<Track> _playlist = [];
  int _currentIndex = -1;

  HarmonyAudioHandler() {
    _initPlayerListeners();
  }

  AudioPlayer get player => _player;
  List<Track> get currentPlaylist => _playlist;
  int get currentTrackIndex => _currentIndex;

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

  Future<void> playTrack(Track track, {List<Track>? newQueue}) async {
    if (newQueue != null && newQueue.isNotEmpty) {
      _playlist.clear();
      _playlist.addAll(newQueue);
      queue.add(_playlist.map((t) => MediaItem(
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album.isNotEmpty ? t.album : "IbraMusic",
            artUri: Uri.tryParse(t.coverUrl),
            duration: t.duration > Duration.zero ? t.duration : null,
          )).toList());
    }

    _currentIndex = _playlist.indexWhere((t) => t.id == track.id);
    if (_currentIndex == -1) {
      _playlist.add(track);
      _currentIndex = _playlist.length - 1;
      queue.add([...queue.value, MediaItem(
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album.isNotEmpty ? track.album : "IbraMusic",
        artUri: Uri.tryParse(track.coverUrl),
        duration: track.duration > Duration.zero ? track.duration : null,
      )]);
    }

    mediaItem.add(MediaItem(
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album.isNotEmpty ? track.album : "IbraMusic",
      artUri: Uri.tryParse(track.coverUrl),
      duration: track.duration > Duration.zero ? track.duration : null,
    ));

    final query = "${track.title} ${track.artist}";
    final streamUrl = await YouTubeAudioExtractor.getAudioStreamUrl(track.id.isNotEmpty && track.id.length == 11 ? track.id : query);
    if (streamUrl != null && streamUrl.isNotEmpty) {
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
    if (_playlist.isEmpty || _currentIndex <= 0) {
      await _player.seek(Duration.zero);
      return;
    }
    _currentIndex--;
    await playTrack(_playlist[_currentIndex]);
  }
}
