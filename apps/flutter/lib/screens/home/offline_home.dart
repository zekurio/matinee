import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../api/matinee_api.dart';
import '../../downloads/downloads.dart';
import '../../downloads/pending_progress.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/format.dart';
import '../../media/layout.dart';
import '../../router.dart';

/// Where the person got to in a file: seconds in, of how many if known.
@immutable
final class Place {
  const Place(this.positionSeconds, this.durationSeconds);

  final double positionSeconds;
  final double? durationSeconds;

  double? get ratio {
    final duration = durationSeconds;
    if (duration == null || duration <= 0) return null;
    return (positionSeconds / duration).clamp(0.0, 1.0);
  }
}

/// A downloaded show, its episodes in order.
final class OfflineShow {
  const OfflineShow(this.title, this.episodes);

  final TitleSummary title;
  final List<OfflineItem> episodes;

  OfflineItem get newest =>
      episodes.reduce((a, b) => b.addedAt.isAfter(a.addedAt) ? b : a);
}

/// Home without the server: what's downloaded, in the rows Home has online.
final class OfflineHomeRows {
  const OfflineHomeRows({
    required this.resume,
    required this.nextUp,
    required this.movies,
    required this.shows,
  });

  final List<OfflineItem> resume;
  final List<OfflineItem> nextUp;
  final List<OfflineItem> movies;
  final List<OfflineShow> shows;

  bool get isEmpty => movies.isEmpty && shows.isEmpty;
}

/// The files in Home's Continue watching and Next up as the server last
/// sent them, by id, in order.
@immutable
final class ServedRows {
  const ServedRows({this.resume = const [], this.nextUp = const []});

  final List<String> resume;
  final List<String> nextUp;
}

/// Seasons in order, then the specials, then the files without a season,
/// as on a show's page.
int _seasonOrder(int? number) => switch (number) {
  null => 1 << 30,
  0 => (1 << 30) - 1,
  final n => n,
};

List<T> _distinctBy<T>(Iterable<T> items, Object? Function(T) key) {
  final seen = <Object?>{};
  return [
    for (final item in items)
      if (seen.add(key(item))) item,
  ];
}

/// Sorts the finished downloads into Home's rows, the Kotlin app's
/// `offlineHomeRows`. [place] is where the person got to in a file, offline
/// or as the server last said; [watched] whether it's done.
///
/// Continue watching and Next up start as the server last had them online,
/// [served], in its order, so they read as they did; of those, what's on
/// the device and still fits. Then what was started offline since, newest
/// first, and for a show with an episode watched or started, the first
/// downloaded one after it that isn't. Then every movie, and every show,
/// newest first.
OfflineHomeRows offlineHomeRows(
  Iterable<OfflineItem> entries, {
  required Place? Function(OfflineItem entry) place,
  required bool Function(OfflineItem entry) watched,
  ServedRows served = const ServedRows(),
}) {
  final done = entries.where((entry) => entry.done).toList()
    ..sort((a, b) => b.addedAt.compareTo(a.addedAt));
  bool started(OfflineItem entry) =>
      !watched(entry) && (place(entry)?.positionSeconds ?? 0) > 0;
  final byId = {for (final entry in done) entry.id: entry};
  final resume = _distinctBy([
    for (final id in served.resume)
      if (byId[id] case final entry? when !watched(entry)) entry,
    ...done.where(started),
  ], (entry) => entry.id);
  final byShow = <String, List<OfflineItem>>{};
  for (final entry in done.where((entry) => entry.isShow)) {
    (byShow[entry.item.title!.id] ??= []).add(entry);
  }
  final shows = [
    for (final files in byShow.values)
      OfflineShow(
        files.first.item.title!,
        [...files]..sort((a, b) {
          final season = _seasonOrder(a.item.seasonNumber)
              .compareTo(_seasonOrder(b.item.seasonNumber));
          if (season != 0) return season;
          return (a.item.episodeNumber ?? 1 << 30).compareTo(
            b.item.episodeNumber ?? 1 << 30,
          );
        }),
      ),
  ]..sort((a, b) => b.newest.addedAt.compareTo(a.newest.addedAt));
  final worked = <OfflineItem>[];
  for (final show in shows) {
    final last = show.episodes.lastIndexWhere(
      (entry) => watched(entry) || started(entry),
    );
    if (last < 0) continue;
    final next = show.episodes
        .skip(last + 1)
        .where((entry) => !watched(entry) && !started(entry));
    if (next.isNotEmpty) worked.add(next.first);
  }
  final resumed = {for (final entry in resume) entry.id};
  final nextUp = _distinctBy(
    _distinctBy([
      for (final id in served.nextUp)
        if (byId[id] case final entry? when !watched(entry) && !started(entry))
          entry,
      ...worked,
    ], (entry) => entry.id).where((entry) => !resumed.contains(entry.id)),
    // One per show, the first in line, as the server's own list has it.
    (entry) => entry.item.title?.id ?? entry.id,
  );
  return OfflineHomeRows(
    resume: resume,
    nextUp: nextUp,
    movies: [
      for (final entry in done)
        if (!entry.isShow) entry,
    ],
    shows: shows,
  );
}

final homeSnapshotProvider = NotifierProvider<HomeSnapshot, ServedRows>(
  HomeSnapshot.new,
);

/// Keeps [ServedRows] across restarts, the Kotlin app's `HomeSnapshot`:
/// online Home saves what the server sent, offline Home reads it, so the
/// two rows don't change just because the server is out of reach. Each
/// saved server keeps its own.
class HomeSnapshot extends Notifier<ServedRows> {
  static const _resume = 'matinee.home.resume:';
  static const _nextUp = 'matinee.home.nextUp:';
  // Opened on first use, inside the guards: a test may have none.
  late final _preferences = SharedPreferencesAsync();
  String? _server;

  @override
  ServedRows build() {
    final server = _server = ref.watch(downloadsServerProvider);
    if (server != null) unawaited(_load(server));
    return const ServedRows();
  }

  Future<void> _load(String server) async {
    try {
      final resume = await _preferences.getStringList('$_resume$server');
      final nextUp = await _preferences.getStringList('$_nextUp$server');
      if (!ref.mounted || _server != server) return;
      state = ServedRows(
        resume: resume ?? state.resume,
        nextUp: nextUp ?? state.nextUp,
      );
    } on Object {
      return;
    }
  }

  void saveResume(List<String> ids) {
    final server = _server;
    if (server == null || listEquals(ids, state.resume)) return;
    state = ServedRows(resume: ids, nextUp: state.nextUp);
    unawaited(_save('$_resume$server', ids));
  }

  void saveNextUp(List<String> ids) {
    final server = _server;
    if (server == null || listEquals(ids, state.nextUp)) return;
    state = ServedRows(resume: state.resume, nextUp: ids);
    unawaited(_save('$_nextUp$server', ids));
  }

  Future<void> _save(String key, List<String> ids) async {
    try {
      await _preferences.setStringList(key, ids);
    } on Object {
      return;
    }
  }
}

/// Home in offline mode, the Kotlin app's `OfflineHomeScreen`: the
/// downloads in Home's rows, each playing from the device with a tap, a
/// show opening its downloaded episodes. The places the player keeps
/// offline move the rows on as they change.
class OfflineHome extends ConsumerWidget {
  const OfflineHome({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final entries = ref.watch(shownDownloadsProvider).values;
    final server = ref.watch(downloadsServerProvider);
    final pending = server == null
        ? const ServerPending()
        : ref.watch(pendingProgressProvider)[server] ?? const ServerPending();
    Place? place(OfflineItem entry) {
      final duration = entry.item.durationSeconds;
      if (pending.reports[entry.id] case final report?) {
        return Place(
          report.positionSeconds,
          report.durationSeconds ?? duration,
        );
      }
      if (entry.item.progress case final progress?) {
        return Place(progress.positionSeconds, duration);
      }
      return null;
    }

    // Watched as the server last said, or played nearly to the end offline.
    bool watched(OfflineItem entry) =>
        isWatched(entry.item) ||
        (pending.reports.containsKey(entry.id) &&
            (place(entry)?.ratio ?? 0) >= .9);

    final rows = offlineHomeRows(
      entries,
      place: place,
      watched: watched,
      served: ref.watch(homeSnapshotProvider),
    );
    if (rows.isEmpty) {
      return Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(vertical: 48),
          child: EmptyState(
            icon: Lucide.download,
            title: l.downloadsEmpty,
            message: l.downloadsEmptyHint,
          ),
        ),
      );
    }
    Widget files(String title, List<OfflineItem> files) => _FileRail(
      title: title,
      files: [
        for (final entry in files)
          _FileCard(entry: entry, place: place(entry), watched: watched(entry)),
      ],
    );
    final sections = [
      if (rows.resume.isNotEmpty) files(l.browseContinueWatching, rows.resume),
      if (rows.nextUp.isNotEmpty) files(l.browseNextUp, rows.nextUp),
      if (rows.movies.isNotEmpty)
        files(l.webLibrariesDialogKindMovies, rows.movies),
      if (rows.shows.isNotEmpty)
        _FileRail(
          title: l.webLibrariesDialogKindShows,
          files: [for (final show in rows.shows) _ShowCard(show: show)],
        ),
    ];
    return ListView.separated(
      padding: const EdgeInsets.only(top: 16, bottom: 24),
      itemCount: sections.length,
      separatorBuilder: (context, index) => const SizedBox(height: 24),
      itemBuilder: (context, index) => sections[index],
    );
  }
}

class _FileRail extends StatelessWidget {
  const _FileRail({required this.title, required this.files});

  final String title;
  final List<Widget> files;

  @override
  Widget build(BuildContext context) {
    final size = railCardSize(context, RailArt.wide);
    return Rail(
      title: title,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: files.length,
      itemBuilder: (context, index) => files[index],
    );
  }
}

/// A downloaded movie or episode, its saved picture, and how far in; a tap
/// plays it from the device.
class _FileCard extends StatelessWidget {
  const _FileCard({
    required this.entry,
    required this.place,
    required this.watched,
  });

  final OfflineItem entry;
  final Place? place;
  final bool watched;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(entry.item, l);
    final code = episodeCode(entry.item, l);
    return WideCard(
      name: code == null ? names.title : names.showName,
      detail: code == null ? names.year : l.mediaCodeTitle(code, names.title),
      toneKey: names.showName,
      art: _SavedArt(entry: entry),
      progress: place?.ratio,
      watchedLabel: watched ? l.mediaWatched : null,
      onPressed: () => context.push(Routes.play(entry.id)),
    );
  }
}

/// A downloaded show, the newest episode's picture; a tap opens its
/// downloaded episodes.
class _ShowCard extends StatelessWidget {
  const _ShowCard({required this.show});

  final OfflineShow show;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return WideCard(
      name: show.title.name,
      detail: l.mediaEpisodeCount(show.episodes.length),
      art: _SavedArt(entry: show.newest),
      onPressed: () => context.push(Routes.downloadsShow(show.title.id)),
    );
  }
}

/// The picture saved with a download, over the card's film icon.
class _SavedArt extends ConsumerWidget {
  const _SavedArt({required this.entry});

  final OfflineItem entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final path = ref.watch(downloadsProvider).path(entry.image);
    if (path == null) return const SizedBox.shrink();
    return Image.file(
      File(path),
      fit: BoxFit.cover,
      errorBuilder: (context, error, stack) => const SizedBox.shrink(),
    );
  }
}
