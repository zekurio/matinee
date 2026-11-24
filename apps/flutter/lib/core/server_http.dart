import 'dart:async';
import 'dart:io';

import 'package:cronet_http/cronet_http.dart';
import 'package:cupertino_http/cupertino_http.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

import '../api/matinee_api.dart' show DevicePlatform;
import 'address.dart';

/// A request kept after its sign-in ended must not use a later sign-in's
/// credentials.
final class SessionChanged implements IOException {
  const SessionChanged();

  @override
  String toString() => 'The session ended.';
}

/// What a request to [url] sends as its bearer token, or null for none.
/// It may throw [SessionChanged] to refuse the request.
typedef BearerFor = String? Function(Uri url);

/// How long a server has to start answering. Streams and encodes wait while
/// the server makes the next part, which only the player does, with its own
/// timeouts.
const answerTimeout = Duration(seconds: 60);

/// How long connecting may take.
const connectTimeout = Duration(seconds: 15);

/// The client the app shares. On Android that's Cronet, Chromium's network
/// stack from Google Play services, which speaks HTTP/2 and HTTP/3: the
/// requests a screen sends at once share one connection, where `dart:io`'s
/// HTTP/1.1 opens one each, every one with its own TLS handshake, and that
/// costs a phone on a mobile network a round trip or two per request.
/// Cronet keeps what it learns of each server in [storage], like that it
/// speaks HTTP/3, so the first request after a start can use it. A device
/// without Play services gets `dart:io`'s. An iPhone or iPad gets
/// URLSession, Apple's, for the same reasons. The Apple TV build has no
/// plugins' native code, so it keeps `dart:io`'s.
http.Client createInnerClient({required String platform, Directory? storage}) {
  if (platform == DevicePlatform.ios) {
    return CupertinoClient.fromSessionConfiguration(
      // Nothing kept between requests that `dart:io` wouldn't keep: no
      // cookies, as the bearer token is the sign-in and a cookie would
      // outlive it, and no cached answers, as the API's change.
      URLSessionConfiguration.ephemeralSessionConfiguration()
        ..httpShouldSetCookies = false
        ..httpCookieAcceptPolicy =
            NSHTTPCookieAcceptPolicy.NSHTTPCookieAcceptPolicyNever
        ..cache = null
        ..requestCachePolicy =
            NSURLRequestCachePolicy.NSURLRequestReloadIgnoringLocalCacheData,
    );
  }
  if (platform == DevicePlatform.android ||
      platform == DevicePlatform.androidtv) {
    try {
      final folder = storage == null
          ? null
          : (Directory('${storage.path}/cronet')..createSync(recursive: true));
      return CronetClient.fromCronetEngine(
        CronetEngine.build(
          // Only what Cronet knows of servers is kept, not their answers:
          // the API's change, and artwork has its own cache.
          cacheMode: folder == null ? CacheMode.disabled : CacheMode.diskNoHttp,
          cacheMaxSize: folder == null ? null : 1 << 20,
          storagePath: folder?.path,
          enableHttp2: true,
          enableQuic: true,
          enableBrotli: true,
          // The system's resolver, as `dart:io` uses: Private DNS, and the
          // names a home network's router hands out.
          useBuiltInDnsResolver: false,
        ),
        closeEngine: true,
      );
    } on Object {
      // No Cronet on this device.
    }
  }
  return IOClient(HttpClient()..connectionTimeout = connectTimeout);
}

/// A client over a shared one that names the app in `User-Agent` and adds a
/// bearer token as [bearerFor] says. Closing it leaves the shared client
/// open: whoever made that closes it.
///
/// It follows redirects itself and asks [bearerFor] again at each one, so a
/// redirect to another origin never carries the token, whatever the client
/// beneath does with `Authorization` on a redirect: `dart:io`'s drops it on
/// another host, and Cronet keeps it. A request it can't send twice, a
/// streamed or multipart one, gets the redirect back instead when it
/// carries a token.
final class AuthorizedClient extends http.BaseClient {
  AuthorizedClient(this._inner, this._userAgent, [this._bearerFor]);

  final http.Client _inner;
  final String _userAgent;
  final BearerFor? _bearerFor;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final bearer = _authorize(request);
    if (!request.followRedirects) return _send(request);
    if (request is! http.Request) {
      if (bearer != null) request.followRedirects = false;
      return _send(request);
    }
    var current = request..followRedirects = false;
    for (var redirects = 0; ; redirects++) {
      final response = await _send(current);
      final location = response.headers['location'];
      if (!_redirects.contains(response.statusCode) || location == null) {
        return response;
      }
      if (redirects >= request.maxRedirects) {
        await response.stream.drain<void>();
        throw http.ClientException('Redirect limit exceeded', request.url);
      }
      await response.stream.drain<void>();
      current = _redirected(current, response.statusCode, location);
      _authorize(current);
    }
  }

  /// Names the app and puts on the token for [request]'s URL, if any.
  String? _authorize(http.BaseRequest request) {
    final bearer = _bearerFor?.call(request.url);
    request.headers['user-agent'] = _userAgent;
    request.headers.remove('authorization');
    if (bearer != null) request.headers['authorization'] = 'Bearer $bearer';
    return bearer;
  }

  Future<http.StreamedResponse> _send(http.BaseRequest request) =>
      _inner.send(request).timeout(answerTimeout);

  @override
  void close() {}
}

/// The statuses a client follows to the `Location` they name.
const _redirects = {301, 302, 303, 307, 308};

/// [request] again at [location], as browsers do: a 303, or a 301 or 302 to
/// a POST, turns it into a GET without its body.
http.Request _redirected(http.Request request, int status, String location) {
  final url = request.url.resolve(location);
  final toGet =
      status == 303 ||
      ((status == 301 || status == 302) && request.method == 'POST');
  final method = toGet ? 'GET' : request.method;
  final next = switch (request) {
    http.Abortable(:final abortTrigger?) => http.AbortableRequest(
      method,
      url,
      abortTrigger: abortTrigger,
    ),
    _ => http.Request(method, url),
  };
  next
    ..followRedirects = false
    ..persistentConnection = request.persistentConnection
    ..headers.addAll(request.headers);
  if (toGet) {
    next.headers
      ..remove('content-type')
      ..remove('content-length');
  } else {
    next.bodyBytes = request.bodyBytes;
  }
  return next;
}

/// A client that sends [bearer] to [server] while [generation] still is
/// [made], and refuses once it moved on, rather than send the new token.
/// A redirect to another origin goes without it, as [AuthorizedClient]
/// follows redirects itself.
AuthorizedClient boundClient(
  http.Client inner,
  String userAgent, {
  required Uri? server,
  required String? bearer,
  required int made,
  required int Function() generation,
}) => AuthorizedClient(inner, userAgent, (url) {
  if (bearer != null && generation() != made) throw const SessionChanged();
  if (server != null && bearer != null && sameOrigin(url, server)) {
    return bearer;
  }
  return null;
});

/// A client that sends whatever token [key]'s saved server has when each
/// request goes, to [server] only.
AuthorizedClient followingClient(
  http.Client inner,
  String userAgent, {
  required Uri server,
  required String key,
  required String? Function(String origin) tokenOf,
}) => AuthorizedClient(
  inner,
  userAgent,
  (url) => sameOrigin(url, server) ? tokenOf(key) : null,
);

/// Sends each saved server's token to that server, as it is at the time,
/// for a client made once for the whole run, like the image loader's. Only
/// for artwork.
AuthorizedClient artworkClient(
  http.Client inner,
  String userAgent, {
  required String? Function(String origin) tokenOf,
}) => AuthorizedClient(inner, userAgent, (url) => tokenOf(originKey(url)));
