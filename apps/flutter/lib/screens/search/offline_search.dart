import '../../api/matinee_api.dart';
import '../../core/text_search.dart';
import '../../downloads/downloads.dart';

/// A downloaded title Search finds offline: the movie or show's name, the
/// file to play or the show's page to open, and how many episodes are here.
final class DownloadHit {
  const DownloadHit({
    required this.name,
    required this.kind,
    required this.id,
    required this.count,
    this.year,
  });

  final String name;

  /// A `TitleKind`.
  final String kind;

  /// The movie's play id, or the show's title id.
  final String id;
  final int count;
  final int? year;

  bool get isShow => kind == TitleKind.show;
}

/// What Search finds offline among the finished [downloads]: each movie
/// once, and each show with every episode on the device, whose name holds
/// [query] without its case or accents. A movie's [DownloadHit.id] is the
/// file to play; a show's is its page on the Downloads tab.
List<DownloadHit> searchDownloads(
  Iterable<OfflineItem> downloads,
  String query,
) {
  final needle = foldSearchText(query.trim());
  if (needle.isEmpty) return const [];
  final movies = <String, OfflineItem>{};
  final shows = <String, List<OfflineItem>>{};
  for (final entry in downloads) {
    if (!entry.done) continue;
    final title = entry.item.title;
    if (title == null) continue;
    if (title.kind == TitleKind.show) {
      (shows[title.id] ??= []).add(entry);
    } else {
      final kept = movies[title.id];
      if (kept == null || entry.addedAt.isAfter(kept.addedAt)) {
        movies[title.id] = entry;
      }
    }
  }
  final hits = [
    for (final entry in movies.values)
      if (foldSearchText(entry.item.title!.name).contains(needle))
        DownloadHit(
          name: entry.item.title!.name,
          kind: TitleKind.movie,
          id: entry.id,
          count: 1,
          year: entry.item.title!.year,
        ),
    for (final episodes in shows.values)
      if (foldSearchText(episodes.first.item.title!.name).contains(needle))
        DownloadHit(
          name: episodes.first.item.title!.name,
          kind: TitleKind.show,
          id: episodes.first.item.title!.id,
          count: episodes.length,
          year: episodes.first.item.title!.year,
        ),
  ]..sort((a, b) => foldSearchText(a.name).compareTo(foldSearchText(b.name)));
  return hits;
}
