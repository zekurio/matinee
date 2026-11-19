import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

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

/// The `dart:io` client the app shares.
http.Client createInnerClient() =>
    IOClient(HttpClient()..connectionTimeout = connectTimeout);

/// A client over a shared one that names the app in `User-Agent` and adds a
/// bearer token as [bearerFor] says. Closing it leaves the shared client
/// open: whoever made that closes it.
final class AuthorizedClient extends http.BaseClient {
  AuthorizedClient(this._inner, this._userAgent, [this._bearerFor]);

  final http.Client _inner;
  final String _userAgent;
  final BearerFor? _bearerFor;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final bearer = _bearerFor?.call(request.url);
    request.headers['user-agent'] = _userAgent;
    request.headers.remove('authorization');
    if (bearer != null) request.headers['authorization'] = 'Bearer $bearer';
    return _inner.send(request).timeout(answerTimeout);
  }

  @override
  void close() {}
}

/// A client that sends [bearer] to [server] while [generation] still is
/// [made], and refuses once it moved on, rather than send the new token.
/// Dart's HTTP client itself drops `Authorization` when a redirect leaves
/// the origin.
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
