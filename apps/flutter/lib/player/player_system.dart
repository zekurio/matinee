import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../platform/player_system.g.dart' as wire;
import 'player_state.dart';

export '../platform/player_system.g.dart'
    show
        MediaCommandKind,
        MediaCommandMessage,
        MediaInfoMessage,
        MediaPhaseMessage,
        MediaStateMessage;

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

/// The video's controls outside the app: the notification shade, the lock
/// screen, headsets, and the small window's buttons. The player says what
/// plays and where it is, and does each press its own way.
abstract class MediaControls {
  Future<void> show(wire.MediaInfoMessage info);

  Future<void> update(wire.MediaStateMessage state);

  Future<void> hide();

  Stream<wire.MediaCommandMessage> get commands;
}

/// What the system's controls show of where the video is.
wire.MediaStateMessage mediaState({
  required bool playing,
  required PlaybackPhase phase,
  required double position,
  required double duration,
  required double rate,
}) => wire.MediaStateMessage(
  playing: playing,
  phase: switch (phase) {
    PlaybackPhase.ready => wire.MediaPhaseMessage.ready,
    PlaybackPhase.ended => wire.MediaPhaseMessage.ended,
    _ => wire.MediaPhaseMessage.buffering,
  },
  positionMs: position.isFinite ? (position * 1000).round() : 0,
  durationMs: duration > 0 && duration.isFinite
      ? (duration * 1000).round()
      : null,
  rate: rate,
);

/// How far the position may drift from where the system works it out
/// before it goes again: a seek moves it further than that.
const mediaDrift = Duration(seconds: 2);

/// Whether [next] says something the system's controls don't know yet,
/// [since] [last] went: a change of play, phase, length, or speed, or a
/// position away from where [last] would have moved on to.
bool mediaStateMoved(
  wire.MediaStateMessage? last,
  wire.MediaStateMessage next,
  Duration since,
) {
  if (last == null) return true;
  if (last.playing != next.playing ||
      last.phase != next.phase ||
      last.durationMs != next.durationMs ||
      last.rate != next.rate) {
    return true;
  }
  final moving = last.playing && last.phase == wire.MediaPhaseMessage.ready;
  final expected =
      last.positionMs + (moving ? since.inMilliseconds * last.rate : 0);
  return (next.positionMs - expected).abs() > mediaDrift.inMilliseconds;
}

/// Both through the platform. There is one window and one session, so one
/// of these listens for the whole app.
class PlatformPlayerSystem
    implements PictureInPicture, MediaControls, wire.PlayerSystemEventsApi {
  PlatformPlayerSystem([wire.PlayerSystemApi? api])
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
  final _commands = StreamController<wire.MediaCommandMessage>.broadcast();

  @override
  ValueListenable<bool> get active => _active;

  @override
  Stream<wire.MediaCommandMessage> get commands => _commands.stream;

  @override
  void pictureInPictureChanged(bool active) => _active.value = active;

  @override
  void mediaCommand(wire.MediaCommandMessage command) => _commands.add(command);

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

  @override
  Future<void> show(wire.MediaInfoMessage info) =>
      _api.showMedia(info).catchError((Object _) {});

  @override
  Future<void> update(wire.MediaStateMessage state) =>
      _api.setMediaState(state).catchError((Object _) {});

  @override
  Future<void> hide() => _api.hideMedia().catchError((Object _) {});

  void dispose() {
    wire.PlayerSystemEventsApi.setUp(null);
    _active.dispose();
    unawaited(_commands.close());
  }
}

final playerSystemProvider = Provider<PlatformPlayerSystem>((ref) {
  final system = PlatformPlayerSystem();
  ref.onDispose(system.dispose);
  return system;
});

final pictureInPictureProvider = Provider<PictureInPicture>(
  (ref) => ref.watch(playerSystemProvider),
);

final mediaControlsProvider = Provider<MediaControls>(
  (ref) => ref.watch(playerSystemProvider),
);

/// Whether the device has picture in picture, for the player's button and
/// the settings that only it uses.
final pictureInPictureAvailableProvider = FutureProvider<bool>(
  (ref) => ref.watch(pictureInPictureProvider).available(),
);
