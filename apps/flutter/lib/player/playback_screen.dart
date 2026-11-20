import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/matinee_api.dart';
import '../core/device.dart';
import '../core/failure_text.dart';
import '../core/session.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../media/actions.dart' show MediaChanges, mediaChangesProvider;
import '../media/format.dart';
import '../platform/player.g.dart' as wire;
import '../router.dart';
import 'playback_device.dart';
import 'playback_report.dart';
import 'playback_session.dart';
import 'player.dart';
import 'player_controls.dart';
import 'player_motion.dart';
import 'player_overlays.dart';
import 'player_panel.dart';
import 'player_preferences.dart';
import 'player_system.dart';
import 'seek_bar.dart';
import 'subtitle_look.dart';
import 'swipe.dart';
import 'trickplay.dart';
import 'video_gestures.dart';
import 'video_view.dart';

final playbackPlayerFactoryProvider =
    Provider<Player Function(PlayerEngine, PlayerPrefs)>(
      (ref) =>
          (engine, prefs) => Player(
            engine: engine,
            softwareDecoders: prefs.decoders == Decoders.software,
            subtitleScale: prefs.subtitleScale,
            systemSubtitleScale: prefs.subtitleSystemStyle,
          ),
    );
final playbackFullscreenProvider = Provider<Future<void> Function(int, bool)>(
  (ref) => wire.PlayerApi().setFullscreen,
);

/// The brightness and volume the swipes on the video set.
final playbackLevelsProvider = Provider<DeviceLevels>(
  (ref) => PlatformLevels(),
);

class PlaybackScreen extends ConsumerStatefulWidget {
  const PlaybackScreen({required this.itemId, this.startAt, super.key});

  final String itemId;
  final double? startAt;

  @override
  ConsumerState<PlaybackScreen> createState() => _PlaybackScreenState();
}

class _PlaybackScreenState extends ConsumerState<PlaybackScreen> {
  static int _lastOwner = 0;
  late final int _owner;
  late final Future<void> Function(int, bool) _fullscreen;

  @override
  void initState() {
    super.initState();
    _owner = ++_lastOwner;
    _fullscreen = ref.read(playbackFullscreenProvider);
    unawaited(_window(true));
  }

  @override
  void dispose() {
    unawaited(_window(false));
    super.dispose();
  }

  Future<void> _window(bool enabled) async {
    try {
      await _fullscreen(_owner, enabled);
    } on Exception {
      // Playback can still show in a window if the platform cannot go full screen.
    }
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(apiProvider);
    final engineState = ref.watch(playerEngineProvider);
    final engine = engineState.value ?? PlayerEngine.mpv;
    // Read once when the player opens; a change made while it plays, like a
    // pinch that saves the fit, doesn't open it again.
    final prefsLoading = ref.watch(
      playerPrefsProvider.select((prefs) => prefs.isLoading),
    );
    final codecs = engine == PlayerEngine.media3
        ? ref.watch(playbackCodecsProvider)
        : null;
    final l = AppLocalizations.of(context);
    final auth = ref.watch(authStateProvider);
    final user = switch (auth) {
      SignedIn(:final user) => user,
      Offline(:final user) => user,
      _ => null,
    };
    void back() => context.canPop() ? context.pop() : context.go(Routes.home);

    final Widget child;
    if (api == null ||
        user == null ||
        auth is Offline ||
        codecs?.hasError == true) {
      child = _Opening(
        back: back,
        error: auth is Offline ? l.errorUnreachable : l.playerErrorLost,
      );
    } else if (engineState.isLoading ||
        prefsLoading ||
        codecs?.isLoading == true) {
      child = _Opening(back: back);
    } else {
      final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
      final profile = playbackDevice(
        engine,
        codecs?.value,
        WidgetsBinding.instance.platformDispatcher.locale.languageCode,
        prefs: prefs,
      );
      child = _PlaybackHost(
        key: ValueKey((api, widget.itemId, widget.startAt, engine)),
        create: () => PlaybackSession(
          diagnostics: _recorder(engine, prefs, profile),
          itemId: widget.itemId,
          api: api,
          httpClient: ref.read(sessionHttpProvider),
          headers: {
            ...ref.read(playerHeadersProvider),
            'User-Agent': ref.read(deviceProvider).userAgent,
          },
          player: ref.read(playbackPlayerFactoryProvider)(engine, prefs),
          device: profile,
          preferences: user.playback ?? defaultPlaybackPreferences,
          startAt: widget.startAt,
          quality: prefs.quality,
        ),
        back: back,
        next: (item) => context.replace(Routes.play(item.id), extra: 0.0),
      );
    }
    return MatineeTheme.wrap(matineeDark, child);
  }

  /// The report of this sitting, which Settings, About keeps after the
  /// player closes. The device's part comes once the platform says it.
  DiagnosticsRecorder _recorder(
    PlayerEngine engine,
    PlayerPrefs prefs,
    PlaybackDevice profile,
  ) {
    // Read now: the session's last change comes as the screen goes away.
    final store = ref.read(playbackReportProvider.notifier);
    final recorder = DiagnosticsRecorder(
      PlaybackReport(
        settings: SettingsDiagnostics.of(engine, prefs),
        capabilities: CapabilityDiagnostics.of(profile, null),
      ),
      // The session starts while the player builds, which mustn't change
      // a provider; a microtask keeps each change in order.
      (report) => scheduleMicrotask(() => store.publish(report)),
    );
    final version = ref.read(deviceProvider).appVersion;
    unawaited(
      ref.read(deviceDiagnosticsProvider.future).then((device) {
        if (device != null) {
          recorder.device(DeviceDiagnostics.of(version, device));
        }
      }),
    );
    return recorder;
  }
}

class _Opening extends StatelessWidget {
  const _Opening({required this.back, this.error});

  final VoidCallback back;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ColoredBox(
      color: const Color(0xFF000000),
      child: SafeArea(
        child: Stack(
          children: [
            PositionedDirectional(
              start: 12,
              top: 8,
              child: PlayerBackButton(label: l.playerBack, onPressed: back),
            ),
            Center(
              child: error == null
                  ? Spinner(
                      size: 48,
                      color: matineeDark.foreground,
                      label: l.loadingInProgress,
                    )
                  : Text(
                      error!,
                      style: KitText.base.style(color: matineeDark.foreground),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaybackHost extends StatefulWidget {
  const _PlaybackHost({
    required super.key,
    required this.create,
    required this.back,
    required this.next,
  });

  final PlaybackSession Function() create;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  State<_PlaybackHost> createState() => _PlaybackHostState();
}

class _PlaybackHostState extends State<_PlaybackHost> {
  late final PlaybackSession _session;
  late final MediaChanges _changes;

  @override
  void initState() {
    super.initState();
    _changes = ProviderScope.containerOf(
      context,
      listen: false,
    ).read(mediaChangesProvider.notifier);
    _session = widget.create();
    unawaited(_session.start());
  }

  @override
  void dispose() {
    // What was watched moved on: the pages under the player fetch again
    // once the server has the last position, as the Kotlin app's
    // `viewer.changed()` on leaving the player.
    unawaited(_session.close().whenComplete(_changes.changed));
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _PlaybackControls(
    session: _session,
    back: widget.back,
    next: widget.next,
  );
}

/// The menus the top bar opens in the side panel.
enum _PlayerMenu { audio, subtitles, speed, quality }

/// The speeds the speed menu offers, from half to double.
const _speeds = [.5, .75, 1.0, 1.25, 1.5, 2.0];

/// The touch controls, laid out in `player_controls.dart` as the Kotlin
/// phone player's. A menu stays open in the side panel while the video
/// continues.
class _PlaybackControls extends ConsumerStatefulWidget {
  const _PlaybackControls({
    required this.session,
    required this.back,
    required this.next,
  });

  final PlaybackSession session;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  ConsumerState<_PlaybackControls> createState() => _PlaybackControlsState();
}

class _PlaybackControlsState extends ConsumerState<_PlaybackControls> {
  static const _hideAfter = Duration(milliseconds: 3500);

  /// How long the skip button shows by itself once its segment starts, as
  /// in Jellyfin and the Kotlin player; after that it comes with the
  /// controls.
  static const skipShown = Duration(seconds: 8);
  static const _nextDelay = 10;
  Timer? _hide;
  Timer? _advance;
  bool _visible = true;
  bool _sheet = false;
  bool _leaving = false;
  bool _playing = false;
  bool _sawNextEarly = false;

  /// The countdown stopped, or never ran with autoplay off, so the next
  /// episode waits for Play.
  bool _cancelledNext = false;

  /// Hide put the next episode away while the credits roll; it comes back
  /// at the end.
  bool _hiddenNext = false;
  bool _autoplay = true;
  int _nextIn = _nextDelay;
  double? _scrubbing;
  _PlayerMenu? _menu;
  double _rate = 1;
  bool _fill = false;

  /// A finger holds the video, so it plays at [holdSpeed] for now.
  bool _holding = false;

  /// Locked, a touch on the screen only shows the unlock button.
  bool _locked = false;

  /// Counts keys and touches while locked, each showing the unlock button again.
  final int _lockTouched = 0;
  final _gesture = ValueNotifier<GestureInfo?>(null);
  late final DeviceLevels _levels;

  /// Counts pinches that switched the fit, so the note shows again for each.
  int _fitNotes = 0;

  late final PictureInPicture _pip;

  /// The app shows in the small window, with the video and its captions
  /// and nothing to touch.
  bool _small = false;

  /// What the player last told the system about entering the small window
  /// on leaving the app, which starts off.
  bool _autoSent = false;

  /// The segment whose skip button shows, and whether it's still within
  /// [skipShown] of starting.
  (String, double, double)? _segmentKey;
  bool _segmentFresh = false;
  Timer? _segmentTimer;

  late final MediaControls _media;
  StreamSubscription<MediaCommandMessage>? _commands;

  /// What the system's controls last got, so each change goes once.
  String? _mediaShown;
  MediaStateMessage? _mediaState;
  DateTime _mediaAt = DateTime.now();
  PlaybackPhase _phase = PlaybackPhase.idle;

  PlaybackSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
    _autoplay = prefs.autoplayNext;
    _cancelledNext = !_autoplay;
    _fill = prefs.fillScreen;
    if (_fill) unawaited(_applyFit());
    _levels = ref.read(playbackLevelsProvider);
    _pip = ref.read(pictureInPictureProvider);
    _small = _pip.active.value;
    _pip.active.addListener(_smallChanged);
    ref.listenManual(playerPrefsProvider, (_, _) => _syncAuto());
    _media = ref.read(mediaControlsProvider);
    _commands = _media.commands.listen(_mediaCommand);
    // The brightness the last swipe left, when settings keep it.
    final saved = prefs.brightness;
    if (prefs.swipeLevels &&
        prefs.rememberBrightness &&
        saved >= 0 &&
        saved <= 1) {
      unawaited(_levels.setBrightness(saved).catchError((Object _) {}));
    }
    _session.addListener(_updated);
    _playing = _session.playback.status.playing;
    _phase = _session.playback.phase;
    if (_playing) _resetHide();
    _syncSegment();
    _syncAuto();
  }

  @override
  void dispose() {
    _session.removeListener(_updated);
    _hide?.cancel();
    _advance?.cancel();
    _segmentTimer?.cancel();
    _gesture.dispose();
    _pip.active.removeListener(_smallChanged);
    unawaited(_commands?.cancel());
    if (_mediaShown != null) unawaited(_media.hide());
    // Leaving the app from anywhere else keeps it full size.
    if (_autoSent) unawaited(_pip.setAuto(false));
    // The window's own brightness was the player's; the system's comes back.
    unawaited(_levels.setBrightness(null).catchError((Object _) {}));
    super.dispose();
  }

  void _updated() {
    final playing = _session.playback.status.playing;
    final phase = _session.playback.phase;
    // A source the session opens again starts at normal speed.
    if (phase == PlaybackPhase.ready && _phase != phase && _rate != 1) {
      unawaited(_applyRate());
    }
    _phase = phase;
    setState(() {
      if (_playing != playing) {
        _playing = playing;
        if (!playing && _session.playback.phase == PlaybackPhase.ready) {
          _visible = true;
        }
        _resetHide();
      }
      _syncNext();
      _syncSegment();
    });
    _syncAuto();
    _syncMedia();
  }

  void _syncSegment() {
    final segment = _session.segment;
    final key = segment == null
        ? null
        : (segment.kind, segment.start, segment.end);
    if (key == _segmentKey) return;
    _segmentKey = key;
    _segmentTimer?.cancel();
    _segmentFresh = key != null;
    if (key != null) {
      _segmentTimer = Timer(
        skipShown,
        () => setState(() => _segmentFresh = false),
      );
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The words change with the language.
    _mediaShown = null;
    _syncMedia();
  }

  /// What the system's controls show: the episode and its show, or the
  /// movie and its year, with its picture, as the Kotlin player's session.
  void _syncMedia() {
    final plan = _session.plan;
    if (plan == null || _leaving) return;
    final l = AppLocalizations.of(context);
    final item = plan.item;
    final names = itemNames(item, l);
    final code = item.label.code;
    final back = _session.skipBack;
    final ahead = _session.skipForward;
    final art =
        item.episode?.still ??
        item.title?.images.backdrop ??
        item.title?.images.poster;
    final api = ref.read(apiProvider);
    final info = MediaInfoMessage(
      title: names.title,
      subtitle: item.title?.kind == TitleKind.show
          ? [names.showName, ?code].join(' · ')
          : names.year,
      artworkUrl: art == null || api == null
          ? null
          : api.paths.artwork(art.id).toString(),
      headers: ref.read(playerHeadersProvider),
      playLabel: l.playerPlay,
      pauseLabel: l.playerPause,
      backMs: back == null ? null : back * 1000,
      backLabel: back == null ? null : l.playerSkipBack(back),
      aheadMs: ahead == null ? null : ahead * 1000,
      aheadLabel: ahead == null ? null : l.playerSkipForward(ahead),
    );
    final key = [
      item.id,
      info.title,
      info.subtitle,
      info.artworkUrl,
      back,
      ahead,
      info.playLabel,
    ].join('\u0000');
    if (key != _mediaShown) {
      _mediaShown = key;
      _mediaState = null;
      unawaited(_media.show(info));
    }
    final state = mediaState(
      playing: _playing,
      phase: _session.playback.phase,
      position: _session.position,
      duration: _session.duration,
      rate: _holding ? holdSpeed : _rate,
    );
    final now = DateTime.now();
    if (!mediaStateMoved(_mediaState, state, now.difference(_mediaAt))) return;
    _mediaState = state;
    _mediaAt = now;
    unawaited(_media.update(state));
  }

  void _mediaCommand(MediaCommandMessage command) {
    switch (command.kind) {
      case MediaCommandKind.play:
        if (!_playing) unawaited(_session.togglePlay());
      case MediaCommandKind.pause:
        if (_playing) unawaited(_session.togglePlay());
      case MediaCommandKind.seekTo:
        if (command.positionMs case final ms?) {
          unawaited(_session.seek(ms / 1000));
        }
      case MediaCommandKind.back:
        if (_session.skipBack case final step?) {
          unawaited(_session.skip(-step));
        }
      case MediaCommandKind.ahead:
        if (_session.skipForward case final step?) {
          unawaited(_session.skip(step));
        }
    }
  }

  /// On while the video plays, so leaving the app keeps it on screen,
  /// unless settings turned it off.
  void _syncAuto() {
    final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
    final auto = _playing && prefs.pictureInPicture && !_leaving;
    if (auto == _autoSent) return;
    _autoSent = auto;
    unawaited(_pip.setAuto(auto));
  }

  void _smallChanged() {
    final small = _pip.active.value;
    if (small == _small) return;
    setState(() {
      _small = small;
      // Back at full size, the controls show, as after any time away.
      _visible = !small;
      _menu = null;
      _sheet = false;
    });
    _gesture.value = null;
    if (_holding) _hold(false);
    // The small window shows the whole picture, then the fit comes back.
    unawaited(
      _session.player
          .setVideoFit(_fill && !small ? VideoFit.cover : VideoFit.contain)
          .catchError((Object _) {}),
    );
    _resetHide();
  }

  void _syncNext() {
    final next = _session.error == null ? _session.next : null;
    if (next == null || !_session.ended) {
      _advance?.cancel();
      _advance = null;
      _nextIn = _nextDelay;
      _sawNextEarly = next != null;
      if (next == null) {
        _cancelledNext = !_autoplay;
        _hiddenNext = false;
      }
      return;
    }
    if (_leaving || _cancelledNext || _advance != null) return;
    if (_sawNextEarly) {
      _advance = Timer(Duration.zero, () => unawaited(_next(next)));
    } else {
      _advance = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => _nextIn--);
        if (_nextIn == 0) unawaited(_next(next));
      });
    }
  }

  void _cancelNext() {
    _advance?.cancel();
    _advance = null;
    setState(() {
      _cancelledNext = true;
      if (!_session.ended) _hiddenNext = true;
    });
  }

  void _resetHide() {
    _hide?.cancel();
    if (!_visible ||
        _small ||
        !_playing ||
        _sheet ||
        _scrubbing != null ||
        _gesture.value != null ||
        WidgetsBinding
            .instance
            .platformDispatcher
            .accessibilityFeatures
            .accessibleNavigation) {
      return;
    }
    _hide = Timer(_hideAfter, () => setState(() => _visible = false));
  }

  void _toggleControls() {
    setState(() => _visible = !_visible);
    _resetHide();
  }

  VoidCallback? _action(Future<void> Function() run, {bool enabled = true}) {
    if (!enabled) return null;
    return () {
      _resetHide();
      unawaited(run());
    };
  }

  Future<void> _next(MediaItem item) async {
    if (_leaving) return;
    _advance?.cancel();
    setState(() => _leaving = true);
    await _session.close();
    if (mounted) widget.next(item);
  }

  void _openMenu(_PlayerMenu menu) {
    setState(() {
      _menu = menu;
      _sheet = true;
    });
    _resetHide();
  }

  void _closeMenu() {
    setState(() {
      _menu = null;
      _sheet = false;
    });
    _resetHide();
  }

  Future<void> _applyRate() async {
    try {
      await _session.player.setRate(_rate);
    } on Exception {
      // The speed applies again once the source is ready.
    }
  }

  void _pickRate(double rate) {
    setState(() => _rate = rate);
    unawaited(_applyRate());
    _syncMedia();
  }

  void _pinch(bool want) {
    if (want == _fill) return;
    setState(() {
      _fill = want;
      _fitNotes++;
    });
    unawaited(_applyFit());
    // Kept for the next video, as the Kotlin app's fillScreen.
    unawaited(
      ref
          .read(playerPrefsProvider.notifier)
          .change((prefs) => prefs.copyWith(fillScreen: want))
          .catchError((Object _) {}),
    );
  }

  /// Plays at [holdSpeed] while a finger holds the video, if it plays and
  /// slower than that, and back to the picked speed as it lifts.
  bool _hold(bool start) {
    if (start) {
      if (_holding || !_playing || _rate >= holdSpeed) return false;
      setState(() => _holding = true);
      unawaited(_session.player.setRate(holdSpeed).catchError((Object _) {}));
      _syncMedia();
      return true;
    }
    if (!_holding) return false;
    if (mounted) setState(() => _holding = false);
    unawaited(_applyRate());
    if (mounted) _syncMedia();
    return false;
  }

  void _gestureStarted(GestureKind kind) {
    // A seek's note sits where the play button is.
    if (kind == GestureKind.seek) setState(() => _visible = false);
    _resetHide();
  }

  void _keepBrightness(double level) {
    final prefs = ref.read(playerPrefsProvider).value;
    if (prefs == null || !prefs.rememberBrightness) return;
    unawaited(
      ref
          .read(playerPrefsProvider.notifier)
          .change((prefs) => prefs.copyWith(brightness: level))
          .catchError((Object _) {}),
    );
  }

  void _lock() {
    setState(() {
      _locked = true;
      _visible = false;
      _menu = null;
      _sheet = false;
    });
  }

  void _unlock() {
    setState(() {
      _locked = false;
      _visible = true;
    });
    _resetHide();
  }

  Future<void> _applyFit() => _session.player
      .setVideoFit(_fill && !_small ? VideoFit.cover : VideoFit.contain)
      .catchError((Object _) {});

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final plan = _session.plan;
    final error = _session.error;
    final buffering = _session.playback.phase == PlaybackPhase.buffering;
    final loading =
        !_leaving &&
        error == null &&
        (plan == null || _session.busy || buffering);
    final controls =
        !_locked &&
        !_small &&
        (_visible || error != null || _session.ended || plan == null);
    final enabled =
        plan != null && error == null && !_session.busy && !_leaving;
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];
    final menu = _menu;
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final look = subtitleLook(ref, prefs);
    final small = _small;

    return Stack(
      fit: StackFit.expand,
      children: [
        if (plan == null || _session.refused || _leaving)
          const ColoredBox(color: Color(0xFF000000)),
        VideoView(player: _session.player),
        // The picture dimmed behind the controls, coming and going with
        // them, but not under a menu, whose own backdrop dims it.
        PlayerFade(
          visible: plan != null && controls && error == null && menu == null,
          child: const PlayerDim(),
        ),
        if (captions.isNotEmpty)
          IgnorePointer(
            child: Align(
              alignment: Alignment.bottomCenter,
              // Moves with the controls rather than jumping as they come and go.
              child: AnimatedPadding(
                duration: PlayerMotion.move,
                curve: PlayerMotion.easing,
                padding: EdgeInsets.fromLTRB(
                  48,
                  0,
                  48,
                  controls && error == null ? 150 : 28,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 2,
                  children: [
                    for (final cue in captions) SubtitleLine(cue, look: look),
                  ],
                ),
              ),
            ),
          ),
        // Taps show and hide the controls, a double tap on either side
        // skips, two fingers fill the screen or show it whole, and swipes
        // set the brightness, the volume, and the time (video_gestures.dart).
        VideoGestures(
          enabled: error == null && menu == null && !_locked && !small,
          prefs: prefs,
          levels: _levels,
          duration: () => _session.duration,
          position: () => _session.position,
          playing: () => _playing,
          notes: _gesture,
          semanticsLabel: l.a11yPlayerVideo,
          semanticsHint: controls
              ? l.a11yPlayerHideControls
              : l.a11yPlayerShowControls,
          onTap: _toggleControls,
          onDoubleTap: (ahead) {
            final step = ahead ? _session.skipForward : _session.skipBack;
            if (step != null && enabled) {
              unawaited(_session.skip(ahead ? step : -step));
            }
            _resetHide();
          },
          onPinch: _pinch,
          onSeek: (seconds) {
            if (enabled) unawaited(_session.seek(seconds));
          },
          onHold: _hold,
          onStart: _gestureStarted,
          onBrightness: _keepBrightness,
        ),
        if (!small)
          GestureNotes(
            notes: _gesture,
            duration: _session.duration,
            holding: _holding,
            frame: switch (_session.trickplay) {
              final images? => (seconds, width) => TrickplayFrame(
                itemId: _session.itemId,
                images: images,
                seconds: seconds,
                width: width,
              ),
              null => null,
            },
          ),
        TimedNote(
          token: _fitNotes == 0 ? null : _fitNotes,
          duration: const Duration(milliseconds: 1200),
          child: PlayerNote(title: _fill ? l.playerFill : l.playerFit),
        ),
        TimedNote(
          token: _session.notice,
          duration: const Duration(seconds: 5),
          onHidden: _session.dismissNotice,
          child: switch (_session.notice) {
            (final notice, final detail) => _notice(l, notice, detail),
            null => const SizedBox.shrink(),
          },
        ),
        if (loading)
          Center(
            child: Spinner(
              size: 48,
              color: matineeDark.foreground,
              label: l.loadingInProgress,
            ),
          ),
        if (plan == null && error == null && !small)
          Align(
            alignment: AlignmentDirectional.topStart,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: PlayerBackButton(
                  label: l.playerBack,
                  onPressed: widget.back,
                ),
              ),
            ),
          ),
        if (plan != null)
          PlayerFade(
            visible: controls && error == null,
            child: _controls(l, plan, enabled, loading, prefs),
          ),
        if (error != null && !small)
          // It takes the taps too, so none reaches the video under it.
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {},
            child: ColoredBox(
              color: const Color(0xCC000000),
              child: _failure(l, error),
            ),
          ),
        // The small window shows the video and its captions, and nothing
        // that wants a touch.
        if (error == null && !_leaving && !small)
          PlayerPrompts(
            lifted: controls,
            children: [
              if (_session.segment case final segment?
                  when !_locked && (_segmentFresh || controls))
                SkipSegmentButton(
                  label: switch (segment.kind) {
                    MediaSegmentKind.recap => l.playerSkipRecap,
                    MediaSegmentKind.credits => l.playerSkipCredits,
                    MediaSegmentKind.preview => l.playerSkipPreview,
                    _ => l.playerSkipIntro,
                  },
                  onPressed: _action(
                    () => _session.skipSegment(segment),
                    enabled: enabled,
                  ),
                ),
              if (_session.ended || !_hiddenNext)
                if (_session.next case final item?) _upNext(l, item, enabled),
            ],
          ),
        // Over everything else, so no touch reaches what's under it. It
        // steps aside while an error shows, so its buttons stay in reach.
        if (_locked && error == null && !small)
          PlayerLocked(
            reveals: _lockTouched,
            unlockLabel: l.playerUnlock,
            onUnlock: _unlock,
          ),
        PlayerPanel(
          entries: menu == null || plan == null
              ? null
              : _entries(l, menu, plan),
          dismissLabel: l.a11yPlayerCloseMenu,
          onDismiss: _closeMenu,
        ),
      ],
    );
  }

  Widget _controls(
    AppLocalizations l,
    PlaybackStart plan,
    bool enabled,
    bool loading,
    PlayerPrefs prefs,
  ) {
    final item = plan.item;
    final names = itemNames(item, l);
    final code = item.label.code;
    final subtitle = plan.subtitle;
    final episodes =
        item.title?.kind == TitleKind.show ||
            plan.previous != null ||
            plan.next != null
        ? (
            PlayerEpisodeButton(
              icon: Lucide.skipBack,
              label: l.playerPreviousEpisode,
              onPressed: switch (plan.previous) {
                final previous? => _action(
                  () => _next(previous),
                  enabled: !_leaving,
                ),
                null => null,
              },
            ),
            PlayerEpisodeButton(
              icon: Lucide.skipForward,
              label: l.playerNextEpisode,
              onPressed: switch (plan.next) {
                final next? => _action(() => _next(next), enabled: !_leaving),
                null => null,
              },
            ),
          )
        : null;
    return PlayerControls(
      title: names.title,
      subtitle: code == null ? null : '$code · ${names.showName}',
      backLabel: l.playerBack,
      onBack: widget.back,
      moreLabel: l.playerMore,
      menus: [
        if (prefs.pictureInPicture &&
            prefs.pictureInPictureButton &&
            (ref.watch(pictureInPictureAvailableProvider).value ?? false))
          PlayerMenuButton(
            icon: Lucide.pictureInPicture,
            label: l.playerPip,
            onPressed: () => unawaited(_pip.enter()),
          ),
        if (prefs.audioButton)
          PlayerMenuButton(
            icon: Lucide.audioLines,
            label: l.playerMenuAudio,
            onPressed: enabled ? () => _openMenu(_PlayerMenu.audio) : null,
          ),
        if (prefs.subtitlesButton)
          PlayerMenuButton(
            icon: Lucide.captions,
            label: l.playerMenuSubtitles,
            active: subtitle != null,
            state: subtitle?.label ?? l.playerSubtitlesOff,
            onPressed: enabled ? () => _openMenu(_PlayerMenu.subtitles) : null,
          ),
        PlayerMenuButton(
          icon: Lucide.gauge,
          label: l.playerSpeed,
          onPressed: enabled ? () => _openMenu(_PlayerMenu.speed) : null,
        ),
        if (plan.original || _session.qualities.isNotEmpty)
          PlayerMenuButton(
            icon: Lucide.settings,
            label: l.playerQuality,
            onPressed: enabled ? () => _openMenu(_PlayerMenu.quality) : null,
          ),
        if (prefs.lockButton)
          PlayerMenuButton(
            icon: Lucide.lock,
            label: l.playerLock,
            onPressed: _lock,
          ),
      ],
      transport: PlayerTransport(
        playing: _playing,
        loading: loading,
        playLabel: l.playerPlay,
        pauseLabel: l.playerPause,
        onTogglePlay: _action(_session.togglePlay, enabled: enabled),
        back: switch (prefs.skipButtons ? _session.skipBack : null) {
          final seconds? => (
            seconds: seconds,
            label: l.playerSkipBack(seconds),
            onPressed: _action(() => _session.skip(-seconds), enabled: enabled),
          ),
          null => null,
        },
        ahead: switch (prefs.skipButtons ? _session.skipForward : null) {
          final seconds? => (
            seconds: seconds,
            label: l.playerSkipForward(seconds),
            onPressed: _action(() => _session.skip(seconds), enabled: enabled),
          ),
          null => null,
        },
        episodes: episodes,
      ),
      seekBar: _seekBar(l, enabled),
    );
  }

  Widget _seekBar(AppLocalizations l, bool enabled) {
    final length = _session.duration;
    final at = (_scrubbing ?? _session.position).clamp(0.0, length);
    final seekable = enabled && length > 0;
    final images = _session.trickplay;
    return SeekBar(
      preview: images == null
          ? null
          : (seconds) => TrickplayFrame(
              itemId: _session.itemId,
              images: images,
              seconds: seconds,
              width: SeekBar.previewWidth,
            ),
      position: at,
      duration: length,
      buffered: _session.buffered?.clamp(0.0, length),
      scrubbing: _scrubbing != null,
      back: _session.skipBack?.toDouble(),
      ahead: _session.skipForward?.toDouble(),
      label: l.a11yPlayerSeek,
      describe: l.a11yPlayerPosition,
      onScrub: seekable
          ? (value) {
              final starting = _scrubbing == null;
              setState(() => _scrubbing = value);
              if (starting) _resetHide();
            }
          : null,
      onScrubEnd: seekable
          ? () {
              final value = _scrubbing;
              setState(() => _scrubbing = null);
              _resetHide();
              if (value != null) unawaited(_session.seek(value));
            }
          : null,
      // Accessibility adjustments seek at once.
      onSeek: seekable
          ? (value) {
              _resetHide();
              unawaited(_session.seek(value));
            }
          : null,
    );
  }

  List<PanelEntry> _entries(
    AppLocalizations l,
    _PlayerMenu menu,
    PlaybackStart plan,
  ) {
    void run(Future<void> Function() pick) => unawaited(pick());
    switch (menu) {
      case _PlayerMenu.audio:
        return [
          PanelHeading(l.playerMenuAudio),
          if (plan.audioTracks.isEmpty) PanelNote(l.playerAudioNoTracks),
          for (final track in plan.audioTracks)
            PanelChoice(
              track.label,
              detail: [track.format, ?track.layout].join(' · '),
              selected: track.index == plan.audio?.index,
              pick: () => run(() => _session.pickAudio(track)),
            ),
        ];
      case _PlayerMenu.subtitles:
        return [
          PanelHeading(l.playerMenuSubtitles),
          PanelChoice(
            l.playerSubtitlesOff,
            selected: plan.subtitle == null,
            pick: () => run(() => _session.pickSubtitle(null)),
          ),
          for (final track in plan.subtitleTracks)
            PanelChoice(
              track.label,
              detail: [
                if (track.forced) l.playerSubtitlesForced,
                if (track.sdh) 'SDH',
                track.format,
                if (track.delivery == SubtitleDelivery.burnIn)
                  l.playerSubtitlesBurnedIn,
              ].join(' · '),
              selected: track.id == plan.subtitle?.id,
              enabled: track.delivery != null,
              pick: () => run(() => _session.pickSubtitle(track)),
            ),
        ];
      case _PlayerMenu.speed:
        final decimal = NumberFormat.decimalPattern(
          Localizations.localeOf(context).toLanguageTag(),
        );
        return [
          PanelHeading(l.playerSpeed),
          for (final rate in _speeds)
            PanelChoice(
              rate == 1
                  ? l.playerSpeedNormal
                  : l.playerSpeedRate(decimal.format(rate)),
              selected: _rate == rate,
              pick: () => _pickRate(rate),
            ),
        ];
      case _PlayerMenu.quality:
        final decimal = NumberFormat.decimalPattern(
          Localizations.localeOf(context).toLanguageTag(),
        );
        return [
          PanelHeading(l.playerQuality),
          if (plan.original)
            PanelChoice(
              l.playerQualityOriginal,
              selected: plan.quality == PlaybackQuality.original,
              pick: () =>
                  run(() => _session.pickQuality(PlaybackQuality.original)),
            ),
          for (final preset in _session.qualities)
            PanelChoice(
              l.playbackQualityPreset(
                preset.height,
                l.playerBitrateMbpsExact(
                  decimal.format(preset.bitrate / 1000000),
                ),
              ),
              selected: plan.quality == preset.id,
              pick: () => run(() => _session.pickQuality(preset.id)),
            ),
        ];
    }
  }

  Widget _upNext(AppLocalizations l, MediaItem item, bool enabled) {
    final left = _session.ended
        ? _nextIn
        : (_session.duration - _session.position).ceil().clamp(0, 9999);
    final words = _cancelledNext ? l.playerPlay : l.playerUpNextIn(left);
    final title = itemNames(item, l).title;
    final code = episodeCode(item, l);
    return UpNextCard(
      heading: l.playerUpNext,
      title: code == null ? title : l.mediaCodeTitle(code, title),
      playLabel: words,
      playWords: words,
      onPlay: _action(() => _next(item), enabled: enabled),
      dismissLabel: !_session.ended
          ? l.playerUpNextHide
          : _cancelledNext
          ? null
          : l.playerUpNextCancel,
      onDismiss: !_session.ended || !_cancelledNext ? _cancelNext : null,
    );
  }

  Widget _failure(AppLocalizations l, Object error) {
    final (title, message) = _errorText(l, error);
    return PlayerFailure(
      title: title,
      message: message,
      backLabel: l.playerBack,
      onBack: widget.back,
      retryLabel: l.commonRetry,
      onRetry: _session.refused ? null : _action(_session.retry),
    );
  }

  Widget _notice(AppLocalizations l, PlaybackNotice notice, Object? detail) =>
      switch (notice) {
        PlaybackNotice.burnInFailed => PlayerNote(
          title: l.playerNoticeBurnInFailed,
          detail: l.playerNoticeBurnInFailedDetail,
        ),
        PlaybackNotice.qualityFailed => PlayerNote(
          title: l.playerNoticeSwitchFailed,
          detail: l.playerNoticeQualityFailedDetail,
        ),
        PlaybackNotice.switchFailed => PlayerNote(
          title: l.playerNoticeSwitchFailed,
          detail: detail == null ? null : _errorText(l, detail).$2,
        ),
        PlaybackNotice.subtitleFailed => PlayerNote(
          title: l.playerErrorSubtitles,
        ),
      };
}

(String, String) _errorText(AppLocalizations l, Object error) {
  switch (error) {
    case ApiException(code: playbackBusy):
      final playing = error.dataAs(PlaybackBusyData.fromJson)?.playing;
      return (
        l.playerBusy,
        playing == null ? l.playerBusyGeneric : l.playerBusyDetail(playing),
      );
    case ApiException(code: playbackRestricted):
      final reason = error.dataAs(PlaybackRestrictedData.fromJson)?.reason;
      return (
        l.playerRestricted,
        switch (reason) {
          PlaybackRestriction.bitrateOriginal => l.playerRestrictedOriginal,
          PlaybackRestriction.bitrateTranscode => l.playerRestrictedNoTranscode,
          PlaybackRestriction.bitrateFailed => l.playerRestrictedFailed,
          PlaybackRestriction.bitrate => l.playerRestrictedBitrate,
          PlaybackRestriction.transcode => l.playerRestrictedTranscode,
          _ => error.message ?? l.playerRestrictedGeneric,
        },
      );
    case ApiException(code: playbackUnplayable):
      return (l.playerErrorLost, l.playerUnplayable);
    case PlaybackServerUnavailable():
      return (l.playerErrorLost, l.errorUnreachable);
    default:
      return (l.playerErrorLost, describeFailure(l, error));
  }
}
