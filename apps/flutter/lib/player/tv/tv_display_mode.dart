import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../platform/display.g.dart' as wire;
import 'tv_seek.dart';

/// What the TV player asks of the screen, faked in tests.
abstract class TvDisplay {
  Future<List<double>> refreshRates();
  Future<void> preferRefreshRate(double? rate);
}

class _PigeonDisplay implements TvDisplay {
  final _api = wire.DisplayApi();

  @override
  Future<List<double>> refreshRates() => _api.refreshRates();

  @override
  Future<void> preferRefreshRate(double? rate) => _api.preferRefreshRate(rate);
}

final tvDisplayProvider = Provider<TvDisplay>((ref) => _PigeonDisplay());

/// The one [TvDisplayMatch] the app's players share, so the next episode
/// takes over the mode the last one asked for.
final tvDisplayMatchProvider = Provider<TvDisplayMatch>(
  (ref) => TvDisplayMatch(ref.watch(tvDisplayProvider)),
);

/// Switches the screen to a refresh rate that plays the video's frame rate
/// evenly while a player is open, as the Kotlin app's `MatchDisplayMode`.
/// The frame rate is the server's, from the item's probe; the rates are the
/// display's at the resolution it has.
///
/// A player [claim]s it as it opens, [match]es once the server says the
/// frame rate, and [leave]s as it closes. The next episode's player claims
/// it before the last one leaves, so the last one's leaving doesn't let go
/// of a mode the next one wants too, and a next episode at the same rate
/// asks nothing of the screen.
class TvDisplayMatch {
  TvDisplayMatch(this._display);

  final TvDisplay _display;
  Object? _owner;
  double? _asked;
  double? _held;
  int _request = 0;

  void claim(Object player) => _owner = player;

  /// Asks for the rate that plays [frameRate], or lets go for none.
  Future<void> match(Object player, double? frameRate) async {
    if (player != _owner || frameRate == _asked) return;
    _asked = frameRate;
    final request = ++_request;
    double? rate;
    try {
      if (frameRate != null) {
        rate = matchingRefreshRate(await _display.refreshRates(), frameRate);
      }
      if (request != _request || rate == _held) return;
      _held = rate;
      await _display.preferRefreshRate(rate);
    } on PlatformException {
      // The screen stays as it is; the video still plays.
    } on MissingPluginException {
      // Not on Android.
    }
  }

  /// [player] closed: lets go, unless another player has taken over.
  void leave(Object player) {
    if (player != _owner) return;
    _owner = null;
    _asked = null;
    _request++;
    if (_held == null) return;
    _held = null;
    unawaited(_display.preferRefreshRate(null).catchError((Object _) {}));
  }
}
