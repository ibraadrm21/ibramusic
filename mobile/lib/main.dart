import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:audio_service/audio_service.dart';

import 'app.dart';
import 'audio/audio_handler.dart';
import 'core/constants.dart';
import 'core/logger.dart';
import 'services/storage_service.dart';

late AudioHandler audioHandler;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // 1. Initialize local offline storage (Hive)
  await StorageService.init();

  // 2. Initialize Supabase Client
  try {
    await Supabase.initialize(
      url: ApiConstants.supabaseUrl,
      anonKey: ApiConstants.supabaseAnonKey,
    );
    Log.d('Main', 'Supabase initialized');
  } catch (e) {
    Log.w('Main', 'Supabase init skipped or offline', e);
  }

  // 3. Initialize Audio Service for Background Playback
  try {
    audioHandler = await AudioService.init(
      builder: () => IbraAudioHandler(),
      config: const AudioServiceConfig(
        androidNotificationChannelId: 'com.ibrastream.ibramusic.audio',
        androidNotificationChannelName: 'IbraMusic Playback',
        androidNotificationOngoing: true,
        androidStopForegroundOnPause: true,
      ),
    );
  } catch (e) {
    Log.w('Main', 'AudioService init failed', e);
  }

  runApp(
    const ProviderScope(
      child: IbraMusicApp(),
    ),
  );
}
