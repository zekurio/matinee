import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/requests_hub.dart' show FollowTitles;
import '../requests/show_gaps.dart';
import 'pending_marks.dart';
import 'title_data.dart';
import 'title_parts.dart';

/// One season of a show: its poster and counts over the show's backdrop, Play
/// for the episode up next in it, its episodes as a list, and the show's other
/// seasons. [season] is null for the files without a season number.
class SeasonScreen extends ConsumerStatefulWidget {
  const SeasonScreen({super.key, required this.titleId, required this.season});

  final String titleId;
  final int? season;

  @override
  ConsumerState<SeasonScreen> createState() => _SeasonScreenState();
}

class _SeasonScreenState extends ConsumerState<SeasonScreen> with PendingMarks {
  SeasonKey get _key => (titleId: widget.titleId, season: widget.season);

  void _refresh() {
    ref
      ..invalidate(titleProvider(widget.titleId))
      ..invalidate(seasonItemsProvider(_key));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final async = ref.watch(titleProvider(widget.titleId));
    final title = async.value;
    final Widget page;
    if (title == null) {
      page = PageState(
        error: async.error,
        errorTitle: l.titleSeasonShowError,
        onRetry: () => ref.invalidate(titleProvider(widget.titleId)),
      );
    } else if (_find(title) case final season?) {
      page = _page(context, title, season);
    } else {
      page = TitleScaffold(
        sections: [
          const SizedBox(height: 120),
          EmptyState(
            icon: Lucide.searchX,
            title: l.titleSeasonMissing(title.name),
          ),
        ],
      );
    }
    return ReturnWatcher(
      path: seasonRoute(widget.titleId, widget.season),
      onReturn: _refresh,
      child: page,
    );
  }

  /// The season in the title, or its specials, which still open from a
  /// link when the library hides them.
  Season? _find(Title title) {
    for (final season in title.seasons) {
      if (season.number == widget.season) return season;
    }
    final specials = title.specials;
    return specials != null && specials.number == widget.season
        ? specials
        : null;
  }

  Widget _page(BuildContext context, Title title, Season season) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final itemsAsync = ref.watch(seasonItemsProvider(_key));
    final items = itemsAsync.value;
    final name = seasonName(season.number, l);
    final number = season.number;
    final summary = title.summary;
    final next = seasonNext(items, title.next);
    final watched = marked('watched', items, seasonWatched(items));
    final favorite = marked('favorite', title, season.favorite);
    final more = SeasonActions(summary, season, here: true);
    final backdrop = title.images.backdrop;
    final up = Routes.title(title.id);
    final gaps = watchShowGaps(ref, title);
    final partial = gaps?.partialOf(number);
    final page = TitleScaffold(
      gap: 20,
      parent: title.name,
      onParent: () => goUp(context, up),
      sections: [
        Backdrop(
          sources: [if (backdrop != null) ArtSource(backdrop)],
          toneKey: title.name,
          top: headingTop(context),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              spacing: 16,
              children: [
                HeadingPoster(
                  name: l.titleSeasonOf(title.name, name),
                  art: season.poster ?? title.images.poster,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        PressIndication(
                          onPressed: () => goUp(context, up),
                          label: title.name,
                          builder: (context, state) => ExcludeSemantics(
                            child: Text(
                              title.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: KitText.lg.style(
                                color: colors.mutedForeground,
                                weight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                        Semantics(
                          header: true,
                          child: Text(name, style: headlineStyle(colors)),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          [
                            l.mediaEpisodeCount(season.itemCount),
                            l.titleSeasonWatchedCount(season.watchedCount),
                          ].join(' · '),
                          style: KitText.sm.style(
                            color: colors.foreground.withValues(alpha: .8),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (season.overview case final overview?) Overview(text: overview),
        ActionRow(
          play: next,
          watched: watched,
          onWatched: () => toggleWatched(
            context,
            watched: watched,
            name: l.titleSeasonOf(title.name, name),
            send: (api, to, at) =>
                MediaMarks.season(api, title.id, number, watched: to, at: at),
            pending: items == null ? null : pendingFor('watched', items),
            askUnwatched: askSeasonUnwatched(
              title.name,
              name,
              count: season.itemCount,
            ),
          ),
          favorite: favorite,
          // The files without a season number aren't a season to mark.
          onFavorite: number == null
              ? null
              : () => toggleFavorite(
                  context,
                  favorite: favorite,
                  send: (api, to) => MediaMarks.favoriteSeason(
                    api,
                    title.id,
                    number,
                    favorite: to,
                  ),
                  pending: pendingFor('favorite', title),
                ),
          onMore: hasActionsFor(ref, more)
              ? () => showActions(context, more)
              : null,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SectionTitle(title: l.titleEpisodes),
        ),
        if (items != null)
          for (final item in items) EpisodeRow(item: item)
        else if (itemsAsync.error case final error?)
          FailureState(
            title: l.titleEpisodesFailed,
            error: error,
            onRetry: () => ref.invalidate(seasonItemsProvider(_key)),
          )
        else
          Padding(
            padding: const EdgeInsets.all(32),
            child: LoadingState(label: l.loadingInProgress),
          ),
        // The ask for the episodes the server lacks, after the last.
        if (gaps != null && partial != null && items != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: SizedBox(
                width: railCardSize(context, RailArt.wide).width,
                child: RestOfSeasonCard(
                  showName: title.name,
                  gaps: gaps,
                  season: partial,
                ),
              ),
            ),
          ),
        if (SeasonsRail.any(title, onSeason: true, current: number, gaps: gaps))
          SeasonsRail(
            title: title,
            onSeason: true,
            current: number,
            gaps: gaps,
          ),
      ],
    );
    return gaps == null
        ? page
        : FollowTitles(titles: gaps.followed, child: page);
  }
}
