import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

/// Sign-in through the browser, as in OAuth for native apps (RFC 8252) with
/// PKCE: the app opens the server's /authorize page in the system browser,
/// and the page sends the browser back to [redirectUri] with a one-time code
/// that only this request's verifier can trade for a session.
final class BrowserSignIn {
  const BrowserSignIn._({
    required this.state,
    required this.verifier,
    required this.challenge,
  });

  /// Makes a request from [random], which is secure unless a test says so.
  factory BrowserSignIn.create([Random? random]) {
    final source = random ?? Random.secure();
    // 64 bytes make 86 characters, inside RFC 7636's 43 to 128.
    final verifier = _randomString(source, 64);
    return BrowserSignIn._(
      state: _randomString(source, 24),
      verifier: verifier,
      challenge: challengeOf(verifier),
    );
  }

  /// The scheme, host, and path the Android manifest registers, and the
  /// server accepts: any `matinee:` URI.
  static const redirectUri = 'matinee://auth/callback';
  static const callbackScheme = 'matinee';

  /// What the browser sends back, to tell this request's answer from another.
  final String state;

  /// What only this app knows, to trade the code for a session.
  final String verifier;

  /// The base64url SHA-256 of [verifier], which the page remembers.
  final String challenge;

  /// RFC 7636's S256 challenge for [verifier].
  static String challengeOf(String verifier) =>
      _base64Url(sha256.convert(utf8.encode(verifier)).bytes);

  static String _base64Url(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  static String _randomString(Random random, int bytes) =>
      _base64Url([for (var i = 0; i < bytes; i++) random.nextInt(256)]);

  /// Whether [uri] is the redirect.
  static bool isCallback(Uri uri) =>
      uri.scheme == callbackScheme &&
      uri.host == 'auth' &&
      uri.path == '/callback';
}

/// Opens the sign-in page in the system browser and waits for the page to
/// send the browser back to the app.
abstract interface class WebAuthenticator {
  /// The URI the browser was sent back to, or null when the person closed
  /// the browser without finishing.
  Future<Uri?> authenticate(Uri url);
}

/// [WebAuthenticator] over flutter_web_auth_2: a Custom Tab or Auth Tab on
/// Android, whose redirect `CallbackActivity` hands back.
final class PlatformWebAuthenticator implements WebAuthenticator {
  const PlatformWebAuthenticator();

  @override
  Future<Uri?> authenticate(Uri url) async {
    try {
      final result = await FlutterWebAuth2.authenticate(
        url: url.toString(),
        callbackUrlScheme: BrowserSignIn.callbackScheme,
      );
      return Uri.parse(result);
    } on PlatformException catch (error) {
      if (error.code == 'CANCELED') return null;
      rethrow;
    }
  }
}
