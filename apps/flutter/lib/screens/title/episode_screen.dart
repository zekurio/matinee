import 'dart:math' as math;

import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import 'pending_marks.dart';
import 'title_data.dart';
import 'title_parts.dart';

/// An episode's page, or any file's that isn't a movie: on a phone its still is
/// the backdrop with the heading on it; wider, the show's art is, with the
/// still on it, which plays. Then what happens in it, Play and the buttons, and
/// the rest of its season.
class EpisodeScreen extends ConsumerStatefulWidget {
  const EpisodeScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<EpisodeScreen> createState() => _EpisodeScreenState();
}

class _EpisodeScreenState extends ConsumerState<EpisodeScreen>
    with PendingMarks {
  void _refresh() {
    ref
      ..invalidate(itemProvider(widget.id))
      ..invalidate(seasonItemsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final async = ref.watch(itemProvider(widget.id));
    final item = async.value;
    return ReturnWatcher(
      path: Routes.episode(widget.id),
      onReturn: _refresh,
      child: item == null
          ? PageState(
              error: async.error,
              errorTitle: l.titleEpisodeLoadError,
              onRetry: () => ref.invalidate(itemProvider(widget.id)),
            )
          : _page(context, item),
    );
  }

  Widget _page(BuildContext context, MediaItem item) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final title = item.title;
    final season = item.seasonNumber;
    final wide = isWide(context);
    final showArt = title?.images.backdrop;
    final show = [if (showArt != null) ArtSource(showArt)];
    final still = landscapeSources(item);
    final watched = marked('watched', item, isWatched(item));
    final favorite = marked('favorite', item, isFavoriteItem(item));
    final more = ItemActions(item, here: true);
    final up = title == null
        ? null
        : season != null
        ? seasonRoute(title.id, season)
        : Routes.title(title.id);
    void play() => context.push(Routes.play(item.id));
    return TitleScaffold(
      gap: 20,
      parent: title == null
          ? null
          : season != null
          ? seasonName(season, l)
          : names.showName,
      onParent: up == null ? null : () => goUp(context, up),
      sections: [
        if (wide) ...[
          Backdrop(
            sources: [...show, ...still],
            toneKey: names.showName,
            // As high as the web starts it, so the season's other
            // episodes make the first screen too.
            top: math.max(112, MediaQuery.sizeOf(context).height * .2),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      borderRadius: KitRadius.control,
                      boxShadow: [
                        BoxShadow(color: Color(0x66000000), blurRadius: 24),
                      ],
                    ),
                    child: Still(
                      item: item,
                      onPressed: play,
                      radius: KitRadius.control,
                    ),
                  ),
                ),
              ),
            ),
          ),
          _EpisodeHeading(item: item),
        ] else
          Backdrop(
            sources: [...still, ...show],
            toneKey: names.showName,
            top: phoneHeadingTop(context),
            child: _EpisodeHeading(item: item),
          ),
        if (item.episode?.overview case final overview?)
          Overview(text: overview, lines: 6),
        ActionRow(
          play: item,
          watched: watched,
          onWatched: () => toggleWatched(
            context,
            watched: watched,
            name: names.title,
            send: (api, to, at) =>
                MediaMarks.item(api, item, watched: to, at: at),
            pending: pendingFor('watched', item),
          ),
          favorite: favorite,
          onFavorite: () => toggleFavorite(
            context,
            favorite: favorite,
            send: (api, to) => MediaMarks.favoriteItem(api, item, favorite: to),
            pending: pendingFor('favorite', item),
          ),
          onMore: hasActionsFor(ref, more)
              ? () => showActions(context, more)
              : null,
        ),
        if (title != null && up != null)
          _MoreFromSeason(item: item, titleId: title.id, up: up),
      ],
    );
  }
}

/// An episode's show, season and number, name, facts, and file, as the
/// web's episode header has them. The show and the season are links up.
class _EpisodeHeading extends StatelessWidget {
  const _EpisodeHeading({required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final names = itemNames(item, l);
    final title = item.title;
    final season = item.seasonNumber;
    final number = item.episodeNumber;
    final where = [
      if (season != null)
        season == 0 ? l.titleEpisodeSpecials : l.titleEpisodeSeason(season),
      if (number != null) l.titleEpisodeNumber(number),
    ].join(' · ');
    Widget link(String text, TextStyle style, String? route) {
      final label = Text(
        text,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
      if (route == null) return label;
      return PressIndication(
        onPressed: () => goUp(context, route),
        label: text,
        builder: (context, state) => ExcludeSemantics(child: label),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          link(
            names.showName,
            KitText.xl.style(color: colors.foreground, weight: FontWeight.w600),
            title == null ? null : Routes.title(title.id),
          ),
          if (where.isNotEmpty)
            link(
              where,
              KitText.lg.style(
                color: colors.mutedForeground,
                weight: FontWeight.w500,
              ),
              title == null ? null : seasonRoute(title.id, season),
            ),
          const SizedBox(height: 6),
          Semantics(
            header: true,
            child: Text(
              names.title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: headlineStyle(colors),
            ),
          ),
          const SizedBox(height: 10),
          HeadingFacts(
            facts: episodeFacts(item, l),
            contentRating: title?.contentRating,
          ),
          if (item.probe != null) ...[
            const SizedBox(height: 12),
            MediaInfo(item: item),
          ],
        ],
      ),
    );
  }
}

/// The season's other episodes, its heading a link to the season. It opens
/// at this one's place: the episode before it at the leading edge and the
/// one after beside it, or at the start when it isn't in the season.
class _MoreFromSeason extends ConsumerWidget {
  const _MoreFromSeason({
    required this.item,
    required this.titleId,
    required this.up,
  });

  final MediaItem item;
  final String titleId;
  final String up;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final season = item.seasonNumber;
    final items = ref
        .watch(seasonItemsProvider((titleId: titleId, season: season)))
        .value;
    final all = items ?? const <MediaItem>[];
    final others = [
      for (final other in all)
        if (other.id != item.id) other,
    ];
    if (others.isEmpty) return const SizedBox.shrink();
    // With this one left out, the one before it is a place earlier.
    final here = all.indexWhere((other) => other.id == item.id);
    return EpisodesRail(
      title: l.titleEpisodeMoreFrom(seasonName(season, l)),
      items: others,
      start: here > 0 ? here - 1 : 0,
      onSeeAll: () => goUp(context, up),
      seeAllLabel: l.mediaHeroEpisodes,
    );
  }
}
