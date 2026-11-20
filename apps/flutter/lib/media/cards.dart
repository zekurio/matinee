import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../router.dart';
import 'artwork.dart';
import 'format.dart';

/// The page a file opens: a movie's title page, or an episode's own.
String itemRoute(MediaItem item) {
  final title = item.title;
  return title != null && title.kind == TitleKind.movie
      ? Routes.title(title.id)
      : Routes.episode(item.id);
}

/// A movie or show as its poster, opening its page, or [route] when set.
/// [poster] stands in for the title's own, as a season's.
class TitleCard extends StatelessWidget {
  const TitleCard({
    super.key,
    required this.title,
    this.detail,
    this.poster,
    this.route,
  });

  final TitleSummary title;
  final String? detail;
  final Artwork? poster;
  final String? route;

  @override
  Widget build(BuildContext context) {
    final art = poster ?? title.images.poster;
    return PosterCard(
      name: title.name,
      detail: detail,
      art: art == null ? null : Picture([ArtSource(art)]),
      watchedLabel: title.watched
          ? AppLocalizations.of(context).mediaWatched
          : null,
      onPressed: () => context.push(route ?? Routes.title(title.id)),
    );
  }
}

/// A movie or show from a library's shelf, saying what it got last: a
/// movie its year, a show its count of episodes, or what's new, opening the
/// one new episode or the season that got them. The Kotlin app's
/// `ShelfCard`.
class ShelfCard extends StatelessWidget {
  const ShelfCard({super.key, required this.entry});

  final ShelfEntry entry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = entry.title;
    final added = entry.added;
    if (title.kind == TitleKind.movie) {
      return TitleCard(title: title, detail: title.year?.toString());
    }
    if (added == null) {
      return TitleCard(title: title, detail: l.mediaEpisodeCount(entry.count));
    }
    final poster = added.season?.poster;
    if (added.count == 1) {
      final code = episodeCode(added.item, l);
      final name = itemNames(added.item, l).title;
      return TitleCard(
        title: title,
        poster: poster,
        detail: code == null ? name : l.mediaCodeTitle(code, name),
        route: Routes.episode(added.item.id),
      );
    }
    final fresh = l.mediaNewEpisodes(added.count);
    final number = added.season?.number;
    return TitleCard(
      title: title,
      poster: poster,
      detail: added.season == null
          ? fresh
          : '${seasonName(number, l)} · $fresh',
      route: number == null ? null : Routes.season(title.id, number),
    );
  }
}

/// An episode or movie to start or resume, for Continue watching and Next
/// up: the episode's picture, the show's name, then the episode and the
/// time left. It opens the episode's page, or a movie's; Play, where a
/// mouse or focus shows it, starts the file. The Kotlin app's
/// `EpisodeCard`.
class EpisodeCard extends StatelessWidget {
  const EpisodeCard({super.key, required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    final left = timeLeft(item, l);
    final name = code == null
        ? names.title
        : l.mediaShowCodeTitle(names.showName, code, names.title);
    final detail = code != null
        ? [l.mediaCodeTitle(code, names.title), ?left].join(' · ')
        : left ?? names.year;
    return WideCard(
      name: names.showName,
      detail: detail,
      art: Picture(landscapeSources(item)),
      progress: progressRatio(item),
      watchedLabel: isWatched(item) ? l.mediaWatched : null,
      onPressed: () => context.push(itemRoute(item)),
      onPlay: () => context.push(Routes.play(item.id)),
      playLabel: left == null
          ? l.mediaPlayNamed(name)
          : l.mediaResumeNamed(name),
    );
  }
}
