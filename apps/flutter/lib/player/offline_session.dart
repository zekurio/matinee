import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../api/matinee_api.dart';
import '../downloads/download_tracks.dart';
import '../downloads/offline_item.dart';
import 'player.dart';
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

/// One sitting with a download, the Kotlin app's `PlayerController` for an
/// `Opening.Local`: the file plays from the device with no server to ask,
/// so the tracks are picked here (`download_tracks.dart`), a text subtitle
/// is drawn from the WebVTT saved beside it, and where the person got to
/// goes to [onReport] for the server or for later.
class OfflinePlaybackSession extends ChangeNotifier {
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
    this.startAt = 0,
    @visibleForTesting Future<String> Function(String path)? readText,
    @visibleForTesting Duration Function()? elapsed,
  }) : _readText = readText ?? _readFile,
       _elapsed = elapsed ?? (Stopwatch()..start()).elapsedNow;

  final MediaItem item;

  /// The video on the device.
  final String path;
  final DownloadKind kind;
  final List<AudioTrack> audioTracks;
  final List<SavedSubtitle> subtitles;
  final Player player;

  /// The engine is mpv, which draws ASS with its own styling.
  final bool mpv;
  final void Function(OfflineReport report) onReport;
  final double startAt;
  final Future<String> Function(String path) _readText;
  final Duration Function() _elapsed;

  AudioTrack? audio;
  SubtitleTrack? subtitle;
  PlaybackState playback = const PlaybackState();
  double position = 0;
  Object? error;
  WebVtt? captions;

  /// The saved subtitle couldn't be read.
  bool subtitleFailed = false;

  StreamSubscription<PlaybackState>? _listener;
  Timer? _timer;
  Duration _lastTick = Duration.zero;
  Duration _lastReport = Duration.zero;
  double _playedSeconds = 0;
  bool _opened = false;
  bool _closed = false;
  bool _seekedAfterFreeze = false;
  Future<void>? _closing;
  int _captionRequest = 0;

  static Future<String> _readFile(String path) => File(path).readAsString();

  /// The file as it is still holds its own streams; a version made for
  /// this device holds only the video and the audio picked.
  bool get _inFile => kind == DownloadKind.original;

  double get duration => max(
    0,
    item.durationSeconds ??
        (playback.timeline.duration == null
            ? 0
            : _seconds(playback.timeline.duration!)),
  );

  double? get buffered => switch (playback.timeline.buffered) {
    final at? => _seconds(at),
    null => null,
  };

  bool get ended => playback.phase == PlaybackPhase.ended;

  List<SubtitleTrack> get subtitleTracks => [
    for (final saved in subtitles) saved.track,
  ];

  Future<void> start() async {
    _lastTick = _elapsed();
    _lastReport = _lastTick;
    _listener = player.states.listen(_updatePlayback);
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _countPlayed();
      final interval = Duration(seconds: playback.status.playing ? 10 : 30);
      if (_elapsed() - _lastReport >= interval) _report();
    });
    position = startAt;
    _opened = true;
    final show = _show();
    try {
      await player.open(
        Uri.file(path).toString(),
        startPosition: _duration(startAt),
        kind: kind == DownloadKind.device
            ? PlayerSourceKind.mp4
            : PlayerSourceKind.file,
        tracks: _tracks(show),
      );
    } on Exception catch (failure) {
      if (_closed) return;
      error = failure;
      notifyListeners();
      return;
    }
    _showCaptions(show);
  }

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
    );
  }

  void _showCaptions(SubtitleShow show) {
    final request = ++_captionRequest;
    captions = null;
    subtitleFailed = false;
    if (show case SubtitleOnScreen(:final track)) {
      final saved = subtitles.where((entry) => entry.track.id == track.id);
      if (saved.isEmpty) return;
      unawaited(_readCaptions(saved.first.path, request));
    }
  }

  Future<void> _readCaptions(String path, int request) async {
    try {
      final cues = WebVtt.parse(await _readText(path));
      if (_closed || request != _captionRequest) return;
      captions = cues;
    } on Exception {
      if (_closed || request != _captionRequest) return;
      subtitleFailed = true;
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
    if (next.phase == PlaybackPhase.error && error == null) _failed();
    notifyListeners();
  }

  /// A download has nothing to fall back to. Frames that stopped get one
  /// seek in place to shake them loose, as the Kotlin app's; after that,
  /// it says the file didn't play.
  void _failed() {
    if (!_seekedAfterFreeze && position > 0) {
      _seekedAfterFreeze = true;
      unawaited(_command(() => player.seekTo(_duration(position))));
      return;
    }
    error = const DownloadUnplayable();
    _report();
  }

  Future<void> retry() async {
    if (_closed) return;
    error = null;
    _seekedAfterFreeze = false;
    notifyListeners();
    final show = _show();
    try {
      await player.open(
        Uri.file(path).toString(),
        startPosition: _duration(position),
        kind: kind == DownloadKind.device
            ? PlayerSourceKind.mp4
            : PlayerSourceKind.file,
        tracks: _tracks(show),
      );
    } on Exception catch (failure) {
      if (_closed) return;
      error = failure;
      notifyListeners();
    }
  }

  bool get _canChange => !_closed && _opened && error == null;

  Future<void> togglePlay() async {
    if (!_canChange) return;
    if (ended) await seek(0);
    if (playback.status.playing && !ended) {
      await _command(player.pause);
    } else {
      await _command(player.play);
    }
  }

  Future<void> skip(int seconds) => seek(position + seconds);

  Future<void> seek(double seconds) async {
    if (!_canChange) return;
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
  Future<void> pickAudio(AudioTrack track) async {
    if (!_canChange || track == audio) return;
    audio = track;
    notifyListeners();
    await _command(() => player.setSourceTracks(_tracks(_show())));
  }

  Future<void> pickSubtitle(SubtitleTrack? track) async {
    if (!_canChange || track?.id == subtitle?.id) return;
    subtitle = track;
    final show = _show();
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

  Future<void> close() => _closing ??= _close();

  Future<void> _close() async {
    _closed = true;
    _timer?.cancel();
    unawaited(_listener?.cancel());
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
