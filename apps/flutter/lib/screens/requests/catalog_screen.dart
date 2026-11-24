import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/link_opener.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/layout.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../title/title_data.dart' show pickTrailer;
import '../title/title_parts.dart';
import 'catalog_cards.dart';
import 'related.dart';
import 'request_sheet.dart';
import 'request_words.dart';
import 'requests_data.dart';
import 'requests_hub.dart';

/// A title the server doesn't have, on a page built like a library title's so
/// it reads as the same page: the backdrop, the poster beside the name and
/// facts, carrying the state, the overview, the crew, then where a library
/// title has Play, the request and Trailer, a show's seasons, each with its own
/// state, the cast, and the related titles. When the title arrives while the
/// page is open, the library title's page takes its place.
class CatalogScreen extends ConsumerWidget {
  const CatalogScreen({super.key, required this.catalogKey});

  final CatalogKey catalogKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final async = ref.watch(catalogDetailsProvider(catalogKey));
    final detail = async.value;
    final key = catalogKey;
    return ReturnWatcher(
      path: Routes.catalog(
        key.kind,
        key.provider,
        key.providerId,
        library: key.libraryId,
      ),
      onReturn: () => ref.invalidate(catalogDetailsProvider(catalogKey)),
      child: FadeSwitcher(
        value: detail != null,
        child: detail == null
            ? PageState(
                error: async.error,
                errorTitle: l.titleLoadError,
                onRetry: () =>
                    ref.invalidate(catalogDetailsProvider(catalogKey)),
              )
            : _CatalogPage(detail: detail, library: key.libraryId),
      ),
    );
  }
}

class _CatalogPage extends ConsumerStatefulWidget {
  const _CatalogPage({required this.detail, required this.library});

  final CatalogTitleDetail detail;
  final String? library;

  @override
  ConsumerState<_CatalogPage> createState() => _CatalogPageState();
}

class _CatalogPageState extends ConsumerState<_CatalogPage> {
  /// The library title's page took this one's place.
  bool _left = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final detail = widget.detail;
    final title = detail.ref;
    final destination = detail.destinations
        .where((each) => each.selected)
        .firstOrNull;
    final availability = ref.watch(
      requestsProvider.select(
        (state) => state.availability(title, detail.availability),
      ),
    );
    final seasons = bySeason(
      ref.watch(
        requestsProvider.select(
          (state) => state.seasons(title, detail.seasons),
        ),
      ),
    );
    // Once the title is in a library the viewer can see, this page becomes
    // that title's page, which Back leaves for wherever this one came
    // from. Only while it's on top: the router replaces the page on top,
    // so under another title's page or the request sheet it waits until
    // the person comes back to it. Watching whether it's on top builds
    // it again when that changes.
    final arrived = availability.state == AvailabilityState.here
        ? availability.libraryTitleId
        : null;
    final onTop = ModalRoute.isCurrentOf(context) ?? true;
    if (arrived != null && !_left && onTop) {
      _left = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (ModalRoute.isCurrentOf(context) ?? true) {
          context.pushReplacement(Routes.title(arrived));
        } else {
          // Covered in the meantime: next time it's on top.
          setState(() => _left = false);
        }
      });
    }
    void openSheet(int? only) => unawaited(
      showRequestSheet(
        context,
        title: title,
        name: detail.name,
        seasons: seasons,
        first: availability.asks,
        libraryId: destination?.id,
        showPoster: detail.poster,
        only: only,
      ),
    );
    final size = railCardSize(context, RailArt.poster);
    final backdrop = detail.backdrop;
    return FollowTitles(
      titles: FollowedTitles([
        CatalogInput(ref: title, libraryId: destination?.id),
      ]),
      child: TitleScaffold(
        sections: [
          Backdrop(
            sources: [if (backdrop != null) ArtSource(backdrop)],
            toneKey: refKey(title),
            top: headingTop(context),
            child: _Heading(
              detail: detail,
              availability: availability,
              seasons: seasons,
            ),
          ),
          if (detail.stale)
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: CardMetrics.gutter,
              ),
              child: Text(
                l.webCatalogPageStale,
                style: KitText.xs.style(
                  color: MatineeTheme.of(context).mutedForeground,
                ),
              ),
            ),
          if (detail.overview case final overview?) Overview(text: overview),
          if (CrewLines.any(detail.credits, detail.studios))
            CrewLines(credits: detail.credits, studios: detail.studios),
          ?_actions(context, detail, availability, seasons, destination, () {
            openSheet(null);
          }),
          if (title.isShow && seasons.isNotEmpty)
            Rail(
              title: l.titleSeasons,
              itemWidth: size.width,
              itemHeight: size.height,
              itemCount: seasons.length,
              itemBuilder: (context, index) => CatalogSeasonCard(
                show: title,
                showName: detail.name,
                showPoster: detail.poster,
                season: seasons[index],
                onRequest: () => openSheet(seasons[index].number),
              ),
            ),
          if (CastRail.any(detail.credits)) CastRail(credits: detail.credits),
          CatalogRelatedRows(
            relatedTo: keyOf(title, libraryId: widget.library),
          ),
        ],
      ),
    );
  }

  /// The page's row, as a library title's has Play first: the one thing
  /// the viewer may do, then Trailer. A show's request and "Request more"
  /// for a show requested already open the request sheet; a film's
  /// requests at once. For an admin with the title's request to answer,
  /// Add and Decline take the action's place until it's answered. Nothing
  /// when there's neither an action nor a trailer.
  Widget? _actions(
    BuildContext context,
    CatalogTitleDetail detail,
    Availability availability,
    List<CatalogSeason> seasons,
    CatalogDestination? destination,
    VoidCallback onSheet,
  ) {
    final l = AppLocalizations.of(context);
    final title = detail.ref;
    final wide = isWide(context);
    final more =
        title.isShow &&
        posterAction(availability) == null &&
        seasons.any((season) => season.availability.asTitle().asks);
    final waiting = waitingRequest(ref, availability);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final answering = waiting != null && !held.contains(waiting.id)
        ? waiting
        : null;
    final action = more || hasPosterButton(availability);
    final trailer = pickTrailer(detail.trailers, l.localeName);
    if (answering == null && !action && trailer == null) return null;
    final busy = ref.watch(
      requestsProvider.select((state) => state.busy.contains(refKey(title))),
    );
    Widget sized(Widget child, double width) =>
        wide ? SizedBox(width: width, child: child) : Expanded(child: child);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 10,
        children: [
          if (answering != null) ...[
            if (ref.watch(canProvider(Permission.adminRequestApprove)))
              sized(AddButton(item: answering, page: true), 200),
            if (ref.watch(canProvider(Permission.adminRequestDecline)))
              DeclineButton(item: answering, page: true),
          ] else if (action)
            sized(
              RequestButton(
                availability: availability,
                name: detail.name,
                busy: busy,
                page: true,
                action: more ? PosterAction.request : null,
                label: more ? l.webAskMore : null,
                onRequest: () {
                  if (title.isShow || more) {
                    onSheet();
                  } else {
                    unawaited(
                      ref
                          .read(requestsProvider.notifier)
                          .ask(
                            l,
                            title,
                            detail.name,
                            libraryId: destination?.id,
                          ),
                    );
                  }
                },
              ),
              260,
            ),
          if (trailer != null)
            RoundIconButton(
              icon: Lucide.clapperboard,
              label: l.titleTrailer,
              onPressed: () {
                final url = Uri.tryParse(trailer.url);
                if (url != null) unawaited(ref.read(linkOpenerProvider)(url));
              },
            ),
        ],
      ),
    );
  }
}

/// Laid out as a season's page is: the poster beside the name, here
/// carrying the state in its corner, then the year and how many seasons,
/// the ratings, and the genres as plain text, since genre pages list the
/// library's titles.
class _Heading extends ConsumerWidget {
  const _Heading({
    required this.detail,
    required this.availability,
    required this.seasons,
  });

  final CatalogTitleDetail detail;
  final Availability availability;
  final List<CatalogSeason> seasons;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final poster = detail.poster;
    // For an admin with the title's request to answer, a tap on the badge
    // says who requested it.
    final waiting = waitingRequest(ref, availability);
    final numbered = seasons.where((season) => season.number > 0).length;
    final facts = [
      ?detail.year?.toString(),
      if (detail.ref.isShow && numbered > 0) l.requestsSeasonCount(numbered),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        spacing: 16,
        children: [
          SizedBox(
            width: isWide(context) ? 180 : 132,
            child: ArtFrame(
              toneKey: refKey(detail.ref),
              aspectRatio: CardMetrics.poster,
              children: [
                if (poster != null) Picture([ArtSource(poster)]),
                Align(
                  alignment: AlignmentDirectional.topEnd,
                  child: Padding(
                    padding: const EdgeInsets.all(6),
                    child: PosterBadge(
                      availability: availability,
                      tip: waiting == null ? null : requestedText(waiting, l),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 8,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      detail.name,
                      maxLines: 4,
                      overflow: TextOverflow.ellipsis,
                      style: headlineStyle(colors),
                    ),
                  ),
                  HeadingFacts(
                    facts: facts,
                    contentRating: detail.contentRating,
                    rating: detail.rating,
                  ),
                  if (detail.genres.isNotEmpty)
                    Text(
                      detail.genres.take(4).join(', '),
                      style: KitText.sm.style(color: colors.mutedForeground),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
