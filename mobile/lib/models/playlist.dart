import 'track.dart';

/// Data model for a user playlist.
class Playlist {
  final String id;
  final String name;
  final List<Track> tracks;
  final String? coverUrl;
  final bool isPublic;

  const Playlist({
    required this.id,
    required this.name,
    this.tracks = const [],
    this.coverUrl,
    this.isPublic = false,
  });

  Playlist copyWith({
    String? name,
    List<Track>? tracks,
    String? coverUrl,
    bool? isPublic,
  }) {
    return Playlist(
      id: id,
      name: name ?? this.name,
      tracks: tracks ?? this.tracks,
      coverUrl: coverUrl ?? this.coverUrl,
      isPublic: isPublic ?? this.isPublic,
    );
  }

  /// The effective cover: explicit coverUrl, or the first track's thumbnail.
  String? get effectiveCover => coverUrl ?? (tracks.isNotEmpty ? tracks.first.thumbnail : null);

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'coverUrl': coverUrl,
        'isPublic': isPublic,
        'tracks': tracks.map((t) => t.toJson()).toList(),
      };

  factory Playlist.fromJson(Map<String, dynamic> json) => Playlist(
        id: json['id'] as String,
        name: json['name'] as String,
        coverUrl: json['coverUrl'] as String?,
        isPublic: json['isPublic'] as bool? ?? false,
        tracks: (json['tracks'] as List<dynamic>?)
                ?.map((t) => Track.fromJson(t as Map<String, dynamic>))
                .toList() ??
            [],
      );

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is Playlist && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
