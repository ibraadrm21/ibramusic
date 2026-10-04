import 'dart:async';
import 'dart:io';
import 'package:just_audio/just_audio.dart';
import 'package:rxdart/rxdart.dart';

import '../core/constants.dart';
import '../core/logger.dart';
import '../models/track.dart';
import '../services/download_service.dart';
import '../services/storage_service.dart';
import '../services/stream_resolver_service.dart';
import '../services/video_id_resolver_service.dart';
import 'crossfade_engine.dart';
import 'queue_manager.dart';

const _tag = 'AudioPlayerManager';

/// Dual-deck audio player manager for seamless crossfade and zero-gap transitions.
///
/// Features:
/// - Deck A and Deck B alternate playback
/// - Pre-cues next track 30 seconds before track ends: resolves video ID, fetches stream URL,
///   warms up audio buffers in background at volume 0
/// - Performs simultaneous crossfade over N configured seconds
/// - Automatically routes to local file if the track is downloaded offline
class AudioPlayerManager {
  static final AudioPlayerManager _instance = AudioPlayerManager._internal();
  factory AudioPlayerManager() => _instance;

  final AudioPlayer _deckA = AudioPlayer();
  final AudioPlayer _deckB = AudioPlayer();
  final QueueManager _queue = QueueManager();

  int _activeDeckIndex = 0; // 0 for Deck A, 1 for Deck B
  bool _isTransitioning = false;
  bool _isBuffering = false;

  // Pre-cue state
  String? _preCuedTrackId;
  bool _preCuedReady = false;
  StreamSubscription? _activeDeckPositionSub;

  AudioPlayer get _activePlayer => _activeDeckIndex == 0 ? _deckA : _deckB;
  AudioPlayer get _standbyPlayer => _activeDeckIndex == 0 ? _deckB : _deckA;

  QueueManager get queue => _queue;
  Track? get currentTrack => _queue.currentTrack;

  // Stream state notifications
  final BehaviorSubject<Track?> _currentTrackSubject = BehaviorSubject<Track?>.seeded(null);
  final BehaviorSubject<bool> _isPlayingSubject = BehaviorSubject<bool>.seeded(false);
  final BehaviorSubject<Duration> _positionSubject = BehaviorSubject<Duration>.seeded(Duration.zero);
  final BehaviorSubject<Duration> _durationSubject = BehaviorSubject<Duration>.seeded(Duration.zero);

  Stream<Track?> get currentTrackStream => _currentTrackSubject.stream;
  Stream<bool> get isPlayingStream => _isPlayingSubject.stream;
  Stream<Duration> get positionStream => _positionSubject.stream;
  Stream<Duration> get durationStream => _durationSubject.stream;

  AudioPlayerManager._internal() {
    _initDecks();
  }

  void _initDecks() {
    _deckA.playerStateStream.listen((state) => _onDeckStateChange(0, state));
    _deckB.playerStateStream.listen((state) => _onDeckStateChange(1, state));

    // Route active position to stream
    _setupPositionListener();
  }

  void _setupPositionListener() {
    _activeDeckPositionSub?.cancel();
    _activeDeckPositionSub = _activePlayer.positionStream.listen((pos) {
      if (!_isTransitioning) {
        _positionSubject.add(pos);
      }
      _checkCrossfadeTriggers(pos);
    });

    _activePlayer.durationStream.listen((dur) {
      if (dur != null && !_isTransitioning) {
        _durationSubject.add(dur);
      }
    });
  }

  void _onDeckStateChange(int deckIndex, PlayerState state) {
    if (deckIndex == _activeDeckIndex) {
      _isPlayingSubject.add(state.playing);
      _isBuffering = state.processingState == ProcessingState.buffering;

      if (state.processingState == ProcessingState.completed && !_isTransitioning) {
        Log.d(_tag, 'Active deck playback completed naturally');
        next();
      }
    }
  }

  /// Plays a given track immediately, or resumes if currently paused on same track.
  Future<void> playTrack(Track track) async {
    if (currentTrack?.id == track.id && !_activePlayer.playing) {
      await _activePlayer.play();
      return;
    }

    _queue.setQueue([track]);
    await _startPlayingTrack(track);
  }

  /// Sets up a queue and starts playing from [initialIndex].
  Future<void> playQueue(List<Track> tracks, {int initialIndex = 0}) async {
    if (tracks.isEmpty) return;
    _queue.setQueue(tracks, initialIndex: initialIndex);
    final track = _queue.currentTrack;
    if (track != null) {
      await _startPlayingTrack(track);
    }
  }

  Future<void> _startPlayingTrack(Track track) async {
    try {
      Log.d(_tag, 'Preparing playback for: ${track.title} on deck $_activeDeckIndex');
      _currentTrackSubject.add(track);
      _preCuedTrackId = null;
      _preCuedReady = false;

      // Add to recently played
      StorageService.addRecentlyPlayed(track);

      // Check offline download first
      if (StorageService.isDownloaded(track.id)) {
        final path = StorageService.getDownloadPath(track.id);
        if (path != null && File(path).existsSync()) {
          Log.d(_tag, 'Playing from offline cache: $path');
          await _activePlayer.setFilePath(path);
          await _activePlayer.setVolume(StorageService.volume);
          await _activePlayer.play();
          return;
        }
      }

      // Stream resolution
      final videoId = await resolveVideoId(track);
      final streamUrl = await resolveAudioStream(videoId);

      await _activePlayer.setUrl(streamUrl);
      await _activePlayer.setVolume(StorageService.volume);
      await _activePlayer.play();
      _setupPositionListener();
    } catch (e, stack) {
      Log.e(_tag, 'Error playing track ${track.title}', e, stack);
      // Advance to next if failed
      next();
    }
  }

  /// Evaluates whether it's time to pre-cue the next track or start the crossfade.
  void _checkCrossfadeTriggers(Duration currentPos) {
    final dur = _activePlayer.duration;
    if (dur == null || dur.inSeconds <= 0) return;

    final remainingSecs = (dur - currentPos).inSeconds;
    final nextTrack = _queue.peekNextTrack();
    if (nextTrack == null) return;

    // 1. Pre-cue trigger: 30 seconds before end
    if (remainingSecs <= ApiConstants.precueLeadTime &&
        _preCuedTrackId != nextTrack.id &&
        !_isTransitioning) {
      _preCueStandbyDeck(nextTrack);
    }

    // 2. Crossfade trigger: when remaining time <= crossfadeDuration
    final crossfadeSecs = StorageService.crossfadeDuration;
    if (StorageService.crossfadeEnabled &&
        remainingSecs <= crossfadeSecs &&
        remainingSecs > 0 &&
        !_isTransitioning &&
        _preCuedReady) {
      _executeCrossfade(nextTrack, crossfadeSecs);
    }
  }

  /// Warms up standby deck with the next track (buffering audio at volume 0).
  Future<void> _preCueStandbyDeck(Track nextTrack) async {
    _preCuedTrackId = nextTrack.id;
    _preCuedReady = false;
    Log.d(_tag, '[Crossfade Presolve++] Pre-cueing standby deck for: ${nextTrack.title}');

    try {
      if (StorageService.isDownloaded(nextTrack.id)) {
        final path = StorageService.getDownloadPath(nextTrack.id);
        if (path != null && File(path).existsSync()) {
          await _standbyPlayer.setFilePath(path);
          _preCuedReady = true;
          Log.d(_tag, '[Crossfade Presolve++] Standby deck warm from local file');
          return;
        }
      }

      final videoId = await resolveVideoId(nextTrack);
      final streamUrl = await resolveAudioStream(videoId);

      await _standbyPlayer.setVolume(0.0);
      await _standbyPlayer.setUrl(streamUrl);

      // Briefly trigger play to fill hardware buffers, then pause & seek 0
      await _standbyPlayer.play();
      await Future.delayed(const Duration(milliseconds: 300));
      await _standbyPlayer.pause();
      await _standbyPlayer.seek(Duration.zero);

      _preCuedReady = true;
      Log.d(_tag, '[Crossfade Presolve++] Standby deck ready for instant transition!');
    } catch (e) {
      Log.w(_tag, 'Failed to pre-cue next track ${nextTrack.title}', e);
    }
  }

  /// Triggers simultaneous crossfade between both decks.
  Future<void> _executeCrossfade(Track nextTrack, int durationSecs) async {
    _isTransitioning = true;
    Log.d(_tag, 'Executing simultaneous crossfade (${durationSecs}s) into ${nextTrack.title}');

    // Update queue index
    _queue.next();
    _currentTrackSubject.add(nextTrack);
    StorageService.addRecentlyPlayed(nextTrack);

    final fadingOutDeck = _activePlayer;
    final fadingInDeck = _standbyPlayer;

    // Swap active deck pointer
    _activeDeckIndex = _activeDeckIndex == 0 ? 1 : 0;
    _setupPositionListener();

    await CrossfadeEngine.crossfade(
      fadingOutPlayer: fadingOutDeck,
      fadingInPlayer: fadingInDeck,
      durationSeconds: durationSecs,
      targetVolume: StorageService.volume,
      onComplete: () {
        _isTransitioning = false;
        _preCuedTrackId = null;
        _preCuedReady = false;
      },
    );
  }

  /// Skips to the next track.
  Future<void> next() async {
    final nextTrack = _queue.next();
    if (nextTrack != null) {
      if (_preCuedReady && _preCuedTrackId == nextTrack.id) {
        // Instant swap deck!
        _activePlayer.stop();
        _activeDeckIndex = _activeDeckIndex == 0 ? 1 : 0;
        _currentTrackSubject.add(nextTrack);
        StorageService.addRecentlyPlayed(nextTrack);
        await _activePlayer.setVolume(StorageService.volume);
        await _activePlayer.play();
        _setupPositionListener();
        _preCuedTrackId = null;
        _preCuedReady = false;
      } else {
        await _startPlayingTrack(nextTrack);
      }
    } else {
      await _activePlayer.stop();
      _isPlayingSubject.add(false);
    }
  }

  /// Skips to previous track.
  Future<void> previous() async {
    // If > 3 seconds in, seek to start of current song first
    if (_activePlayer.position.inSeconds > 3) {
      await seek(Duration.zero);
      return;
    }

    final prevTrack = _queue.previous();
    if (prevTrack != null) {
      await _startPlayingTrack(prevTrack);
    }
  }

  Future<void> play() async => await _activePlayer.play();
  Future<void> pause() async => await _activePlayer.pause();

  Future<void> togglePlayPause() async {
    if (_activePlayer.playing) {
      await pause();
    } else {
      await play();
    }
  }

  Future<void> seek(Duration position) async {
    await _activePlayer.seek(position);
  }

  Future<void> setVolume(double volume) async {
    final clamped = volume.clamp(0.0, 1.0);
    StorageService.volume = clamped;
    await _activePlayer.setVolume(clamped);
  }

  void dispose() {
    _activeDeckPositionSub?.cancel();
    _deckA.dispose();
    _deckB.dispose();
    _currentTrackSubject.close();
    _isPlayingSubject.close();
    _positionSubject.close();
    _durationSubject.close();
  }
}
