import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';

/// A favorite of any kind as a poster, so a row that mixes them lines up: a
/// movie or show by its year, a season on its own poster, an episode on its
/// show's.
class FavoriteCard extends StatelessWidget {
  const FavoriteCard({super.key, required this.favorite});

  final Favorite favorite;

  @override
  Widget build(BuildContext context) => switch (favorite) {
    FavoriteMovie(:final title) || FavoriteShow(:final title) => TitleCard(
      title: title,
      detail: yearLine(context, title.year, title.kind),
    ),
    FavoriteShowSeason(:final title, :final season) => SeasonPosterCard(
      title: title,
      season: season,
    ),
    FavoriteEpisode(:final item) => EpisodePosterCard(item: item),
  };
}

/// Tells favorites apart in a row that mixes their kinds.
String favoriteKey(Favorite favorite) => switch (favorite) {
  FavoriteMovie(:final title) ||
  FavoriteShow(:final title) => 'title/${title.id}',
  FavoriteShowSeason(:final title, :final season) =>
    'season/${title.id}/${season.number}',
  FavoriteEpisode(:final item) => 'episode/${item.id}',
};

/// A season as its poster, or its show's: the show's name over the season's,
/// opening the season's page. Watched once every file is. A long press opens
/// its menu.
class SeasonPosterCard extends StatelessWidget {
  const SeasonPosterCard({
    super.key,
    required this.title,
    required this.season,
  });

  final TitleSummary title;
  final Season season;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final art = season.poster ?? title.images.poster;
    final number = season.number;
    final watched =
        season.itemCount > 0 && season.watchedCount >= season.itemCount;
    return PosterCard(
      name: title.name,
      detail: seasonName(number, l),
      toneKey: title.name,
      art: art == null ? null : Picture([ArtSource(art)]),
      artCovers: art?.placeholder != null,
      watchedLabel: watched ? l.mediaWatched : null,
      onPressed: () => context.push(seasonRoute(title.id, number)),
      onLongPress: () => showActions(context, SeasonActions(title, season)),
      longPressLabel: l.titleMoreActions,
    );
  }
}

/// An episode as its show's poster, for a row of posters: the show's name
/// over the episode's, opening the episode's page. A long press opens its
/// menu.
class EpisodePosterCard extends StatelessWidget {
  const EpisodePosterCard({super.key, required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    final poster = item.title?.images.poster;
    return PosterCard(
      name: names.showName,
      detail: code == null ? names.title : l.mediaCodeTitle(code, names.title),
      toneKey: names.showName,
      art: poster == null ? null : Picture([ArtSource(poster)]),
      artCovers: poster?.placeholder != null,
      watchedLabel: isWatched(item) ? l.mediaWatched : null,
      onPressed: () => context.push(itemRoute(item)),
      onLongPress: () => showActions(context, ItemActions(item)),
      longPressLabel: l.titleMoreActions,
    );
  }
}
