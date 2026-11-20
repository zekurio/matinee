import 'dart:async';
import 'dart:math';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../downloads/download_tracks.dart';
import '../downloads/downloads.dart';
import '../downloads/pending_progress.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../media/actions.dart' show mediaChangesProvider;
import '../router.dart';
import 'offline_session.dart';
import 'playback_device.dart';
import 'playback_screen.dart';
import 'player.dart';
import 'player_controls.dart';
import 'player_preferences.dart';

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
    // Read once when the player opens, as a stream's.
    final prefsLoading = ref.watch(
      playerPrefsProvider.select((prefs) => prefs.isLoading),
    );
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
        prefsLoading ||
        (codecs != null && codecs.isLoading)) {
      child = _Opening(back: back);
    } else {
      final item = _fresh ?? download.item;
      final preferences = user?.playback ?? defaultPlaybackPreferences;
      final prefs = ref.read(playerPrefsProvider).value ?? const PlayerPrefs();
      final device = playbackDevice(
        engine,
        codecs?.value,
        WidgetsBinding.instance.platformDispatcher.locale.languageCode,
        prefs: prefs,
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
      // The system's media controls show the server's artwork while it's
      // the one in use, as the Kotlin app's do.
      final api = ref.read(apiProvider);
      final artwork =
          api != null &&
              ref.read(authStateProvider) is SignedIn &&
              ref.read(downloadsServerProvider) == server
          ? api.paths.artwork
          : null;
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
          player: ref.read(playbackPlayerFactoryProvider)(engine, prefs),
          mpv: engine == PlayerEngine.mpv,
          audio: audio,
          subtitle: subtitle,
          startAt: startAt,
          onReport: reporter.report,
          skipBack: preferences.skipBack,
          skipForward: preferences.skipForward,
          diagnostics: startPlaybackReport(
            ref,
            engine,
            prefs,
            device,
            file: item,
          ),
          artwork: artwork,
        ),
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
    required this.back,
    required this.next,
  });

  final OfflinePlaybackSession Function() create;
  final VoidCallback back;
  final ValueChanged<MediaItem> next;

  @override
  ConsumerState<_OfflineHost> createState() => _OfflineHostState();
}

class _OfflineHostState extends ConsumerState<_OfflineHost> {
  late final OfflinePlaybackSession _session;

  @override
  void initState() {
    super.initState();
    _session = widget.create();
    unawaited(_session.start());
    unawaited(_neighbours());
  }

  /// The episodes either side, from the server when it answers; none
  /// offline.
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
      _session.episodes(
        index > 0 ? all[index - 1] : null,
        index + 1 < all.length ? all[index + 1] : null,
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

  /// The stream's controls: a download has the same gestures, lock,
  /// buttons, picture in picture, media session, and keys.
  @override
  Widget build(BuildContext context) =>
      PlaybackControls(session: _session, back: widget.back, next: widget.next);
}
