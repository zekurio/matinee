import '../api/matinee_api.dart';
import 'offline_item.dart';

/// The episodes either side of [current] among the finished downloads,
/// for Previous and Next with no server to ask: the nearest of the show's
/// files the server put before and after it that is on the device, so one
/// that wasn't downloaded is skipped over rather than landed on.
(MediaItem?, MediaItem?) downloadNeighbours(
  OfflineItem current,
  Iterable<OfflineItem> downloads,
) {
  final offline = current.offline;
  if (offline == null) return _byNumber(current.item, downloads);
  final here = {
    for (final download in downloads)
      if (download.done && download.id != current.id)
        download.id: download.item,
  };
  final order = offline.episodes;
  final at = order.indexOf(current.id);
  if (at < 0) return (null, null);
  MediaItem? nearest(int from, int step) {
    for (var i = from; i >= 0 && i < order.length; i += step) {
      if (here[order[i]] case final item?) return item;
    }
    return null;
  }

  return (nearest(at - 1, -1), nearest(at + 1, 1));
}

/// For a download made before the server sent its show's order: the one
/// numbered either side in the same season; across a season, the next
/// season's first episode after the last one downloaded of this season,
/// and back from a first episode, the last one downloaded of the season
/// before.
(MediaItem?, MediaItem?) _byNumber(
  MediaItem current,
  Iterable<OfflineItem> downloads,
) {
  final show = current.title;
  final season = current.seasonNumber;
  final episode = current.episodeNumber;
  if (show == null ||
      show.kind != TitleKind.show ||
      season == null ||
      episode == null) {
    return (null, null);
  }
  final here = {
    for (final download in downloads)
      if (download.done &&
          download.item.id != current.id &&
          download.item.title?.id == show.id &&
          download.item.seasonNumber != null &&
          download.item.episodeNumber != null)
        (download.item.seasonNumber!, download.item.episodeNumber!):
            download.item,
  };
  int? last(int inSeason) {
    int? highest;
    for (final (s, e) in here.keys) {
      if (s == inSeason && (highest == null || e > highest)) highest = e;
    }
    return highest;
  }

  final previous =
      here[(season, episode - 1)] ??
      (episode == 1 && season > 1
          ? switch (last(season - 1)) {
              final e? => here[(season - 1, e)],
              null => null,
            }
          : null);
  final laterHere = (last(season) ?? 0) > episode;
  final next =
      here[(season, episode + 1)] ?? (laterHere ? null : here[(season + 1, 1)]);
  return (previous, next);
}
