/// Lightweight reference to an artist (used inside Track.artists).
class ArtistRef {
  final String id;
  final String name;

  const ArtistRef({required this.id, required this.name});

  Map<String, dynamic> toJson() => {'id': id, 'name': name};

  factory ArtistRef.fromJson(Map<String, dynamic> json) => ArtistRef(
        id: (json['id'] ?? '').toString(),
        name: json['name'] as String? ?? '',
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is ArtistRef && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

/// Core data model for a music track. This is the primary entity across
/// the entire app — search results, queue, favorites, downloads, etc.
class Track {
  final String id;
  final String title;
  final String artist;
  final String? artistId;
  final List<ArtistRef>? artists;
  final String? albumName;
  final String? albumId;
  final int duration; // seconds
  final String thumbnail;
  final String audioUrl; // may be empty — resolved at play time
  final String? youtubeUrl;
  final bool isExplicit;
  final String? dateAdded;

  const Track({
    required this.id,
    required this.title,
    required this.artist,
    this.artistId,
    this.artists,
    this.albumName,
    this.albumId,
    required this.duration,
    required this.thumbnail,
    this.audioUrl = '',
    this.youtubeUrl,
    this.isExplicit = false,
    this.dateAdded,
  });

  Track copyWith({
    String? id,
    String? title,
    String? artist,
    String? artistId,
    List<ArtistRef>? artists,
    String? albumName,
    String? albumId,
    int? duration,
    String? thumbnail,
    String? audioUrl,
    String? youtubeUrl,
    bool? isExplicit,
    String? dateAdded,
  }) {
    return Track(
      id: id ?? this.id,
      title: title ?? this.title,
      artist: artist ?? this.artist,
      artistId: artistId ?? this.artistId,
      artists: artists ?? this.artists,
      albumName: albumName ?? this.albumName,
      albumId: albumId ?? this.albumId,
      duration: duration ?? this.duration,
      thumbnail: thumbnail ?? this.thumbnail,
      audioUrl: audioUrl ?? this.audioUrl,
      youtubeUrl: youtubeUrl ?? this.youtubeUrl,
      isExplicit: isExplicit ?? this.isExplicit,
      dateAdded: dateAdded ?? this.dateAdded,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'artist': artist,
        'artistId': artistId,
        'albumName': albumName,
        'albumId': albumId,
        'duration': duration,
        'thumbnail': thumbnail,
        'audioUrl': audioUrl,
        'youtubeUrl': youtubeUrl,
        'isExplicit': isExplicit,
        'dateAdded': dateAdded,
        'artists': artists?.map((a) => a.toJson()).toList(),
      };

  factory Track.fromJson(Map<String, dynamic> json) => Track(
        id: (json['id'] ?? '').toString(),
        title: json['title'] as String? ?? 'Unknown Title',
        artist: json['artist'] as String? ?? 'Unknown Artist',
        artistId: json['artistId']?.toString(),
        albumName: json['albumName'] as String?,
        albumId: json['albumId']?.toString(),
        duration: json['duration'] as int? ?? 180,
        thumbnail: json['thumbnail'] as String? ?? '',
        audioUrl: json['audioUrl'] as String? ?? '',
        youtubeUrl: json['youtubeUrl'] as String?,
        isExplicit: json['isExplicit'] as bool? ?? false,
        dateAdded: json['dateAdded'] as String?,
        artists: (json['artists'] as List<dynamic>?)
            ?.map((a) => ArtistRef.fromJson(a as Map<String, dynamic>))
            .toList(),
      );

  /// Factory for Deezer search result items.
  factory Track.fromDeezerJson(Map<String, dynamic> json) {
    final album = json['album'] as Map<String, dynamic>?;
    final artistMap = json['artist'] as Map<String, dynamic>?;
    final coverUrl = album?['cover_xl'] ??
        album?['cover_big'] ??
        album?['cover_medium'] ??
        album?['cover'] ??
        '';

    return Track(
      id: json['id'].toString(),
      title: (json['title'] ?? json['title_short'] ?? 'Unknown Title') as String,
      artist: artistMap?['name'] as String? ?? 'Unknown Artist',
      artistId: artistMap?['id']?.toString(),
      artists: artistMap != null
          ? [ArtistRef(id: artistMap['id'].toString(), name: artistMap['name'] as String)]
          : null,
      albumName: album?['title'] as String?,
      albumId: album?['id']?.toString(),
      duration: json['duration'] as int? ?? 180,
      thumbnail: coverUrl as String,
      audioUrl: json['preview'] as String? ?? '',
      isExplicit: (json['explicit_lyrics'] as bool? ?? false) ||
          (json['explicit_content_lyrics'] == 1),
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is Track && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'Track($id, "$title" by $artist)';
}
