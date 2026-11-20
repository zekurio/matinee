import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../router.dart';
import '../playback_device.dart';
import '../playback_screen.dart'
    show PlaybackHost, createPlaybackSession, playbackFullscreenProvider;
import '../playback_session.dart';
import '../player.dart';
import '../player_motion.dart';
import '../player_overlays.dart' show TimedNote;
import '../player_panel.dart';
import '../player_parts.dart';
import '../player_preferences.dart';
import '../player_system.dart';
import '../subtitle_look.dart';
import '../trickplay.dart';
import '../video_view.dart';
import 'tv_display_mode.dart';
import 'tv_overlay.dart';
import 'tv_seek.dart';

/// How long the controls stay up while the video plays and nothing moves:
/// the phone player's time. Neither it nor the kit reads the platform's
/// recommended timeout, which the Kotlin player asked accessibility for.
const _hideAfter = Duration(milliseconds: 3500);

/// How long the skip button shows by itself once its segment starts, as
/// the Kotlin player's `SKIP_SHOWN_MS`; after that it comes with the
/// controls.
const _skipShown = Duration(seconds: 8);

/// The player on a TV, as the Kotlin app's `TvPlayerScreen`: what the
/// phone's player loads, the same [PlaybackSession] set up the same way
/// ([createPlaybackSession]) with the video under it, drawn for a remote.
/// The controls, the menus, and the keys are the TV's own.
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
  late final TvDisplayMatch _display;

  @override
  void initState() {
    super.initState();
    _fullscreen = ref.read(playbackFullscreenProvider);
    // Before the last episode's player leaves, so the mode it holds stays
    // for this one to keep or change.
    _display = ref.read(tvDisplayMatchProvider)..claim(this);
    unawaited(_window(true));
  }

  @override
  void dispose() {
    _display.leave(this);
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
    // Read once when the player opens, as the phone's does.
    final prefsLoading = ref.watch(
      playerPrefsProvider.select((prefs) => prefs.isLoading),
    );
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
        prefsLoading) {
      child = const _Opening();
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
        builder: (session) => _TvPlayback(
          session: session,
          display: (rate) => _display.match(this, rate),
          back: _back,
          next: (item) => context.replace(Routes.play(item.id), extra: 0.0),
        ),
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

/// The menus the TV's buttons open at the right edge, as the Kotlin app's:
/// audio, subtitles, and settings, which holds the quality, the speed, and
/// how the picture fills the screen.
List<PlayerMenu> _menusOf(TvPlayerMenu menu) => switch (menu) {
  TvPlayerMenu.audio => const [PlayerMenu.audio],
  TvPlayerMenu.subtitles => const [PlayerMenu.subtitles],
  TvPlayerMenu.settings => const [PlayerMenu.quality, PlayerMenu.speed],
};

/// Plays the session for a remote, as the Kotlin app's `TvPlayback`.
///
/// With the controls away, Left and Right skip and glide while held,
/// Select, Up, and Down bring the controls with focus on play, and the
/// media keys work at any time. With them showing, the D-pad moves focus.
/// Back closes a menu, then the controls, then the player. Every key press
/// keeps the controls up a while longer; a menu or a seek keeps them up.
/// The keys are this widget's alone: a TV never builds the phone's
/// controls, whose own key handler would act on them too.
class _TvPlayback extends ConsumerStatefulWidget {
  const _TvPlayback({
    required this.session,
    required this.display,
    required this.back,
    required this.next,
  });

  final PlaybackSession session;

  /// Asks the screen for the frame rate the server says the video has.
  final ValueChanged<double?> display;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  ConsumerState<_TvPlayback> createState() => _TvPlaybackState();
}

class _TvPlaybackState extends ConsumerState<_TvPlayback> {
  final _targets = TvPlayerTargets();
  final _root = FocusNode(debugLabel: 'player/root');
  final _keySeek = KeySeek();
  late final UpNextCountdown _countdown;
  late final PlayerSpeed _speed;
  late final PlayerMediaSession _media;
  late final bool _matchFrameRate;
  Timer? _hide;
  var _controls = true;
  var _menuOpen = false;
  double? _scrub;

  /// The controls came up for a held arrow, so focus goes to the seek bar.
  var _focusSeek = false;

  /// The arrow gliding the seek bar, and a key whose release the screen
  /// already answered.
  LogicalKeyboardKey? _seeking;
  LogicalKeyboardKey? _swallow;

  /// The segment whose skip button shows, whether it's within [_skipShown]
  /// of starting, and the one Back took off the picture.
  (String, double, double)? _segmentKey;
  var _segmentFresh = false;
  Timer? _segmentTimer;
  MediaSegment? _skipAwayFrom;
  var _leaving = false;
  var _fill = false;

  /// What focus followed last, to move it when the controls come or go.
  ({bool visible, bool onPicture, String? next})? _followed;

  PlaybackSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
    _matchFrameRate = prefs.matchFrameRate;
    _fill = prefs.fillScreen;
    if (_fill) unawaited(_applyFit());
    _countdown = UpNextCountdown(
      autoplay: prefs.autoplayNext,
      onTick: () => setState(() {}),
      onPlay: (item) => unawaited(_play(item)),
    );
    _speed = PlayerSpeed(_session);
    _media = PlayerMediaSession(
      _session,
      ref.read(mediaControlsProvider),
      headers: () => ref.read(playerHeadersProvider),
    );
    _session.addListener(_updated);
    HardwareKeyboard.instance.addHandler(_preview);
    _resetHide();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The words change with the language.
    _media.forget();
    _syncMedia();
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_preview);
    _session.removeListener(_updated);
    _hide?.cancel();
    _segmentTimer?.cancel();
    _countdown.stop();
    _media.dispose();
    _targets.dispose();
    _root.dispose();
    super.dispose();
  }

  void _updated() {
    _speed.follow();
    setState(() {
      _countdown.sync(_session, leaving: _leaving);
      _syncSegment();
    });
    _resetHide();
    _syncMedia();
    if (_matchFrameRate) {
      if (_session.item case final item?) {
        widget.display(item.probe?.video?.frameRate);
      } else if (_session.error != null) {
        widget.display(null);
      }
    }
  }

  void _syncMedia() {
    if (_leaving) return;
    _media.sync(
      AppLocalizations.of(context),
      playing: _session.playback.status.playing,
      rate: _speed.value,
    );
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
      _segmentTimer = Timer(_skipShown, () {
        if (mounted) setState(() => _segmentFresh = false);
      });
    }
  }

  Future<void> _play(MediaItem item) async {
    if (_leaving) return;
    _countdown.stop();
    setState(() => _leaving = true);
    await _session.close();
    if (mounted) widget.next(item);
  }

  void _resetHide() {
    _hide?.cancel();
    if (!_controls ||
        !_session.playback.status.playing ||
        _menuOpen ||
        _scrub != null ||
        WidgetsBinding
            .instance
            .platformDispatcher
            .accessibilityFeatures
            .accessibleNavigation) {
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

  Future<void> _applyFit() => _session.player
      .setVideoFit(_fill ? VideoFit.cover : VideoFit.contain)
      .catchError((Object _) {});

  void _pickFill(bool fill) {
    setState(() => _fill = fill);
    unawaited(_applyFit());
    // Kept for the next video, as the Kotlin app's fillScreen.
    unawaited(
      ref
          .read(playerPrefsProvider.notifier)
          .change((prefs) => prefs.copyWith(fillScreen: fill))
          .catchError((Object _) {}),
    );
  }

  /// A press steps by the account's skip length, once the server has said
  /// which lengths it offers; until then the keys do nothing, as the
  /// phone's do.
  late final TvSeekKeys _seekKeys = (
    press: (direction, repeat, at) {
      final step = direction < 0 ? _session.skipBack : _session.skipForward;
      if (step == null) return;
      final to = _keySeek.press(
        from: _scrub ?? _session.position,
        direction: direction,
        step: step.toDouble(),
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
      (_session.ended && _session.next == null) ||
      _session.error != null;

  TvPictureAction? _action(AppLocalizations l) {
    if (_session.error != null || _leaving) return null;
    if (_session.next case final next?) {
      return (
        label: l.playerNextEpisode,
        countdown: _countdown.cancelled
            ? null
            : _countdown.secondsLeft(_session),
        onPressed: () => unawaited(_play(next)),
      );
    }
    if (_session.segment case final segment? when _segmentFresh || _controls) {
      return (
        label: skipSegmentLabel(l, segment),
        countdown: null,
        onPressed: () => unawaited(_session.skipSegment(segment)),
      );
    }
    return null;
  }

  bool get _away => _session.next != null
      ? _countdown.hidden
      : _session.segment != null && _session.segment == _skipAwayFrom;

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
    final playing = _session.playback.status.playing;
    final back = _session.skipBack;
    final ahead = _session.skipForward;
    final previous = _session.previousEpisode;
    final following = _session.nextEpisode;
    final VoidCallback? media = switch (key) {
      LogicalKeyboardKey.mediaPlayPause ||
      LogicalKeyboardKey.space => () => unawaited(_session.togglePlay()),
      LogicalKeyboardKey.mediaPlay => () {
        if (!playing) unawaited(_session.togglePlay());
      },
      LogicalKeyboardKey.mediaPause => () {
        if (playing) unawaited(_session.togglePlay());
      },
      LogicalKeyboardKey.mediaFastForward ||
      LogicalKeyboardKey.mediaSkipForward => () {
        if (ahead != null) unawaited(_session.skip(ahead));
      },
      LogicalKeyboardKey.mediaRewind ||
      LogicalKeyboardKey.mediaSkipBackward => () {
        if (back != null) unawaited(_session.skip(-back));
      },
      LogicalKeyboardKey.mediaTrackPrevious when previous != null =>
        () => unawaited(_play(previous)),
      LogicalKeyboardKey.mediaTrackNext when following != null =>
        () => unawaited(_play(following)),
      LogicalKeyboardKey.closedCaptionToggle => () => unawaited(
        _openMenu(TvPlayerMenu.subtitles),
      ),
      LogicalKeyboardKey.mediaAudioTrack => () => unawaited(
        _openMenu(TvPlayerMenu.audio),
      ),
      _ => null,
    };
    if (media != null) {
      // Taken here, so Android doesn't also hand it to the media session.
      if (event is KeyDownEvent && _session.item != null) media();
      return true;
    }
    if (!_onTop || _session.item == null || _session.error != null) {
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
      next: _session.next?.id,
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
    if (_session.item == null || _menuOpen || !_onTop) return;
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
    final title = switch (menu) {
      TvPlayerMenu.audio => l.playerMenuAudio,
      TvPlayerMenu.subtitles => l.playerMenuSubtitles,
      TvPlayerMenu.settings => l.playerMenuSettings,
    };
    final pick = await showTvPanel<VoidCallback>(
      context,
      title: title,
      builder: (panel) => _panelRows(panel, title, _entries(l, menu)),
    );
    if (!mounted) return;
    setState(() => _menuOpen = false);
    pick?.call();
    _resetHide();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _visible) button.requestFocus();
    });
  }

  /// The phone's entries for [menu] ([playerMenuEntries]), and in settings
  /// how the picture fills the screen, which a phone switches with a pinch.
  List<PanelEntry> _entries(AppLocalizations l, TvPlayerMenu menu) => [
    for (final part in _menusOf(menu))
      if (part != PlayerMenu.quality || offersQuality(_session))
        ...playerMenuEntries(
          l,
          _session,
          part,
          rate: _speed.value,
          onRate: (speed) => setState(() => _speed.pick(speed)),
        ),
    if (menu == TvPlayerMenu.settings) ...[
      const PanelDivider(),
      PanelHeading(l.playerPicture),
      for (final fill in [false, true])
        PanelChoice(
          fill ? l.playerFill : l.playerFit,
          selected: _fill == fill,
          pick: () => _pickFill(fill),
        ),
    ],
  ];

  /// [entries] as the panel's rows: the current choice checked and focused
  /// first, a pick closing the panel before it runs. The panel's heading
  /// names the menu, so a first heading that says the same goes.
  List<Widget> _panelRows(
    BuildContext panel,
    String title,
    List<PanelEntry> entries,
  ) {
    final rows = switch (entries) {
      [PanelHeading(:final text), ...final rest] when text == title => rest,
      _ => entries,
    };
    var focused = false;
    return [
      for (final (index, entry) in rows.indexed)
        switch (entry) {
          PanelHeading(:final text) => Padding(
            padding: EdgeInsets.only(top: index > 0 ? 8 : 0),
            child: TvListHeading(text),
          ),
          PanelNote(:final text) => _MenuNote(text),
          PanelDivider() => const _MenuDivider(),
          PanelChoice() => () {
            final first = entry.selected && entry.enabled && !focused;
            if (first) focused = true;
            return TvListItem(
              title: entry.title,
              subtitle: entry.detail == null || entry.detail!.isEmpty
                  ? null
                  : entry.detail,
              quiet: true,
              checked: entry.selected,
              enabled: entry.enabled,
              autofocus: first,
              onPressed: () => Navigator.of(panel).pop(entry.pick),
            );
          }(),
        },
    ];
  }

  void _onBack() {
    final l = AppLocalizations.of(context);
    if (_onPicture(l)) {
      // Back cancels the countdown and takes the button away; the controls
      // still have it.
      setState(() {
        if (_session.next != null) {
          _countdown.cancel(hide: true);
        } else {
          _skipAwayFrom = _session.segment;
        }
      });
      return;
    }
    if (_controls && _session.error == null && _session.item != null) {
      _hide?.cancel();
      setState(() => _controls = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = _session.item;
    final error = _session.error;
    final loading =
        !_leaving &&
        error == null &&
        (item == null ||
            _session.busy ||
            _session.playback.phase == PlaybackPhase.buffering);
    final visible = _visible;
    final action = _action(l);
    final onPicture = _onPicture(l);
    if (item != null && error == null) _follow(visible, onPicture, action);
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final names = item == null ? null : itemNames(item, l);
    final code = item?.label.code;
    final playRests = !_menuOpen && !_focusSeek && !(action != null && !_away);
    final canLeave =
        error != null || item == null || (!_controls && !onPicture);
    final previous = _session.previousEpisode;
    final following = _session.nextEpisode;
    final images = _session.trickplay;

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
            if (item == null || _session.refused || _leaving)
              const ColoredBox(color: Color(0xFF000000)),
            VideoView(player: _session.player),
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
                  size: 56,
                  color: matineeDark.foreground,
                  label: l.loadingInProgress,
                ),
              ),
            if (item != null && names != null)
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
                  subtitlesOn: _session.subtitle != null,
                  onTogglePlay: () => unawaited(_session.togglePlay()),
                  onSkip: (seconds) => unawaited(_session.skip(seconds)),
                  onMenu: (menu) => unawaited(_openMenu(menu)),
                  action: action,
                  episodes: previous == null && following == null
                      ? null
                      : (
                          previous: switch (previous) {
                            final previous? => () => unawaited(_play(previous)),
                            null => null,
                          },
                          next: switch (following) {
                            final next? => () => unawaited(_play(next)),
                            null => null,
                          },
                        ),
                  preview: images == null
                      ? null
                      : (seconds) => TrickplayFrame(
                          itemId: _session.itemId,
                          images: images,
                          seconds: seconds,
                          width: tvTrickplayWidth,
                        ),
                ),
              ),
            // Over the scrim, so it doesn't dim them; they rise clear of
            // the controls.
            if (captions.isNotEmpty)
              SubtitleLayer(
                cues: captions,
                look: subtitleLook(ref, prefs),
                bottom: visible ? tvOverlayHeight : 40,
                side: 80,
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
    final (title, message) = playbackErrorText(l, error);
    return TvPlayerFailure(
      title: title,
      message: message,
      onBack: widget.back,
      onRetry: _session.refused ? null : () => unawaited(_session.retry()),
    );
  }
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

class _MenuDivider extends StatelessWidget {
  const _MenuDivider();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: SizedBox(
      height: 1,
      child: ColoredBox(color: MatineeTheme.of(context).border),
    ),
  );
}
