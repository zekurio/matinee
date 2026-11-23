import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/browser_sign_in.dart';

void main() {
  test('the challenge is RFC 7636\'s S256 of the verifier', () {
    // Appendix B of RFC 7636.
    expect(
      BrowserSignIn.challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  test('a request has a verifier in RFC 7636\'s length and alphabet', () {
    final request = BrowserSignIn.create();

    expect(request.verifier.length, inInclusiveRange(43, 128));
    expect(request.verifier, matches(RegExp(r'^[A-Za-z0-9_-]+$')));
    expect(request.state, matches(RegExp(r'^[A-Za-z0-9_-]+$')));
    expect(request.challenge, BrowserSignIn.challengeOf(request.verifier));
    expect(request.challenge, isNot(contains('=')));
  });

  test('only the registered redirect is the callback', () {
    expect(
      BrowserSignIn.isCallback(Uri.parse('matinee://auth/callback?code=x')),
      isTrue,
    );
    expect(
      BrowserSignIn.isCallback(Uri.parse('matinee://auth/other')),
      isFalse,
    );
    expect(
      BrowserSignIn.isCallback(Uri.parse('matinee://evil/callback')),
      isFalse,
    );
    expect(
      BrowserSignIn.isCallback(Uri.parse('https://auth/callback')),
      isFalse,
    );
  });
}
