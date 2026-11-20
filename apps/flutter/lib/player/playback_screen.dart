import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/matinee_api.dart';
import '../core/device.dart';
import '../core/failure_text.dart';
import '../core/session.dart';
import '../kit/glass.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../platform/player.g.dart' as wire;
import '../router.dart';
import 'playback_device.dart';
import 'playback_session.dart';
import 'player.dart';
import 'player_preferences.dart';
import 'video_view.dart';

final playbackPlayerFactoryProvider = Provider<Player Function(PlayerEngine)>(
  (ref) =>
      (engine) => Player(engine: engine),
);
final playbackFullscreenProvider = Provider<Future<void> Function(int, bool)>(
  (ref) => wire.PlayerApi().setFullscreen,
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
    } else if (engineState.isLoading || codecs?.isLoading == true) {
      child = _Opening(back: back);
    } else {
      final profile = playbackDevice(
        engine,
        codecs?.value,
        WidgetsBinding.instance.platformDispatcher.locale.languageCode,
      );
      child = _PlaybackHost(
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
        back: back,
        next: (item) => context.replace(Routes.play(item.id), extra: 0.0),
      );
    }
    return MatineeTheme.wrap(matineeDark, child);
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
              child: _button(Lucide.arrowLeft, l.playerBack, back),
            ),
            Center(
              child: error == null
                  ? Spinner(size: 28, label: l.loadingInProgress)
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

  @override
  void initState() {
    super.initState();
    _session = widget.create();
    unawaited(_session.start());
  }

  @override
  void dispose() {
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

/// The touch controls. A sheet can stay open while the video continues.
class _PlaybackControls extends StatefulWidget {
  const _PlaybackControls({
    required this.session,
    required this.back,
    required this.next,
  });

  final PlaybackSession session;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  State<_PlaybackControls> createState() => _PlaybackControlsState();
}

class _PlaybackControlsState extends State<_PlaybackControls> {
  static const _hideAfter = Duration(seconds: 3);
  static const _nextDelay = 10;
  Timer? _hide;
  Timer? _advance;
  bool _visible = true;
  bool _sheet = false;
  bool _leaving = false;
  bool _playing = false;
  bool _sawNextEarly = false;
  bool _cancelledNext = false;
  int _nextIn = _nextDelay;
  double? _scrubbing;

  PlaybackSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    _session.addListener(_updated);
    _playing = _session.playback.status.playing;
    if (_playing) _resetHide();
  }

  @override
  void dispose() {
    _session.removeListener(_updated);
    _hide?.cancel();
    _advance?.cancel();
    super.dispose();
  }

  void _updated() {
    final playing = _session.playback.status.playing;
    setState(() {
      if (_playing != playing) {
        _playing = playing;
        if (!playing && _session.playback.phase == PlaybackPhase.ready) {
          _visible = true;
        }
        _resetHide();
      }
      _syncNext();
    });
  }

  void _syncNext() {
    final next = _session.error == null ? _session.next : null;
    if (next == null || !_session.ended) {
      _advance?.cancel();
      _advance = null;
      _nextIn = _nextDelay;
      _sawNextEarly = next != null;
      if (next == null) _cancelledNext = false;
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
    setState(() => _cancelledNext = true);
  }

  void _resetHide() {
    _hide?.cancel();
    if (!_visible ||
        !_playing ||
        _sheet ||
        _scrubbing != null ||
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
        _visible || error != null || _session.ended || plan == null;
    final enabled =
        plan != null && error == null && !_session.busy && !_leaving;
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];

    return Stack(
      fit: StackFit.expand,
      children: [
        if (plan == null || _session.refused || _leaving)
          const ColoredBox(color: Color(0xFF000000)),
        VideoView(player: _session.player),
        if (controls)
          const IgnorePointer(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xB3000000),
                    Color(0x08000000),
                    Color(0xD9000000),
                  ],
                  stops: [0, .48, 1],
                ),
              ),
            ),
          ),
        if (captions.isNotEmpty)
          SafeArea(
            child: IgnorePointer(
              child: Align(
                alignment: Alignment.bottomCenter,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(24, 0, 24, controls ? 108 : 20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [for (final cue in captions) _Caption(cue)],
                  ),
                ),
              ),
            ),
          ),
        Semantics(
          label: controls ? l.a11yPlayerHideControls : l.a11yPlayerShowControls,
          button: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _toggleControls,
          ),
        ),
        SafeArea(
          minimum: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (controls) _header(l, plan?.item),
              Expanded(
                child: Center(
                  child: error != null
                      ? _failure(l, error)
                      : loading
                      ? Spinner(size: 28, label: l.loadingInProgress)
                      : controls && enabled
                      ? _transport(l)
                      : null,
                ),
              ),
              if (error == null && !_leaving) ...[
                _prompts(l, enabled),
                if (controls && plan != null) _footer(l, plan, enabled),
              ],
            ],
          ),
        ),
        if (_session.notice case (final notice, final detail))
          SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: Padding(
                padding: const EdgeInsets.only(top: 52, left: 16, right: 16),
                child: _notice(l, notice, detail),
              ),
            ),
          ),
      ],
    );
  }

  Widget _header(AppLocalizations l, MediaItem? item) => Row(
    spacing: 12,
    children: [
      _button(Lucide.arrowLeft, l.playerBack, widget.back),
      if (item != null)
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                item.label.showName.isEmpty
                    ? item.fileTitle
                    : item.label.showName,
                style: KitText.base.style(
                  color: matineeDark.foreground,
                  weight: FontWeight.w600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              if (_fileLabel(l, item) case final label?)
                Text(
                  label,
                  style: KitText.sm.style(color: matineeDark.mutedForeground),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
            ],
          ),
        ),
    ],
  );

  Widget _transport(AppLocalizations l) => Row(
    mainAxisSize: MainAxisSize.min,
    spacing: 24,
    children: [
      if (_session.skipBack case final seconds?)
        _button(
          Lucide.rotateCcw,
          l.playerSkipBack(seconds),
          _action(() => _session.skip(-seconds)),
          seconds: seconds,
        ),
      _button(
        _playing ? Lucide.pause : Lucide.play,
        _playing ? l.playerPause : l.playerPlay,
        _action(_session.togglePlay),
        primary: true,
      ),
      if (_session.skipForward case final seconds?)
        _button(
          Lucide.rotateCw,
          l.playerSkipForward(seconds),
          _action(() => _session.skip(seconds)),
          seconds: seconds,
        ),
    ],
  );

  Widget _prompts(AppLocalizations l, bool enabled) => Align(
    alignment: AlignmentDirectional.centerEnd,
    child: Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.end,
      children: [
        if (_session.segment case final segment?)
          MatineeButton(
            onPressed: _action(
              () => _session.skipSegment(segment),
              enabled: enabled,
            ),
            look: ButtonLook.frosted,
            child: Text(switch (segment.kind) {
              MediaSegmentKind.intro => l.playerSkipIntro,
              MediaSegmentKind.recap => l.playerSkipRecap,
              MediaSegmentKind.credits => l.playerSkipCredits,
              _ => l.playerSkipPreview,
            }),
          ),
        if (_session.ended || !_cancelledNext)
          if (_session.next case final item?) _nextPrompt(l, item, enabled),
      ],
    ),
  );

  Widget _nextPrompt(AppLocalizations l, MediaItem item, bool enabled) {
    final left = _session.ended
        ? _nextIn
        : (_session.duration - _session.position).ceil().clamp(0, 9999);
    final words = _cancelledNext ? l.playerNextEpisode : l.playerUpNextIn(left);
    return Glass(
      shape: KitRadius.panel,
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          spacing: 5,
          children: [
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 240),
              child: Text(
                _fileLabel(l, item) ?? item.label.showName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: KitText.sm.style(color: matineeDark.foreground),
              ),
            ),
            Wrap(
              spacing: 6,
              children: [
                MatineeButton(
                  onPressed: _action(() => _next(item), enabled: enabled),
                  leading: Lucide.skipForward,
                  label: l.playerNextEpisode,
                  child: ExcludeSemantics(child: Text(words)),
                ),
                if (!_cancelledNext)
                  MatineeButton(
                    onPressed: _cancelNext,
                    look: ButtonLook.frosted,
                    child: Text(
                      _session.ended
                          ? l.playerUpNextCancel
                          : l.playerUpNextHide,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _footer(AppLocalizations l, PlaybackStart plan, bool enabled) {
    final length = _session.duration;
    final at = (_scrubbing ?? _session.position).clamp(0.0, length);
    final seekable = enabled && length > 0;
    return Row(
      children: [
        Text(_time(at), style: KitText.xs.style(color: matineeDark.foreground)),
        Expanded(
          child: Slider(
            compact: true,
            value: at,
            buffered: _session.buffered?.clamp(0.0, length),
            max: length > 0 ? length : 1,
            label: l.a11yPlayerSeek,
            formatValue: (value) =>
                l.a11yPlayerPosition(_time(value), _time(length)),
            onChangeStart: seekable
                ? (value) {
                    setState(() => _scrubbing = value);
                    _resetHide();
                  }
                : null,
            onChanged: seekable
                ? (value) {
                    if (_scrubbing == null) {
                      // Accessibility and keyboard adjustments do not always start a drag.
                      unawaited(_session.seek(value));
                    } else {
                      setState(() => _scrubbing = value);
                    }
                  }
                : null,
            onChangeEnd: seekable
                ? (value) {
                    setState(() => _scrubbing = null);
                    _resetHide();
                    unawaited(_session.seek(value));
                  }
                : null,
          ),
        ),
        if (length > 0)
          Text(
            _time(length),
            style: KitText.xs.style(color: matineeDark.foreground),
          ),
        const SizedBox(width: 8),
        _button(
          Lucide.audioLines,
          l.playerMenuAudio,
          enabled ? () => _audio(l, plan) : null,
        ),
        _button(
          Lucide.captions,
          l.playerMenuSubtitles,
          enabled ? () => _subtitles(l, plan) : null,
        ),
        if (plan.original || _session.qualities.isNotEmpty)
          _button(
            Lucide.settings,
            l.playerQuality,
            enabled ? () => _quality(l, plan) : null,
          ),
      ],
    );
  }

  void _audio(AppLocalizations l, PlaybackStart plan) {
    unawaited(
      _choices(l.playerMenuAudio, [
        for (final track in plan.audioTracks)
          _Choice(
            track.label,
            track.index == plan.audio?.index,
            () => _session.pickAudio(track),
          ),
      ], empty: l.playerAudioNoTracks),
    );
  }

  void _subtitles(AppLocalizations l, PlaybackStart plan) {
    unawaited(
      _choices(l.playerMenuSubtitles, [
        _Choice(
          l.playerSubtitlesOff,
          plan.subtitle == null,
          () => _session.pickSubtitle(null),
        ),
        for (final track in plan.subtitleTracks)
          _Choice(
            track.label,
            track.id == plan.subtitle?.id,
            () => _session.pickSubtitle(track),
          ),
      ]),
    );
  }

  void _quality(AppLocalizations l, PlaybackStart plan) {
    final decimal = NumberFormat.decimalPattern(
      Localizations.localeOf(context).toLanguageTag(),
    );
    unawaited(
      _choices(l.playerQuality, [
        if (plan.original)
          _Choice(
            l.playerQualityOriginal,
            plan.quality == PlaybackQuality.original,
            () => _session.pickQuality(PlaybackQuality.original),
          ),
        for (final preset in _session.qualities)
          _Choice(
            l.playbackQualityPreset(
              preset.height,
              l.playerBitrateMbpsExact(
                decimal.format(preset.bitrate / 1000000),
              ),
            ),
            plan.quality == preset.id,
            () => _session.pickQuality(preset.id),
          ),
      ]),
    );
  }

  Future<void> _choices(
    String title,
    List<_Choice> choices, {
    String? empty,
  }) async {
    final l = AppLocalizations.of(context);
    _sheet = true;
    _resetHide();
    final pick = await Sheet.show<_Choice>(
      context,
      dismissLabel: l.a11yPlayerCloseMenu,
      builder: (sheet) => Sheet(
        title: title,
        child: choices.isEmpty
            ? Text(empty ?? '')
            : Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final choice in choices)
                    PressIndication(
                      selected: choice.selected,
                      inMutuallyExclusiveGroup: true,
                      shape: KitRadius.panel,
                      onPressed: () => Navigator.of(sheet).pop(choice),
                      builder: (context, state) {
                        final colors = MatineeTheme.of(context);
                        return ColoredBox(
                          color: state == PressState.idle
                              ? const Color(0x00000000)
                              : colors.secondary,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 12,
                            ),
                            child: Row(
                              spacing: 8,
                              children: [
                                Expanded(child: Text(choice.label)),
                                if (choice.selected)
                                  const KitIcon(Lucide.check, size: 16),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
      ),
    );
    if (!mounted) return;
    _sheet = false;
    _resetHide();
    await pick?.run();
  }

  Widget _failure(AppLocalizations l, Object error) {
    final (title, message) = _errorText(l, error);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        spacing: 8,
        children: [
          Text(
            title,
            textAlign: TextAlign.center,
            style: KitText.lg.style(color: matineeDark.foreground),
          ),
          Text(
            message,
            textAlign: TextAlign.center,
            style: KitText.sm.style(color: matineeDark.mutedForeground),
          ),
          if (!_session.refused)
            MatineeButton(
              onPressed: _action(_session.retry),
              child: Text(l.commonRetry),
            ),
        ],
      ),
    );
  }

  Widget _notice(AppLocalizations l, PlaybackNotice notice, Object? detail) {
    final text = switch (notice) {
      PlaybackNotice.burnInFailed => l.playerNoticeBurnInFailedDetail,
      PlaybackNotice.qualityFailed => l.playerNoticeQualityFailedDetail,
      PlaybackNotice.subtitleFailed => l.playerErrorSubtitles,
      PlaybackNotice.switchFailed =>
        detail == null ? l.playerNoticeSwitchFailed : _errorText(l, detail).$2,
    };
    return Glass(
      shape: KitRadius.panel,
      child: Padding(
        padding: const EdgeInsetsDirectional.only(start: 12, end: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                text,
                style: KitText.sm.style(color: matineeDark.foreground),
              ),
            ),
            _button(Lucide.x, l.toastClose, _session.dismissNotice),
          ],
        ),
      ),
    );
  }
}

class _Choice {
  const _Choice(this.label, this.selected, this.run);

  final String label;
  final bool selected;
  final Future<void> Function() run;
}

class _Caption extends StatelessWidget {
  const _Caption(this.cue);

  final TextSpan cue;

  @override
  Widget build(BuildContext context) => Container(
    color: const Color(0xD9000000),
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    child: Text.rich(
      cue,
      textAlign: TextAlign.center,
      style: KitText.lg.style(color: const Color(0xFFFFFFFF)),
    ),
  );
}

Widget _button(
  String icon,
  String label,
  VoidCallback? onPressed, {
  bool primary = false,
  int? seconds,
}) => MatineeButton(
  label: label,
  onPressed: onPressed,
  look: ButtonLook.frosted,
  size: ButtonSize.iconLg,
  child: seconds == null
      ? KitIcon(icon, size: primary ? 24 : 20)
      : Stack(
          alignment: Alignment.center,
          children: [
            KitIcon(icon, size: 27),
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: ExcludeSemantics(
                child: Text('$seconds', style: KitText.xs.style()),
              ),
            ),
          ],
        ),
);

String? _fileLabel(AppLocalizations l, MediaItem item) {
  final label = item.label;
  final number = label.episodeNumber;
  final title =
      label.title ??
      (number == null
          ? null
          : item.seasonNumber == 0
          ? l.mediaSpecial(number)
          : l.mediaEpisode(number));
  return [
    ?label.code,
    if (title != null && title != label.showName) title,
  ].join(' · ').nullIfEmpty;
}

extension on String {
  String? get nullIfEmpty => isEmpty ? null : this;
}

String _time(double seconds) {
  final total = seconds.toInt();
  final hours = total ~/ 3600;
  final minutes = (total ~/ 60) % 60;
  final rest = (total % 60).toString().padLeft(2, '0');
  return hours > 0
      ? '$hours:${minutes.toString().padLeft(2, '0')}:$rest'
      : '$minutes:$rest';
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
