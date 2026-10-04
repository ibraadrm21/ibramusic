import 'dart:async';
import 'package:just_audio/just_audio.dart';

import '../core/logger.dart';

const _tag = 'CrossfadeEngine';

/// Manages smooth volume ramping between active deck and standby deck.
class CrossfadeEngine {
  CrossfadeEngine._();

  static const int _intervalMs = 40;

  /// Performs a simultaneous linear crossfade:
  /// - [fadingOutPlayer] volume goes from current -> 0.0
  /// - [fadingInPlayer] volume goes from 0.0 -> [targetVolume]
  /// Over [durationSeconds].
  static Future<void> crossfade({
    required AudioPlayer fadingOutPlayer,
    required AudioPlayer fadingInPlayer,
    required int durationSeconds,
    double targetVolume = 1.0,
    VoidCallback? onComplete,
  }) async {
    Log.d(_tag, 'Starting crossfade of $durationSeconds seconds...');
    final durationMs = durationSeconds * 1000;
    final totalSteps = (durationMs / _intervalMs).round().clamp(1, 500);

    final startOutVolume = fadingOutPlayer.volume;
    await fadingInPlayer.setVolume(0.0);
    fadingInPlayer.play();

    int step = 0;
    final completer = Completer<void>();

    Timer.periodic(const Duration(milliseconds: _intervalMs), (timer) {
      step++;
      final progress = (step / totalSteps).clamp(0.0, 1.0);

      // Volume calculations
      final outVol = (startOutVolume * (1.0 - progress)).clamp(0.0, 1.0);
      final inVol = (targetVolume * progress).clamp(0.0, 1.0);

      fadingOutPlayer.setVolume(outVol);
      fadingInPlayer.setVolume(inVol);

      if (step >= totalSteps) {
        timer.cancel();
        fadingOutPlayer.stop();
        fadingOutPlayer.setVolume(targetVolume); // reset for future use
        fadingInPlayer.setVolume(targetVolume);
        Log.d(_tag, 'Crossfade completed successfully');
        onComplete?.call();
        completer.complete();
      }
    });

    return completer.future;
  }
}

typedef VoidCallback = void Function();
