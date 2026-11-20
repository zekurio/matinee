/// The player selected for a source. Android uses mpv by default.
enum PlayerEngine { mpv, media3 }

enum VideoFit { contain, cover, fill }

enum PlaybackPhase { idle, buffering, ready, ended, error }

/// What the player is doing. [playing] is true only while the picture and
/// sound are advancing, so it is false while buffering, paused, or ended.
/// [message] explains an [PlaybackPhase.error].
typedef PlaybackStatus = ({PlaybackPhase phase, bool playing, String? message});

typedef PlaybackTimeline = ({
  Duration position,
  Duration? duration,
  Duration? buffered,
});

typedef VideoInfo = ({int width, int height, double? frameRate});

typedef MediaTrack = ({
  String id,
  String? language,
  String? title,
  String? codec,
  bool isDefault,
  bool isForced,
  bool selected,
});

typedef PlaybackTracks = ({List<MediaTrack> audio, List<MediaTrack> subtitles});

class PlaybackState {
  const PlaybackState({
    this.status = (phase: PlaybackPhase.idle, playing: false, message: null),
    this.timeline = (position: Duration.zero, duration: null, buffered: null),
    this.tracks = (audio: const [], subtitles: const []),
    this.video,
    this.engine,
    this.serverUnavailable = false,
  });

  final PlaybackStatus status;
  final PlaybackTimeline timeline;
  final PlaybackTracks tracks;
  final VideoInfo? video;

  /// The engine the native side is using, once it says so.
  final PlayerEngine? engine;
  final bool serverUnavailable;

  PlaybackPhase get phase => status.phase;

  /// A source is open and can be commanded: not idle, and not failed.
  bool get isOpen =>
      phase != PlaybackPhase.idle && phase != PlaybackPhase.error;

  PlaybackState copyWith({
    PlaybackStatus? status,
    PlaybackTimeline? timeline,
    PlaybackTracks? tracks,
    VideoInfo? video,
    PlayerEngine? engine,
    bool? serverUnavailable,
  }) => PlaybackState(
    status: status ?? this.status,
    timeline: timeline ?? this.timeline,
    tracks: tracks ?? this.tracks,
    video: video ?? this.video,
    engine: engine ?? this.engine,
    serverUnavailable: serverUnavailable ?? this.serverUnavailable,
  );
}

/// Where a seek by [delta] from the current position lands, kept inside the
/// media when its length is known.
Duration seekTarget(PlaybackTimeline timeline, Duration delta) {
  final target = timeline.position + delta;
  if (target < Duration.zero) return Duration.zero;
  final end = timeline.duration;
  if (end != null && target > end) return end;
  return target;
}
