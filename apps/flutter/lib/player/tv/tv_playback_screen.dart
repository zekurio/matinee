import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show MediaChanges, mediaChangesProvider;
import '../../media/format.dart';
import '../../router.dart';
import '../playback_device.dart';
import '../playback_screen.dart'
    show playbackFullscreenProvider, playbackPlayerFactoryProvider;
import '../playback_session.dart';
import '../player.dart';
import '../player_motion.dart';
import '../player_overlays.dart' show PlayerNote, TimedNote;
import '../player_preferences.dart';
import '../video_view.dart';
import 'tv_display_mode.dart';
import 'tv_overlay.dart';
import 'tv_preferences.dart';
import 'tv_seek.dart';

/// How long the controls stay up while the video plays and nothing moves.
const _hideAfter = Duration(milliseconds: 3500);

/// Seconds the next episode counts down once the file ended, when the
/// credits didn't count it down already.
const _upNextSeconds = 10;

/// The speeds the settings menu offers, from half to double.
const _speeds = [.5, .75, 1.0, 1.25, 1.5, 2.0];

/// The player on a TV, as the Kotlin app's `TvPlayerScreen`: what the
/// phone's player loads, the [PlaybackSession] and the video under it,
/// drawn for a remote. The controls, the menus, and the keys are the TV's
/// own.
class TvPlaybackScreen extends ConsumerStatefulWidget {
  const TvPlaybackScreen({super.key, required this.itemId, this.startAt});

  final String itemId;
  final double? startAt;

  @override
  ConsumerState<TvPlaybackScreen> createState() => _TvPlaybackScreenState();
}

class _TvPlaybackScreenState extends ConsumerState<TvPlaybackScreen> {
  static int _lastOwner = 1 << 20;
  late final int _owner = ++_lastOwner;
  late final Future<void> Function(int, bool) _fullscreen;

  @override
  void initState() {
    super.initState();
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
      // A TV's window fills the screen anyway.
    }
  }

  void _back() => context.canPop() ? context.pop() : context.go(Routes.home);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final api = ref.watch(apiProvider);
    final engineState = ref.watch(playerEngineProvider);
    final engine = engineState.value ?? PlayerEngine.mpv;
    final codecs = engine == PlayerEngine.media3
        ? ref.watch(playbackCodecsProvider)
        : null;
    final prefs = ref.watch(tvPlaybackPrefsProvider);
    final auth = ref.watch(authStateProvider);
    final user = switch (auth) {
      SignedIn(:final user) => user,
      _ => null,
    };
    final Widget child;
    if (api == null || user == null || codecs?.hasError == true) {
      child = TvPlayerFailure(
        title: l.playerErrorLost,
        message: auth is Offline ? l.errorUnreachable : null,
        onBack: _back,
      );
    } else if (engineState.isLoading ||
        codecs?.isLoading == true ||
        prefs.isLoading) {
      child = const _Opening();
    } else {
      final profile = playbackDevice(
        engine,
        codecs?.value,
        WidgetsBinding.instance.platformDispatcher.locale.languageCode,
      );
      child = _TvPlaybackHost(
        key: ValueKey((api, widget.itemId, widget.startAt, engine)),
        create: () => PlaybackSession(
          itemId: widget.itemId,
          api: api,
          httpClient: ref.read(sessionHttpProvider),
          headers: {
            ...ref.read(playerHeadersProvider),
            'User-Agent': ref.read(deviceProvider).userAgent,
          },
          player: ref.read(playbackPlayerFactoryProvider)(engine),
          device: profile,
          preferences: user.playback ?? defaultPlaybackPreferences,
          startAt: widget.startAt,
        ),
        prefs: prefs.value ?? (matchFrameRate: true, autoplayNext: true),
        back: _back,
        next: (item) => context.replace(Routes.play(item.id), extra: 0.0),
      );
    }
    return MatineeTheme.wrap(
      matineeDark,
      ColoredBox(
        color: const Color(0xFF000000),
        child: TvFocusRules(child: child),
      ),
    );
  }
}

class _Opening extends StatelessWidget {
  const _Opening();

  @override
  Widget build(BuildContext context) => Center(
    child: Spinner(
      size: 56,
      color: matineeDark.accent,
      label: AppLocalizations.of(context).loadingInProgress,
    ),
  );
}

/// Why nothing plays, with Try again focused and Back beside it, as the
/// Kotlin app's `TvPlayerFailure`. Without [onRetry], only Back, since
/// asking again gets the same answer.
class TvPlayerFailure extends StatelessWidget {
  const TvPlayerFailure({
    super.key,
    required this.title,
    required this.onBack,
    this.message,
    this.onRetry,
  });

  final String title;
  final String? message;
  final VoidCallback onBack;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: Overscan.padding,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            title,
            textAlign: TextAlign.center,
            style: TvType.headline.style(color: colors.foreground),
          ),
          if (message case final text? when text.isNotEmpty) ...[
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: Text(
                text,
                textAlign: TextAlign.center,
                style: TvType.body.style(color: colors.mutedForeground),
              ),
            ),
          ],
          const SizedBox(height: 28),
          Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 16,
            children: [
              if (onRetry case final retry?)
                TvButton(
                  label: l.commonRetry,
                  icon: Lucide.refreshCw,
                  autofocus: true,
                  onPressed: retry,
                ),
              TvButton(
                label: l.playerBack,
                autofocus: onRetry == null,
                onPressed: onBack,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TvPlaybackHost extends StatefulWidget {
  const _TvPlaybackHost({
    required super.key,
    required this.create,
    required this.prefs,
    required this.back,
    required this.next,
  });

  final PlaybackSession Function() create;
  final TvPlaybackPrefs prefs;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  State<_TvPlaybackHost> createState() => _TvPlaybackHostState();
}

class _TvPlaybackHostState extends State<_TvPlaybackHost> {
  late final PlaybackSession _session;
  late final MediaChanges _changes;
  late final TvDisplayMatch _display;

  @override
  void initState() {
    super.initState();
    final container = ProviderScope.containerOf(context, listen: false);
    _changes = container.read(mediaChangesProvider.notifier);
    _display = TvDisplayMatch(container.read(tvDisplayProvider));
    _session = widget.create();
    if (widget.prefs.matchFrameRate) _session.addListener(_matchDisplay);
    unawaited(_session.start());
  }

  /// The screen follows the video's frame rate once the server says it.
  void _matchDisplay() {
    final rate = _session.plan?.item.probe?.video?.frameRate;
    if (rate != null) unawaited(_display.match(rate));
  }

  @override
  void dispose() {
    _session.removeListener(_matchDisplay);
    _display.release();
    // What was watched moved on: the pages under the player fetch again
    // once the server has the last position.
    unawaited(_session.close().whenComplete(_changes.changed));
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _TvPlayback(
    session: _session,
    autoplayNext: widget.prefs.autoplayNext,
    back: widget.back,
    next: widget.next,
  );
}

/// The next episode as it comes, as the Kotlin app's `UpNextState`: its
/// countdown, whether it stopped or never ran, and whether it came while
/// the credits rolled, when it starts as soon as the file ends.
class _UpNext {
  _UpNext(this.item, {required bool autoplay, required this.early})
    : cancelled = !autoplay;

  final MediaItem item;
  final bool early;
  bool cancelled;
  int left = _upNextSeconds;

  /// Back took its button off the picture; the controls still have it.
  bool away = false;
}

/// Plays the session for a remote, as the Kotlin app's `TvPlayback`.
///
/// With the controls away, Left and Right skip and glide while held,
/// Select, Up, and Down bring the controls with focus on play, and the
/// media keys work at any time. With them showing, the D-pad moves focus.
/// Back closes a menu, then the controls, then the player. Every key press
/// keeps the controls up a while longer; a menu or a seek keeps them up.
class _TvPlayback extends StatefulWidget {
  const _TvPlayback({
    required this.session,
    required this.autoplayNext,
    required this.back,
    required this.next,
  });

  final PlaybackSession session;
  final bool autoplayNext;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  State<_TvPlayback> createState() => _TvPlaybackState();
}

class _TvPlaybackState extends State<_TvPlayback> {
  final _targets = TvPlayerTargets();
  final _root = FocusNode(debugLabel: 'player/root');
  final _keySeek = KeySeek();
  Timer? _hide;
  Timer? _countdown;
  var _controls = true;
  var _menuOpen = false;
  double? _scrub;

  /// The controls came up for a held arrow, so focus goes to the seek bar.
  var _focusSeek = false;

  /// The arrow gliding the seek bar, and a key whose release the screen
  /// already answered.
  LogicalKeyboardKey? _seeking;
  LogicalKeyboardKey? _swallow;
  _UpNext? _upNext;
  MediaSegment? _skipAwayFrom;
  var _leaving = false;
  var _rate = 1.0;
  var _fill = false;
  PlaybackPhase _phase = PlaybackPhase.idle;

  /// What focus followed last, to move it when the controls come or go.
  ({bool visible, bool onPicture, String? next})? _followed;

  PlaybackSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    _session.addListener(_updated);
    HardwareKeyboard.instance.addHandler(_preview);
    _resetHide();
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_preview);
    _session.removeListener(_updated);
    _hide?.cancel();
    _countdown?.cancel();
    _targets.dispose();
    _root.dispose();
    super.dispose();
  }

  void _updated() {
    final phase = _session.playback.phase;
    // A source the session opens again starts at normal speed.
    if (phase == PlaybackPhase.ready && _phase != phase && _rate != 1) {
      unawaited(_applyRate());
    }
    _phase = phase;
    setState(_syncNext);
    _resetHide();
  }

  /// Follows the episode after this one, as `rememberUpNext`: once the file
  /// ends it starts at once if the credits counted it down, or counts down
  /// on its own first, unless the countdown stopped.
  void _syncNext() {
    final item = _session.error == null ? _session.next : null;
    if (item == null) {
      _upNext = null;
      _countdown?.cancel();
      _countdown = null;
      return;
    }
    if (_upNext?.item.id != item.id) {
      _upNext = _UpNext(
        item,
        autoplay: widget.autoplayNext,
        early: !_session.ended,
      );
    }
    final next = _upNext!;
    if (!_session.ended || next.cancelled || _countdown != null || _leaving) {
      return;
    }
    if (next.early) {
      _countdown = Timer(Duration.zero, () => unawaited(_play(item)));
    } else {
      _countdown = Timer.periodic(const Duration(seconds: 1), (_) {
        setState(() => next.left--);
        if (next.left <= 0) unawaited(_play(item));
      });
    }
  }

  Future<void> _play(MediaItem item) async {
    if (_leaving) return;
    _countdown?.cancel();
    setState(() => _leaving = true);
    await _session.close();
    if (mounted) widget.next(item);
  }

  void _resetHide() {
    _hide?.cancel();
    if (!_controls ||
        !_session.playback.status.playing ||
        _menuOpen ||
        _scrub != null) {
      return;
    }
    _hide = Timer(_hideAfter, () {
      if (mounted) setState(() => _controls = false);
    });
  }

  void _show({bool seek = false}) {
    setState(() {
      _controls = true;
      if (seek) _focusSeek = true;
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

  double get _skipBack => (_session.skipBack ?? 10).toDouble();
  double get _skipAhead => (_session.skipForward ?? 10).toDouble();

  late final TvSeekKeys _seekKeys = (
    press: (direction, repeat, at) {
      final step = direction < 0 ? _skipBack : _skipAhead;
      final to = _keySeek.press(
        from: _scrub ?? _session.position,
        direction: direction,
        step: step,
        duration: _session.duration,
        repeat: repeat,
        at: at,
      );
      if (to != null) setState(() => _scrub = to);
      _resetHide();
    },
    release: () {
      final to = _keySeek.release();
      if (to != null) unawaited(_session.seek(to));
      if (_scrub != null) setState(() => _scrub = null);
      _resetHide();
    },
  );

  /// Whether this player is the top route, with no menu over it.
  bool get _onTop => ModalRoute.of(context)?.isCurrent ?? true;

  bool get _visible =>
      _controls ||
      (_session.ended && _upNext == null) ||
      _session.error != null;

  TvPictureAction? _action(AppLocalizations l) {
    if (_session.error != null || _leaving) return null;
    if (_upNext case final next?) {
      return (
        label: l.playerNextEpisode,
        countdown: next.cancelled
            ? null
            : _session.ended
            ? next.left
            : (_session.duration - _session.position).ceil().clamp(0, 99999),
        onPressed: () => unawaited(_play(next.item)),
      );
    }
    if (_session.segment case final segment?) {
      return (
        label: switch (segment.kind) {
          MediaSegmentKind.recap => l.playerSkipRecap,
          MediaSegmentKind.credits => l.playerSkipCredits,
          MediaSegmentKind.preview => l.playerSkipPreview,
          _ => l.playerSkipIntro,
        },
        countdown: null,
        onPressed: () => unawaited(_session.skipSegment(segment)),
      );
    }
    return null;
  }

  bool get _away => switch (_upNext) {
    final next? => next.away,
    null => _session.segment != null && _session.segment == _skipAwayFrom,
  };

  /// Sees each key before what has focus, as `onPreviewKeyEvent` did.
  bool _preview(KeyEvent event) {
    if (!mounted) return false;
    final key = event.logicalKey;
    final down = event is KeyDownEvent || event is KeyRepeatEvent;
    if (event is KeyDownEvent) _resetHide();
    if (event is KeyUpEvent && _swallow == key) {
      _swallow = null;
      return true;
    }
    final media = switch (key) {
      LogicalKeyboardKey.mediaPlayPause ||
      LogicalKeyboardKey.space => _session.togglePlay,
      LogicalKeyboardKey.mediaPlay => _session.player.play,
      LogicalKeyboardKey.mediaPause => _session.player.pause,
      LogicalKeyboardKey.mediaFastForward ||
      LogicalKeyboardKey.mediaSkipForward => () => _session.skip(
        _skipAhead.round(),
      ),
      LogicalKeyboardKey.mediaRewind || LogicalKeyboardKey.mediaSkipBackward =>
        () => _session.skip(-_skipBack.round()),
      LogicalKeyboardKey.mediaTrackPrevious =>
        switch (_session.plan?.previous) {
          final previous? => () => _play(previous),
          null => null,
        },
      LogicalKeyboardKey.mediaTrackNext => switch (_session.plan?.next) {
        final next? => () => _play(next),
        null => null,
      },
      LogicalKeyboardKey.closedCaptionToggle => () async => _openMenu(
        TvPlayerMenu.subtitles,
      ),
      LogicalKeyboardKey.mediaAudioTrack => () async => _openMenu(
        TvPlayerMenu.audio,
      ),
      _ => null,
    };
    if (media != null) {
      if (event is KeyDownEvent && _session.plan != null) unawaited(media());
      return true;
    }
    if (!_onTop || _session.plan == null || _session.error != null) {
      return false;
    }
    final direction = switch (key) {
      LogicalKeyboardKey.arrowLeft => -1,
      LogicalKeyboardKey.arrowRight => 1,
      _ => 0,
    };
    // Left and Right skip while the controls are away, and glide on while
    // held, which brings the controls to show where to.
    if (direction != 0 && (_seeking == key || !_visible)) {
      if (down) {
        _seeking = key;
        final repeat = event is KeyRepeatEvent;
        _seekKeys.press(direction, repeat, event.timeStamp);
        if (repeat && !_controls) _show(seek: true);
      } else {
        _seeking = null;
        _seekKeys.release();
      }
      return true;
    }
    final onPicture = _onPicture(AppLocalizations.of(context));
    // Select presses the button on the picture, rather than bringing the
    // controls.
    if (onPicture && isTvSelectKey(key)) return false;
    if (!_visible && event is KeyDownEvent) {
      if (isTvSelectKey(key) ||
          key == LogicalKeyboardKey.arrowUp ||
          key == LogicalKeyboardKey.arrowDown) {
        _swallow = key;
        _show();
        return true;
      }
    }
    return false;
  }

  bool _onPicture(AppLocalizations l) =>
      _action(l) != null && !_away && !_controls;

  /// Moves focus as the controls come and go, as the Kotlin player's
  /// effect on them: on play, the seek bar after a held arrow, or the
  /// button the player offers, as they come; on that button or the screen
  /// itself, which takes the keys, as they go.
  void _follow(bool visible, bool onPicture, TvPictureAction? action) {
    final now = (
      visible: visible,
      onPicture: onPicture,
      next: _upNext?.item.id,
    );
    final before = _followed;
    if (before == now) return;
    _followed = now;
    final nextCame =
        before != null && before.next != now.next && now.next != null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _menuOpen) return;
      if (!visible) {
        (onPicture ? _targets.corner : _root).requestFocus();
        return;
      }
      if (before != null && before.visible && !nextCame) return;
      final target = _focusSeek
          ? _targets.seek
          : action != null && !_away
          ? _targets.action
          : _targets.play;
      _focusSeek = false;
      target.requestFocus();
    });
  }

  Future<void> _openMenu(TvPlayerMenu menu) async {
    final plan = _session.plan;
    if (plan == null || _menuOpen || !_onTop) return;
    final l = AppLocalizations.of(context);
    setState(() {
      _controls = true;
      _menuOpen = true;
    });
    _hide?.cancel();
    final button = _targets.menus[menu]!;
    // Let the controls build, so the panel closes back onto the button.
    await WidgetsBinding.instance.endOfFrame;
    if (!mounted) return;
    button.requestFocus();
    final pick = await showTvPanel<VoidCallback>(
      context,
      title: switch (menu) {
        TvPlayerMenu.audio => l.playerMenuAudio,
        TvPlayerMenu.subtitles => l.playerMenuSubtitles,
        TvPlayerMenu.settings => l.playerMenuSettings,
      },
      builder: (panel) => _menuRows(panel, l, menu, plan),
    );
    if (!mounted) return;
    setState(() => _menuOpen = false);
    pick?.call();
    _resetHide();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _visible) button.requestFocus();
    });
  }

  List<Widget> _menuRows(
    BuildContext panel,
    AppLocalizations l,
    TvPlayerMenu menu,
    PlaybackStart plan,
  ) {
    var focused = false;
    Widget choice(
      String title, {
      required bool selected,
      required VoidCallback pick,
      String? detail,
      bool enabled = true,
    }) {
      final first = selected && enabled && !focused;
      if (first) focused = true;
      return TvListItem(
        title: title,
        subtitle: detail == null || detail.isEmpty ? null : detail,
        quiet: true,
        checked: selected,
        enabled: enabled,
        autofocus: first,
        onPressed: () => Navigator.of(panel).pop(pick),
      );
    }

    void run(Future<void> Function() action) => unawaited(action());
    final decimal = NumberFormat.decimalPattern(l.localeName);
    switch (menu) {
      case TvPlayerMenu.audio:
        return [
          if (plan.audioTracks.isEmpty) _MenuNote(l.playerAudioNoTracks),
          for (final track in plan.audioTracks)
            choice(
              track.label,
              detail: [track.format, ?track.layout].join(' · '),
              selected: track.index == plan.audio?.index,
              pick: () => run(() => _session.pickAudio(track)),
            ),
        ];
      case TvPlayerMenu.subtitles:
        return [
          choice(
            l.playerSubtitlesOff,
            selected: plan.subtitle == null,
            pick: () => run(() => _session.pickSubtitle(null)),
          ),
          for (final track in plan.subtitleTracks)
            choice(
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
      case TvPlayerMenu.settings:
        return [
          if (plan.original || _session.qualities.isNotEmpty) ...[
            TvListHeading(l.playerQuality),
            if (plan.original)
              choice(
                l.playerQualityOriginal,
                selected: plan.quality == PlaybackQuality.original,
                pick: () =>
                    run(() => _session.pickQuality(PlaybackQuality.original)),
              ),
            for (final preset in _session.qualities)
              choice(
                l.playbackQualityPreset(
                  preset.height,
                  l.playerBitrateMbpsExact(
                    decimal.format(preset.bitrate / 1000000),
                  ),
                ),
                selected: plan.quality == preset.id,
                pick: () => run(() => _session.pickQuality(preset.id)),
              ),
          ],
          TvListHeading(l.playerSpeed),
          for (final rate in _speeds)
            choice(
              rate == 1
                  ? l.playerSpeedNormal
                  : l.playerSpeedRate(decimal.format(rate)),
              selected: _rate == rate,
              pick: () {
                setState(() => _rate = rate);
                unawaited(_applyRate());
              },
            ),
          // How the picture fills the screen, which a phone switches with
          // a pinch.
          TvListHeading(l.playerPicture),
          for (final fill in [false, true])
            choice(
              fill ? l.playerFill : l.playerFit,
              selected: _fill == fill,
              pick: () {
                setState(() => _fill = fill);
                unawaited(
                  _session.player
                      .setVideoFit(fill ? VideoFit.cover : VideoFit.contain)
                      .catchError((Object _) {}),
                );
              },
            ),
        ];
    }
  }

  void _onBack() {
    final l = AppLocalizations.of(context);
    if (_onPicture(l)) {
      // Back cancels the countdown and takes the button away; the controls
      // still have it.
      setState(() {
        if (_upNext case final next?) {
          next
            ..cancelled = true
            ..away = true;
          _countdown?.cancel();
          _countdown = null;
        } else {
          _skipAwayFrom = _session.segment;
        }
      });
      return;
    }
    if (_controls && _session.error == null && _session.plan != null) {
      _hide?.cancel();
      setState(() => _controls = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final plan = _session.plan;
    final error = _session.error;
    final loading =
        !_leaving &&
        error == null &&
        (plan == null ||
            _session.busy ||
            _session.playback.phase == PlaybackPhase.buffering);
    final visible = _visible;
    final action = _action(l);
    final onPicture = _onPicture(l);
    if (plan != null && error == null) _follow(visible, onPicture, action);
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];
    final names = plan == null ? null : itemNames(plan.item, l);
    final code = plan?.item.label.code;
    final playRests = !_menuOpen && !_focusSeek && !(action != null && !_away);
    final canLeave =
        error != null || plan == null || (!_controls && !onPicture);

    return PopScope(
      canPop: canLeave,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: Focus(
        focusNode: _root,
        // It holds focus while the controls are away; the D-pad never
        // lands on it.
        skipTraversal: true,
        autofocus: true,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (plan == null || _session.refused || _leaving)
              const ColoredBox(color: Color(0xFF000000)),
            VideoView(player: _session.player),
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
                  size: 56,
                  color: matineeDark.foreground,
                  label: l.loadingInProgress,
                ),
              ),
            if (plan != null && names != null)
              PlayerFade(
                visible: visible && error == null,
                child: TvPlayerOverlay(
                  targets: _targets,
                  title: names.title,
                  subtitle: code == null ? null : '$code · ${names.showName}',
                  playing: _session.playback.status.playing,
                  position: (_scrub ?? _session.position).clamp(
                    0,
                    _session.duration,
                  ),
                  duration: _session.duration,
                  buffered: _session.buffered,
                  scrubbing: _scrub != null,
                  back: _session.skipBack,
                  ahead: _session.skipForward,
                  keys: _seekKeys,
                  playRests: playRests,
                  subtitlesOn: plan.subtitle != null,
                  onTogglePlay: () => unawaited(_session.togglePlay()),
                  onSkip: (seconds) => unawaited(_session.skip(seconds)),
                  onMenu: (menu) => unawaited(_openMenu(menu)),
                  action: action,
                  episodes: plan.previous == null && plan.next == null
                      ? null
                      : (
                          previous: switch (plan.previous) {
                            final previous? => () => unawaited(_play(previous)),
                            null => null,
                          },
                          next: switch (plan.next) {
                            final next? => () => unawaited(_play(next)),
                            null => null,
                          },
                        ),
                ),
              ),
            // Over the scrim, so it doesn't dim them; they rise clear of
            // the controls.
            if (captions.isNotEmpty)
              IgnorePointer(
                child: Align(
                  alignment: Alignment.bottomCenter,
                  child: AnimatedPadding(
                    duration: PlayerMotion.move,
                    curve: PlayerMotion.easing,
                    padding: EdgeInsets.fromLTRB(
                      80,
                      0,
                      80,
                      visible ? tvOverlayHeight : 40,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 2,
                      children: [for (final cue in captions) _Caption(cue)],
                    ),
                  ),
                ),
              ),
            if (error != null)
              ColoredBox(
                color: const Color(0xD9000000),
                child: _failure(l, error),
              ),
            // In the corner while the controls are away. They have it in
            // their row, beside the menus.
            if (action != null)
              Positioned(
                right: Overscan.horizontal,
                bottom: Overscan.vertical,
                child: PlayerFade(
                  visible: onPicture,
                  child: ExcludeFocus(
                    excluding: !onPicture,
                    child: TvPictureButton(
                      action: action,
                      focusNode: _targets.corner,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _failure(AppLocalizations l, Object error) {
    final (title, message) = tvPlaybackErrorText(l, error);
    return TvPlayerFailure(
      title: title,
      message: message,
      onBack: widget.back,
      onRetry: _session.refused ? null : () => unawaited(_session.retry()),
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
          detail: detail == null ? null : tvPlaybackErrorText(l, detail).$2,
        ),
        PlaybackNotice.subtitleFailed => PlayerNote(
          title: l.playerErrorSubtitles,
        ),
      };
}

class _MenuNote extends StatelessWidget {
  const _MenuNote(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(
      horizontal: TvListItems.inset,
      vertical: 8,
    ),
    child: Text(
      text,
      style: TvType.body.style(color: MatineeTheme.of(context).mutedForeground),
    ),
  );
}

/// A subtitle cue, read from the couch: larger than the phone's.
class _Caption extends StatelessWidget {
  const _Caption(this.cue);

  final TextSpan cue;

  @override
  Widget build(BuildContext context) => Container(
    color: const Color(0xD9000000),
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
    child: Text.rich(
      cue,
      textAlign: TextAlign.center,
      style: TvType.title.style(color: const Color(0xFFFFFFFF)),
    ),
  );
}

/// What went wrong, as a title and a line under it, as the phone player's
/// `_errorText`, which is private to `playback_screen.dart`.
(String, String) tvPlaybackErrorText(AppLocalizations l, Object error) {
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
