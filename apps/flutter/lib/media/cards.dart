import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../api/matinee_api.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';
import '../router.dart';
import 'actions.dart';
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
/// [poster] stands in for the title's own, as a season's. A long press
/// opens its menu, with "Not interested" when a recommendation row offered
/// it as [recommended].
class TitleCard extends StatelessWidget {
  const TitleCard({
    super.key,
    required this.title,
    this.detail,
    this.detailIcon,
    this.detailLabel,
    this.poster,
    this.route,
    this.recommended,
  });

  /// [detail]'s parts as [TitleCard] takes them.
  TitleCard.withDetail({
    Key? key,
    required TitleSummary title,
    CardDetail? detail,
  }) : this(
         key: key,
         title: title,
         detail: detail?.text,
         detailIcon: detail?.icon,
         detailLabel: detail?.label,
       );

  final TitleSummary title;
  final String? detail;
  final String? detailIcon;
  final String? detailLabel;
  final Artwork? poster;
  final String? route;
  final CatalogRef? recommended;

  @override
  Widget build(BuildContext context) {
    final art = poster ?? title.images.poster;
    return PosterCard(
      name: title.name,
      detail: detail,
      detailIcon: detailIcon,
      detailLabel: detailLabel,
      art: art == null ? null : Picture([ArtSource(art)]),
      artCovers: art?.placeholder != null,
      watchedLabel: title.watched
          ? AppLocalizations.of(context).mediaWatched
          : null,
      onPressed: () => context.push(route ?? Routes.title(title.id)),
      onLongPress: () =>
          showActions(context, TitleActions(title, recommended: recommended)),
      longPressLabel: AppLocalizations.of(context).titleMoreActions,
    );
  }
}

/// A movie or show from a library's shelf, saying what it got last: a
/// Whether the cards under it name their kind beside the year: on for a
/// row or grid that can hold both movies and shows, so every card there
/// says "2012 · Movie", off where it holds one kind, so none does. The
/// cards of one row agree either way. Off when nothing above says.
class NamedKinds extends InheritedWidget {
  const NamedKinds({super.key, this.named = true, required super.child});

  final bool named;

  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<NamedKinds>()?.named ?? false;

  @override
  bool updateShouldNotify(NamedKinds oldWidget) => named != oldWidget.named;
}

/// A title's year for a card's second line, "2012", or "2012 · Movie"
/// under a [NamedKinds] row.
String? yearLine(BuildContext context, int? year, String kind) {
  if (!NamedKinds.of(context)) return year?.toString();
  final l = AppLocalizations.of(context);
  final word = kind == TitleKind.show
      ? l.webRequestsKindShow
      : l.webRequestsKindMovie;
  return year == null ? word : l.requestsYearKind('$year', word);
}

/// movie its year, a show its count of episodes, or what's new, opening the one
/// new episode or the season that got them.
class ShelfCard extends StatelessWidget {
  const ShelfCard({super.key, required this.entry});

  final ShelfEntry entry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = entry.title;
    final added = entry.added;
    if (title.kind == TitleKind.movie) {
      return TitleCard(
        title: title,
        detail: yearLine(context, title.year, title.kind),
      );
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

/// An episode or movie to start or resume, for Continue watching and Next up:
/// the episode's picture, the show's name, then the episode and the time left.
/// It opens the episode's page, or a movie's; Play, where a mouse or focus
/// shows it, starts the file. On a show's own pages [showName] is false, and
/// the episode's name leads instead. A long press opens its menu.
class EpisodeCard extends StatelessWidget {
  const EpisodeCard({super.key, required this.item, this.showName = true});

  final MediaItem item;
  final bool showName;

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
    final number = episodeNumberLabel(item, l);
    final ownName = number == null || names.untitled
        ? names.title
        : l.titleEpisodesCodedName(number, names.title);
    final ownDetail = [
      ?formatDay(item.episode?.airDate, l),
      ?(left ?? formatRuntime(runtimeMinutes(item), l)),
    ].join(' · ');
    return WideCard(
      name: showName ? names.showName : ownName,
      detail: showName ? detail : (ownDetail.isEmpty ? null : ownDetail),
      toneKey: names.showName,
      untitled: !showName && names.untitled,
      art: Picture(landscapeSources(item)),
      progress: progressRatio(item),
      watchedLabel: isWatched(item) ? l.mediaWatched : null,
      onPressed: () => context.push(itemRoute(item)),
      onPlay: () => context.push(Routes.play(item.id)),
      playLabel: left == null
          ? l.mediaPlayNamed(name)
          : l.mediaResumeNamed(name),
      onLongPress: () => showActions(context, ItemActions(item)),
      longPressLabel: l.titleMoreActions,
    );
  }
}
