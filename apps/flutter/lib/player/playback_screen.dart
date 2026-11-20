import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../core/device.dart';
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
import 'player_parts.dart';
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
            subtitles: playerSubtitles(prefs),
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
      child = PlaybackHost(
        key: ValueKey((api, widget.itemId, widget.startAt, engine)),
        create: () => createPlaybackSession(
          ref,
          api: api,
          user: user,
          engine: engine,
          codecs: codecs?.value,
          itemId: widget.itemId,
          startAt: widget.startAt,
        ),
        builder: (session) => PlaybackControls(
          session: session,
          back: back,
          next: (item) => context.replace(Routes.play(item.id), extra: 0.0),
        ),
      );
    }
    return MatineeTheme.wrap(matineeDark, child);
  }
}

/// A sitting with [itemId] on the server, set up as settings say: the
/// engine and its decoders, the codecs this device plays, the quality to
/// start in, the account's languages and skips, and a playback report.
/// The phone's player and the TV's both start theirs here.
PlaybackSession createPlaybackSession(
  WidgetRef ref, {
  required MatineeApi api,
  required User user,
  required PlayerEngine engine,
  required wire.CodecCapabilitiesMessage? codecs,
  required String itemId,
  double? startAt,
}) {
  final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
  final profile = playbackDevice(
    engine,
    codecs,
    WidgetsBinding.instance.platformDispatcher.locale.languageCode,
    prefs: prefs,
  );
  return PlaybackSession(
    diagnostics: startPlaybackReport(ref, engine, prefs, profile),
    itemId: itemId,
    api: api,
    httpClient: ref.read(sessionHttpProvider),
    headers: {
      ...ref.read(playerHeadersProvider),
      'User-Agent': ref.read(deviceProvider).userAgent,
    },
    player: ref.read(playbackPlayerFactoryProvider)(engine, prefs),
    device: profile,
    preferences: user.playback ?? defaultPlaybackPreferences,
    startAt: startAt,
    quality: prefs.quality,
  );
}

/// The report of a sitting, which Settings, About keeps after the player
/// closes, for a stream or a download ([file], which a stream's first
/// answer gives). The device's part comes once the platform says it.
DiagnosticsRecorder startPlaybackReport(
  WidgetRef ref,
  PlayerEngine engine,
  PlayerPrefs prefs,
  PlaybackDevice profile, {
  MediaItem? file,
}) {
  // Read now: the session's last change comes as the screen goes away.
  final store = ref.read(playbackReportProvider.notifier);
  final recorder = DiagnosticsRecorder(
    PlaybackReport(
      settings: SettingsDiagnostics.of(engine, prefs),
      capabilities: CapabilityDiagnostics.of(profile, null),
      file: file == null ? const FileDiagnostics() : FileDiagnostics.of(file),
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

/// Starts the session [create] makes, and closes it when it goes, which
/// tells the pages under the player to fetch again. [builder] draws the
/// controls over it.
class PlaybackHost extends StatefulWidget {
  const PlaybackHost({
    required super.key,
    required this.create,
    required this.builder,
  });

  final PlaybackSession Function() create;
  final Widget Function(PlaybackSession session) builder;

  @override
  State<PlaybackHost> createState() => _PlaybackHostState();
}

class _PlaybackHostState extends State<PlaybackHost> {
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
  Widget build(BuildContext context) => widget.builder(_session);
}

/// The touch controls, laid out in `player_controls.dart` as the Kotlin
/// phone player's, over a stream or a download alike ([PlayerSitting]):
/// the gestures and their notes, the lock, the buttons settings keep,
/// picture in picture, the system's media controls, and the keys. A menu
/// stays open in the side panel while the video continues.
class PlaybackControls extends ConsumerStatefulWidget {
  const PlaybackControls({
    super.key,
    required this.session,
    required this.back,
    required this.next,
  });

  final PlayerSitting session;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  ConsumerState<PlaybackControls> createState() => _PlaybackControlsState();
}

class _PlaybackControlsState extends ConsumerState<PlaybackControls> {
  static const _hideAfter = Duration(milliseconds: 3500);

  /// How long the skip button shows by itself once its segment starts, as
  /// in Jellyfin and the Kotlin player; after that it comes with the
  /// controls.
  static const skipShown = Duration(seconds: 8);
  Timer? _hide;
  bool _visible = true;
  bool _sheet = false;
  bool _leaving = false;
  bool _playing = false;

  /// The next episode's countdown, and whether Hide put it away while the
  /// credits roll.
  late final UpNextCountdown _countdown;
  double? _scrubbing;
  PlayerMenu? _menu;
  late final PlayerSpeed _speed;
  bool _fill = false;

  /// A finger holds the video, so it plays at [holdSpeed] for now.
  bool _holding = false;

  /// Locked, a touch on the screen only shows the unlock button.
  bool _locked = false;

  /// Counts keys and touches while locked, each showing the unlock button again.
  int _lockTouched = 0;
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

  late final PlayerMediaSession _media;

  PlayerSitting get _session => widget.session;

  @override
  void initState() {
    super.initState();
    final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
    _countdown = UpNextCountdown(
      autoplay: prefs.autoplayNext,
      onTick: () => setState(() {}),
      onPlay: (item) => unawaited(_next(item)),
    );
    _speed = PlayerSpeed(_session);
    _fill = prefs.fillScreen;
    if (_fill) unawaited(_applyFit());
    _levels = ref.read(playbackLevelsProvider);
    _pip = ref.read(pictureInPictureProvider);
    _small = _pip.active.value;
    _pip.active.addListener(_smallChanged);
    ref.listenManual(playerPrefsProvider, (_, _) => _syncAuto());
    _media = PlayerMediaSession(
      _session,
      ref.read(mediaControlsProvider),
      headers: () => ref.read(playerHeadersProvider),
    );
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
    _speed.follow();
    if (_playing) _resetHide();
    _syncSegment();
    _syncAuto();
  }

  @override
  void dispose() {
    _session.removeListener(_updated);
    _hide?.cancel();
    _countdown.stop();
    _segmentTimer?.cancel();
    _gesture.dispose();
    _pip.active.removeListener(_smallChanged);
    _media.dispose();
    // Leaving the app from anywhere else keeps it full size.
    if (_autoSent) unawaited(_pip.setAuto(false));
    // The window's own brightness was the player's; the system's comes back.
    unawaited(_levels.setBrightness(null).catchError((Object _) {}));
    super.dispose();
  }

  void _updated() {
    final playing = _session.playback.status.playing;
    // A source the session opens again starts at normal speed.
    _speed.follow();
    setState(() {
      if (_playing != playing) {
        _playing = playing;
        if (!playing && _session.playback.phase == PlaybackPhase.ready) {
          _visible = true;
        }
        _resetHide();
      }
      _countdown.sync(_session, leaving: _leaving);
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
    _media.forget();
    _syncMedia();
  }

  /// What the system's controls show, as the Kotlin player's session.
  void _syncMedia() {
    if (_leaving) return;
    _media.sync(
      AppLocalizations.of(context),
      playing: _playing,
      rate: _holding ? holdSpeed : _speed.value,
    );
  }

  /// A remote's, a keyboard's, or a headset's keys, as the Kotlin player
  /// takes them: media keys play, pause, skip, and change episodes; the
  /// arrows skip and Select or Up and Down bring up the controls while
  /// they're hidden. Locked, media keys still work, and the keys that would
  /// bring up the controls show the unlock button instead.
  KeyEventResult _key(FocusNode _, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final previous = _session.previousEpisode;
    final following = _session.nextEpisode;
    final back = _session.skipBack;
    final ahead = _session.skipForward;
    final controls = _visible && !_small;
    void skip(int? step) {
      if (step != null) unawaited(_session.skip(step));
    }

    void episode(MediaItem? item) {
      if (item != null && !_leaving) unawaited(_next(item));
    }

    final key = event.logicalKey;
    final VoidCallback? action = switch (key) {
      LogicalKeyboardKey.mediaPlayPause ||
      LogicalKeyboardKey.space => () => unawaited(_session.togglePlay()),
      LogicalKeyboardKey.mediaPlay => () {
        if (!_playing) unawaited(_session.togglePlay());
      },
      LogicalKeyboardKey.mediaPause => () {
        if (_playing) unawaited(_session.togglePlay());
      },
      LogicalKeyboardKey.mediaFastForward => () => skip(ahead),
      LogicalKeyboardKey.mediaRewind => () => skip(back == null ? null : -back),
      LogicalKeyboardKey.mediaTrackPrevious when previous != null =>
        () => episode(previous),
      LogicalKeyboardKey.mediaTrackNext when following != null => () => episode(
        following,
      ),
      _ when _locked && _navigationKeys.contains(key) => () => setState(
        () => _lockTouched++,
      ),
      LogicalKeyboardKey.arrowLeft when !controls => () => skip(
        back == null ? null : -back,
      ),
      LogicalKeyboardKey.arrowRight when !controls => () => skip(ahead),
      LogicalKeyboardKey.select ||
      LogicalKeyboardKey.enter ||
      LogicalKeyboardKey.arrowUp ||
      LogicalKeyboardKey.arrowDown when !controls => () {
        setState(() => _visible = true);
        _resetHide();
      },
      _ => null,
    };
    if (action == null) return KeyEventResult.ignored;
    action();
    return KeyEventResult.handled;
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

  void _cancelNext() =>
      setState(() => _countdown.cancel(hide: !_session.ended));

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
    _countdown.stop();
    setState(() => _leaving = true);
    await _session.close();
    if (mounted) widget.next(item);
  }

  void _openMenu(PlayerMenu menu) {
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

  void _pickRate(double rate) {
    setState(() => _speed.pick(rate));
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
      if (_holding || !_playing || _speed.value >= holdSpeed) return false;
      setState(() => _holding = true);
      unawaited(_speed.apply(holdSpeed));
      _syncMedia();
      return true;
    }
    if (!_holding) return false;
    if (mounted) setState(() => _holding = false);
    unawaited(_speed.apply());
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
    final item = _session.item;
    final error = _session.error;
    final buffering = _session.playback.phase == PlaybackPhase.buffering;
    final loading =
        !_leaving &&
        error == null &&
        (item == null || _session.busy || buffering);
    final controls =
        !_locked &&
        !_small &&
        (_visible || error != null || _session.ended || item == null);
    final enabled =
        item != null && error == null && !_session.busy && !_leaving;
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];
    final menu = _menu;
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final look = subtitleLook(ref, prefs);
    final small = _small;

    return Focus(
      autofocus: true,
      onKeyEvent: _key,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (item == null || _session.refused || _leaving)
            const ColoredBox(color: Color(0xFF000000)),
          VideoView(player: _session.player),
          // The picture dimmed behind the controls, coming and going with
          // them, but not under a menu, whose own backdrop dims it.
          PlayerFade(
            visible: item != null && controls && error == null && menu == null,
            child: const PlayerDim(),
          ),
          if (captions.isNotEmpty)
            SubtitleLayer(
              cues: captions,
              look: look,
              bottom: controls && error == null ? 150 : 28,
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
              (final notice, final detail) => playbackNoticeNote(
                l,
                notice,
                detail,
              ),
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
          if (item == null && error == null && !small)
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
          if (item != null)
            PlayerFade(
              visible: controls && error == null,
              child: _controls(l, item, enabled, loading, prefs),
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
                    label: skipSegmentLabel(l, segment),
                    onPressed: _action(
                      () => _session.skipSegment(segment),
                      enabled: enabled,
                    ),
                  ),
                if (_session.ended || !_countdown.hidden)
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
            entries: menu == null || item == null
                ? null
                : playerMenuEntries(
                    l,
                    _session,
                    menu,
                    rate: _speed.value,
                    onRate: _pickRate,
                  ),
            dismissLabel: l.a11yPlayerCloseMenu,
            onDismiss: _closeMenu,
          ),
        ],
      ),
    );
  }

  Widget _controls(
    AppLocalizations l,
    MediaItem item,
    bool enabled,
    bool loading,
    PlayerPrefs prefs,
  ) {
    final names = itemNames(item, l);
    final code = item.label.code;
    final subtitle = _session.subtitle;
    final previous = _session.previousEpisode;
    final following = _session.nextEpisode;
    final episodes =
        item.title?.kind == TitleKind.show ||
            previous != null ||
            following != null
        ? (
            PlayerEpisodeButton(
              icon: Lucide.skipBack,
              label: l.playerPreviousEpisode,
              onPressed: switch (previous) {
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
              onPressed: switch (following) {
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
            onPressed: enabled ? () => _openMenu(PlayerMenu.audio) : null,
          ),
        if (prefs.subtitlesButton)
          PlayerMenuButton(
            icon: Lucide.captions,
            label: l.playerMenuSubtitles,
            active: subtitle != null,
            state: subtitle?.label ?? l.playerSubtitlesOff,
            onPressed: enabled ? () => _openMenu(PlayerMenu.subtitles) : null,
          ),
        PlayerMenuButton(
          icon: Lucide.gauge,
          label: l.playerSpeed,
          onPressed: enabled ? () => _openMenu(PlayerMenu.speed) : null,
        ),
        // A download plays as it is.
        if (offersQuality(_session))
          PlayerMenuButton(
            icon: Lucide.settings,
            label: l.playerQuality,
            onPressed: enabled ? () => _openMenu(PlayerMenu.quality) : null,
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

  Widget _upNext(AppLocalizations l, MediaItem item, bool enabled) {
    final cancelled = _countdown.cancelled;
    final left = _countdown.secondsLeft(_session);
    final words = cancelled ? l.playerPlay : l.playerUpNextIn(left);
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
          : cancelled
          ? null
          : l.playerUpNextCancel,
      onDismiss: !_session.ended || !cancelled ? _cancelNext : null,
    );
  }

  Widget _failure(AppLocalizations l, Object error) {
    final (title, message) = playbackErrorText(l, error);
    return PlayerFailure(
      title: title,
      message: message,
      backLabel: l.playerBack,
      onBack: widget.back,
      retryLabel: l.commonRetry,
      onRetry: _session.refused ? null : _action(_session.retry),
    );
  }
}

/// The keys that skip or bring up the controls, which a locked player
/// keeps from doing either.
final _navigationKeys = {
  LogicalKeyboardKey.arrowLeft,
  LogicalKeyboardKey.arrowRight,
  LogicalKeyboardKey.arrowUp,
  LogicalKeyboardKey.arrowDown,
  LogicalKeyboardKey.select,
  LogicalKeyboardKey.enter,
};
