import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/server_discovery.dart';

List<int> reply(Object? body) => utf8.encode(jsonEncode(body));

DiscoveredServer? read(Object? body) => readDiscoveryReply(reply(body));

void main() {
  group('the probe', () {
    test('is the greeting padded with spaces to exactly 512 bytes', () {
      expect(discoveryProbe, hasLength(512));
      expect(
        ascii.decode(discoveryProbe),
        'Matinee discovery v1'.padRight(512),
      );
      expect(discoveryProbe.contains(10), isFalse, reason: 'no newline');
    });
  });

  group('a reply', () {
    test('names a server', () {
      expect(
        read({
          'version': 1,
          'name': 'Matinee',
          'url': 'https://media.example.com',
        }),
        const DiscoveredServer('Matinee', 'https://media.example.com'),
      );
    });

    test('is rejected for another version, or one that is not a number', () {
      const url = 'https://media.example.com';
      expect(read({'version': 2, 'name': 'Matinee', 'url': url}), isNull);
      expect(read({'version': 0, 'name': 'Matinee', 'url': url}), isNull);
      expect(read({'version': '1', 'name': 'Matinee', 'url': url}), isNull);
      expect(read({'version': 1.0, 'name': 'Matinee', 'url': url}), isNull);
      expect(read({'name': 'Matinee', 'url': url}), isNull);
    });

    test('is rejected without a name or url, or with an empty name', () {
      expect(read({'version': 1, 'url': 'https://a.example'}), isNull);
      expect(read({'version': 1, 'name': 'Matinee'}), isNull);
      expect(
        read({'version': 1, 'name': '  ', 'url': 'https://a.example'}),
        isNull,
      );
      expect(
        read({'version': 1, 'name': 7, 'url': 'https://a.example'}),
        isNull,
      );
      expect(read({'version': 1, 'name': 'Matinee', 'url': null}), isNull);
    });

    test('is rejected for a url that is not an http or https server', () {
      for (final url in [
        'ftp://media.example.com',
        'media.example.com',
        'https://user:pass@media.example.com',
        'https://user@media.example.com',
        'javascript:alert(1)',
        'https://',
        '',
      ]) {
        expect(
          read({'version': 1, 'name': 'Matinee', 'url': url}),
          isNull,
          reason: url,
        );
      }
    });

    test('is rejected past the length limits, counted in code points', () {
      expect(
        read({'version': 1, 'name': 'n' * 64, 'url': 'https://a.example'}),
        isNotNull,
      );
      expect(
        read({'version': 1, 'name': 'n' * 65, 'url': 'https://a.example'}),
        isNull,
      );
      // 64 emoji are 128 UTF-16 units but 64 code points.
      expect(
        read({'version': 1, 'name': '🎬' * 64, 'url': 'https://a.example'}),
        isNotNull,
      );
      final long = 'https://a.example/${'p' * 381}';
      expect(long.length, 399);
      expect(read({'version': 1, 'name': 'M', 'url': long}), isNotNull);
      expect(read({'version': 1, 'name': 'M', 'url': '${long}pp'}), isNull);
    });

    test('is rejected when it is not JSON, not an object, or not UTF-8', () {
      expect(readDiscoveryReply(utf8.encode('Matinee')), isNull);
      expect(readDiscoveryReply(utf8.encode('[1]')), isNull);
      expect(readDiscoveryReply(utf8.encode('null')), isNull);
      expect(readDiscoveryReply(const []), isNull);
      expect(
        readDiscoveryReply([
          ...utf8.encode(
            '{"version":1,"name":"M","url":"https://a.example","x":"',
          ),
          0xff,
          0xfe,
          ...utf8.encode('"}'),
        ]),
        isNull,
      );
    });

    test('is rejected past 512 bytes', () {
      final body = jsonEncode({
        'version': 1,
        'name': 'Matinee',
        'url': 'https://a.example',
        'pad': ' ' * 512,
      });
      expect(utf8.encode(body).length, greaterThan(512));
      expect(readDiscoveryReply(utf8.encode(body)), isNull);
    });
  });

  group('a scan over loopback', () {
    late RawDatagramSocket responder;
    final probes = <List<int>>[];

    setUp(() async {
      probes.clear();
      responder = await RawDatagramSocket.bind(InternetAddress.loopbackIPv4, 0);
    });

    tearDown(() => responder.close());

    void answer(List<List<int>> replies) {
      responder.listen((event) {
        if (event != RawSocketEvent.read) return;
        final datagram = responder.receive();
        if (datagram == null) return;
        probes.add(datagram.data);
        for (final bytes in replies) {
          responder.send(bytes, datagram.address, datagram.port);
        }
      });
    }

    Future<List<DiscoveredServer>> scan({
      Duration timeout = const Duration(milliseconds: 400),
    }) => discoverServers(
      timeout: timeout,
      destinations: () async => [
        (InternetAddress.loopbackIPv4, responder.port),
      ],
    ).toList();

    test('sends the probe, and keeps good replies once each', () async {
      answer([
        reply({'version': 1, 'name': 'Matinee', 'url': 'https://a.example'}),
        reply({'version': 1, 'name': 'Matinee', 'url': 'https://a.example'}),
        utf8.encode('garbage'),
        reply({'version': 2, 'name': 'Matinee', 'url': 'https://old.example'}),
        reply({
          'version': 1,
          'name': 'Matinee',
          'url': 'http://192.168.1.5:8420',
        }),
      ]);

      final found = await scan();

      expect(found.map((server) => server.url), [
        'https://a.example',
        'http://192.168.1.5:8420',
      ]);
      expect(probes.single, discoveryProbe);
    });

    test('ends by itself with nothing found', () async {
      answer(const []);

      final watch = Stopwatch()..start();
      final found = await scan(timeout: const Duration(milliseconds: 200));

      expect(found, isEmpty);
      expect(
        watch.elapsed,
        greaterThanOrEqualTo(const Duration(milliseconds: 150)),
      );
    });

    test('ends early when the listener cancels', () async {
      answer([
        reply({'version': 1, 'name': 'Matinee', 'url': 'https://a.example'}),
      ]);

      final first = await discoverServers(
        timeout: const Duration(seconds: 30),
        destinations: () async => [
          (InternetAddress.loopbackIPv4, responder.port),
        ],
      ).first.timeout(const Duration(seconds: 5));

      expect(first.url, 'https://a.example');
    });
  });
}
