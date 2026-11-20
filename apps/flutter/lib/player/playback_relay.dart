import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';

import '../core/address.dart';

/// libmpv's HTTP headers apply to every URL it opens. Give it a private
/// loopback URL instead. Only requests to the playback origin carry headers.
///
/// The server runs on an isolate of its own. On Android the UI isolate
/// shares the platform thread, and mpv refills its cache after a seek as
/// fast as the network allows, so copying those bytes there would cost
/// frames while the controls are up.
class PlaybackRelay {
  PlaybackRelay._(this._commands, this._port, this._key);

  final SendPort _commands;
  final int _port;
  final String _key;
  final _sources = <Uri>[];
  static final _random = Random.secure();

  static Future<PlaybackRelay> open(
    Uri origin,
    Map<String, String> headers,
  ) async {
    final key = base64Url.encode(
      List.generate(24, (_) => _random.nextInt(256)),
    );
    final ready = ReceivePort();
    try {
      await Isolate.spawn(
        _relayMain,
        (ready.sendPort, '$origin', headers, key),
        debugName: 'playback relay',
        // A failure to bind arrives here instead of the port.
        onError: ready.sendPort,
      );
      return switch (await ready.first) {
        (final SendPort commands, final int port) => PlaybackRelay._(
          commands,
          port,
          key,
        ),
        final other => throw StateError('relay failed to start: $other'),
      };
    } finally {
      ready.close();
    }
  }

  /// The loopback URL that relays [source]. It's ready as soon as it's
  /// returned: the relay holds a request for it until the source arrives.
  String url(String source) {
    final uri = Uri.parse(source);
    var index = _sources.indexOf(uri);
    if (index < 0) {
      index = _sources.length;
      _sources.add(uri);
      _commands.send((index, source));
    }
    return _localUrl(_port, _key, 'm$index', uri);
  }

  void close() => _commands.send(null);
}

String _filename(Uri uri) =>
    uri.pathSegments.isEmpty ? 'source' : uri.pathSegments.last;

String _localUrl(int port, String key, String id, Uri source) =>
    // Keep a playlist's relative segment URLs relative to its own directory.
    Uri(
      scheme: 'http',
      host: '127.0.0.1',
      port: port,
      pathSegments: [key, id, _filename(source)],
    ).toString();

typedef _Start = (SendPort, String, Map<String, String>, String);

Future<void> _relayMain(_Start start) async {
  final (reply, origin, headers, key) = start;
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  final relay = _Relay(server, Uri.parse(origin), headers, key);
  final commands = ReceivePort();
  commands.listen((message) {
    switch (message) {
      case (final int index, final String source):
        relay.add(index, Uri.parse(source));
      case null:
        commands.close();
        relay.close();
    }
  });
  server.listen(relay.serve);
  reply.send((commands.sendPort, server.port));
}

class _Relay {
  _Relay(this._server, this._origin, this._headers, this._key);

  final HttpServer _server;
  final Uri _origin;
  final Map<String, String> _headers;
  final String _key;
  final _client = HttpClient()..autoUncompress = false;

  /// The sources the player asked for, by the index it gave them.
  final _sources = <int, Uri>{};
  final _waiting = <int, Completer<Uri?>>{};

  /// The redirect targets this relay handed out, in its own namespace.
  final _redirects = <Uri>[];

  /// How long a request waits for a source the player named but whose
  /// message hasn't arrived. It comes over a port, the request over a
  /// socket, so either can be first.
  static const _late = Duration(seconds: 2);

  void add(int index, Uri source) {
    _sources[index] = source;
    _waiting.remove(index)?.complete(source);
  }

  Future<Uri?> _source(String id) async {
    if (id.startsWith('r')) {
      final index = int.tryParse(id.substring(1));
      return index == null || index < 0 || index >= _redirects.length
          ? null
          : _redirects[index];
    }
    final index = id.startsWith('m') ? int.tryParse(id.substring(1)) : null;
    if (index == null || index < 0) return null;
    if (_sources[index] case final source?) return source;
    final waiting = _waiting.putIfAbsent(index, Completer<Uri?>.new);
    return waiting.future.timeout(
      _late,
      onTimeout: () {
        _waiting.remove(index);
        return null;
      },
    );
  }

  String _local(Uri uri) {
    var index = _redirects.indexOf(uri);
    if (index < 0) {
      index = _redirects.length;
      _redirects.add(uri);
    }
    return _localUrl(_server.port, _key, 'r$index', uri);
  }

  Future<void> serve(HttpRequest incoming) async {
    final response = incoming.response;
    try {
      final parts = incoming.uri.pathSegments;
      final source = parts.length < 3 || parts.first != _key
          ? null
          : await _source(parts[1]);
      if (source == null || !{'GET', 'HEAD'}.contains(incoming.method)) {
        response.statusCode = HttpStatus.notFound;
        return;
      }
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

  /// Ends every relayed read and the server; with the commands port closed
  /// too, nothing keeps the isolate alive and it exits.
  void close() {
    for (final waiting in _waiting.values) {
      waiting.complete(null);
    }
    _waiting.clear();
    _client.close(force: true);
    unawaited(_server.close(force: true));
  }
}
