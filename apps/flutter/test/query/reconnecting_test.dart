import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/query/reconnecting.dart';

// Each test runs on fake time: the waits between connects are timers, and
// on real time a busy machine fires them late, out of step with the test's
// own wait.
void main() {
  const tick = Duration(milliseconds: 1);

  test('opens again after a drop and passes the error on', () {
    fakeAsync((async) {
      var opened = 0;
      final events = <Object>[];
      final stream = reconnecting<int>(() {
        opened++;
        if (opened > 1) return Stream.fromIterable([2, 3]);
        // A value, then the drop.
        final first = StreamController<int>();
        first
          ..add(1)
          ..addError(const SocketExceptionLike());
        unawaited(first.close());
        return first.stream;
      }, delay: (_) => tick);
      late final StreamSubscription<int> subscription;
      void add(Object event) {
        events.add(event);
        // The second stream ends cleanly and would open again at once,
        // forever on fake time.
        if (events.length == 4) unawaited(subscription.cancel());
      }

      subscription = stream.listen(add, onError: add);
      async.elapse(Duration.zero);
      expect(events, [1, const SocketExceptionLike()]);
      async.elapse(tick);
      expect(events, [1, const SocketExceptionLike(), 2, 3]);
      expect(opened, 2);
      expect(async.pendingTimers, isEmpty);
    });
  });

  test('a stream that ends after a value opens again at once', () {
    fakeAsync((async) {
      var opened = 0;
      final delays = <int>[];
      final values = <int>[];
      final stream = reconnecting<int>(
        () => Stream.value(++opened),
        delay: (attempt) {
          delays.add(attempt);
          return tick;
        },
      );
      late final StreamSubscription<int> subscription;
      // Each reconnect is a zero timer, which would run forever on fake
      // time, so it stops at the third.
      subscription = stream.listen((value) {
        values.add(value);
        if (values.length == 3) unawaited(subscription.cancel());
      });
      async.elapse(Duration.zero);
      expect(values, [1, 2, 3]);
      expect(delays, isEmpty);
      expect(async.pendingTimers, isEmpty);
    });
  });

  test('backs off on failures in a row and stops on cancel', () {
    fakeAsync((async) {
      final attempts = <int>[];
      var opened = 0;
      final stream = reconnecting<int>(
        () {
          opened++;
          return Stream<int>.error(StateError('down'));
        },
        delay: (attempt) {
          attempts.add(attempt);
          return reconnectDelay(attempt);
        },
      );
      final subscription = stream.listen(null, onError: (Object _) {});
      async.flushMicrotasks();
      expect(opened, 1);
      expect(attempts, [0]);
      // Not before the second is up.
      async.elapse(const Duration(milliseconds: 999));
      expect(opened, 1);
      async.elapse(const Duration(milliseconds: 1));
      expect(opened, 2);
      async.elapse(const Duration(seconds: 2));
      expect(opened, 3);
      async.elapse(const Duration(seconds: 4));
      expect(opened, 4);
      expect(attempts, [0, 1, 2, 3]);
      unawaited(subscription.cancel());
      async.flushMicrotasks();
      async.elapse(const Duration(minutes: 5));
      expect(opened, 4);
      expect(async.pendingTimers, isEmpty);
    });
  });

  test('a stream that ends without a word waits like a failure', () {
    fakeAsync((async) {
      var opened = 0;
      final subscription = reconnecting<int>(() {
        opened++;
        return const Stream<int>.empty();
      }, delay: (_) => const Duration(seconds: 1)).listen(null);
      async.flushMicrotasks();
      expect(opened, 1);
      async.elapse(const Duration(milliseconds: 500));
      expect(opened, 1);
      async.elapse(const Duration(milliseconds: 500));
      expect(opened, 2);
      unawaited(subscription.cancel());
      async.flushMicrotasks();
    });
  });

  test('cancelling cancels the stream it has open', () {
    fakeAsync((async) {
      var cancelled = false;
      final source = StreamController<int>(onCancel: () => cancelled = true);
      final subscription = reconnecting(() => source.stream).listen(null);
      async.flushMicrotasks();
      unawaited(subscription.cancel());
      async.flushMicrotasks();
      expect(cancelled, isTrue);
      unawaited(source.close());
      async.flushMicrotasks();
    });
  });

  test('the delay doubles from a second up to half a minute', () {
    expect(reconnectDelay(0), const Duration(seconds: 1));
    expect(reconnectDelay(1), const Duration(seconds: 2));
    expect(reconnectDelay(4), const Duration(seconds: 16));
    expect(reconnectDelay(9), const Duration(seconds: 30));
  });
}

/// An error that compares equal, to check it was passed on.
final class SocketExceptionLike implements Exception {
  const SocketExceptionLike();
}
