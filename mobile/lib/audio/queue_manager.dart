import 'dart:math';
import '../models/track.dart';

enum RepeatMode { off, all, one }

/// Manages playback queue, shuffle state, history, and user-enqueued tracks.
class QueueManager {
  final List<Track> _playlistTracks = [];
  final List<Track> _userQueue = []; // Explicit "Play next" items
  final List<int> _shuffleIndices = [];

  int _currentIndex = -1;
  bool _shuffle = false;
  RepeatMode _repeatMode = RepeatMode.off;

  List<Track> get playlistTracks => List.unmodifiable(_playlistTracks);
  List<Track> get userQueue => List.unmodifiable(_userQueue);
  int get currentIndex => _currentIndex;
  bool get isShuffle => _shuffle;
  RepeatMode get repeatMode => _repeatMode;

  Track? get currentTrack {
    if (_currentIndex >= 0 && _currentIndex < _playlistTracks.length) {
      return _playlistTracks[_currentIndex];
    }
    return null;
  }

  /// Sets up a new playlist or collection of tracks.
  void setQueue(List<Track> tracks, {int initialIndex = 0}) {
    _playlistTracks.clear();
    _playlistTracks.addAll(tracks);
    _userQueue.clear();
    _currentIndex = initialIndex.clamp(0, max(0, tracks.length - 1));

    if (_shuffle) {
      _generateShuffleOrder();
    }
  }

  /// Adds a track to play immediately after the current song.
  void playNext(Track track) {
    _userQueue.insert(0, track);
  }

  /// Enqueues a track at the end of the manual queue.
  void addToQueue(Track track) {
    _userQueue.add(track);
  }

  /// Removes an item from the manual user queue.
  void removeFromUserQueue(int index) {
    if (index >= 0 && index < _userQueue.length) {
      _userQueue.removeAt(index);
    }
  }

  /// Clears manual user queue.
  void clearUserQueue() {
    _userQueue.clear();
  }

  /// Toggles shuffle mode and recalculates ordering.
  bool toggleShuffle() {
    _shuffle = !_shuffle;
    if (_shuffle) {
      _generateShuffleOrder();
    }
    return _shuffle;
  }

  /// Cycles repeat mode: off -> all -> one -> off.
  RepeatMode cycleRepeatMode() {
    switch (_repeatMode) {
      case RepeatMode.off:
        _repeatMode = RepeatMode.all;
        break;
      case RepeatMode.all:
        _repeatMode = RepeatMode.one;
        break;
      case RepeatMode.one:
        _repeatMode = RepeatMode.off;
        break;
    }
    return _repeatMode;
  }

  /// Returns the next track according to queue priority:
  /// 1. Repeat ONE returns current track
  /// 2. User priority queue
  /// 3. Normal / Shuffled list
  Track? peekNextTrack() {
    if (_repeatMode == RepeatMode.one && currentTrack != null) {
      return currentTrack;
    }

    if (_userQueue.isNotEmpty) {
      return _userQueue.first;
    }

    if (_playlistTracks.isEmpty) return null;

    if (_shuffle) {
      final currentPosInShuffle = _shuffleIndices.indexOf(_currentIndex);
      if (currentPosInShuffle >= 0 && currentPosInShuffle < _shuffleIndices.length - 1) {
        return _playlistTracks[_shuffleIndices[currentPosInShuffle + 1]];
      } else if (_repeatMode == RepeatMode.all && _shuffleIndices.isNotEmpty) {
        return _playlistTracks[_shuffleIndices.first];
      }
    } else {
      if (_currentIndex < _playlistTracks.length - 1) {
        return _playlistTracks[_currentIndex + 1];
      } else if (_repeatMode == RepeatMode.all) {
        return _playlistTracks.first;
      }
    }

    return null;
  }

  /// Advances to the next track and updates indices.
  Track? next() {
    if (_repeatMode == RepeatMode.one && currentTrack != null) {
      return currentTrack;
    }

    // Check user manual queue first
    if (_userQueue.isNotEmpty) {
      final nextTrack = _userQueue.removeAt(0);
      // Insert right after current index so the playlist keeps context
      final insertIndex = (_currentIndex >= 0) ? _currentIndex + 1 : 0;
      _playlistTracks.insert(insertIndex, nextTrack);
      _currentIndex = insertIndex;
      return nextTrack;
    }

    if (_playlistTracks.isEmpty) return null;

    if (_shuffle) {
      final currentPosInShuffle = _shuffleIndices.indexOf(_currentIndex);
      if (currentPosInShuffle >= 0 && currentPosInShuffle < _shuffleIndices.length - 1) {
        _currentIndex = _shuffleIndices[currentPosInShuffle + 1];
        return _playlistTracks[_currentIndex];
      } else if (_repeatMode == RepeatMode.all && _shuffleIndices.isNotEmpty) {
        _currentIndex = _shuffleIndices.first;
        return _playlistTracks[_currentIndex];
      }
    } else {
      if (_currentIndex < _playlistTracks.length - 1) {
        _currentIndex++;
        return _playlistTracks[_currentIndex];
      } else if (_repeatMode == RepeatMode.all) {
        _currentIndex = 0;
        return _playlistTracks[_currentIndex];
      }
    }

    return null;
  }

  /// Returns to the previous track.
  Track? previous() {
    if (_playlistTracks.isEmpty) return null;

    if (_shuffle) {
      final currentPosInShuffle = _shuffleIndices.indexOf(_currentIndex);
      if (currentPosInShuffle > 0) {
        _currentIndex = _shuffleIndices[currentPosInShuffle - 1];
        return _playlistTracks[_currentIndex];
      } else if (_repeatMode == RepeatMode.all && _shuffleIndices.isNotEmpty) {
        _currentIndex = _shuffleIndices.last;
        return _playlistTracks[_currentIndex];
      }
    } else {
      if (_currentIndex > 0) {
        _currentIndex--;
        return _playlistTracks[_currentIndex];
      } else if (_repeatMode == RepeatMode.all) {
        _currentIndex = _playlistTracks.length - 1;
        return _playlistTracks[_currentIndex];
      }
    }

    return null;
  }

  void _generateShuffleOrder() {
    _shuffleIndices.clear();
    for (int i = 0; i < _playlistTracks.length; i++) {
      _shuffleIndices.add(i);
    }
    // Shuffle all elements, but keep current playing track first if possible
    _shuffleIndices.shuffle(Random());
    if (_currentIndex >= 0 && _shuffleIndices.contains(_currentIndex)) {
      _shuffleIndices.remove(_currentIndex);
      _shuffleIndices.insert(0, _currentIndex);
    }
  }
}
