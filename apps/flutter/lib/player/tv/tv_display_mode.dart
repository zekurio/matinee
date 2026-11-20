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

/// Switches the screen to a refresh rate that plays the video's frame rate
/// evenly while the player is open, as the Kotlin app's
/// `MatchDisplayMode`. The frame rate is the server's, from the item's
/// probe; the rates are the display's at the resolution it has. [match]
/// asks once per frame rate, [release] lets go when the player closes.
class TvDisplayMatch {
  TvDisplayMatch(this._display);

  final TvDisplay _display;
  double? _asked;
  bool _holding = false;
  bool _released = false;

  Future<void> match(double? frameRate) async {
    if (_released || frameRate == null || frameRate == _asked) return;
    _asked = frameRate;
    try {
      final rate = matchingRefreshRate(
        await _display.refreshRates(),
        frameRate,
      );
      if (_released || rate == null) return;
      _holding = true;
      await _display.preferRefreshRate(rate);
    } on PlatformException {
      // The screen stays as it is; the video still plays.
    } on MissingPluginException {
      // Not on Android.
    }
  }

  void release() {
    _released = true;
    if (!_holding) return;
    _holding = false;
    unawaited(_display.preferRefreshRate(null).catchError((Object _) {}));
  }
}
