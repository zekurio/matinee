part of 'player.dart';

class _PigeonPlayer implements Player {
  _PigeonPlayer(
    this._engine, [
    this._softwareDecoders = false,
    this._subtitles = const PlayerSubtitles(),
  ]);

  static int _lastSession = 0;
  static final wire.PlayerApi _api = wire.PlayerApi();

  final PlayerEngine _engine;
  final bool _softwareDecoders;
  final PlayerSubtitles _subtitles;
  final StreamController<PlaybackState> _updates = StreamController.broadcast();
  final _diagnostics = StreamController<wire.DiagnosticsMessage>.broadcast();
  PlaybackState _state = const PlaybackState();
  int? _session;
  bool _disposed = false;
  VideoFit _fit = VideoFit.contain;
  Rect? _viewport;
  PlaybackRelay? _relay;

  @override
  PlaybackState get state => _state;

  @override
  late final Stream<PlaybackState> states = Stream.multi((listener) {
    listener.add(_state);
    final subscription = _updates.stream.listen(
      listener.add,
      onDone: listener.close,
    );
    listener.onCancel = subscription.cancel;
  }, isBroadcast: true);

  @override
  Stream<wire.DiagnosticsMessage> get diagnostics => _diagnostics.stream;

  @override
  Future<void> open(
    String url, {
    Map<String, String> headers = const {},
    Duration startPosition = Duration.zero,
    PlayerSourceKind? kind,
    SourceTracks? tracks,
    bool autoplay = true,
  }) async {
    if (_disposed) throw StateError('Player has been disposed.');
    final previous = _session;
    if (previous != null) _unregister(previous);
    final session = ++_lastSession;
    _session = session;
    _update(
      const PlaybackState(
        status: (
          phase: PlaybackPhase.buffering,
          playing: false,
          wantsPlay: false,
          message: null,
        ),
      ),
    );
    wire.PlayerEventsApi.setUp(
      _SessionEvents((message) {
        if (_session != session) return;
        if (message is wire.DiagnosticsMessage) {
          _diagnostics.add(message);
        } else {
          _update(reducePlayback(_state, PlayerEvent.fromMessage(message)));
        }
      }),
      messageChannelSuffix: '$session',
    );
    _relay?.close();
    _relay = null;
    try {
      if (_engine == PlayerEngine.mpv && headers.isNotEmpty) {
        // Binding can yield to a back press or another open. Release the
        // previous native engine before dispose starts targeting the new id.
        if (previous != null) await _api.dispose(previous);
        final relay = await PlaybackRelay.open(Uri.parse(url), headers);
        if (_session != session || _lastSession != session) {
          relay.close();
          return;
        }
        _relay = relay;
      }
      await _api.open(
        session,
        wire.OpenMessage(
          url: _relay?.url(url) ?? url,
          headers: _relay == null ? headers : const {},
          startMs: startPosition.inMilliseconds,
          engine: switch (_engine) {
            PlayerEngine.mpv => wire.EngineMessage.mpv,
            PlayerEngine.media3 => wire.EngineMessage.media3,
          },
          fit: _wireFit(_fit),
          viewport: _wireViewport(_viewport),
          sourceKind: switch (kind) {
            PlayerSourceKind.file => wire.SourceKindMessage.file,
            PlayerSourceKind.mp4 => wire.SourceKindMessage.mp4,
            PlayerSourceKind.hls => wire.SourceKindMessage.hls,
            null => null,
          },
          tracks: tracks == null ? null : _wireTracks(tracks),
          autoplay: autoplay,
          softwareDecoders: _softwareDecoders,
          subtitleScale: _subtitles.scale,
          systemSubtitleScale: _subtitles.system,
          subtitleColor: _subtitles.color,
          subtitleBackground: _subtitles.background,
          subtitleEdge: _subtitles.edge,
        ),
      );
    } on Exception {
      if (_session == session) {
        _update(
          reducePlayback(
            _state,
            StatusChanged((
              phase: PlaybackPhase.error,
              playing: false,
              wantsPlay: false,
              message: 'Could not open the player.',
            )),
          ),
        );
      }
    }
  }

  @override
  Future<void> play() => _command(_api.play);

  @override
  Future<void> pause() => _command(_api.pause);

  @override
  Future<void> seekTo(Duration position) =>
      _command((session) => _api.seekTo(session, position.inMilliseconds));

  @override
  Future<void> setRate(double rate) =>
      _command((session) => _api.setRate(session, rate));

  @override
  Future<void> selectAudioTrack(String? id) =>
      _command((session) => _api.selectAudioTrack(session, id));

  @override
  Future<void> selectSubtitleTrack(String? id) =>
      _command((session) => _api.selectSubtitleTrack(session, id));

  @override
  Future<void> setSourceTracks(SourceTracks tracks) =>
      _command((session) => _api.setSourceTracks(session, _wireTracks(tracks)));

  @override
  Future<void> setSubtitleUrl(String? url) => _command(
    (session) => _api.setSubtitleUrl(
      session,
      url == null ? null : _relay?.url(url) ?? url,
    ),
  );

  @override
  Future<void> setVideoFit(VideoFit fit) {
    _fit = fit;
    return _command((session) => _api.setVideoFit(session, _wireFit(fit)));
  }

  @override
  Future<void> setVideoViewport(Rect? bounds) {
    if (_viewport == bounds) return Future<void>.value();
    _viewport = bounds;
    return _command(
      (session) => _api.setViewport(session, _wireViewport(bounds)),
    );
  }

  @override
  Future<void> dispose() async {
    if (_disposed) return;
    _disposed = true;
    _relay?.close();
    _relay = null;
    final session = _session;
    _session = null;
    _state = const PlaybackState();
    try {
      if (session != null) {
        _unregister(session);
        await _api.dispose(session);
      }
    } on PlatformException {
      // The native side closes its player when the activity does. A failed
      // dispose leaves nothing for the caller to do.
    } finally {
      unawaited(_updates.close());
      unawaited(_diagnostics.close());
    }
  }

  Future<void> _command(Future<void> Function(int session) command) async {
    final session = _session;
    if (session != null) await command(session);
  }

  void _update(PlaybackState next) {
    _state = next;
    _updates.add(next);
  }

  static void _unregister(int session) {
    wire.PlayerEventsApi.setUp(null, messageChannelSuffix: '$session');
  }

  wire.SourceTracksMessage _wireTracks(SourceTracks tracks) =>
      wire.SourceTracksMessage(
        audioIndex: tracks.audioIndex,
        audioOrdinal: tracks.audioOrdinal,
        subtitleIndex: tracks.subtitleIndex,
        subtitleUrl: tracks.subtitleUrl == null
            ? null
            : _relay?.url(tracks.subtitleUrl!) ?? tracks.subtitleUrl,
        subtitleOffset: tracks.subtitleOffset,
      );

  static wire.FitMessage _wireFit(VideoFit fit) => switch (fit) {
    VideoFit.contain => wire.FitMessage.contain,
    VideoFit.cover => wire.FitMessage.cover,
    VideoFit.fill => wire.FitMessage.fill,
  };

  static wire.ViewportMessage? _wireViewport(Rect? bounds) {
    if (bounds == null) return null;
    final left = bounds.left.round();
    final top = bounds.top.round();
    return wire.ViewportMessage(
      left: left,
      top: top,
      width: bounds.right.round() - left,
      height: bounds.bottom.round() - top,
    );
  }
}

class _SessionEvents implements wire.PlayerEventsApi {
  const _SessionEvents(this._receive);

  final void Function(wire.PlaybackEventMessage) _receive;

  @override
  void onEvent(wire.PlaybackEventMessage event) => _receive(event);
}
