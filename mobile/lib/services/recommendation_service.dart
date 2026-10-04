import 'dart:math';

import '../core/constants.dart';
import '../core/logger.dart';
import '../models/track.dart';
import 'http_client.dart';
import 'music_search_service.dart';

const _tag = 'RecommendationService';

class RelatedGenre {
  final String genre;
  final List<String> relatedArtists;

  const RelatedGenre(this.genre, this.relatedArtists);
}

/// Static map of related artists by genre, mirroring web app logic.
const Map<String, RelatedGenre> relatedArtistsByGenre = {
  'bad bunny': RelatedGenre('reggaeton / trap', [
    'feid',
    'rauw alejandro',
    'myke towers',
    'karol g',
    'j balvin',
    'anuel aa'
  ]),
  'feid': RelatedGenre('reggaeton', [
    'bad bunny',
    'rauw alejandro',
    'mora',
    'quevedo',
    'ryan castro'
  ]),
  'rosalia': RelatedGenre('flamenco pop / urban', [
    'c. tangana',
    'rauw alejandro',
    'nathy peluso',
    'tokischa'
  ]),
  'bizarrap': RelatedGenre('latino / trap', [
    'duki',
    'quevedo',
    'tiago pzk',
    'lit killah',
    'trueno',
    'milo j'
  ]),
  'quevedo': RelatedGenre('latino / reggaeton', [
    'myke towers',
    'feid',
    'saiko',
    'mora',
    'bizarrap'
  ]),
  'kendrick lamar': RelatedGenre('conscious hip-hop', [
    'j. cole',
    'baby keem',
    'kanye west',
    'tyler, the creator',
    'asap rocky'
  ]),
  'travis scott': RelatedGenre('trap', [
    'don toliver',
    'playboi carti',
    'metro boomin',
    'lil uzi vert',
    'future'
  ]),
  'drake': RelatedGenre('hip-hop / pop', [
    'future',
    'lil baby',
    'gunna',
    'travis scott',
    '21 savage'
  ]),
  'the weeknd': RelatedGenre('r&b / synthpop', [
    'drake',
    'post malone',
    'frank ocean',
    'khalid',
    'travis scott',
    'sza'
  ]),
  'taylor swift': RelatedGenre('pop / country', [
    'olivia rodrigo',
    'sabrina carpenter',
    'gracie abrams',
    'selena gomez',
    'lana del rey'
  ]),
  'daft punk': RelatedGenre('electronic', [
    'justice',
    'disclosure',
    'chemical brothers',
    'deadmau5',
    'calvin harris',
    'gesaffelstein'
  ]),
  'billie eilish': RelatedGenre('indie pop', [
    'lorde',
    'lana del rey',
    'clairo',
    'phoebe bridgers',
    'finneas',
    'girl in red'
  ]),
  'dua lipa': RelatedGenre('dance pop', [
    'bebe rexha',
    'rita ora',
    'miley cyrus',
    'kylie minogue',
    'charli xcx'
  ]),
  'olivia rodrigo': RelatedGenre('pop rock / pop', [
    'conan gray',
    'sabrina carpenter',
    'billie eilish',
    'tate mcrae'
  ]),
  'coldplay': RelatedGenre('alternative rock', [
    'onerepublic',
    'imagine dragons',
    'keane',
    'the fray',
    'muse',
    'u2'
  ]),
  'arctic monkeys': RelatedGenre('indie rock', [
    'the strokes',
    'franz ferdinand',
    'tame impala',
    'the neighbourhood',
    'cage the elephant'
  ]),
  'tame impala': RelatedGenre('psychedelic rock / indie', [
    'mgmt',
    'foster the people',
    'unknown mortal orchestra',
    'pond',
    'beach house'
  ]),
};

const List<String> popularSeeds = [
  'Bad Bunny',
  'Feid',
  'Kendrick Lamar',
  'Travis Scott',
  'Drake',
  'Kanye West',
  'The Weeknd',
  'Taylor Swift',
  'Daft Punk',
  'Billie Eilish',
  'Dua Lipa',
  'Olivia Rodrigo',
  'Coldplay',
  'Arctic Monkeys',
  'Tame Impala',
  'Radiohead',
  'Rosalia',
  'Myke Towers',
  'Karol G',
  'Bizarrap',
  'Quevedo',
];

/// Smart music recommendation engine mirroring recommendationEngine.ts
class RecommendationService {
  RecommendationService._();

  static final Map<String, List<String>> _relatedArtistCache = {};

  /// Generates recommendations based on the user's profile and current context.
  static Future<List<Track>> getRecommendations({
    required List<Track> favorites,
    required List<Track> recentlyPlayed,
    Track? currentTrack,
    int limit = 15,
  }) async {
    Log.d(_tag, 'Building recommendations for user profile...');

    // 1. Calculate artist frequency & weights
    final Map<String, double> artistScores = {};
    final Map<String, String> artistIds = {};

    void addWeight(String artist, String? id, double weight) {
      final key = artist.toLowerCase().trim();
      if (key.isEmpty) return;
      artistScores[key] = (artistScores[key] ?? 0.0) + weight;
      if (id != null && !artistIds.containsKey(key)) {
        artistIds[key] = id;
      }
    }

    for (final track in favorites) {
      addWeight(track.artist, track.artistId, 3.0);
    }
    for (final track in recentlyPlayed.take(20)) {
      addWeight(track.artist, track.artistId, 1.0);
    }
    if (currentTrack != null) {
      addWeight(currentTrack.artist, currentTrack.artistId, 4.0);
    }

    // Top artist names sorted by score
    final sortedArtists = artistScores.keys.toList()
      ..sort((a, b) => (artistScores[b] ?? 0).compareTo(artistScores[a] ?? 0));

    final topArtists = sortedArtists.take(4).toList();

    // 2. Discover related artists dynamically
    final Set<String> querySeeds = {};

    for (final artist in topArtists) {
      querySeeds.add(artist);
      final id = artistIds[artist];
      if (id != null) {
        final related = await _getDeezerRelatedArtists(id);
        querySeeds.addAll(related.take(2));
      }

      // Check static mapping
      final staticMatch = relatedArtistsByGenre[artist];
      if (staticMatch != null) {
        querySeeds.addAll(staticMatch.relatedArtists.take(2));
      }
    }

    // Fallback if user is new or has very few items
    if (querySeeds.length < 3) {
      final rng = Random();
      final shuffledSeeds = List<String>.from(popularSeeds)..shuffle(rng);
      querySeeds.addAll(shuffledSeeds.take(5));
    }

    Log.d(_tag, 'Seeds selected for recommendations: $querySeeds');

    // 3. Query tracks for seeds in parallel
    final List<Future<List<Track>>> searchFutures = [];
    for (final seed in querySeeds.take(6)) {
      searchFutures.add(searchTracks(seed));
    }

    final results = await Future.wait(searchFutures);
    final Set<String> existingTrackIds = {
      ...favorites.map((t) => t.id),
      ...recentlyPlayed.map((t) => t.id),
      if (currentTrack != null) currentTrack.id,
    };

    final List<Track> candidateTracks = [];
    final Set<String> seenCandidateIds = {};

    for (final trackList in results) {
      for (final t in trackList) {
        if (!existingTrackIds.contains(t.id) && !seenCandidateIds.contains(t.id)) {
          seenCandidateIds.add(t.id);
          candidateTracks.add(t);
        }
      }
    }

    // 4. Score and sort candidates
    final rng = Random();
    candidateTracks.sort((a, b) {
      double scoreA = (artistScores[a.artist.toLowerCase().trim()] ?? 0) * 5.0 + rng.nextDouble() * 5;
      double scoreB = (artistScores[b.artist.toLowerCase().trim()] ?? 0) * 5.0 + rng.nextDouble() * 5;
      return scoreB.compareTo(scoreA);
    });

    return candidateTracks.take(limit).toList();
  }

  static Future<List<String>> _getDeezerRelatedArtists(String artistId) async {
    if (_relatedArtistCache.containsKey(artistId)) {
      return _relatedArtistCache[artistId]!;
    }

    try {
      final url = ApiConstants.deezerRelatedArtists(artistId);
      final json = await HttpClient.getJson(url);
      final data = (json?['data'] as List<dynamic>?) ?? [];
      final names = data
          .map((e) => (e['name'] as String?)?.toLowerCase().trim())
          .whereType<String>()
          .toList();
      _relatedArtistCache[artistId] = names;
      return names;
    } catch (e) {
      Log.w(_tag, 'Could not fetch related artists for ID $artistId', e);
      return [];
    }
  }
}
