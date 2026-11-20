import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import '../core/address.dart';

/// libmpv's HTTP headers apply to every URL it opens. Give it a private
/// loopback URL instead. Only requests to the playback origin carry headers.
class PlaybackRelay {
  PlaybackRelay._(this._server, this._origin, this._headers);

  final HttpServer _server;
  final Uri _origin;
  final Map<String, String> _headers;
  final _client = HttpClient()..autoUncompress = false;
  final _sources = <Uri>[];
  static final _random = Random.secure();
  final _key = base64Url.encode(List.generate(24, (_) => _random.nextInt(256)));

  static Future<PlaybackRelay> open(
    Uri origin,
    Map<String, String> headers,
  ) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final relay = PlaybackRelay._(server, origin, headers);
    server.listen(relay._serve);
    return relay;
  }

  String url(String source) => _local(Uri.parse(source));

  static String _filename(Uri uri) =>
      uri.pathSegments.isEmpty ? 'source' : uri.pathSegments.last;

  String _local(Uri uri) {
    var index = _sources.indexOf(uri);
    if (index < 0) {
      index = _sources.length;
      _sources.add(uri);
    }
    // Keep a playlist's relative segment URLs relative to its own directory.
    return Uri(
      scheme: 'http',
      host: '127.0.0.1',
      port: _server.port,
      pathSegments: [_key, '$index', _filename(uri)],
    ).toString();
  }

  Future<void> _serve(HttpRequest incoming) async {
    final response = incoming.response;
    try {
      final parts = incoming.uri.pathSegments;
      final index = parts.length < 3 ? null : int.tryParse(parts[1]);
      if (index == null ||
          index < 0 ||
          index >= _sources.length ||
          parts.first != _key ||
          !{'GET', 'HEAD'}.contains(incoming.method)) {
        response.statusCode = HttpStatus.notFound;
        return;
      }
      final source = _sources[index];
      final target = parts.length == 3 && parts.last == _filename(source)
          ? source
          : source.resolveUri(
              Uri(
                pathSegments: parts.skip(2),
                query: incoming.uri.hasQuery ? incoming.uri.query : null,
              ),
            );
      if (!sameOrigin(target, source) ||
          !target.path.startsWith(source.resolve('.').path)) {
        response.statusCode = HttpStatus.forbidden;
        return;
      }
      final request = await _client.openUrl(incoming.method, target);
      request.followRedirects = false;
      if (sameOrigin(target, _origin)) _headers.forEach(request.headers.set);
      for (final name in ['range', 'if-range']) {
        final value = incoming.headers.value(name);
        if (value != null) request.headers.set(name, value);
      }
      final upstream = await request.close();
      response.statusCode = upstream.statusCode;
      final location = upstream.headers.value(HttpHeaders.locationHeader);
      if (upstream.isRedirect && location != null) {
        final next = target.resolve(location);
        if (!{'https', 'http'}.contains(next.scheme) ||
            next.userInfo.isNotEmpty) {
          response.statusCode = HttpStatus.badGateway;
        } else {
          response.headers.set(HttpHeaders.locationHeader, _local(next));
        }
        await upstream.drain<void>();
        return;
      }
      for (final name in [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'content-encoding',
      ]) {
        final value = upstream.headers.value(name);
        if (value != null) response.headers.set(name, value);
      }
      await response.addStream(upstream);
    } on Exception {
      try {
        response.statusCode = HttpStatus.badGateway;
      } on StateError {
        // The response already started before the stream broke.
      }
    } on StateError {
      // Closing the relay also closes its HTTP client.
    } finally {
      try {
        await response.close();
      } on IOException {
        // Seeking and closing the player discard in-flight reads.
      }
    }
  }

  void close() {
    _client.close(force: true);
    unawaited(_server.close(force: true));
  }
}
