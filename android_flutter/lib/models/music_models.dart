class Track {
  final String id;
  final String title;
  final String artist;
  final String album;
  final String coverUrl;
  final Duration duration;
  final bool isFavorite;

  Track({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.coverUrl,
    required this.duration,
    this.isFavorite = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'album': album,
        'coverUrl': coverUrl,
        'durationMs': duration.inMilliseconds,
        'isFavorite': isFavorite,
      };

  factory Track.fromJson(Map<String, dynamic> json) => Track(
        id: json['id'] ?? '',
        title: json['title'] ?? 'Unknown Track',
        artist: json['artist'] ?? 'Unknown Artist',
        album: json['album'] ?? '',
        coverUrl: json['coverUrl'] ?? '',
        duration: Duration(milliseconds: json['durationMs'] ?? 0),
        isFavorite: json['isFavorite'] ?? false,
      );

  Track copyWith({bool? isFavorite}) {
    return Track(
      id: id,
      title: title,
      artist: artist,
      album: album,
      coverUrl: coverUrl,
      duration: duration,
      isFavorite: isFavorite ?? this.isFavorite,
    );
  }
}

class Playlist {
  final String id;
  final String name;
  final List<Track> tracks;
  final String? coverUrl;

  Playlist({
    required this.id,
    required this.name,
    required this.tracks,
    this.coverUrl,
  });
}

class Artist {
  final String id;
  final String name;
  final String? imageUrl;
  final int? listeners;

  Artist({
    required this.id,
    required this.name,
    this.imageUrl,
    this.listeners,
  });
}
