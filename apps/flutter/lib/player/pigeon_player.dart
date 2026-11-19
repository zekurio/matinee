part of 'player.dart';

class _PigeonPlayer implements Player {
  _PigeonPlayer(this._engine);

  static int _lastSession = 0;
  static final wire.PlayerApi _api = wire.PlayerApi();

  final PlayerEngine _engine;
  final StreamController<PlaybackState> _updates = StreamController.broadcast();
  PlaybackState _state = const PlaybackState();
  int? _session;
  bool _disposed = false;
  VideoFit _fit = VideoFit.contain;
  Rect? _viewport;

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
  Future<void> open(
    String url, {
    Map<String, String> headers = const {},
    Duration startPosition = Duration.zero,
  }) async {
    if (_disposed) throw StateError('Player has been disposed.');
    final previous = _session;
    if (previous != null) _unregister(previous);
    final session = ++_lastSession;
    _session = session;
    _update(
      const PlaybackState(
        status: (phase: PlaybackPhase.buffering, playing: false, message: null),
      ),
    );
    wire.PlayerEventsApi.setUp(
      _SessionEvents((message) {
        if (_session == session) {
          _update(reducePlayback(_state, PlayerEvent.fromMessage(message)));
        }
      }),
      messageChannelSuffix: '$session',
    );
    try {
      await _api.open(
        session,
        wire.OpenMessage(
          url: url,
          headers: headers,
          startMs: startPosition.inMilliseconds,
          engine: switch (_engine) {
            PlayerEngine.mpv => wire.EngineMessage.mpv,
            PlayerEngine.media3 => wire.EngineMessage.media3,
          },
          fit: _wireFit(_fit),
          viewport: _wireViewport(_viewport),
        ),
      );
    } on PlatformException catch (failure) {
      if (_session == session) {
        _update(
          reducePlayback(
            _state,
            StatusChanged((
              phase: PlaybackPhase.error,
              playing: false,
              message: failure.message ?? failure.code,
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
  Future<void> setSubtitleUrl(String? url) =>
      _command((session) => _api.setSubtitleUrl(session, url));

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
