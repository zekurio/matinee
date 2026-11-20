import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/player_system.g.dart' as wire;

/// Picture in picture, as the Kotlin player has it: on while a video
/// plays, so leaving the app keeps it on screen, and a button that shrinks
/// it at once.
abstract class PictureInPicture {
  /// Whether the device has it; low-memory ones don't.
  Future<bool> available();

  /// Shrinks the app into the small window now, and answers whether it did.
  Future<bool> enter();

  /// Whether leaving the app shrinks it into the small window.
  Future<void> setAuto(bool enabled);

  /// Whether the app shows in the small window now.
  ValueListenable<bool> get active;
}

/// [PictureInPicture] through the platform. There is one window, so one
/// of these listens for the whole app.
class PlatformPictureInPicture
    implements PictureInPicture, wire.PlayerSystemEventsApi {
  PlatformPictureInPicture([wire.PlayerSystemApi? api])
    : _api = api ?? wire.PlayerSystemApi() {
    wire.PlayerSystemEventsApi.setUp(this);
    // The app can already be small, as when it starts again in the window.
    unawaited(
      _api
          .inPictureInPicture()
          .then((small) => _active.value = small)
          .catchError((Object _) => false),
    );
  }

  final wire.PlayerSystemApi _api;
  final _active = ValueNotifier(false);

  @override
  ValueListenable<bool> get active => _active;

  @override
  void pictureInPictureChanged(bool active) => _active.value = active;

  // A platform without the channel, like a desktop test run, has none.
  @override
  Future<bool> available() =>
      _api.hasPictureInPicture().catchError((Object _) => false);

  @override
  Future<bool> enter() =>
      _api.enterPictureInPicture().catchError((Object _) => false);

  @override
  Future<void> setAuto(bool enabled) =>
      _api.setAutoPictureInPicture(enabled).catchError((Object _) {});

  void dispose() {
    wire.PlayerSystemEventsApi.setUp(null);
    _active.dispose();
  }
}

final pictureInPictureProvider = Provider<PictureInPicture>((ref) {
  final pip = PlatformPictureInPicture();
  ref.onDispose(pip.dispose);
  return pip;
});

/// Whether the device has picture in picture, for the player's button and
/// the settings that only it uses.
final pictureInPictureAvailableProvider = FutureProvider<bool>(
  (ref) => ref.watch(pictureInPictureProvider).available(),
);
