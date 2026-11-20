import 'dart:async';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../downloads/download_tracks.dart';
import '../downloads/downloads.dart';
import '../downloads/pending_progress.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../media/actions.dart' show mediaChangesProvider;
import '../media/format.dart';
import '../router.dart';
import 'offline_session.dart';
import 'playback_device.dart';
import 'playback_screen.dart';
import 'player.dart';
import 'player_controls.dart';
import 'player_motion.dart';
import 'player_overlays.dart';
import 'player_panel.dart';
import 'player_preferences.dart';
import 'seek_bar.dart';
import 'video_view.dart';

/// `/play/:id`: a finished download of the file plays from the device, as
/// in the Kotlin app, online too; anything else asks the server.
class PlayRoute extends ConsumerWidget {
  const PlayRoute({super.key, required this.id, this.startAt});

  final String id;
  final double? startAt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Picked once, so a download that finishes or goes meanwhile doesn't
    // swap the player under the person.
    final download = ref.read(finishedDownloadProvider(id));
    final loaded = ref.watch(downloadsProvider.select((list) => list.loaded));
    if (download != null) {
      return OfflinePlaybackScreen(itemId: id, startAt: startAt);
    }
    if (!loaded) {
      // The list comes in a moment; until then nothing is played twice.
      return const ColoredBox(color: Color(0xFF000000));
    }
    return _Settled(id: id, startAt: startAt);
  }
}

/// Once the list is in, what it said stays.
class _Settled extends ConsumerStatefulWidget {
  const _Settled({required this.id, this.startAt});

  final String id;
  final double? startAt;

  @override
  ConsumerState<_Settled> createState() => _SettledState();
}

class _SettledState extends ConsumerState<_Settled> {
  late final bool _download =
      ref.read(finishedDownloadProvider(widget.id)) != null;

  @override
  Widget build(BuildContext context) => _download
      ? OfflinePlaybackScreen(itemId: widget.id, startAt: widget.startAt)
      : PlaybackScreen(itemId: widget.id, startAt: widget.startAt);
}

/// A download playing with no server to ask, the Kotlin app's
/// `PlayerScreen` with `PlayerData.Local`: the same touch controls, the
/// tracks the download holds, and where the person got to sent to the
/// server, or kept for it while it's out of reach (`PendingProgress`).
class OfflinePlaybackScreen extends ConsumerStatefulWidget {
  const OfflinePlaybackScreen({required this.itemId, this.startAt, super.key});

  final String itemId;
  final double? startAt;

  @override
  ConsumerState<OfflinePlaybackScreen> createState() =>
      _OfflinePlaybackScreenState();
}

class _OfflinePlaybackScreenState extends ConsumerState<OfflinePlaybackScreen> {
  static int _lastOwner = 1 << 20;
  late final int _owner;
  late final Future<void> Function(int, bool) _fullscreen;

  /// The download as it was when the player opened.
  late final OfflineItem? _download = ref.read(
    finishedDownloadProvider(widget.itemId),
  );

  /// Online, the server says where the person got to, which may be past
  /// what the download remembers. Null until it answered or couldn't.
  MediaItem? _fresh;
  bool _asked = false;

  @override
  void initState() {
    super.initState();
    _owner = ++_lastOwner;
    _fullscreen = ref.read(playbackFullscreenProvider);
    unawaited(_window(true));
    unawaited(_ask());
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
      // Playback can still show in a window.
    }
  }

  Future<void> _ask() async {
    final api = ref.read(apiProvider);
    final online = ref.read(authStateProvider) is SignedIn;
    MediaItem? fresh;
    if (api != null && online) {
      try {
        fresh = await api.media
            .get(widget.itemId)
            .timeout(const Duration(seconds: 4));
      } on Object {
        // The download's own copy does.
      }
    }
    await ref.read(pendingProgressProvider.notifier).ready;
    if (!mounted) return;
    setState(() {
      _fresh = fresh;
      _asked = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final engineState = ref.watch(playerEngineProvider);
    final engine = engineState.value ?? PlayerEngine.mpv;
    final codecs = engine == PlayerEngine.media3
        ? ref.watch(playbackCodecsProvider)
        : null;
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    final folder = ref.watch(downloadsProvider.select((list) => list.folder));
    final download = _download;
    void back() => context.canPop() ? context.pop() : context.go(Routes.home);

    final Widget child;
    if (download == null || folder == null) {
      child = _Opening(back: back, error: l.playerErrorDownload);
    } else if (!_asked ||
        engineState.isLoading ||
        (codecs != null && codecs.isLoading)) {
      child = _Opening(back: back);
    } else {
      final item = _fresh ?? download.item;
      final preferences = user?.playback ?? defaultPlaybackPreferences;
      final device = playbackDevice(
        engine,
        codecs?.value,
        WidgetsBinding.instance.platformDispatcher.locale.languageCode,
      );
      bool decodes(String codec) =>
          device.audio.contains('*') ||
          device.audio.contains(codec) ||
          codec.startsWith('pcm_');
      final saved = [
        for (final entry in download.subtitles)
          SavedSubtitle(entry.track, '$folder/${entry.file}'),
      ];
      final audio = downloadAudio(
        download.audio,
        preferences.audioLanguage,
        item.title?.originalLanguage,
        decodes: decodes,
      );
      final subtitle = downloadSubtitle(
        [for (final entry in saved) entry.track],
        audio?.language,
        preferences,
        deviceLanguage: device.language,
      );
      final server = download.server;
      final pending = ref.read(pendingProgressProvider.notifier);
      final waiting = pending.report(server, item.id)?.positionSeconds;
      final progress = item.progress;
      final resume = progress != null && !progress.completed
          ? progress.positionSeconds
          : null;
      final startAt = widget.startAt ?? waiting ?? resume ?? 0;
      final reporter = _Reporter(
        ProviderScope.containerOf(context, listen: false),
        server: server,
        itemId: item.id,
        sessionId: _sessionId(),
      );
      child = _OfflineHost(
        key: ValueKey((widget.itemId, widget.startAt, engine)),
        create: () => OfflinePlaybackSession(
          item: item,
          path: '$folder/${download.file}',
          kind: download.kind,
          audioTracks: download.audio,
          subtitles: saved,
          player: ref.read(playbackPlayerFactoryProvider)(engine),
          mpv: engine == PlayerEngine.mpv,
          audio: audio,
          subtitle: subtitle,
          startAt: startAt,
          onReport: reporter.report,
        ),
        skipBack: preferences.skipBack,
        skipForward: preferences.skipForward,
        back: back,
        next: (next) => context.replace(Routes.play(next.id), extra: 0.0),
      );
    }
    return MatineeTheme.wrap(matineeDark, child);
  }
}

/// Where the person got to in a download, to the server when it answers,
/// as the Kotlin app's `PlayerController.report`: a report that goes
/// through drops what waited; one that doesn't waits, with the sitting so
/// far for the statistics. In offline mode it waits at once.
final class _Reporter {
  _Reporter(
    this._container, {
    required this.server,
    required this.itemId,
    required this.sessionId,
  }) : _startedAt = DateTime.now().toUtc();

  final String server;
  final String itemId;
  final String sessionId;
  final DateTime _startedAt;
  final ProviderContainer _container;

  void report(OfflineReport report) {
    final MatineeApi? api;
    final bool online;
    try {
      api = _container.read(apiProvider);
      online =
          _container.read(authStateProvider) is SignedIn &&
          _container.read(downloadsServerProvider) == server;
    } on StateError {
      // The app is going away with the player.
      return;
    }
    unawaited(_send(online ? api : null, report));
  }

  Future<void> _send(MatineeApi? api, OfflineReport report) async {
    final pending = _container.read(pendingProgressProvider.notifier);
    if (api != null) {
      try {
        await api.playback.report(
          itemId,
          positionSeconds: report.position,
          durationSeconds: report.duration,
          sessionId: sessionId,
          playedSeconds: report.played,
          paused: report.paused,
          closed: report.closed ? true : null,
        );
        await pending.drop(server, itemId);
        await pending.dropPlay(server, sessionId);
        if (report.closed) {
          _container.read(mediaChangesProvider.notifier).changed();
        }
        return;
      } on ApiException {
        // The server heard it and turned it down; nothing to keep.
        return;
      } on Object {
        // Out of reach: kept below.
      }
    }
    await pending.put(
      server,
      itemId,
      PendingReport(report.position, report.duration),
    );
    if (report.played > 0) {
      await pending.putPlay(
        server,
        PlaybackOfflineInputPlay(
          sessionId: sessionId,
          itemId: itemId,
          startedAt: _startedAt.toIso8601String(),
          endedAt: DateTime.now().toUtc().toIso8601String(),
          playedSeconds: report.played,
          positionSeconds: report.position,
          durationSeconds: report.duration,
        ),
      );
    }
  }
}

String _sessionId() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

class _Opening extends StatelessWidget {
  const _Opening({required this.back, this.error});

  final VoidCallback back;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final error = this.error;
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
                      error,
                      style: KitText.base.style(color: matineeDark.foreground),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfflineHost extends ConsumerStatefulWidget {
  const _OfflineHost({
    required super.key,
    required this.create,
    required this.skipBack,
    required this.skipForward,
    required this.back,
    required this.next,
  });

  final OfflinePlaybackSession Function() create;
  final int skipBack;
  final int skipForward;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  ConsumerState<_OfflineHost> createState() => _OfflineHostState();
}

class _OfflineHostState extends ConsumerState<_OfflineHost> {
  late final OfflinePlaybackSession _session;

  /// The episodes either side, from the server when it answers; none
  /// offline.
  (MediaItem?, MediaItem?) _episodes = (null, null);

  @override
  void initState() {
    super.initState();
    _session = widget.create();
    unawaited(_session.start());
    unawaited(_neighbours());
  }

  Future<void> _neighbours() async {
    final title = _session.item.title;
    final api = ref.read(apiProvider);
    if (title == null ||
        title.kind != TitleKind.show ||
        api == null ||
        ref.read(authStateProvider) is! SignedIn) {
      return;
    }
    try {
      final all = await api.titleItems(title.id);
      final index = all.indexWhere((item) => item.id == _session.item.id);
      if (!mounted || index < 0) return;
      setState(
        () => _episodes = (
          index > 0 ? all[index - 1] : null,
          index + 1 < all.length ? all[index + 1] : null,
        ),
      );
    } on Object {
      // Without the server, none either side.
    }
  }

  @override
  void dispose() {
    unawaited(_session.close());
    _session.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _OfflineControls(
    session: _session,
    skipBack: widget.skipBack,
    skipForward: widget.skipForward,
    previous: _episodes.$1,
    following: _episodes.$2,
    back: widget.back,
    next: widget.next,
  );
}

enum _Menu { audio, subtitles, speed }

const _speeds = [.5, .75, 1.0, 1.25, 1.5, 2.0];

/// The touch controls over a download, as `PlaybackScreen`'s, without the
/// quality menu: a download plays as it is.
class _OfflineControls extends StatefulWidget {
  const _OfflineControls({
    required this.session,
    required this.skipBack,
    required this.skipForward,
    required this.previous,
    required this.following,
    required this.back,
    required this.next,
  });

  final OfflinePlaybackSession session;
  final int skipBack;
  final int skipForward;
  final MediaItem? previous;
  final MediaItem? following;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  State<_OfflineControls> createState() => _OfflineControlsState();
}

class _OfflineControlsState extends State<_OfflineControls> {
  static const _hideAfter = Duration(milliseconds: 3500);
  static const _nextDelay = 10;
  Timer? _hide;
  Timer? _advance;
  bool _visible = true;
  bool _leaving = false;
  bool _playing = false;
  bool _cancelledNext = false;
  int _nextIn = _nextDelay;
  double? _scrubbing;
  _Menu? _menu;
  double _rate = 1;

  OfflinePlaybackSession get _session => widget.session;

  @override
  void initState() {
    super.initState();
    _session.addListener(_updated);
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

  /// Once the file ends, the next episode counts down and starts.
  void _syncNext() {
    final next = _session.error == null ? widget.following : null;
    if (next == null || !_session.ended) {
      _advance?.cancel();
      _advance = null;
      _nextIn = _nextDelay;
      return;
    }
    if (_leaving || _cancelledNext || _advance != null) return;
    _advance = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _nextIn--);
      if (_nextIn == 0) unawaited(_next(next));
    });
  }

  void _resetHide() {
    _hide?.cancel();
    if (!_visible ||
        !_playing ||
        _menu != null ||
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

  void _openMenu(_Menu menu) {
    setState(() => _menu = menu);
    _resetHide();
  }

  void _closeMenu() {
    setState(() => _menu = null);
    _resetHide();
  }

  void _pickRate(double rate) {
    setState(() => _rate = rate);
    unawaited(_session.player.setRate(rate).catchError((Object _) {}));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final error = _session.error;
    final buffering = _session.playback.phase == PlaybackPhase.buffering;
    final loading =
        !_leaving &&
        error == null &&
        (buffering || _session.playback.phase == PlaybackPhase.idle);
    final controls = _visible || error != null || _session.ended;
    final enabled = error == null && !_leaving;
    final captions =
        _session.captions?.at(_session.position) ?? const <TextSpan>[];
    final menu = _menu;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (_leaving) const ColoredBox(color: Color(0xFF000000)),
        VideoView(player: _session.player),
        PlayerFade(
          visible: controls && error == null && menu == null,
          child: const PlayerDim(),
        ),
        if (captions.isNotEmpty)
          IgnorePointer(
            child: Align(
              alignment: Alignment.bottomCenter,
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
                  children: [for (final cue in captions) _Caption(cue)],
                ),
              ),
            ),
          ),
        Semantics(
          label: l.a11yPlayerVideo,
          onTapHint: controls
              ? l.a11yPlayerHideControls
              : l.a11yPlayerShowControls,
          onTap: _toggleControls,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _toggleControls,
          ),
        ),
        TimedNote(
          token: _session.subtitleFailed ? _session.subtitle : null,
          duration: const Duration(seconds: 5),
          child: PlayerNote(title: l.playerErrorSubtitles),
        ),
        if (loading)
          Center(
            child: Spinner(
              size: 48,
              color: matineeDark.foreground,
              label: l.loadingInProgress,
            ),
          ),
        PlayerFade(
          visible: controls && error == null,
          child: _controls(l, enabled, loading),
        ),
        if (error != null)
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {},
            child: ColoredBox(
              color: const Color(0xCC000000),
              child: PlayerFailure(
                title: l.playerErrorLost,
                message: l.playerErrorDownload,
                backLabel: l.playerBack,
                onBack: widget.back,
                retryLabel: l.commonRetry,
                onRetry: _action(_session.retry),
              ),
            ),
          ),
        if (error == null && !_leaving)
          PlayerPrompts(
            lifted: controls,
            children: [
              if (_session.ended)
                if (widget.following case final item?) _upNext(l, item),
            ],
          ),
        PlayerPanel(
          entries: menu == null ? null : _entries(l, menu),
          dismissLabel: l.a11yPlayerCloseMenu,
          onDismiss: _closeMenu,
        ),
      ],
    );
  }

  Widget _controls(AppLocalizations l, bool enabled, bool loading) {
    final item = _session.item;
    final names = itemNames(item, l);
    final code = item.label.code;
    final subtitle = _session.subtitle;
    final previous = widget.previous;
    final following = widget.following;
    final episodes = item.title?.kind == TitleKind.show
        ? (
            PlayerEpisodeButton(
              icon: Lucide.skipBack,
              label: l.playerPreviousEpisode,
              onPressed: previous == null
                  ? null
                  : _action(() => _next(previous), enabled: !_leaving),
            ),
            PlayerEpisodeButton(
              icon: Lucide.skipForward,
              label: l.playerNextEpisode,
              onPressed: following == null
                  ? null
                  : _action(() => _next(following), enabled: !_leaving),
            ),
          )
        : null;
    final back = widget.skipBack;
    final ahead = widget.skipForward;
    return PlayerControls(
      title: names.title,
      subtitle: code == null ? null : '$code · ${names.showName}',
      backLabel: l.playerBack,
      onBack: widget.back,
      menus: [
        PlayerMenuButton(
          icon: Lucide.audioLines,
          label: l.playerMenuAudio,
          onPressed: enabled ? () => _openMenu(_Menu.audio) : null,
        ),
        PlayerMenuButton(
          icon: Lucide.captions,
          label: l.playerMenuSubtitles,
          active: subtitle != null,
          state: subtitle?.label ?? l.playerSubtitlesOff,
          onPressed: enabled ? () => _openMenu(_Menu.subtitles) : null,
        ),
        PlayerMenuButton(
          icon: Lucide.gauge,
          label: l.playerSpeed,
          onPressed: enabled ? () => _openMenu(_Menu.speed) : null,
        ),
      ],
      transport: PlayerTransport(
        playing: _playing,
        loading: loading,
        playLabel: l.playerPlay,
        pauseLabel: l.playerPause,
        onTogglePlay: _action(_session.togglePlay, enabled: enabled),
        back: (
          seconds: back,
          label: l.playerSkipBack(back),
          onPressed: _action(() => _session.skip(-back), enabled: enabled),
        ),
        ahead: (
          seconds: ahead,
          label: l.playerSkipForward(ahead),
          onPressed: _action(() => _session.skip(ahead), enabled: enabled),
        ),
        episodes: episodes,
      ),
      seekBar: _seekBar(l, enabled),
    );
  }

  Widget _seekBar(AppLocalizations l, bool enabled) {
    final length = _session.duration;
    final at = (_scrubbing ?? _session.position).clamp(0.0, length);
    final seekable = enabled && length > 0;
    return SeekBar(
      position: at,
      duration: length,
      buffered: _session.buffered?.clamp(0.0, length),
      scrubbing: _scrubbing != null,
      back: widget.skipBack.toDouble(),
      ahead: widget.skipForward.toDouble(),
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
      onSeek: seekable
          ? (value) {
              _resetHide();
              unawaited(_session.seek(value));
            }
          : null,
    );
  }

  List<PanelEntry> _entries(AppLocalizations l, _Menu menu) {
    void run(Future<void> Function() pick) => unawaited(pick());
    switch (menu) {
      case _Menu.audio:
        return [
          PanelHeading(l.playerMenuAudio),
          if (_session.audioTracks.isEmpty) PanelNote(l.playerAudioNoTracks),
          for (final track in _session.audioTracks)
            PanelChoice(
              track.label,
              detail: [track.format, ?track.layout].join(' · '),
              selected: track == _session.audio,
              pick: () => run(() => _session.pickAudio(track)),
            ),
        ];
      case _Menu.subtitles:
        return [
          PanelHeading(l.playerMenuSubtitles),
          PanelChoice(
            l.playerSubtitlesOff,
            selected: _session.subtitle == null,
            pick: () => run(() => _session.pickSubtitle(null)),
          ),
          for (final track in _session.subtitleTracks)
            PanelChoice(
              track.label,
              detail: [
                if (track.forced) l.playerSubtitlesForced,
                if (track.sdh) 'SDH',
                track.format,
              ].join(' · '),
              selected: track.id == _session.subtitle?.id,
              pick: () => run(() => _session.pickSubtitle(track)),
            ),
        ];
      case _Menu.speed:
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
    }
  }

  Widget _upNext(AppLocalizations l, MediaItem item) {
    final words = _cancelledNext ? l.playerPlay : l.playerUpNextIn(_nextIn);
    final title = itemNames(item, l).title;
    final code = episodeCode(item, l);
    return UpNextCard(
      heading: l.playerUpNext,
      title: code == null ? title : l.mediaCodeTitle(code, title),
      playLabel: words,
      playWords: words,
      onPlay: _action(() => _next(item)),
      dismissLabel: _cancelledNext ? null : l.playerUpNextCancel,
      onDismiss: _cancelledNext
          ? null
          : () {
              _advance?.cancel();
              _advance = null;
              setState(() => _cancelledNext = true);
            },
    );
  }
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
