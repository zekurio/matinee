import 'dart:async';
import 'dart:math' as math;

/// How long to wait before connecting again after [attempt] failures in a
/// row: a second, doubling up to half a minute. A stream that ended
/// cleanly, as the server's do when their time is up, comes back at once.
Duration reconnectDelay(int attempt) =>
    Duration(milliseconds: math.min(1000 * (1 << math.min(attempt, 5)), 30000));

/// The events of [open]'s stream, opened again whenever it ends or fails,
/// for as long as someone listens: the way every live stream from
/// `transport.events` is followed. An error is passed on, so the listener
/// knows the connection is down, and then it tries again after
/// [delay]; one that ended cleanly after sending something opens again at
/// once. Cancelling stops
/// the stream it has open and any wait.
///
/// Open only what the server sends whole on each connect, as `follow(...)`
/// streams and the request snapshots are: nothing that happened while it
/// was away is sent again.
Stream<T> reconnecting<T>(
  Stream<T> Function() open, {
  Duration Function(int attempt) delay = reconnectDelay,
}) {
  late final StreamController<T> controller;
  StreamSubscription<T>? current;
  Timer? wait;
  var failures = 0;
  var stopped = false;
  // Whether the stream open now sent anything: one that ends without a
  // word waits like a failure, rather than open again in a tight loop.
  var heard = false;

  void connect() {
    if (stopped) return;
    final Stream<T> stream;
    try {
      stream = open();
    } on Object catch (error, stack) {
      controller.addError(error, stack);
      wait = Timer(delay(failures++), connect);
      return;
    }
    heard = false;
    current = stream.listen(
      (value) {
        failures = 0;
        heard = true;
        controller.add(value);
      },
      onError: (Object error, StackTrace stack) {
        current = null;
        if (stopped) return;
        controller.addError(error, stack);
        wait = Timer(delay(failures++), connect);
      },
      onDone: () {
        current = null;
        if (stopped) return;
        wait = Timer(heard ? Duration.zero : delay(failures++), connect);
      },
      cancelOnError: true,
    );
  }

  controller = StreamController<T>(
    onListen: connect,
    onPause: () => current?.pause(),
    onResume: () => current?.resume(),
    onCancel: () async {
      stopped = true;
      wait?.cancel();
      await current?.cancel();
      // Its done future waits on this cancel, so not awaited here.
      unawaited(controller.close());
    },
  );
  return controller.stream;
}
