import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/address.dart';

void main() {
  group('serverCandidates', () {
    List<String> candidates(String input) => [
      for (final url in serverCandidates(input)) url.toString(),
    ];

    test('without a scheme tries https, then http', () {
      expect(candidates('media.example.com'), [
        'https://media.example.com/',
        'http://media.example.com/',
      ]);
    });

    test('keeps a port', () {
      expect(candidates('192.168.1.5:8420'), [
        'https://192.168.1.5:8420/',
        'http://192.168.1.5:8420/',
      ]);
    });

    test('with a scheme tries only that one', () {
      expect(candidates('http://nas.local:8420'), ['http://nas.local:8420/']);
      expect(candidates('HTTPS://Media.Example.com'), [
        'https://media.example.com/',
      ]);
    });

    test('drops spaces, trailing slashes, path, query, and fragment', () {
      expect(candidates('  https://media.example.com///  '), [
        'https://media.example.com/',
      ]);
      expect(candidates('media.example.com/library?x=1#top'), [
        'https://media.example.com/',
        'http://media.example.com/',
      ]);
    });

    test('takes an IPv6 address', () {
      expect(candidates('http://[::1]:8420'), ['http://[::1]:8420/']);
    });

    test('is empty for what is not an http or https address', () {
      expect(candidates(''), isEmpty);
      expect(candidates('   '), isEmpty);
      expect(candidates('/'), isEmpty);
      expect(candidates('ftp://media.example.com'), isEmpty);
      expect(candidates('https://'), isEmpty);
      expect(candidates('media example com'), isEmpty);
      expect(candidates('host:99999'), isEmpty);
    });
  });

  group('names', () {
    test('an origin is saved without a default port', () {
      expect(
        originKey(Uri.parse('https://a.example:443/x')),
        'https://a.example/',
      );
      expect(originKey(Uri.parse('http://a.example:80')), 'http://a.example/');
      expect(
        originKey(Uri.parse('http://a.example:8420/x')),
        'http://a.example:8420/',
      );
      expect(originKey(Uri.parse('http://[::1]:8420')), 'http://[::1]:8420/');
    });

    test('the display form has no trailing slash', () {
      expect(displayOf(Uri.parse('https://a.example/')), 'https://a.example');
      expect(
        displayOf(Uri.parse('http://192.168.1.5:8420/')),
        'http://192.168.1.5:8420',
      );
    });

    test('a saved origin parses back, or is null', () {
      expect(parseOrigin('https://a.example/')?.host, 'a.example');
      expect(parseOrigin('nonsense'), isNull);
      expect(parseOrigin(''), isNull);
    });

    test('the same origin means scheme, host, and port', () {
      final origin = Uri.parse('https://a.example/');
      expect(
        sameOrigin(Uri.parse('https://a.example/api/x?y=1'), origin),
        isTrue,
      );
      expect(sameOrigin(Uri.parse('https://a.example:443/'), origin), isTrue);
      expect(sameOrigin(Uri.parse('http://a.example/'), origin), isFalse);
      expect(sameOrigin(Uri.parse('https://a.example:8443/'), origin), isFalse);
      expect(sameOrigin(Uri.parse('https://b.example/'), origin), isFalse);
      expect(
        sameOrigin(Uri.parse('https://a.example.evil.com/'), origin),
        isFalse,
      );
    });
  });
}
