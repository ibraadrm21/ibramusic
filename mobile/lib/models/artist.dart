/// Data model for an artist.
class Artist {
  final String id;
  final String name;
  final String thumbnail;
  final int? popularity;
  final String? description;
  final int? monthlyListeners;

  const Artist({
    required this.id,
    required this.name,
    required this.thumbnail,
    this.popularity,
    this.description,
    this.monthlyListeners,
  });

  factory Artist.fromDeezerJson(Map<String, dynamic> json) => Artist(
        id: json['id'].toString(),
        name: json['name'] as String? ?? 'Unknown Artist',
        thumbnail: (json['picture_xl'] ??
                json['picture_big'] ??
                json['picture_medium'] ??
                json['picture'] ??
                '') as String,
        popularity: json['nb_fan'] as int?,
      );

  factory Artist.fromJson(Map<String, dynamic> json) => Artist(
        id: (json['id'] ?? '').toString(),
        name: json['name'] as String? ?? 'Unknown Artist',
        thumbnail: json['thumbnail'] as String? ?? '',
        popularity: json['popularity'] as int?,
        description: json['description'] as String?,
        monthlyListeners: json['monthlyListeners'] as int?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'thumbnail': thumbnail,
        'popularity': popularity,
        'description': description,
        'monthlyListeners': monthlyListeners,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is Artist && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
