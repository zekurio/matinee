import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'catalog_cards.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// What the server lacks of a show in the library, as its provider lists it:
/// the seasons that aren't here, for the seasons rail, and the ones only partly
/// here, with the ask for the rest at the end of their episodes.

/// A show's gaps, with each season's state as the server streams it.
@immutable
final class ShowGaps {
  const ShowGaps({
    required this.ref,
    required this.libraryId,
    required this.missing,
    required this.partial,
    required this.first,
  });

  final CatalogRef ref;
  final String libraryId;
  final List<CatalogSeason> missing;
  final List<CatalogSeason> partial;

  /// Nothing of the show is asked for yet, so Undo may take an ask back.
  final bool first;

  CatalogSeason? partialOf(int? number) =>
      partial.where((season) => season.number == number).firstOrNull;

  /// What the page follows, for the seasons' states.
  FollowedTitles get followed =>
      FollowedTitles([CatalogInput(ref: ref, libraryId: libraryId)]);
}

/// The gaps of [title], as they stand now. Null for a film, until they
/// load, and when the provider can't say, so the page shows only what's
/// here. Wrap the page in [FollowTitles] with [ShowGaps.followed].
ShowGaps? watchShowGaps(WidgetRef ref, Title title) {
  if (!title.isShow) return null;
  final data = ref.watch(showGapsProvider(title.id)).value;
  if (data == null) return null;
  final missing = bySeason(
    ref.watch(
      requestsProvider.select((state) => state.seasons(data.ref, data.seasons)),
    ),
  );
  final partial = ref.watch(
    requestsProvider.select(
      (state) => state.seasons(data.ref, data.partialSeasons),
    ),
  );
  return ShowGaps(
    ref: data.ref,
    libraryId: title.libraryId,
    missing: missing,
    partial: partial,
    first: [
      ...missing,
      ...partial,
    ].every((season) => season.availability.requestId == null),
  );
}

/// "3 of 10 episodes here", for a season only partly on the server.
String partialLine(CatalogSeason season, AppLocalizations l) =>
    l.requestsSeasonPartial(
      season.availability.episodesHere,
      season.availability.episodesAired,
    );

/// The end of a season's episodes when only some are here: how many more
/// there are, in a dashed frame the size of an episode's still, holding
/// what a poster would: the state once there is one, and the one thing to
/// do about it, "Request the rest" until it's requested. For an admin with
/// the season's request to answer, Add and Decline.
class RestOfSeasonCard extends ConsumerWidget {
  const RestOfSeasonCard({
    super.key,
    required this.showName,
    required this.gaps,
    required this.season,
  });

  final String showName;
  final ShowGaps gaps;
  final CatalogSeason season;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = season.availability.asTitle();
    final waiting = waitingRequest(ref, availability);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final answering = waiting != null && !held.contains(waiting.id)
        ? waiting
        : null;
    final more =
        season.availability.episodesAired - season.availability.episodesHere;
    final name = l.requestsRestName(seasonOf(showName, season.number, l));
    final busy = ref.watch(
      requestsProvider.select((state) => state.busy.contains(refKey(gaps.ref))),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        AspectRatio(
          aspectRatio: CardMetrics.wide,
          child: CustomPaint(
            painter: DashedOutline(colors.foreground.withValues(alpha: .2)),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: CardMetrics.radius,
                color: colors.foreground.withValues(alpha: .03),
              ),
              child: Center(
                child: SingleChildScrollView(
                  physics: const NeverScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    spacing: 8,
                    children: [
                      PosterBadge(
                        availability: availability,
                        tip: waiting == null ? null : requestedText(waiting, l),
                      ),
                      if (answering != null)
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          spacing: 8,
                          children: [
                            if (ref.watch(
                              canProvider(Permission.adminRequestApprove),
                            ))
                              AddButton(item: answering),
                            if (ref.watch(
                              canProvider(Permission.adminRequestDecline),
                            ))
                              DeclineButton(item: answering),
                          ],
                        )
                      else
                        RequestButton(
                          availability: availability,
                          name: name,
                          busy: busy,
                          label: l.requestsRestAsk,
                          plain: true,
                          onRequest: () => ref
                              .read(requestsProvider.notifier)
                              .ask(
                                l,
                                gaps.ref,
                                name,
                                libraryId: gaps.libraryId,
                                scope: AskScope(seasons: [season.number]),
                                undo: gaps.first,
                              ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        CardText(primary: l.requestsRestMore(more)),
      ],
    );
  }
}
