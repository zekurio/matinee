import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../api/matinee_api.dart';
import '../core/app_log.dart';
import '../core/device.dart';
import '../core/session.dart';
import '../l10n/app_localizations.dart';
import '../media/actions.dart' show mediaChangesProvider;
import '../media/format.dart';
import '../platform/watch_next.g.dart' as wire;
import '../router.dart';

// Continue watching and Next up in an Android TV launcher's Watch Next row.
// The server's two lists decide what goes in and in what order, and the
// launcher how the row looks. Dart fetches the lists and the pictures, which
// need the session; the platform keeps the row (`launcher/WatchNext.kt`).

/// The server's two lists as the launcher's cards, in the server's order,
/// Continue watching first. Nothing is left out or sorted here. A file in
/// both lists is a card once, where it came first.
List<wire.WatchNextProgramMessage> watchNextPrograms(
  List<MediaItem> continuing,
  List<NextUpEntry> next,
  AppLocalizations l,
) {
  final seen = <String>{};
  return [
    for (final item in continuing)
      if (seen.add(item.id))
        _program(
          item,
          wire.WatchNextKindMessage.resume,
          l,
          item.progress?.updatedAt,
        ),
    // The time the episode before it was finished, never the episode's own
    // progress: that is what puts the show where it was last watched.
    for (final entry in next)
      if (seen.add(entry.item.id))
        _program(
          entry.item,
          wire.WatchNextKindMessage.next,
          l,
          entry.lastWatchedAt,
        ),
  ];
}

wire.WatchNextProgramMessage _program(
  MediaItem item,
  wire.WatchNextKindMessage kind,
  AppLocalizations l,
  String? watchedAt,
) {
  final names = itemNames(item, l);
  final episode =
      item.title?.kind == TitleKind.show || item.episodeNumber != null;
  final images = item.title?.images;
  final landscape = item.episode?.still ?? images?.backdrop;
  final duration = item.durationSeconds;
  final position = item.progress?.positionSeconds;
  return wire.WatchNextProgramMessage(
    itemId: item.id,
    kind: kind,
    // The launcher has a column for each: the show, then the episode.
    title: names.showName,
    episodeTitle: episode ? names.title : null,
    description: item.episode?.overview ?? item.title?.overview,
    episode: episode,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    artworkId: (landscape ?? images?.poster)?.id,
    poster: landscape == null,
    durationMillis: duration == null ? null : (duration * 1000).round(),
    positionMillis: position == null ? null : (position * 1000).round(),
    // A time the server didn't send, or that doesn't parse, stays empty: the
    // device's clock never stands in for it.
    engagementMillis: watchedAt == null
        ? null
        : DateTime.tryParse(watchedAt)?.millisecondsSinceEpoch,
  );
}

/// Whose row it is: a hash of the server in use and the account saved for
/// it, so nothing of either is in the launcher's table. Null with nobody
/// signed in there. It stays while the server is away or being checked.
String? watchNextIdentity(SessionState session) {
  final origin = session.activeServer;
  if (origin == null) return null;
  for (final server in session.servers) {
    if (server.origin != origin) continue;
    final user = server.user;
    if (user == null) return null;
    return sha256.convert(utf8.encode('$origin\n${user.id}')).toString();
  }
  return null;
}

/// What the platform does for the row. Android TV's is `WatchNext.kt`; tests
/// give their own.
abstract interface class WatchNextPlatform {
  Future<void> setIdentity(String? identity);
  Future<List<String>> missingArtwork(String identity, List<String> artworkIds);
  Future<void> saveArtwork(String identity, String artworkId, Uint8List bytes);
  Future<void> publish(
    String identity,
    List<wire.WatchNextProgramMessage> programs,
  );

  /// The card the launcher started the app with, once.
  Future<wire.WatchNextLinkMessage?> takeLink();

  /// The cards opened while the app runs.
  Stream<wire.WatchNextLinkMessage> get links;
}

/// The platform's side over the Pigeon channels in `pigeons/watch_next.dart`.
final class PigeonWatchNextPlatform
    implements WatchNextPlatform, wire.WatchNextEventsApi {
  PigeonWatchNextPlatform() {
    wire.WatchNextEventsApi.setUp(this);
  }

  final _host = wire.WatchNextApi();
  final _links = StreamController<wire.WatchNextLinkMessage>.broadcast();

  @override
  void opened(wire.WatchNextLinkMessage link) => _links.add(link);

  @override
  Stream<wire.WatchNextLinkMessage> get links => _links.stream;

  @override
  Future<void> setIdentity(String? identity) => _host.setIdentity(identity);

  @override
  Future<List<String>> missingArtwork(
    String identity,
    List<String> artworkIds,
  ) => _host.missingArtwork(identity, artworkIds);

  @override
  Future<void> saveArtwork(
    String identity,
    String artworkId,
    Uint8List bytes,
  ) => _host.saveArtwork(identity, artworkId, bytes);

  @override
  Future<void> publish(
    String identity,
    List<wire.WatchNextProgramMessage> programs,
  ) => _host.publish(identity, programs);

  @override
  Future<wire.WatchNextLinkMessage?> takeLink() => _host.takeLink();
}

final watchNextPlatformProvider = Provider<WatchNextPlatform>(
  (ref) => PigeonWatchNextPlatform(),
);

/// Whether this device's launcher has the row: an Android TV's.
final hasWatchNextProvider = Provider<bool>(
  (ref) => ref.watch(deviceProvider).platform == DevicePlatform.androidtv,
);

/// Brings the launcher's row up to date. One sync runs at a time, and asking
/// during one runs one more after it, so the row ends as the latest ask saw
/// the server.
final class WatchNext {
  WatchNext(this._ref);

  final Ref _ref;
  Future<void>? _running;
  bool _again = false;

  /// The app's words, for an episode without a name. The row waits for them.
  AppLocalizations? words;

  /// Syncs soon. Does nothing where there's no row.
  void requestSync() {
    if (!_ref.read(hasWatchNextProvider)) return;
    if (_running != null) {
      _again = true;
      return;
    }
    _running = _run();
  }

  Future<void> _run() async {
    do {
      _again = false;
      try {
        await sync();
      } on Object catch (error, stack) {
        // The launcher can take its table away, and the server can be down.
        // The row keeps what it had, and playback is none the worse.
        logWarning('watch-next', "Couldn't sync Watch Next", error, stack);
      }
    } while (_again);
    _running = null;
  }

  /// Tells the platform whose row it is, then fills it from the server.
  /// False when nobody is signed in or the session changed meanwhile. A
  /// fetch that fails throws before anything is written.
  @visibleForTesting
  Future<bool> sync() async {
    final platform = _ref.read(watchNextPlatformProvider);
    final session = _ref.read(sessionProvider);
    final identity = watchNextIdentity(session);
    await platform.setIdentity(identity);
    final l = words;
    final api = _ref.read(apiProvider);
    if (identity == null ||
        l == null ||
        api == null ||
        session.auth is! SignedIn) {
      return false;
    }
    final client = _ref.read(sessionHttpProvider);
    final continuing = await api.home.continueWatching();
    final next = await api.home.nextUp();
    final programs = watchNextPrograms(continuing, next, l);
    final wanted = {for (final program in programs) ?program.artworkId};
    final missing = await platform.missingArtwork(identity, wanted.toList());
    for (final id in missing) {
      final bytes = await _artwork(client, api.paths.artwork(id, size: _size));
      // A card without its picture still plays.
      if (bytes != null) await platform.saveArtwork(identity, id, bytes);
    }
    if (_ref.read(sessionProvider).version != session.version) return false;
    await platform.publish(identity, programs);
    return true;
  }

  /// 960 pixels wide, which is more than a launcher draws a card at.
  static const _size = ArtworkSize.medium;

  Future<Uint8List?> _artwork(http.Client client, Uri url) async {
    try {
      final response = await client.get(url);
      return response.statusCode == 200 ? response.bodyBytes : null;
    } on Exception catch (error) {
      logWarning('watch-next', "Couldn't fetch a launcher picture", error);
      return null;
    }
  }
}

final watchNextProvider = Provider<WatchNext>(WatchNext.new);

/// Keeps the launcher's row in step with the app and opens the cards the
/// person picks there. It syncs when the session changes, when the app comes
/// to the front, and when what's watched changes: a mark, or the player's
/// last report (`mediaChangesProvider`). Nothing syncs while the app is
/// closed. `app.dart` puts it under the router on an Android TV.
class WatchNextLifecycle extends ConsumerStatefulWidget {
  const WatchNextLifecycle({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<WatchNextLifecycle> createState() => _WatchNextLifecycleState();
}

class _WatchNextLifecycleState extends ConsumerState<WatchNextLifecycle> {
  late final AppLifecycleListener _lifecycle;
  StreamSubscription<wire.WatchNextLinkMessage>? _links;
  int _opening = 0;

  @override
  void initState() {
    super.initState();
    final row = ref.read(watchNextProvider);
    _lifecycle = AppLifecycleListener(onResume: row.requestSync);
    ref.listenManual(
      sessionProvider.select((state) => (state.version, state.auth)),
      (_, _) => row.requestSync(),
    );
    ref.listenManual(mediaChangesProvider, (_, _) => row.requestSync());
    final platform = ref.read(watchNextPlatformProvider);
    _links = platform.links.listen(_open);
    unawaited(_first(platform));
  }

  Future<void> _first(WatchNextPlatform platform) async {
    try {
      final link = await platform.takeLink();
      if (link != null) await _open(link);
    } on PlatformException catch (error) {
      logWarning('watch-next', "Couldn't read the launcher's link", error);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The first sync, and another when the language changes.
    ref.read(watchNextProvider)
      ..words = AppLocalizations.of(context)
      ..requestSync();
  }

  /// Plays the card's file, as Resume does, once the session has settled,
  /// and only for the account whose row the card was in. A card that's out
  /// of date, for a file that's gone or another account, opens the app and
  /// nothing else.
  Future<void> _open(wire.WatchNextLinkMessage link) async {
    final opening = ++_opening;
    final settled = await _settled();
    if (!mounted || opening != _opening) return;
    final session = ref.read(sessionProvider);
    final api = ref.read(apiProvider);
    if (!settled ||
        api == null ||
        session.auth is! SignedIn ||
        link.identity != watchNextIdentity(session)) {
      return;
    }
    try {
      // The file can be gone since the card was made.
      await api.media.get(link.itemId);
    } on Exception catch (error) {
      logWarning('watch-next', "Couldn't open the launcher's card", error);
      ref.read(watchNextProvider).requestSync();
      return;
    }
    if (!mounted ||
        opening != _opening ||
        ref.read(sessionProvider).version != session.version) {
      return;
    }
    final router = ref.read(routerProvider);
    final route = Routes.play(link.itemId);
    final here = router.routerDelegate.currentConfiguration.uri.path;
    // There is one player: a card opened while a video plays takes its place.
    if (here.startsWith(Routes.playPrefix)) {
      unawaited(router.pushReplacement(route));
    } else {
      unawaited(router.push(route));
    }
  }

  /// Waits while the saved server is being checked, as it is right after a
  /// cold start. False when it took too long.
  Future<bool> _settled() async {
    if (ref.read(authStateProvider) is! Connecting) return true;
    final done = Completer<bool>();
    final listening = ref.listenManual(authStateProvider, (_, auth) {
      if (auth is! Connecting && !done.isCompleted) done.complete(true);
    });
    final timeout = Timer(const Duration(seconds: 30), () {
      if (!done.isCompleted) done.complete(false);
    });
    try {
      return await done.future;
    } finally {
      timeout.cancel();
      listening.close();
    }
  }

  @override
  void dispose() {
    _opening++;
    unawaited(_links?.cancel());
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
