import 'dart:async';
import 'dart:math';

import '../api/matinee_api.dart';
import '../core/server_http.dart' show SessionChanged;

/// Holds a session's `playback.presence` stream open while [hold] is on, so
/// the server learns at once when the player goes, rather than when its
/// reports stop. The server sends one event as a stream opens and then only
/// keeps it open. It ends each stream after a few minutes, and then another
/// opens at once.
///
/// Presence is best effort: nothing it meets reaches the viewer. A stream
/// that fails, or ends before its event, opens again after 1, 2, 4, then
/// every 5 seconds, from 1 again once one delivers its event. A server that
/// turns the request down, as one from before presence does with a 404,
/// isn't asked again, and the reports carry the session as before.
final class PresenceHold {
  PresenceHold(this._open, {required this.onLost});

  final Stream<PlaybackPresence> Function() _open;

  /// A connection that had opened failed: the session sends a report, so
  /// the server hears the player is still there meanwhile.
  final void Function() onLost;

  static const firstRetry = Duration(seconds: 1);
  static const longestRetry = Duration(seconds: 5);

  StreamSubscription<PlaybackPresence>? _subscription;
  Timer? _wait;
  var _holding = false;
  var _refused = false;
  var _opened = false;
  var _delay = Duration.zero;

  /// Counts connections, so a late event from one cancelled is ignored.
  var _attempt = 0;

  /// The server turned presence down, so it isn't asked again.
  bool get refused => _refused;

  /// A connection is open or opening, or the next is waiting its turn.
  bool get holding => _holding;

  /// Hold a connection open, or stop holding one.
  set hold(bool on) {
    if (on == _holding) return;
    _holding = on;
    if (on) {
      if (!_refused) _connect();
    } else {
      _drop();
    }
  }

  /// Stop for good.
  void close() => hold = false;

  void _connect() {
    _wait = null;
    _opened = false;
    final attempt = ++_attempt;
    bool current() => _holding && attempt == _attempt;
    _subscription = _open().listen(
      (_) {
        if (!current()) return;
        _opened = true;
        _delay = Duration.zero;
      },
      onError: (Object failure) {
        if (!current()) return;
        _subscription = null;
        _failed(failure);
      },
      onDone: () {
        if (!current()) return;
        _subscription = null;
        // The server ended it on purpose: hold another at once. One that
        // ended without its event never opened, so it waits like a failure.
        if (_opened) {
          _connect();
        } else {
          _retry();
        }
      },
      cancelOnError: true,
    );
  }

  void _failed(Object failure) {
    if (_turnedDown(failure)) {
      _refused = true;
      return;
    }
    if (_opened) onLost();
    _retry();
  }

  void _retry() {
    _delay = _delay == Duration.zero
        ? firstRetry
        : Duration(
            microseconds: min(
              _delay.inMicroseconds * 2,
              longestRetry.inMicroseconds,
            ),
          );
    _wait = Timer(_delay, _connect);
  }

  void _drop() {
    _attempt++;
    _wait?.cancel();
    _wait = null;
    // Cancelling aborts the request, which closes the connection, or the
    // HTTP/2 stream on Cronet.
    final cancelling = _subscription?.cancel();
    _subscription = null;
    if (cancelling != null) unawaited(cancelling.catchError((Object _) {}));
  }
}

/// A refusal asking again won't change: any 4xx, which includes a server
/// from before presence (404) and a sign-in it no longer takes (401), and
/// a request that ends with the sign-in it went with.
bool _turnedDown(Object failure) => switch (failure) {
  ApiException(:final status) => status >= 400 && status < 500,
  SessionChanged() => true,
  _ => false,
};
