import 'package:flutter/foundation.dart';

import '../api/matinee_api.dart';
import 'player.dart';
import 'web_vtt.dart';

/// A note the player shows for a few seconds, over the video.
enum PlaybackNotice {
  switchFailed,
  burnInFailed,
  qualityFailed,
  subtitleFailed,
}

/// What the player's controls drive: a file the server plans
/// (`PlaybackSession`), or a download playing from the device
/// (`OfflinePlaybackSession`). The controls, the gestures, the lock, the
/// keys, picture in picture, and the system's media controls are the same
/// for both, as in the Kotlin app, where one `PlayerController` plays
/// either; what only the server has, the quality, trickplay frames, and
/// skip segments, a download leaves empty.
abstract interface class PlayerSitting implements Listenable {
  Player get player;

  String get itemId;

  /// The file, once it's known: from the server's first answer, or the
  /// download's own copy.
  MediaItem? get item;

  PlaybackState get playback;

  /// Seconds into the file.
  double get position;
  double get duration;
  double? get buffered;
  bool get ended;

  /// A source or a pick is on its way, so the controls wait.
  bool get busy;
  Object? get error;

  /// The server won't play it for this account, so trying again won't help.
  bool get refused;

  /// Nothing has arrived for a while as it buffers, so the spinner says
  /// it waits on the server.
  bool get waiting;

  /// The text subtitle the app draws itself, when one is shown.
  WebVtt? get captions;

  (PlaybackNotice, Object?)? get notice;
  void dismissNotice();

  /// Seconds a skip button or a double tap moves, or null for none.
  int? get skipBack;
  int? get skipForward;

  /// The episodes either side, for the buttons and the media keys.
  MediaItem? get previousEpisode;
  MediaItem? get nextEpisode;

  /// The next episode, once it's time to offer it.
  MediaItem? get next;

  List<AudioTrack> get audioTracks;
  AudioTrack? get audio;
  List<SubtitleTrack> get subtitleTracks;
  SubtitleTrack? get subtitle;

  /// Whether [track] can be picked in the menu.
  bool canPick(SubtitleTrack track);

  /// Whether [track] would be burned into the picture.
  bool burnsIn(SubtitleTrack track);

  /// The segment the person is in that can be skipped.
  MediaSegment? get segment;

  Trickplay? get trickplay;

  /// Where artwork [id] comes from for the system's media controls, or
  /// null without a server to ask.
  Uri? artworkUrl(String id);

  Future<void> togglePlay();
  Future<void> skip(int seconds);
  Future<void> seek(double seconds);
  Future<void> skipSegment(MediaSegment segment);
  Future<void> pickAudio(AudioTrack track);
  Future<void> pickSubtitle(SubtitleTrack? track);
  Future<void> retry();
  Future<void> close();
}

/// [PlayerSitting]'s defaults for what a download doesn't have.
mixin NoServerExtras on ChangeNotifier implements PlayerSitting {
  @override
  MediaSegment? get segment => null;

  @override
  Trickplay? get trickplay => null;

  @override
  bool get refused => false;

  @override
  bool get waiting => false;

  @override
  Future<void> skipSegment(MediaSegment segment) async {}
}
