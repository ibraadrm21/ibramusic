/// Data model for an album.
class Album {
  final String id;
  final String title;
  final String artist;
  final String? artistId;
  final String thumbnail;
  final String? releaseDate;
  final int? numberOfTracks;

  const Album({
    required this.id,
    required this.title,
    required this.artist,
    this.artistId,
    required this.thumbnail,
    this.releaseDate,
    this.numberOfTracks,
  });

  factory Album.fromDeezerJson(Map<String, dynamic> json) {
    final artistMap = json['artist'] as Map<String, dynamic>?;
    return Album(
      id: json['id'].toString(),
      title: json['title'] as String? ?? 'Unknown Album',
      artist: artistMap?['name'] as String? ?? 'Unknown Artist',
      artistId: artistMap?['id']?.toString(),
      thumbnail: (json['cover_xl'] ??
              json['cover_big'] ??
              json['cover_medium'] ??
              json['cover'] ??
              '') as String,
      numberOfTracks: json['nb_tracks'] as int?,
    );
  }

  factory Album.fromJson(Map<String, dynamic> json) => Album(
        id: (json['id'] ?? '').toString(),
        title: json['title'] as String? ?? 'Unknown Album',
        artist: json['artist'] as String? ?? 'Unknown Artist',
        artistId: json['artistId']?.toString(),
        thumbnail: json['thumbnail'] as String? ?? '',
        releaseDate: json['releaseDate'] as String?,
        numberOfTracks: json['numberOfTracks'] as int?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'artistId': artistId,
        'thumbnail': thumbnail,
        'releaseDate': releaseDate,
        'numberOfTracks': numberOfTracks,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is Album && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
