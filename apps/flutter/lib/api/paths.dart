/// The plain HTTP routes in packages/contracts/src/paths.ts.
final class Paths {
  const Paths(this.base);

  final Uri base;

  Uri route(List<String> segments, {Map<String, String> query = const {}}) {
    final prefix = base.pathSegments.toList();
    if (prefix.isNotEmpty && prefix.last.isEmpty) prefix.removeLast();
    return Uri(
      scheme: base.scheme,
      host: base.host,
      port: base.hasPort ? base.port : null,
      pathSegments: [...prefix, ...segments],
      queryParameters: query.isEmpty ? null : query,
    );
  }

  Uri artwork(String id, {ArtworkSize size = ArtworkSize.small}) =>
      route(['api', 'artwork', id], query: {'size': size.name});

  Uri thumbnail(String itemId, {bool large = false}) => route(
    ['api', 'media', itemId, 'thumbnail'],
    query: {'size': large ? 'large' : 'small'},
  );

  /// The file as it is, with byte ranges.
  Uri stream(String itemId) => route(['api', 'media', itemId, 'stream']);

  /// Resolves a path the server returned, such as a playback source.
  Uri server(String path) => base.resolve(path);

  Uri subtitle(String itemId, String trackId, {bool ass = false}) => route(
    ['api', 'media', itemId, 'subtitles', trackId],
    query: {if (ass) 'delivery': 'ass'},
  );

  Uri trickplayTile(String itemId, String key, int tile) =>
      route(['api', 'media', itemId, 'trickplay', key, '$tile.jpg']);

  /// The page an app opens in the browser to be signed in.
  Uri authorize({
    required String redirectUri,
    required String state,
    required String codeChallenge,
    required String platform,
    String? deviceName,
  }) => route(
    ['authorize'],
    query: {
      'redirect_uri': redirectUri,
      'state': state,
      'code_challenge': codeChallenge,
      'code_challenge_method': 'S256',
      'platform': platform,
      if (deviceName != null && deviceName.trim().isNotEmpty)
        'device_name': deviceName,
    },
  );
}

enum ArtworkSize { thumb, small, medium, large, xlarge }
