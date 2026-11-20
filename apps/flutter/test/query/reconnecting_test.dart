import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/query/reconnecting.dart';

void main() {
  const tick = Duration(milliseconds: 1);

  test('opens again after a drop and passes the error on', () async {
    var opened = 0;
    final events = <Object>[];
    final stream = reconnecting<int>(() {
      opened++;
      return opened == 1
          ? Stream.fromIterable([1])
                .followedBy(Stream<int>.error(const SocketExceptionLike()))
          : Stream.fromIterable([2, 3]);
    }, delay: (_) => tick);
    final subscription = stream.listen(events.add, onError: events.add);
    await pumpEventQueue();
    await Future<void>.delayed(tick * 10);
    await subscription.cancel();
    expect(events.take(4), [1, const SocketExceptionLike(), 2, 3]);
    expect(opened, greaterThanOrEqualTo(2));
  });

  test('a stream that ends after a value opens again at once', () async {
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
    final subscription = stream.listen(values.add);
    await Future<void>.delayed(tick * 5);
    await subscription.cancel();
    expect(values.take(3), [1, 2, 3]);
    expect(delays, isEmpty);
  });

  test('backs off on failures in a row and stops on cancel', () async {
    final attempts = <int>[];
    var opened = 0;
    final stream = reconnecting<int>(
      () {
        opened++;
        return Stream<int>.error(StateError('down'));
      },
      delay: (attempt) {
        attempts.add(attempt);
        return tick;
      },
    );
    final subscription = stream.listen(null, onError: (Object _) {});
    await Future<void>.delayed(tick * 10);
    await subscription.cancel();
    final after = opened;
    await Future<void>.delayed(tick * 5);
    expect(attempts.take(3), [0, 1, 2]);
    expect(opened, after);
  });

  test('cancelling cancels the stream it has open', () async {
    var cancelled = false;
    final source = StreamController<int>(onCancel: () => cancelled = true);
    final subscription = reconnecting(() => source.stream).listen(null);
    await pumpEventQueue();
    await subscription.cancel();
    expect(cancelled, isTrue);
    await source.close();
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

extension on Stream<int> {
  Stream<int> followedBy(Stream<int> next) async* {
    yield* this;
    yield* next;
  }
}
