import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:audio_service/audio_service.dart';

import 'services/audio_handler.dart';
import 'services/search_service.dart';
import 'services/supabase_service.dart';
import 'models/music_models.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize background AudioService
  audioHandler = await AudioService.init(
    builder: () => HarmonyAudioHandler(),
    config: AudioServiceConfig(
      androidNotificationChannelId: 'com.ibramusic.android_flutter.channel.audio',
      androidNotificationChannelName: 'IbraMusic Playback',
      androidNotificationChannelDescription: 'Background audio playback for IbraMusic',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: false,
    ),
  );

  // Initialize Supabase
  try {
    await SupabaseSyncService.init();
  } catch (e) {
    debugPrint("Supabase init error: $e");
  }

  runApp(const IbraMusicApp());
}

class IbraMusicApp extends StatelessWidget {
  const IbraMusicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => MusicStateProvider(),
      child: MaterialApp(
        title: 'IbraMusic',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark().copyWith(
          scaffoldBackgroundColor: const Color(0xFF09090B),
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFF1DB954),
            surface: Color(0xFF121214),
          ),
        ),
        home: const MainNavigationScreen(),
      ),
    );
  }
}

class MusicStateProvider extends ChangeNotifier {
  Track? _currentTrack;
  bool _isPlaying = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  List<Track> _searchResults = [];
  final List<Track> _favorites = [];
  final List<Playlist> _playlists = [];
  bool _isSearching = false;
  List<Track> _queue = [];
  int _currentIndex = -1;

  MusicStateProvider() {
    _initListeners();
  }

  void _initListeners() {
    audioHandler.playbackState.listen((state) {
      _isPlaying = state.playing;
      _position = state.position;
      notifyListeners();
    });

    audioHandler.player.positionStream.listen((pos) {
      _position = pos;
      notifyListeners();
    });

    audioHandler.player.durationStream.listen((dur) {
      if (dur != null) {
        _duration = dur;
        notifyListeners();
      }
    });

    audioHandler.mediaItem.listen((item) {
      if (item != null) {
        _currentTrack = Track(
          id: item.id,
          title: item.title,
          artist: item.artist ?? "Desconocido",
          album: item.album ?? "",
          coverUrl: item.artUri?.toString() ?? "",
          duration: item.duration ?? Duration.zero,
          isFavorite: _favorites.any((f) => f.id == item.id),
        );
        _queue = audioHandler.currentPlaylist;
        _currentIndex = audioHandler.currentTrackIndex;
        notifyListeners();
      }
    });
  }

  Track? get currentTrack => _currentTrack;
  bool get isPlaying => _isPlaying;
  Duration get position => _position;
  Duration get duration => _duration;
  List<Track> get searchResults => _searchResults;
  List<Track> get favorites => _favorites;
  List<Playlist> get playlists => _playlists;
  bool get isSearching => _isSearching;
  List<Track> get queue => _queue;
  int get currentIndex => _currentIndex;

  Future<void> search(String query) async {
    if (query.trim().isEmpty) return;
    _isSearching = true;
    notifyListeners();

    try {
      final results = await MonochromeSearchService.searchTracks(query);
      _searchResults = results.map((m) => Track(
        id: m.id,
        title: m.title,
        artist: m.artist,
        album: m.album,
        coverUrl: m.coverUrl,
        duration: m.duration,
        isFavorite: _favorites.any((f) => f.id == m.id),
      )).toList();
    } catch (_) {
      _searchResults = [];
    } finally {
      _isSearching = false;
      notifyListeners();
    }
  }

  Future<void> playTrack(Track track, {List<Track>? newQueue}) async {
    _currentTrack = track;
    _isPlaying = true;
    notifyListeners();
    await audioHandler.playTrack(track, newQueue: newQueue);
  }

  Future<void> togglePlayPause() async {
    if (_isPlaying) {
      await audioHandler.pause();
    } else {
      await audioHandler.play();
    }
  }

  Future<void> seek(Duration pos) async {
    await audioHandler.seek(pos);
  }

  void toggleFavorite(Track track) {
    final idx = _favorites.indexWhere((t) => t.id == track.id);
    if (idx >= 0) {
      _favorites.removeAt(idx);
    } else {
      _favorites.add(track.copyWith(isFavorite: true));
    }
    notifyListeners();
  }

  Future<void> nextTrack() async {
    await audioHandler.skipToNext();
  }

  Future<void> prevTrack() async {
    await audioHandler.skipToPrevious();
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _pages = const [
    HomeScreen(),
    SearchScreen(),
    LibraryScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    final musicState = Provider.of<MusicStateProvider>(context);
    final hasCurrentTrack = musicState.currentTrack != null;

    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: _currentIndex,
            children: _pages,
          ),
          if (hasCurrentTrack)
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: MiniPlayerWidget(track: musicState.currentTrack!),
            ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Color(0xFF09090B),
          border: Border(top: BorderSide(color: Colors.white10, width: 0.5)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (index) => setState(() => _currentIndex = index),
          backgroundColor: Colors.transparent,
          elevation: 0,
          selectedItemColor: Colors.white,
          unselectedItemColor: Colors.grey,
          selectedFontSize: 11,
          unselectedFontSize: 11,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(LucideIcons.house, size: 20),
              activeIcon: Icon(LucideIcons.house, size: 22, color: Colors.white),
              label: 'Inicio',
            ),
            BottomNavigationBarItem(
              icon: Icon(LucideIcons.search, size: 20),
              activeIcon: Icon(LucideIcons.search, size: 22, color: Colors.white),
              label: 'Buscar',
            ),
            BottomNavigationBarItem(
              icon: Icon(LucideIcons.library, size: 20),
              activeIcon: Icon(LucideIcons.library, size: 22, color: Colors.white),
              label: 'Biblioteca',
            ),
          ],
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<MusicStateProvider>(context);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF09090B),
        elevation: 0,
        title: const Row(
          children: [
            Icon(LucideIcons.disc, color: Color(0xFF1DB954)),
            SizedBox(width: 8),
            Text(
              'IbraMusic',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20),
            ),
          ],
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Recomendados',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 12),
            provider.searchResults.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 40),
                      child: Text(
                        'Usa el buscador para añadir y escuchar música',
                        style: TextStyle(color: Colors.white54),
                      ),
                    ),
                  )
                : ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: provider.searchResults.length,
                    itemBuilder: (context, index) {
                      final track = provider.searchResults[index];
                      return ListTile(
                        leading: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(
                            track.coverUrl,
                            width: 48,
                            height: 48,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, _) => Container(
                              width: 48,
                              height: 48,
                              color: Colors.white10,
                              child: const Icon(LucideIcons.music, color: Colors.white54),
                            ),
                          ),
                        ),
                        title: Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold)),
                        subtitle: Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white54)),
                        onTap: () => provider.playTrack(track),
                      );
                    },
                  ),
          ],
        ),
      ),
    );
  }
}

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<MusicStateProvider>(context);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF09090B),
        elevation: 0,
        title: Container(
          height: 44,
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(22),
          ),
          child: TextField(
            controller: _controller,
            onSubmitted: (query) => provider.search(query),
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: const InputDecoration(
              hintText: '¿Qué quieres escuchar? (o pega un link)',
              hintStyle: TextStyle(color: Colors.white38, fontSize: 13),
              prefixIcon: Icon(LucideIcons.search, size: 18, color: Colors.white54),
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(vertical: 12),
            ),
          ),
        ),
      ),
      body: provider.isSearching
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: provider.searchResults.length,
              itemBuilder: (context, index) {
                final track = provider.searchResults[index];
                return ListTile(
                  leading: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      track.coverUrl,
                      width: 48,
                      height: 48,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 48,
                        height: 48,
                        color: Colors.white10,
                        child: const Icon(LucideIcons.music, color: Colors.white54),
                      ),
                    ),
                  ),
                  title: Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () => provider.playTrack(track),
                );
              },
            ),
    );
  }
}

class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<MusicStateProvider>(context);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF09090B),
        title: const Text('Tu Biblioteca', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            leading: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Colors.purple, Colors.blue]),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(LucideIcons.heart, color: Colors.white),
            ),
            title: const Text('Tus Me Gusta', style: TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${provider.favorites.length} canciones', style: const TextStyle(color: Colors.white54)),
          ),
        ],
      ),
    );
  }
}

class MiniPlayerWidget extends StatelessWidget {
  final Track track;

  const MiniPlayerWidget({super.key, required this.track});

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<MusicStateProvider>(context);

    return GestureDetector(
      onTap: () {
        showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          backgroundColor: Colors.transparent,
          builder: (_) => const FullPlayerSheet(),
        );
      },
      child: Container(
        height: 60,
        decoration: BoxDecoration(
          color: const Color(0xFF18181B),
          borderRadius: BorderRadius.circular(12),
          boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 10)],
        ),
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.network(
                track.coverUrl,
                width: 42,
                height: 42,
                fit: BoxFit.cover,
                errorBuilder: (_, __, _) => Container(
                  width: 42,
                  height: 42,
                  color: Colors.white10,
                  child: const Icon(LucideIcons.music, size: 20, color: Colors.white54),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white54, fontSize: 11)),
                ],
              ),
            ),
            IconButton(
              icon: Icon(provider.isPlaying ? LucideIcons.pause : LucideIcons.play, color: Colors.white),
              onPressed: () => provider.togglePlayPause(),
            ),
          ],
        ),
      ),
    );
  }
}

class FullPlayerSheet extends StatelessWidget {
  const FullPlayerSheet({super.key});

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes;
    final seconds = d.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<MusicStateProvider>(context);
    final track = provider.currentTrack;
    if (track == null) return const SizedBox.shrink();

    final currentPos = provider.position;
    final totalDur = provider.duration > Duration.zero ? provider.duration : track.duration;

    return Container(
      height: MediaQuery.of(context).size.height * 0.92,
      decoration: const BoxDecoration(
        color: Color(0xFF09090B),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 32),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Image.network(
              track.coverUrl,
              width: 280,
              height: 280,
              fit: BoxFit.cover,
              errorBuilder: (_, __, _) => Container(
                width: 280,
                height: 280,
                color: Colors.white10,
                child: const Icon(LucideIcons.music, size: 80, color: Colors.white54),
              ),
            ),
          ),
          const SizedBox(height: 32),
          Align(
            alignment: Alignment.centerLeft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(track.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold), maxLines: 1, overflow: TextOverflow.ellipsis),
                const SizedBox(height: 4),
                Text(track.artist, style: const TextStyle(fontSize: 16, color: Colors.white54), maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(height: 24),
          // Progress Slider
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
              trackHeight: 3,
              activeTrackColor: const Color(0xFF1DB954),
              inactiveTrackColor: Colors.white12,
              thumbColor: Colors.white,
            ),
            child: Slider(
              value: totalDur > Duration.zero
                  ? currentPos.inMilliseconds.clamp(0, totalDur.inMilliseconds).toDouble()
                  : 0.0,
              max: totalDur > Duration.zero ? totalDur.inMilliseconds.toDouble() : 1.0,
              onChanged: (val) {
                provider.seek(Duration(milliseconds: val.toInt()));
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_formatDuration(currentPos), style: const TextStyle(fontSize: 12, color: Colors.white54)),
                Text(_formatDuration(totalDur), style: const TextStyle(fontSize: 12, color: Colors.white54)),
              ],
            ),
          ),
          const Spacer(),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              IconButton(icon: const Icon(LucideIcons.skipBack, size: 28), onPressed: () => provider.prevTrack()),
              IconButton(
                iconSize: 56,
                icon: Icon(provider.isPlaying ? LucideIcons.circlePause : LucideIcons.circlePlay, color: Colors.white),
                onPressed: () => provider.togglePlayPause(),
              ),
              IconButton(icon: const Icon(LucideIcons.skipForward, size: 28), onPressed: () => provider.nextTrack()),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
