import 'dart:async';

import 'package:flutter/services.dart';

import '../platform/player.g.dart' as wire;
import 'playback_relay.dart';
import 'player_events.dart';
import 'player_state.dart';

export 'player_state.dart';

part 'pigeon_player.dart';

enum PlayerSourceKind { file, mp4, hls }

/// The server's track picks, expressed in the original file's stream IDs.
class SourceTracks {
  const SourceTracks({
    this.audioIndex,
    this.audioOrdinal,
    this.subtitleIndex,
    this.subtitleUrl,
    this.subtitleOffset = 0,
  });

  final int? audioIndex;
  final int? audioOrdinal;
  final int? subtitleIndex;
  final String? subtitleUrl;
  final double subtitleOffset;
}

/// Android has one active native player per activity. Opening a source
/// replaces any previous session, including one owned by another [Player].
abstract class Player {
  /// [softwareDecoders] tries the device's software decoders first, as the
  /// Decoders setting asks.
  factory Player({
    PlayerEngine engine = PlayerEngine.mpv,
    bool softwareDecoders = false,
  }) => _PigeonPlayer(engine, softwareDecoders);

  PlaybackState get state;

  /// Each new subscription starts with the current state.
  Stream<PlaybackState> get states;

  /// Opens and starts playing. A new open clears the previous source's state.
  Future<void> open(
    String url, {
    Map<String, String> headers = const {},
    Duration startPosition = Duration.zero,
    PlayerSourceKind? kind,
    SourceTracks? tracks,
    bool autoplay = true,
  });
  Future<void> play();
  Future<void> pause();
  Future<void> seekTo(Duration position);
  Future<void> setRate(double rate);

  /// Track IDs come from [state] and are valid for the current source.
  /// Passing null disables that track type.
  Future<void> selectAudioTrack(String? id);
  Future<void> selectSubtitleTrack(String? id);
  Future<void> setSourceTracks(SourceTracks tracks);

  /// Passing null removes the attached sidecar.
  Future<void> setSubtitleUrl(String? url);
  Future<void> setVideoFit(VideoFit fit);

  /// Used by VideoView. Bounds are relative to the Flutter view in physical
  /// pixels. Null hides the native surfaces. The bounds outlive [open], so a
  /// VideoView that was laid out first still places the video.
  Future<void> setVideoViewport(Rect? bounds);

  Future<void> dispose();
}
