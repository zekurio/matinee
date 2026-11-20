import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../api/matinee_api.dart';
import '../core/address.dart';
import 'player.dart';
import 'web_vtt.dart';

typedef _Picks = ({int? audio, SubtitlePick? subtitle, String? quality});

enum PlaybackNotice {
  switchFailed,
  burnInFailed,
  qualityFailed,
  subtitleFailed,
}

/// One sitting with a file. Only the server selects the source and tracks.
/// Here, positions stay on the file's clock until a command reaches an engine.
class PlaybackSession extends ChangeNotifier {
  PlaybackSession({
    required this.itemId,
    required this.api,
    required this.httpClient,
    required this.headers,
    required this.player,
    required this.device,
    required this.preferences,
    this.startAt,
    String? quality,
    @visibleForTesting String? sessionId,
    @visibleForTesting Duration Function()? elapsed,
  }) : sessionId = sessionId ?? _sessionId(),
       _elapsed = elapsed ?? (Stopwatch()..start()).elapsedNow,
       // The quality settings start in. The server answers with the nearest
       // the account may use, and a pick in the player lasts this session.
       _picks = (audio: null, subtitle: null, quality: quality);

  final String itemId;
  final String sessionId;
  final MatineeApi api;
  final http.Client httpClient;
  final Map<String, String> headers;
  final Player player;
  final PlaybackDevice device;
  final PlaybackPreferences preferences;
  final double? startAt;
  final Duration Function() _elapsed;

  PlaybackStart? plan;
  PlaybackOptions? options;
  PlaybackState playback = const PlaybackState();
  double position = 0;
  bool busy = false;
  Object? error;
  (PlaybackNotice, Object?)? notice;
  WebVtt? captions;

  /// The server's preview frames for the seek bar, once they're ready.
  Trickplay? trickplay;
  StreamSubscription<TrickplayStatus>? _trickplay;

  final _failed = <String>{};
  _Picks _picks;
  StreamSubscription<PlaybackState>? _listener;
  Timer? _timer;
  Duration _lastTick = Duration.zero;
  Duration _lastReport = Duration.zero;
  double _playedSeconds = 0;
  double _offset = 0;
  (String, double, double)? _skipped;
  Uri? _captionUrl;
  int _request = 0;
  bool _sourceFailed = false;
  bool _opened = false;
  bool _hasTimeline = false;
  bool _closed = false;
  Future<void>? _closing;
  Future<void>? _sending;
  PlaybackReportInput? _queuedReport;
  Future<void> _savingPicks = Future<void>.value();

  double get duration => max(
    0,
    plan?.item.durationSeconds ??
        (_hasTimeline && playback.timeline.duration != null
            ? _offset + _seconds(playback.timeline.duration!)
            : 0),
  );

  double? get buffered {
    final at = playback.timeline.buffered;
    return at == null ? null : _offset + _seconds(at);
  }

  int? get skipBack => _skipStep(preferences.skipBack);
  int? get skipForward => _skipStep(preferences.skipForward);

  int? _skipStep(int preferred) {
    final steps = options?.skipSteps;
    if (steps == null || steps.isEmpty) return null;
    if (steps.contains(preferred)) return preferred;
    return steps.contains(defaultSkipSeconds)
        ? defaultSkipSeconds
        : steps.first;
  }

  List<PlaybackQualityPreset> get qualities {
    final allowed = plan?.qualities ?? const [];
    final ladder = options?.qualities;
    if (ladder == null) return allowed;
    final ids = allowed.map((quality) => quality.id).toSet();
    return ladder.where((quality) => ids.contains(quality.id)).toList();
  }

  MediaSegment? get segment {
    for (final segment in plan?.segments ?? const <MediaSegment>[]) {
      if ((segment.kind, segment.start, segment.end) != _skipped &&
          position >= segment.start &&
          position < segment.end - 1) {
        return segment;
      }
    }
    return null;
  }

  bool get ended => playback.phase == PlaybackPhase.ended;

  MediaItem? get next {
    if (plan case final plan?) {
      if (ended || position >= (plan.upNextAt ?? double.infinity)) {
        return plan.next;
      }
    }
    return null;
  }

  bool get refused => switch (error) {
    ApiException(code: playbackRestricted || playbackBusy) => true,
    _ => false,
  };

  Future<void> start() {
    _lastTick = _elapsed();
    _lastReport = _lastTick;
    _listener = player.states.listen(_updatePlayback);
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      _countPlayed();
      final interval = Duration(seconds: playback.status.playing ? 10 : 30);
      if (_elapsed() - _lastReport >= interval) _report();
    });
    unawaited(_readOptions());
    _readTrickplay();
    return _ask(at: startAt, forceReload: true);
  }

  /// The seek bar does without previews until they're ready, or at all.
  void _readTrickplay() {
    _trickplay = api
        .trickplayUntilSettled(itemId)
        .listen(
          (status) {
            if (_closed || status is! TrickplayStatusReady) return;
            trickplay = status.images;
            notifyListeners();
          },
          onError: (Object _) {},
          cancelOnError: true,
        );
  }

  Future<void> _readOptions() async {
    try {
      final result = await api.playback.options();
      if (_closed) return;
      options = result;
      notifyListeners();
    } on Exception {
      // The start answer still supplies the qualities allowed for the file.
    } on TypeError {
      // Older servers may not supply all of the current options.
    }
  }

  Future<void> _ask({
    double? at,
    _Picks? picks,
    bool forceReload = false,
    bool nearest = false,
    PlaybackStart? lost,
  }) async {
    final request = ++_request;
    final previous = plan;
    final wants = picks ?? _picks;
    final pause =
        _opened &&
        !playback.status.playing &&
        playback.phase == PlaybackPhase.ready;
    busy = true;
    error = null;
    notice = null;
    notifyListeners();
    try {
      final next = await api.playback.start(
        PlaybackStartInput(
          itemId: itemId,
          sessionId: sessionId,
          device: device,
          audio: wants.audio,
          subtitle: wants.subtitle,
          quality: wants.quality,
          position: at,
          snap: nearest ? PlaybackSnap.nearest : PlaybackSnap.before,
          failed: _failed.toList(),
        ),
      );
      if (!_current(request)) return;
      // A fallback must make progress even if an older server ignores failed.
      if (_failed.contains(next.method)) {
        throw const ApiException(status: 422, code: playbackUnplayable);
      }
      final url = _serverUrl(next.url);
      final reuse =
          !forceReload && previous != null && _sameSource(previous, next);
      final settled = _settle(wants, lost, next);
      final tracks = _tracks(next, reuse ? _offset : next.offset);
      final caption = _captionFor(next);

      if (reuse) {
        await player.setSourceTracks(tracks);
        if (!_current(request)) return;
        plan = next;
        _picks = settled;
      } else {
        plan = next;
        _picks = settled;
        await _load(url, next.offset, next.start, tracks, autoplay: !pause);
      }
      if (_current(request)) _showCaptions(caption);
    } catch (failure) {
      if (_current(request)) {
        await _handleRequestFailure(failure);
      }
    } finally {
      if (_current(request)) {
        busy = false;
        notifyListeners();
      }
    }
  }

  bool _current(int request) => !_closed && request == _request;

  Future<void> _handleRequestFailure(Object failure) async {
    if (_opened &&
        !_sourceFailed &&
        !(failure is ApiException &&
            (failure.code == playbackBusy ||
                failure.code == playbackRestricted))) {
      notice = (PlaybackNotice.switchFailed, failure);
      return;
    }
    error = failure;
    if (refused) {
      busy = false;
      notifyListeners();
      await close();
      return;
    }
    if (_opened) {
      await _command(player.pause);
      if (!_closed) _report();
    }
  }

  _Picks _settle(_Picks picks, PlaybackStart? lost, PlaybackStart next) {
    if (lost == null) return picks;
    if (lost.subtitleMode == PlaybackSubtitleMode.burnIn &&
        next.subtitleMode != PlaybackSubtitleMode.burnIn) {
      notice = (PlaybackNotice.burnInFailed, null);
      return (
        audio: picks.audio,
        subtitle: const SubtitlePick(trackId: null),
        quality: picks.quality,
      );
    }
    if (picks.quality != null &&
        picks.quality != PlaybackQuality.original &&
        lost.quality != PlaybackQuality.original &&
        next.quality == PlaybackQuality.original) {
      notice = (PlaybackNotice.qualityFailed, null);
      return (
        audio: picks.audio,
        subtitle: picks.subtitle,
        quality: PlaybackQuality.original,
      );
    }
    return picks;
  }

  Future<void> _load(
    Uri url,
    double offset,
    double start,
    SourceTracks tracks, {
    required bool autoplay,
  }) async {
    final answer = plan!;
    _countPlayed();
    _offset = offset;
    position = offset + start;
    _sourceFailed = false;
    _hasTimeline = false;
    _opened = true;
    playback = const PlaybackState();
    await player.open(
      url.toString(),
      headers: headers,
      startPosition: _duration(start),
      kind: answer.hls
          ? PlayerSourceKind.hls
          : answer.method == PlaybackMethod.direct
          ? PlayerSourceKind.file
          : PlayerSourceKind.mp4,
      tracks: tracks,
      autoplay: autoplay,
    );
  }

  SourceTracks _tracks(PlaybackStart answer, double offset) {
    final track = answer.subtitle;
    final audio = answer.method == PlaybackMethod.direct ? answer.audio : null;
    int? subtitleIndex;
    Uri? subtitleUrl;
    if (track != null) {
      if (answer.subtitleMode == PlaybackSubtitleMode.player &&
          track.source == SubtitleSource.embedded &&
          track.id.startsWith('stream-')) {
        subtitleIndex = int.tryParse(track.id.substring('stream-'.length));
      }
      if (answer.subtitleMode == PlaybackSubtitleMode.client &&
          track.delivery == SubtitleDelivery.pgs) {
        final path = answer.subtitleUrl;
        if (path != null) subtitleUrl = _serverUrl(path);
      }
    }
    final ordinal = answer.audioTracks.indexWhere(
      (track) => track.index == audio?.index,
    );
    return SourceTracks(
      audioIndex: audio?.index,
      audioOrdinal: ordinal >= 0 ? ordinal : null,
      subtitleIndex: subtitleIndex,
      subtitleUrl: subtitleUrl?.toString(),
      subtitleOffset: offset,
    );
  }

  Uri _serverUrl(String path) {
    final url = api.paths.server(path);
    if (!sameOrigin(url, api.base) || url.userInfo.isNotEmpty) {
      throw const FormatException(
        'Expected a playback URL on the active server.',
      );
    }
    return url;
  }

  Uri? _captionFor(PlaybackStart answer) {
    final path = answer.subtitleUrl;
    return answer.subtitleMode == PlaybackSubtitleMode.client &&
            answer.subtitle?.delivery == SubtitleDelivery.webvtt &&
            path != null
        ? _serverUrl(path)
        : null;
  }

  void _showCaptions(Uri? url) {
    if (_captionUrl == url) return;
    _captionUrl = url;
    captions = null;
    if (url != null) unawaited(_readCaptions(url));
  }

  Future<void> _readCaptions(Uri url) async {
    try {
      var target = url;
      late http.StreamedResponse streamed;
      for (var hops = 0; ; hops++) {
        if (_closed || _captionUrl != url) return;
        streamed = await httpClient.send(
          http.Request('GET', target)..followRedirects = false,
        );
        final location = streamed.headers['location'];
        if (!streamed.isRedirect || location == null) break;
        await streamed.stream.drain<void>();
        target = target.resolve(location);
        if (hops >= 5 ||
            !{'http', 'https'}.contains(target.scheme) ||
            target.userInfo.isNotEmpty) {
          throw const FormatException('Invalid subtitle redirect.');
        }
      }
      final response = await http.Response.fromStream(streamed);
      if (response.statusCode != 200) {
        throw http.ClientException('HTTP ${response.statusCode}', url);
      }
      final cues = WebVtt.parse(utf8.decode(response.bodyBytes));
      if (_closed || _captionUrl != url) return;
      captions = cues;
    } on Exception {
      if (_closed || _captionUrl != url) return;
      notice = (PlaybackNotice.subtitleFailed, null);
    }
    notifyListeners();
  }

  void _countPlayed() {
    final now = _elapsed();
    if (playback.status.playing) {
      _playedSeconds += _seconds(now - _lastTick);
    }
    _lastTick = now;
  }

  void _updatePlayback(PlaybackState _) {
    if (_closed || !_opened) return;
    final next = player.state;
    final previous = playback;
    _countPlayed();
    playback = next;
    final moved = next.timeline != previous.timeline;
    if (moved) {
      _hasTimeline = true;
      position = _offset + _seconds(next.timeline.position);
    }
    if (next.status.playing != previous.status.playing ||
        (ended && (previous.phase != PlaybackPhase.ended || moved))) {
      _report();
    }
    if (next.phase == PlaybackPhase.error && !_sourceFailed) _fallback(next);
    notifyListeners();
  }

  void _fallback(PlaybackState failed) {
    final lost = plan;
    if (lost == null) return;
    _sourceFailed = true;
    if (failed.serverUnavailable) {
      _request++;
      busy = false;
      error = const PlaybackServerUnavailable();
      return;
    }
    _failed.add(lost.method);
    unawaited(_ask(at: position, forceReload: true, lost: lost));
  }

  Future<void> retry() {
    if (_closed || busy || refused) return Future<void>.value();
    _failed.clear();
    return _ask(at: _opened ? position : startAt, forceReload: true);
  }

  Future<void> togglePlay() async {
    if (_closed || !_opened || busy || error != null) return;
    if (ended) {
      await seek(0);
      if (!_closed && error == null) await _command(player.play);
      return;
    }
    if (_closed || error != null) return;
    if (playback.status.playing && !ended) {
      await _command(player.pause);
    } else {
      await _command(player.play);
    }
  }

  Future<void> skip(int seconds) => seek(position + seconds);

  Future<void> seek(double seconds) {
    if (!_canChange) return Future<void>.value();
    _skipped = null;
    return _move(seconds);
  }

  Future<void> skipSegment(MediaSegment segment) {
    if (!_canChange) return Future<void>.value();
    _skipped = (segment.kind, segment.start, segment.end);
    return _move(segment.end);
  }

  Future<void> _move(double seconds) async {
    final answer = plan!;
    final length = duration;
    if (!seconds.isFinite || length <= 0) return;
    final target = seconds.clamp(0.0, max(0.0, length - 1)).toDouble();
    if (answer.method == PlaybackMethod.direct || answer.hls) {
      final request = ++_request;
      final moved = await _command(
        () => player.seekTo(_duration(max(0, target - _offset))),
      );
      if (!_current(request) || !moved) return;
      position = target;
    } else if (answer.method == PlaybackMethod.remux) {
      if (!await _seekStream(answer, target)) return;
    } else {
      await _ask(at: target, nearest: true, forceReload: true);
    }
    if (!_closed) {
      _report();
      notifyListeners();
    }
  }

  Future<bool> _seekStream(PlaybackStart answer, double target) async {
    final request = ++_request;
    final autoplay = playback.status.playing || ended;
    busy = true;
    notice = null;
    notifyListeners();
    try {
      final seek = await api.playback.seek(
        PlaybackSeekInput(
          itemId: itemId,
          sessionId: sessionId,
          audio: answer.audio?.index ?? 0,
          position: target,
          snap: PlaybackSnap.nearest,
          audioCodecs: device.streamAudio,
        ),
      );
      if (!_current(request)) return false;
      await _load(
        _serverUrl(seek.url),
        seek.offset,
        0,
        _tracks(answer, seek.offset),
        autoplay: autoplay,
      );
      return _current(request);
    } catch (failure) {
      if (_current(request)) {
        await _handleRequestFailure(failure);
      }
      return false;
    } finally {
      if (_current(request)) {
        busy = false;
        notifyListeners();
      }
    }
  }

  bool get _canChange => !_closed && _opened && !busy && error == null;

  Future<void> pickAudio(AudioTrack track) {
    if (!_canChange || track.index == plan?.audio?.index) {
      return Future<void>.value();
    }
    _remember(audio: track.index);
    return _ask(
      at: position,
      picks: (
        audio: track.index,
        subtitle: _picks.subtitle,
        quality: _picks.quality,
      ),
    );
  }

  Future<void> pickSubtitle(SubtitleTrack? track) {
    if (!_canChange || track?.id == plan?.subtitle?.id) {
      return Future<void>.value();
    }
    final pick = SubtitlePick(trackId: track?.id);
    _remember(subtitle: pick);
    if (track != null && track.delivery != SubtitleDelivery.webvtt) {
      _failed.remove(PlaybackMethod.transcode);
    }
    return _ask(
      at: position,
      picks: (audio: _picks.audio, subtitle: pick, quality: _picks.quality),
    );
  }

  Future<void> pickQuality(String quality) {
    if (!_canChange || quality == plan?.quality) return Future<void>.value();
    if (quality != PlaybackQuality.original) {
      _failed.remove(PlaybackMethod.transcode);
    }
    return _ask(
      at: position,
      picks: (audio: _picks.audio, subtitle: _picks.subtitle, quality: quality),
    );
  }

  void _remember({int? audio, SubtitlePick? subtitle}) {
    _savingPicks = _savingPicks.then((_) async {
      if (_closed) return;
      try {
        await api.playback.pickTracks(itemId, audio: audio, subtitle: subtitle);
      } on Exception {
        // This sitting still uses the explicit pick on playback.start.
      }
    });
  }

  Future<bool> _command(Future<void> Function() command) async {
    try {
      await command();
      return true;
    } on Exception catch (failure) {
      if (!_closed) {
        notice = (PlaybackNotice.switchFailed, failure);
        notifyListeners();
      }
      return false;
    }
  }

  void dismissNotice() {
    notice = null;
    notifyListeners();
  }

  void _report({bool closed = false}) {
    if (!_opened) return;
    _lastReport = _elapsed();
    final length = duration;
    _queuedReport = PlaybackReportInput(
      positionSeconds: max(0, position),
      durationSeconds: length > 0 ? length : null,
      sessionId: sessionId,
      playedSeconds: _playedSeconds,
      paused: closed || !playback.status.playing,
      closed: closed ? true : null,
    );
    _sending ??= Future<void>.microtask(_sendReports);
  }

  Future<void> _sendReports() async {
    while (_queuedReport != null) {
      final report = _queuedReport!;
      _queuedReport = null;
      try {
        await api.playback.report(
          itemId,
          positionSeconds: report.positionSeconds,
          durationSeconds: report.durationSeconds,
          sessionId: report.sessionId,
          playedSeconds: report.playedSeconds,
          paused: report.paused,
          closed: report.closed,
        );
      } on Exception {
        // The next report includes the whole sitting's watch time.
      }
    }
    _sending = null;
  }

  Future<void> close() => _closing ??= _close();

  Future<void> _close() async {
    _closed = true;
    _timer?.cancel();
    unawaited(_listener?.cancel());
    unawaited(_trickplay?.cancel());
    _countPlayed();
    try {
      await player.dispose();
    } finally {
      _report(closed: true);
      await _sending;
    }
  }

  @override
  void dispose() {
    unawaited(close());
    super.dispose();
  }
}

class PlaybackServerUnavailable implements Exception {
  const PlaybackServerUnavailable();
}

bool _sameSource(PlaybackStart previous, PlaybackStart next) {
  if (previous.method != next.method || previous.hls != next.hls) return false;
  if (next.method == PlaybackMethod.direct) return true;
  String? burned(PlaybackStart plan) =>
      plan.subtitleMode == PlaybackSubtitleMode.burnIn
      ? plan.subtitle?.id
      : null;
  return previous.audio?.index == next.audio?.index &&
      previous.quality == next.quality &&
      previous.convertedAudio == next.convertedAudio &&
      previous.convertedVideo == next.convertedVideo &&
      burned(previous) == burned(next);
}

double _seconds(Duration duration) =>
    duration.inMicroseconds / Duration.microsecondsPerSecond;

Duration _duration(double seconds) =>
    Duration(milliseconds: (seconds * 1000).round());

String _sessionId() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}

extension on Stopwatch {
  Duration elapsedNow() => elapsed;
}
