import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/server_http.dart';
import 'package:matinee/player/playback_presence.dart';

const _event = PlaybackPresence(graceSeconds: 10);

/// The streams a [PresenceHold] opened, each one the test drives.
final class _Server {
  final streams = <StreamController<PlaybackPresence>>[];
  final cancelled = <int>[];
  var lost = 0;

  late final hold = PresenceHold(_open, onLost: () => lost++);

  Stream<PlaybackPresence> _open() {
    final index = streams.length;
    final stream = StreamController<PlaybackPresence>(
      onCancel: () => cancelled.add(index),
    );
    streams.add(stream);
    return stream.stream;
  }

  StreamController<PlaybackPresence> get last => streams.last;
}

void main() {
  test('opens another at once when the server ends one that opened', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      expect(server.streams, hasLength(1));
      server.last.add(_event);
      unawaited(server.last.close());
      time.flushMicrotasks();
      expect(server.streams, hasLength(2));
      expect(server.lost, 0);
      server.hold.close();
    });
  });

  test('a stream that ends before its event waits like a failure, '
      'from one second up to five', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      // Without the event, none of them opened: no tight loop, no report.
      for (final wait in [1, 2, 4, 5, 5]) {
        final before = server.streams.length;
        unawaited(server.last.close());
        time.elapse(Duration(seconds: wait) - const Duration(milliseconds: 1));
        expect(server.streams, hasLength(before), reason: 'before ${wait}s');
        time.elapse(const Duration(milliseconds: 1));
        expect(server.streams, hasLength(before + 1), reason: 'after ${wait}s');
      }
      expect(server.lost, 0);
      server.hold.close();
    });
  });

  test('a connection that drops after opening reports once and retries, '
      'with the wait reset by its event', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      server.last.addError(Exception('connection reset'));
      time.flushMicrotasks();
      expect(server.lost, 0, reason: 'it never opened');
      time.elapse(const Duration(seconds: 1));
      server.last.addError(Exception('connection reset'));
      time.elapse(const Duration(seconds: 2));
      expect(server.streams, hasLength(3));

      server.last.add(_event);
      server.last.addError(Exception('connection reset'));
      time.flushMicrotasks();
      expect(server.lost, 1);
      time.elapse(const Duration(seconds: 1));
      expect(server.streams, hasLength(4), reason: 'back to one second');
      server.hold.close();
    });
  });

  test('a server from before presence is never asked again', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      server.last.addError(const ApiException(status: 404));
      time.elapse(const Duration(minutes: 5));
      expect(server.streams, hasLength(1));
      expect(server.hold.refused, isTrue);
      // Not after the app comes back either.
      server.hold.hold = false;
      server.hold.hold = true;
      time.elapse(const Duration(minutes: 1));
      expect(server.streams, hasLength(1));
      expect(server.lost, 0);
    });
  });

  test('any refusal stops it, even after a connection had opened', () {
    for (final refusal in <Object>[
      const ApiException(status: 401),
      const ApiException(status: 403),
      const SessionChanged(),
    ]) {
      fakeAsync((time) {
        final server = _Server()..hold.hold = true;
        time.flushMicrotasks();
        server.last.add(_event);
        unawaited(server.last.close());
        time.flushMicrotasks();
        server.last.addError(refusal);
        time.elapse(const Duration(minutes: 1));
        expect(server.streams, hasLength(2), reason: '$refusal');
        expect(server.lost, 0, reason: '$refusal');
      });
    }
  });

  test('a server error retries', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      server.last.addError(const ApiException(status: 503));
      time.elapse(const Duration(seconds: 1));
      expect(server.streams, hasLength(2));
      server.hold.close();
    });
  });

  test('letting go cancels the open stream and any wait', () {
    fakeAsync((time) {
      final server = _Server()..hold.hold = true;
      time.flushMicrotasks();
      server.last.add(_event);
      time.flushMicrotasks();
      server.hold.hold = false;
      time.flushMicrotasks();
      expect(server.cancelled, [0]);

      server.hold.hold = true;
      time.flushMicrotasks();
      expect(server.streams, hasLength(2), reason: 'it holds again at once');
      unawaited(server.last.close());
      time.flushMicrotasks();
      server.hold.close();
      time.elapse(const Duration(minutes: 1));
      expect(server.streams, hasLength(2), reason: 'the wait was cancelled');
      expect(server.lost, 0);
    });
  });
}
