import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../router.dart';

/// A favorite of any kind as a poster, so a row that mixes them lines up,
/// as the Kotlin app's `FavoriteCard`: a movie or show by its year, a
/// season on its own poster, an episode on its show's.
class FavoriteCard extends StatelessWidget {
  const FavoriteCard({super.key, required this.favorite});

  final Favorite favorite;

  @override
  Widget build(BuildContext context) => switch (favorite) {
    FavoriteMovie(:final title) || FavoriteShow(:final title) => TitleCard(
      title: title,
      detail: title.year?.toString(),
    ),
    FavoriteShowSeason(:final title, :final season) => SeasonCard(
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

/// A season as its poster, or its show's: the show's name over the
/// season's, opening the season's page. Watched once every file is.
class SeasonCard extends StatelessWidget {
  const SeasonCard({super.key, required this.title, required this.season});

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
      toneKey: title.id,
      art: art == null ? null : Picture([ArtSource(art)]),
      watchedLabel: watched ? l.mediaWatched : null,
      onPressed: () => context.push(
        number == null
            ? Routes.title(title.id)
            : Routes.season(title.id, number),
      ),
    );
  }
}

/// An episode as its show's poster, for a row of posters: the show's name
/// over the episode's, opening the episode's page.
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
      toneKey: item.title?.id ?? item.id,
      art: poster == null ? null : Picture([ArtSource(poster)]),
      watchedLabel: isWatched(item) ? l.mediaWatched : null,
      onPressed: () => context.push(itemRoute(item)),
    );
  }
}
