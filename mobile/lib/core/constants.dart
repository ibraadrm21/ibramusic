/// All API URLs, timeouts, keys, and configuration constants.
class ApiConstants {
  ApiConstants._();

  // ─────────────────────── Deezer (primary metadata) ───────────────────────
  static const deezerBaseUrl = 'https://api.deezer.com';
  static String deezerSearchTracks(String query, {int limit = 30}) =>
      '$deezerBaseUrl/search?q=${Uri.encodeComponent(query)}&limit=$limit';
  static String deezerSearchAlbums(String query, {int limit = 25}) =>
      '$deezerBaseUrl/search/album?q=${Uri.encodeComponent(query)}&limit=$limit';
  static String deezerSearchArtists(String query, {int limit = 25}) =>
      '$deezerBaseUrl/search/artist?q=${Uri.encodeComponent(query)}&limit=$limit';
  static String deezerAlbumTracks(String albumId) =>
      '$deezerBaseUrl/album/$albumId/tracks?limit=100';
  static String deezerAlbumInfo(String albumId) =>
      '$deezerBaseUrl/album/$albumId';
  static String deezerArtistTopTracks(String artistId, {int limit = 50}) =>
      '$deezerBaseUrl/artist/$artistId/top?limit=$limit';
  static String deezerArtistInfo(String artistId) =>
      '$deezerBaseUrl/artist/$artistId';
  static String deezerRelatedArtists(String artistId) =>
      '$deezerBaseUrl/artist/$artistId/related';

  // ─────────────────────── iTunes (search fallback) ────────────────────────
  static String itunesSearch(String query, {int limit = 25}) =>
      'https://itunes.apple.com/search?term=${Uri.encodeComponent(query)}&entity=song&limit=$limit';

  // ─────────────────── Monochrome / Tidal proxy (fallback) ─────────────────
  static const monochromeHosts = [
    'https://monochrome-api.samidy.com',
    'https://us-west.monochrome.tf',
    'https://eu-central.monochrome.tf',
    'https://api.monochrome.tf',
  ];

  // ──────────────────── Piped (YouTube proxy — videoId + stream) ───────────
  static const pipedHosts = [
    'https://pipedapi.kavin.rocks',
    'https://api.piped.private.coffee',
    'https://pipedapi.lvk.li',
    'https://api.piped.yt',
  ];

  // ────────────────── Invidious (YouTube proxy — videoId fallback) ─────────
  static const invidiousHosts = [
    'https://inv.thepixora.com',
    'https://invidious.jing.rocks',
    'https://inv.tux.pizza',
  ];

  // ──────────────────── Cobalt (audio stream fallback) ────────────────────
  static const cobaltDirectoryUrl =
      'https://cobalt.directory/api/working?type=api';
  static const cobaltFallbackHosts = [
    'https://api.qwkuns.me/',
    'https://cobaltapi.squair.xyz/',
    'https://rue-cobalt.xenon.zone/',
    'https://apicobalt.mgytr.top/',
    'https://fox.kittycat.boo/',
    'https://api.cobalt.tools/',
  ];

  // ──────────────────── LRCLIB (synced lyrics) ────────────────────────────
  static const lrclibBaseUrl = 'https://lrclib.net/api';
  static String lrclibGetExact(String title, String artist, int durationSecs) =>
      '$lrclibBaseUrl/get?track_name=${Uri.encodeComponent(title)}&artist_name=${Uri.encodeComponent(artist)}&duration=$durationSecs';
  static String lrclibGetLenient(String title, String artist) =>
      '$lrclibBaseUrl/get?track_name=${Uri.encodeComponent(title)}&artist_name=${Uri.encodeComponent(artist)}';
  static String lrclibSearch(String query) =>
      '$lrclibBaseUrl/search?q=${Uri.encodeComponent(query)}';

  // ──────────────────── Supabase ──────────────────────────────────────────
  static const supabaseUrl = 'https://nkhonqrseaymilneurgj.supabase.co';
  static const supabaseAnonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raG9ucXJzZWF5bWlsbmV1cmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDQ1NTgsImV4cCI6MjA5NzEyMDU1OH0.zdzwopG3BXoTmqzuoEPQ0FcsBUhmjgrgMirWZFTZcPo';

  // ──────────────────── Timeouts ──────────────────────────────────────────
  static const defaultTimeout = Duration(seconds: 8);
  static const streamTimeout = Duration(seconds: 6);
  static const searchTimeout = Duration(seconds: 5);
  static const cobaltTimeout = Duration(seconds: 6);
  static const pipedTimeout = Duration(seconds: 4);

  // ──────────────────── App defaults ─────────────────────────────────────
  static const defaultCrossfadeDuration = 4; // seconds
  static const precueLeadTime = 30; // seconds before end to start pre-cueing
  static const maxRecentlyPlayed = 100;
  static const searchDebounceMs = 300;
  static const defaultPlaceholderImage =
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&q=80';
}
