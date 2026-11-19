import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/device_codes.dart';

import 'fakes.dart';

const device = AppDevice(name: 'Living room TV', platform: 'androidtv');

DeviceCode deviceCodeFor(String deviceCode, {int interval = 5}) => DeviceCode(
  deviceCode: deviceCode,
  userCode: 'BCDF-GHJK',
  verificationUri: 'https://a.example/link',
  verificationUriComplete: 'https://a.example/link?code=BCDF-GHJK',
  expiresIn: 600,
  interval: interval,
);

/// A server that starts codes and answers polls from [polls], one each.
final class DeviceGrant {
  DeviceGrant(this.polls);

  /// What each poll answers: a response, or a thrown error.
  final List<Object> polls;
  final started = <Map<String, Object?>>[];
  final polled = <String>[];
  var _codes = 0;

  late final client = MockClient((request) async {
    final body = jsonDecode(request.body) as Map<String, Object?>;
    switch (request.url.path) {
      case '/api/v1/auth/device':
        started.add(body);
        _codes++;
        return jsonResponse(deviceCodeFor('device-$_codes').toJson());
      case '/api/v1/auth/device/token':
        polled.add(body['deviceCode']! as String);
        final next = polls.removeAt(0);
        if (next is http.Response) return next;
        throw next;
    }
    return http.Response('', 404);
  });

  MatineeApi get api =>
      MatineeApi(base: Uri.parse('https://a.example/'), client: client);
}

final pending = jsonResponse({'status': 'pending'});
final approved = jsonResponse({
  'status': 'approved',
  'token': 'token-a',
  'user': userJson('ada'),
});
http.Response status(int code) =>
    jsonResponse({'code': 'ERROR', 'status': code, 'message': 'No.'}, code);

Future<List<DeviceCodeEvent>> run(
  DeviceGrant grant, {
  bool renew = false,
  List<Duration>? waits,
}) => deviceCodeSignIn(
  grant.api,
  device,
  renewExpired: renew,
  delay: (duration) async => waits?.add(duration),
).toList();

void main() {
  group('code sign-in', () {
    test('polls at the code\'s interval until someone approves', () async {
      final grant = DeviceGrant([pending, pending, approved]);
      final waits = <Duration>[];

      final events = await run(grant, waits: waits);

      expect(events.first, isA<DeviceCodeShown>());
      expect((events.first as DeviceCodeShown).code.userCode, 'BCDF-GHJK');
      expect(events.last, isA<DeviceCodeApproved>());
      final session = (events.last as DeviceCodeApproved).session;
      expect(session.token, 'token-a');
      expect(session.user.username, 'ada');
      expect(grant.started.single, {
        'name': 'Living room TV',
        'platform': 'androidtv',
      });
      expect(grant.polled, ['device-1', 'device-1', 'device-1']);
      expect(waits, everyElement(const Duration(seconds: 5)));
      expect(waits, hasLength(3));
    });

    test('ends when the code expires, if it is not renewed', () async {
      final grant = DeviceGrant([pending, status(404)]);

      final events = await run(grant);

      expect(events.last, isA<DeviceCodeExpired>());
      expect(events.whereType<DeviceCodeApproved>(), isEmpty);
      expect(grant.started, hasLength(1));
    });

    test('gets a new code at once when it expires, if it is renewed', () async {
      final grant = DeviceGrant([status(404), pending, approved]);

      final events = await run(grant, renew: true);

      expect(
        events.whereType<DeviceCodeShown>().map((e) => e.code.deviceCode),
        ['device-1', 'device-2'],
      );
      expect(events.last, isA<DeviceCodeApproved>());
      expect(grant.polled, ['device-1', 'device-2', 'device-2']);
      expect(events.whereType<DeviceCodeExpired>(), isEmpty);
    });

    test(
      'a refused or too quick poll tries again with the same code',
      () async {
        final grant = DeviceGrant([status(429), status(403), approved]);

        final events = await run(grant);

        final failures = events.whereType<DeviceCodeFailed>().toList();
        expect(failures, hasLength(2));
        expect(failures.every((failure) => !failure.fatal), isTrue);
        expect((failures.first.error as ApiException).status, 429);
        expect(events.last, isA<DeviceCodeApproved>());
        expect(grant.polled, ['device-1', 'device-1', 'device-1']);
        expect(grant.started, hasLength(1));
      },
    );

    test('a dropped connection keeps asking about the same code', () async {
      final grant = DeviceGrant([
        http.ClientException('Connection reset'),
        pending,
        approved,
      ]);

      final events = await run(grant);

      expect(
        events.whereType<DeviceCodeFailed>().single.error,
        isA<http.ClientException>(),
      );
      // A poll that gets through clears the failure.
      final failedAt = events.indexWhere((event) => event is DeviceCodeFailed);
      expect(
        events.skip(failedAt + 1).whereType<DeviceCodePolled>(),
        isNotEmpty,
      );
      expect(events[failedAt + 1], isA<DeviceCodeAsking>());
      expect(events.last, isA<DeviceCodeApproved>());
      expect(grant.polled, hasLength(3));
    });

    test(
      'a code that never came ends in a failure to start again from',
      () async {
        final client = MockClient((_) async => status(500));
        final events = await deviceCodeSignIn(
          MatineeApi(base: Uri.parse('https://a.example/'), client: client),
          device,
          renewExpired: true,
          delay: (_) async {},
        ).toList();

        expect(events, hasLength(1));
        final failed = events.single as DeviceCodeFailed;
        expect(failed.fatal, isTrue);
        expect((failed.error as ApiException).status, 500);
      },
    );

    test('stops polling when the listener cancels', () async {
      final grant = DeviceGrant([pending, pending, pending, pending]);
      final gate = Completer<void>();
      var waits = 0;
      final events = <DeviceCodeEvent>[];
      final subscription = deviceCodeSignIn(
        grant.api,
        device,
        renewExpired: false,
        delay: (_) async {
          if (++waits == 3) await gate.future;
        },
      ).listen(events.add);

      await Future<void>.delayed(const Duration(milliseconds: 50));
      final cancelled = subscription.cancel();
      gate.complete();
      await cancelled;

      // The third wait was held; the poll after it never goes out.
      expect(grant.polled, hasLength(2));
      expect(events.whereType<DeviceCodeApproved>(), isEmpty);
    });
  });

  group('user codes', () {
    test('are eight letters, shown with a dash', () {
      expect(UserCode.parse('BCDF-GHJK'), 'BCDF-GHJK');
      expect(UserCode.parse(' bcdf ghjk '), 'BCDF-GHJK');
      expect(UserCode.parse('bcdfghjk'), 'BCDF-GHJK');
    });

    test('use no vowels and no 0 or 1', () {
      expect(UserCode.parse('ABCD-EFGH'), isNull);
      expect(UserCode.parse('BCDF-GHJ'), isNull);
      expect(UserCode.parse('BCDF-GHJK1'), isNull);
      expect(UserCode.parse('BCDF--GHJK'), isNull);
      expect(UserCode.parse(''), isNull);
    });
  });

  group('scanned codes', () {
    test('the link page names the server and the code', () {
      final scanned = scannedCode(
        'https://media.example.com/link?code=bcdf-ghjk',
      );
      expect(scanned?.userCode, 'BCDF-GHJK');
      expect(scanned?.server, 'https://media.example.com');
    });

    test('keeps a port', () {
      expect(
        scannedCode('http://192.168.1.5:8420/link?code=BCDFGHJK')?.server,
        'http://192.168.1.5:8420',
      );
    });

    test('a bare code names no server', () {
      final scanned = scannedCode('BCDF-GHJK');
      expect(scanned?.userCode, 'BCDF-GHJK');
      expect(scanned?.server, isNull);
    });

    test('another app\'s QR code is nothing', () {
      expect(
        scannedCode('https://media.example.com/other?code=BCDF-GHJK'),
        isNull,
      );
      expect(scannedCode('https://media.example.com/link'), isNull);
      expect(scannedCode('https://media.example.com/link?code=nope'), isNull);
      expect(scannedCode('WIFI:S:home;T:WPA;P:secret;;'), isNull);
      expect(scannedCode(''), isNull);
    });
  });
}
