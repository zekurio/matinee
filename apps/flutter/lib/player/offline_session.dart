import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:clock/clock.dart';
import 'package:flutter/foundation.dart';

import '../api/matinee_api.dart';
import '../downloads/download_tracks.dart';
import '../downloads/offline_item.dart';
import 'playback_report.dart';
import 'player.dart';
import 'player_sitting.dart';
import 'web_vtt.dart';

/// Where a sitting with a download got to, for the server or, while it's
/// out of reach, for later.
typedef OfflineReport = ({
  double position,
  double? duration,
  double played,
  bool paused,
  bool closed,
});

/// A subtitle track saved beside a download, at [path] on the device.
final class SavedSubtitle {
  const SavedSubtitle(this.track, this.path);

  final SubtitleTrack track;
  final String path;
}

/// One sitting with a download: the file plays from the device with no server
/// to ask, so the tracks are picked here (`download_tracks.dart`), a text
/// subtitle is drawn from the WebVTT saved beside it, and where the person got
/// to goes to [onReport] for the server or for later. The controls are the
/// stream's (`PlaybackControls`), through [PlayerSitting].
class OfflinePlaybackSession extends ChangeNotifier
    with NoServerExtras
    implements PlayerSitting {
  OfflinePlaybackSession({
    required this.item,
    required this.path,
    required this.kind,
    required this.audioTracks,
    required this.subtitles,
    required this.player,
    required this.mpv,
    required this.onReport,
    this.audio,
    this.subtitle,
    this.offline,
    this.startAt = 0,
    this.skipBack,
    this.skipForward,
    this.diagnostics,
    this._artwork,
    @visibleForTesting Future<String> Function(String path)? readText,
    @visibleForTesting Duration Function()? elapsed,
  }) : _readText = readText ?? _readFile,
       _elapsed = elapsed ?? (clock.stopwatch()..start()).elapsedNow;

  @override
  final MediaItem item;

  /// The video on the device.
  final String path;
  final DownloadKind kind;
  @override
  final List<AudioTrack> audioTracks;
  final List<SavedSubtitle> subtitles;
  @override
  final Player player;

  /// The engine is mpv, which draws ASS with its own styling.
  final bool mpv;
  final void Function(OfflineReport report) onReport;

  /// What the server said to offer while this plays, as `downloads.resolve`
  /// sent it for the download. Null for one made before it said: no skips,
  /// and the next episode only at the end.
  final DownloadOffline? offline;
  final double startAt;
  @override
  final int? skipBack;
  @override
  final int? skipForward;

  /// This sitting's report, which Settings, About keeps, as a stream's.
  final DiagnosticsRecorder? diagnostics;
  final Uri Function(String id)? _artwork;
  final Future<String> Function(String path) _readText;
  final Duration Function() _elapsed;

  @override
  AudioTrack? audio;
  @override
  SubtitleTrack? subtitle;
  @override
  PlaybackState playback = const PlaybackState();
  @override
  double position = 0;
  @override
  Object? error;
  @override
  WebVtt? captions;
  @override
  (PlaybackNotice, Object?)? notice;

  /// The episodes either side, from the server while it answers, and from
  /// the downloads on the device when it doesn't.
  @override
  MediaItem? previousEpisode;
  @override
  MediaItem? nextEpisode;

  StreamSubscription<PlaybackState>? _listener;
  StreamSubscription<Object>? _diagnosed;
  ErrorDiagnostics? _engineError;
  Timer? _timer;
  Duration _lastTick = Duration.zero;
  Duration _lastReport = Duration.zero;
  double _playedSeconds = 0;
  bool _opened = false;
  bool _closed = false;
  Future<void>? _closing;
  int _captionRequest = 0;

  /// The player draws the captions, as its external subtitle.
  bool _playerCaptions = false;
  (String, double, double)? _skipped;

  static Future<String> _readFile(String path) => File(path).readAsString();

  /// The file as it is still holds its own streams; a version made for
  /// this device holds only the video and the audio picked.
  bool get _inFile => kind == DownloadKind.original;

  @override
  String get itemId => item.id;

  @override
  double get duration => max(
    0,
    item.durationSeconds ??
        (playback.timeline.duration == null
            ? 0
            : _seconds(playback.timeline.duration!)),
  );

  /// None: the whole file is on the device, so a band for how much has
  /// arrived would only show how far ahead the engine has read.
  @override
  double? get buffered => null;

  @override
  bool get ended => playback.phase == PlaybackPhase.ended;

  /// Opening, before the engine says anything.
  @override
  bool get busy =>
      _opened &&
      !_closed &&
      error == null &&
      playback.phase == PlaybackPhase.idle;

  /// The next episode, from the server's `upNextAt`, or at the end.
  @override
  MediaItem? get next =>
      error == null &&
          (ended || position >= (offline?.upNextAt ?? double.infinity))
      ? nextEpisode
      : null;

  /// The part being played, until it's skipped, as a stream's.
  @override
  MediaSegment? get segment {
    for (final segment in offline?.segments ?? const <MediaSegment>[]) {
      if ((segment.kind, segment.start, segment.end) != _skipped &&
          position >= segment.start &&
          position < segment.end - 1) {
        return segment;
      }
    }
    return null;
  }

  @override
  Future<void> skipSegment(MediaSegment segment) async {
    if (!_canChange) return;
    await seek(segment.end);
    _skipped = (segment.kind, segment.start, segment.end);
  }

  @override
  List<SubtitleTrack> get subtitleTracks => [
    for (final saved in subtitles) saved.track,
  ];

  /// A track neither the engine nor the screen can draw shows nothing.
  @override
  bool canPick(SubtitleTrack track) =>
      downloadSubtitleShow(track, mpv: mpv, inFile: _inFile) is! SubtitleOff;

  /// A download holds what it holds; nothing is burned in for it.
  @override
  bool burnsIn(SubtitleTrack track) => false;

  @override
  Uri? artworkUrl(String id) => _artwork?.call(id);

  /// The episodes either side, once the server or the downloads say.
  void episodes(MediaItem? previous, MediaItem? next) {
    if (_closed) return;
    previousEpisode = previous;
    nextEpisode = next;
    notifyListeners();
  }

  @override
  void dismissNotice() {
    notice = null;
    notifyListeners();
  }

  Future<void> start() async {
    _lastTick = _elapsed();
    _lastReport = _lastTick;
    _listener = player.states.listen(_updatePlayback);
    _diagnosed = player.diagnostics.listen((message) {
      if (message.error case final error?) {
        _engineError = ErrorDiagnostics.of(error);
      }
      diagnostics?.engine(message);
    });
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _countPlayed();
      final interval = Duration(seconds: playback.status.playing ? 10 : 30);
      if (_elapsed() - _lastReport >= interval) _report();
    });
    position = startAt;
    _opened = true;
    final show = _show();
    if (await _open(show, startAt, AttemptReason.start)) _showCaptions(show);
  }

  /// Loads the file at [at] seconds, as the report's attempt for [reason].
  Future<bool> _open(SubtitleShow show, double at, AttemptReason reason) async {
    diagnostics?.attemptLocal(reason, at: at, audioIndex: audio?.index);
    _select(show);
    try {
      await player.open(
        Uri.file(path).toString(),
        startPosition: _duration(at),
        kind: kind == DownloadKind.device
            ? PlayerSourceKind.mp4
            : PlayerSourceKind.file,
        tracks: _tracks(show),
      );
      return true;
    } on Exception {
      if (_closed) return false;
      diagnostics?.failed(_engineError ?? ErrorDiagnostics.unknown);
      error = const DownloadUnplayable();
      notifyListeners();
      return false;
    }
  }

  void _select(SubtitleShow show) => diagnostics?.selected(
    SelectionDiagnostics.picked(audio, subtitle, switch (show) {
      SubtitleOnScreen() => SubtitleRendering.screen,
      SubtitleInFile() => SubtitleRendering.player,
      SubtitleOff() => null,
    }),
  );

  SubtitleShow _show() =>
      downloadSubtitleShow(subtitle, mpv: mpv, inFile: _inFile);

  /// The file's own streams: by their index in the file as it is; in a
  /// version made for this device, the audio follows the video in the
  /// order the server's plan gave them.
  SourceTracks _tracks(SubtitleShow show) {
    final picked = audio;
    final ordinal = picked == null ? -1 : audioTracks.indexOf(picked);
    return SourceTracks(
      audioIndex: picked == null
          ? null
          : _inFile
          ? picked.index
          : ordinal + 1,
      audioOrdinal: ordinal >= 0 ? ordinal : null,
      subtitleIndex: switch (show) {
        SubtitleInFile(:final stream) => stream,
        _ => null,
      },
      subtitleUrl: _playerCaptions ? _captionFile(show) : null,
    );
  }

  /// The saved WebVTT of the subtitle the app draws, or null when it draws
  /// none.
  String? _captionFile(SubtitleShow show) {
    if (show case SubtitleOnScreen(:final track)) {
      for (final saved in subtitles) {
        if (saved.track.id == track.id) return saved.path;
      }
    }
    return null;
  }

  @override
  Future<void> drawCaptionsInPlayer(bool on) async {
    if (_playerCaptions == on) return;
    _playerCaptions = on;
    final path = _captionFile(_show());
    if (path == null || _closed) return;
    await _command(() => player.setSubtitleUrl(on ? path : null));
  }

  void _showCaptions(SubtitleShow show) {
    final request = ++_captionRequest;
    captions = null;
    final path = _captionFile(show);
    if (path != null) unawaited(_readCaptions(path, request));
  }

  Future<void> _readCaptions(String path, int request) async {
    try {
      final cues = WebVtt.parse(await _readText(path));
      if (_closed || request != _captionRequest) return;
      captions = cues;
    } on Exception {
      if (_closed || request != _captionRequest) return;
      notice = (PlaybackNotice.subtitleFailed, null);
      diagnostics?.note(DiagnosticsNote.subtitleLoadFailed);
    }
    notifyListeners();
  }

  void _countPlayed() {
    final now = _elapsed();
    if (playback.status.playing) _playedSeconds += _seconds(now - _lastTick);
    _lastTick = now;
  }

  void _updatePlayback(PlaybackState _) {
    if (_closed || !_opened) return;
    final next = player.state;
    final previous = playback;
    _countPlayed();
    playback = next;
    if (next.timeline != previous.timeline) {
      position = _seconds(next.timeline.position);
    }
    if (next.status.playing != previous.status.playing ||
        (ended && previous.phase != PlaybackPhase.ended)) {
      _report();
    }
    if (next.phase == PlaybackPhase.ready &&
        previous.phase != PlaybackPhase.ready) {
      diagnostics?.playing();
    }
    if (next.phase == PlaybackPhase.error && error == null) _failed();
    notifyListeners();
  }

  /// A download has nothing to fall back to, so it says the file didn't play.
  /// Frames that stopped arriving get one seek in place first, which the engine
  /// makes itself for a file on the device (`Media3Engine`).
  void _failed() {
    diagnostics?.failed(_engineError ?? ErrorDiagnostics.unknown);
    _engineError = null;
    error = const DownloadUnplayable();
    _report();
  }

  @override
  Future<void> retry() async {
    if (_closed) return;
    error = null;
    notifyListeners();
    final show = _show();
    if (await _open(show, position, AttemptReason.retry)) _showCaptions(show);
  }

  bool get _canChange => !_closed && _opened && error == null;

  @override
  Future<void> togglePlay() async {
    if (!_canChange) return;
    if (ended) await seek(0);
    if (playback.status.wantsPlay && !ended) {
      await _command(player.pause);
    } else {
      await _command(player.play);
    }
  }

  @override
  Future<void> skip(int seconds) => seek(position + seconds);

  @override
  Future<void> seek(double seconds) async {
    if (!_canChange) return;
    _skipped = null;
    final length = duration;
    if (!seconds.isFinite || length <= 0) return;
    final target = seconds.clamp(0.0, max(0.0, length - 1)).toDouble();
    if (!await _command(() => player.seekTo(_duration(target)))) return;
    if (_closed) return;
    position = target;
    _report();
    notifyListeners();
  }

  /// A download holds only its own tracks, so it picks among them; nothing
  /// is remembered on a server.
  @override
  Future<void> pickAudio(AudioTrack track) async {
    if (!_canChange || track == audio) return;
    audio = track;
    final show = _show();
    _select(show);
    notifyListeners();
    await _command(() => player.setSourceTracks(_tracks(show)));
  }

  @override
  Future<void> pickSubtitle(SubtitleTrack? track) async {
    if (!_canChange || track?.id == subtitle?.id) return;
    subtitle = track;
    final show = _show();
    _select(show);
    _showCaptions(show);
    notifyListeners();
    await _command(() => player.setSourceTracks(_tracks(show)));
  }

  Future<bool> _command(Future<void> Function() command) async {
    try {
      await command();
      return true;
    } on Exception {
      return false;
    }
  }

  void _report({bool closed = false}) {
    if (!_opened) return;
    _lastReport = _elapsed();
    final length = duration;
    onReport((
      position: max(0, position),
      duration: length > 0 ? length : null,
      played: _playedSeconds,
      paused: closed || !playback.status.playing,
      closed: closed,
    ));
  }

  @override
  Future<void> close() => _closing ??= _close();

  Future<void> _close() async {
    _closed = true;
    _timer?.cancel();
    unawaited(_listener?.cancel());
    unawaited(_diagnosed?.cancel());
    diagnostics?.closed();
    _countPlayed();
    try {
      await player.dispose();
    } finally {
      _report(closed: true);
    }
  }

  @override
  void dispose() {
    unawaited(close());
    super.dispose();
  }
}

/// The download didn't play, and there's nothing to fall back to.
class DownloadUnplayable implements Exception {
  const DownloadUnplayable();
}

double _seconds(Duration duration) =>
    duration.inMicroseconds / Duration.microsecondsPerSecond;

Duration _duration(double seconds) =>
    Duration(milliseconds: (seconds * 1000).round());

extension on Stopwatch {
  Duration elapsedNow() => elapsed;
}
