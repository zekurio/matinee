import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/permissions.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/format.dart' show seasonName;
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/catalog_cards.dart';
import '../requests/request_sheet.dart' show dismissRecommendation;
import '../requests/request_words.dart';
import '../requests/requests_data.dart';
import '../requests/requests_hub.dart';
import 'tv_actions.dart';
import 'tv_home.dart' show TvPageMessage, TvRowNotice;
import 'tv_media.dart';
import 'tv_requests.dart';
import 'tv_shell.dart' show TvBackdrop;

/// A title the server doesn't have on a TV, its card, and asking for it:
/// built like a library title's page, so it reads as the same page.

/// What a catalog card's header line says: its name, its year and kind,
/// or only the year where the row holds one kind, and its state.
FocusedItem catalogInfo(
  String name,
  int? year,
  String kind,
  Availability availability,
  AppLocalizations l, {
  bool named = true,
}) {
  final word = stateWord(availability, percent: true);
  return FocusedItem(
    name: name,
    facts: [
      if (named) yearKind(year, kind, l) else ?year?.toString(),
      if (word != null) stateText(word, l),
    ],
  );
}

/// A title from the catalog as a TV poster: the library's card once the
/// viewer can watch it, else its poster with its state in the corner,
/// which follows what the stream says. Select opens its page, the
/// library's or the catalog's; [onLongPress] offers the rest, as a
/// recommendation's "Not interested". [onFocus] gets what the header says
/// of it.
class TvCatalogPoster extends ConsumerWidget {
  const TvCatalogPoster({
    super.key,
    required this.catalogRef,
    required this.name,
    required this.year,
    required this.poster,
    required this.availability,
    this.title,
    this.libraryId,
    this.focusNode,
    this.onFocus,
    this.onLongPress,
    this.width = TvCards.posterWidth,
    this.named = true,
  });

  factory TvCatalogPoster.browse(
    CatalogBrowseTitle item, {
    Key? key,
    FocusNode? focusNode,
    ValueChanged<FocusedItem>? onFocus,
    VoidCallback? onLongPress,
    double? width = TvCards.posterWidth,
    bool named = true,
  }) => TvCatalogPoster(
    key: key,
    catalogRef: item.ref,
    name: item.name,
    year: item.year,
    poster: item.poster,
    availability: item.availability,
    title: item.title,
    focusNode: focusNode,
    onFocus: onFocus,
    onLongPress: onLongPress,
    width: width,
    named: named,
  );

  factory TvCatalogPoster.summary(
    CatalogTitleSummary item, {
    Key? key,
    String? libraryId,
    FocusNode? focusNode,
    ValueChanged<FocusedItem>? onFocus,
    double? width = TvCards.posterWidth,
  }) => TvCatalogPoster(
    key: key,
    catalogRef: item.ref,
    name: item.name,
    year: item.year,
    poster: item.poster,
    availability: item.availability,
    libraryId: libraryId,
    focusNode: focusNode,
    onFocus: onFocus,
    width: width,
  );

  factory TvCatalogPoster.related(
    RelatedTitle item, {
    Key? key,
    FocusNode? focusNode,
    ValueChanged<FocusedItem>? onFocus,
  }) => TvCatalogPoster(
    key: key,
    catalogRef: item.ref,
    name: item.name,
    year: item.year,
    poster: item.poster,
    availability: item.availability,
    title: item.title,
    focusNode: focusNode,
    onFocus: onFocus,
  );

  final CatalogRef catalogRef;
  final String name;
  final int? year;
  final Artwork? poster;
  final Availability availability;

  /// The library's title, when the server has one.
  final TitleSummary? title;

  /// The library the page opens it for, as a request's.
  final String? libraryId;
  final FocusNode? focusNode;
  final ValueChanged<FocusedItem>? onFocus;
  final VoidCallback? onLongPress;
  final double? width;
  final bool named;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final now = liveAvailability(ref, catalogRef, availability);
    final onFocus = this.onFocus;
    final library = title;
    if (library != null && now.hereAs == library.id) {
      return TvPosterCard(
        name: library.name,
        poster: poster ?? library.images.poster,
        watched: library.watched,
        width: width,
        focusNode: focusNode,
        onPressed: () => context.push(Routes.title(library.id)),
        onLongPress:
            onLongPress ?? () => showTvActions(context, TitleActions(library)),
        onFocused: onFocus == null
            ? null
            : () => onFocus(titleInfo(library, l, kind: named)),
      );
    }
    final here = now.hereAs;
    final word = stateWord(now, percent: true);
    return TvPosterCard(
      name: name,
      poster: poster,
      width: width,
      focusNode: focusNode,
      label: word == null ? name : '$name, ${stateText(word, l)}',
      corner: CatalogBadge(availability: now, size: 28),
      onPressed: () => context.push(
        here != null
            ? Routes.title(here)
            : catalogRoute(catalogRef, library: libraryId),
      ),
      onLongPress: onLongPress,
      onFocused: onFocus == null
          ? null
          : () => onFocus(
              catalogInfo(name, year, catalogRef.kind, now, l, named: named),
            ),
    );
  }
}

/// "Not interested" for a recommended title, in the TV's panel, as its
/// actions are: the title leaves the rows at once, and focus goes to the
/// card beside it.
Future<void> showTvNotInterested(
  BuildContext context,
  CatalogTitleSummary item,
) async {
  final l = AppLocalizations.of(context);
  final container = ProviderScope.containerOf(context, listen: false);
  final picked = await showTvPanel<bool>(
    context,
    title: item.name,
    description: item.year?.toString(),
    builder: (panel) => [
      TvListItem(
        title: l.webDiscoverNotInterested,
        icon: Lucide.eyeOff,
        quiet: true,
        onPressed: () => Navigator.of(panel).pop(true),
      ),
    ],
  );
  if (picked == true) await dismissRecommendation(container, l, item);
}

// ---------------------------------------------------------------------------
// Asking.

/// Where a show is asked for on a TV, as the phone's request sheet: each
/// season the viewer may still request with a box, the server's pick
/// ticked (or only [only], from a season's card), the rest with their
/// state; on a [first] request "New seasons as they air"; and a button
/// that says what pressing it requests. Focus starts on the first season
/// with a box. It closes once the server took the ask.
Future<void> showTvAsk(
  BuildContext context, {
  required CatalogRef title,
  required String name,
  required List<CatalogSeason> seasons,
  required bool first,
  required bool defaultFuture,
  required String? libraryId,
  int? only,
}) {
  final l = AppLocalizations.of(context);
  return showTvPanel<void>(
    context,
    // From a season's card, the heading names the season, so it's plain
    // the panel starts on it alone rather than on the show's whole ask.
    title: l.webAskDialogTitle(
      only == null ? name : l.titleSeasonOf(name, seasonName(only, l)),
    ),
    builder: (panel) => [
      _AskBody(
        title: title,
        name: name,
        seasons: seasons,
        first: first,
        defaultFuture: defaultFuture,
        libraryId: libraryId,
        only: only,
      ),
    ],
  );
}

class _AskBody extends ConsumerStatefulWidget {
  const _AskBody({
    required this.title,
    required this.name,
    required this.seasons,
    required this.first,
    required this.defaultFuture,
    required this.libraryId,
    required this.only,
  });

  final CatalogRef title;
  final String name;
  final List<CatalogSeason> seasons;
  final bool first;
  final bool defaultFuture;
  final String? libraryId;
  final int? only;

  @override
  ConsumerState<_AskBody> createState() => _AskBodyState();
}

class _AskBodyState extends ConsumerState<_AskBody> {
  // Each opening starts from the server's pick.
  late Set<int> _picked = chooserStart(widget.seasons, only: widget.only);
  late bool _future =
      widget.first && widget.defaultFuture && widget.only == null;

  void _toggle(int number) => setState(
    () => _picked = _picked.contains(number)
        ? ({..._picked}..remove(number))
        : {..._picked, number},
  );

  void _ask(AppLocalizations l, List<CatalogSeason> chosen) {
    final navigator = Navigator.of(context);
    final route = ModalRoute.of(context);
    unawaited(
      ref
          .read(requestsProvider.notifier)
          .ask(
            l,
            widget.title,
            widget.name,
            libraryId: widget.libraryId,
            scope: ShowScope(
              seasons: [for (final season in chosen) season.number],
              future: _future && widget.first,
            ),
            // The panel asked; the toast only says it.
            undo: false,
            onDone: () {
              if (route != null && route.isCurrent) navigator.pop();
            },
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = widget.title;
    // The seasons as the stream has them now.
    final seasons = ref.watch(
      requestsProvider.select((state) => state.seasons(title, widget.seasons)),
    );
    final chosen = [
      for (final season in seasons)
        if (_picked.contains(season.number)) season,
    ];
    final label = chooserLabel(chosen, future: _future, first: widget.first);
    final busy = ref.watch(
      requestsProvider.select((state) => state.busy.contains(refKey(title))),
    );
    final opened = widget.only;
    final start = opened != null && _picked.contains(opened)
        ? opened
        : seasons
              .where((season) => season.availability.asTitle().asks)
              .firstOrNull
              ?.number;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        for (final season in seasons) _seasonRow(l, season, start),
        if (widget.first)
          TvListItem(
            title: l.webAskChooserFuture,
            // "Neue Staffeln, sobald sie laufen" beside the switch.
            titleLines: 2,
            quiet: true,
            trailing: TvListSwitch(checked: _future),
            onPressed: () => setState(() => _future = !_future),
          ),
        const SizedBox(height: 12),
        TvListItem(
          title: chooserText(label, l),
          icon: Lucide.plus,
          enabled: label is! PickOneLabel,
          onPressed: () {
            if (!busy) _ask(l, chosen);
          },
        ),
      ],
    );
  }

  Widget _seasonRow(AppLocalizations l, CatalogSeason season, int? start) {
    final availability = season.availability.asTitle();
    final open = availability.asks;
    final word = stateWord(availability);
    final detail = open
        ? seasonDetailText(seasonDetail(season), l)
        : word == null
        ? l.webAskChooserUnavailable
        : stateText(word, l);
    final checked = _picked.contains(season.number);
    // One that can't be asked for keeps the box's room, so the names line
    // up, and still takes focus, so every season can be read.
    return TvListItem(
      key: ValueKey(season.number),
      title: seasonName(season.number, l),
      subtitle: detail,
      quiet: true,
      leading: open
          ? Semantics(
              checked: checked,
              child: TvCheckBox(checked: checked),
            )
          : const SizedBox(width: TvCheckBox.size),
      autofocus: season.number == start,
      onPressed: open ? () => _toggle(season.number) : null,
    );
  }
}

// ---------------------------------------------------------------------------
// The page.

/// The rows and buttons of the catalog page in its focus memory.
abstract final class _Rows {
  static const actions = 'actions';
  static const action = 'action';
  static const add = 'add';
  static const goesTo = 'goesTo';
  static const decline = 'decline';
  static const seasons = 'seasons';
  static const people = 'people';
  static String related(String rail) => 'related-$rail';
}

const _posterHeight = TvCards.posterWidth * 1.5;

/// A catalog title's page on a TV, as the library title's page: its
/// backdrop, its name, facts, genres, and the request's state in the
/// server's words, its overview, and where Play would be, the request:
/// Request, Request more, or Cancel request, which asks first, and for an
/// admin with the title's request to answer, Add, Goes to, and Decline.
/// Focus starts there. Below, a show's seasons, each with its own state,
/// the cast and crew, and the related titles. When the title arrives while
/// the page is open, the library title's page takes its place.
class TvCatalogScreen extends ConsumerWidget {
  const TvCatalogScreen({super.key, required this.catalogKey});

  final CatalogKey catalogKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final key = catalogKey;
    final load = ref.watch(catalogDetailsProvider(key));
    final Widget child;
    if (load.value case final detail?) {
      child = _CatalogPage(detail: detail, library: key.libraryId);
    } else if (load.error case final cause?) {
      child = TvPageMessage(
        title: l.titleLoadError,
        message: describeFailure(l, cause),
        onRetry: () => ref.invalidate(catalogDetailsProvider(key)),
      );
    } else {
      child = Center(
        child: Spinner(
          size: 36,
          color: MatineeTheme.of(context).mutedForeground,
        ),
      );
    }
    return ReturnWatcher(
      path: Routes.catalog(
        key.kind,
        key.provider,
        key.providerId,
        library: key.libraryId,
      ),
      onReturn: () => ref.invalidate(catalogDetailsProvider(key)),
      child: child,
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
  final _memory = TvFocusMemory();

  /// The library title's page took this one's place.
  bool _left = false;

  @override
  void initState() {
    super.initState();
    tvOpenPanels.addListener(_panels);
  }

  @override
  void dispose() {
    tvOpenPanels.removeListener(_panels);
    _memory.dispose();
    super.dispose();
  }

  /// A panel closing may uncover an arrival that waited for it.
  void _panels() {
    if (mounted) setState(() {});
  }

  bool get _onTop =>
      (ModalRoute.isCurrentOf(context) ?? true) && tvOpenPanels.value == 0;

  /// Once the title is in a library the viewer can see, this page becomes
  /// that title's page, which Back leaves for wherever this one came
  /// from. Only while it's on top and no panel is over it, so the person
  /// isn't moved from under what they're doing.
  void _arrive(Availability availability) {
    final arrived = availability.hereAs;
    if (arrived == null || _left || !_onTop) return;
    _left = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_onTop) {
        context.pushReplacement(Routes.title(arrived));
      } else {
        setState(() => _left = false);
      }
    });
  }

  void _openAsk(
    List<CatalogSeason> seasons,
    Availability availability,
    CatalogDestination? destination, {
    int? only,
  }) {
    final detail = widget.detail;
    unawaited(
      showTvAsk(
        context,
        title: detail.ref,
        name: detail.name,
        seasons: seasons,
        first: availability.asks,
        defaultFuture: detail.defaultScope?.future ?? false,
        libraryId: destination?.id,
        only: only,
      ),
    );
  }

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
    _arrive(availability);
    final buttons = _buttons(l, availability, seasons, destination);
    final people = tvPeople(detail.credits, l);
    String personKey(TvPerson person) => '${person.name}-${person.role}';
    final related = _related(l);
    _memory.restore(context, () {
      if (buttons.firstOrNull case (final key, _)) return (_Rows.actions, key);
      if (title.isShow && seasons.isNotEmpty) {
        return (_Rows.seasons, '${seasons.first.number}');
      }
      if (people.firstOrNull case final person?) {
        return (_Rows.people, personKey(person));
      }
      for (final (row, first, _) in related.rows) {
        if (first != null) return (row, first);
      }
      return null;
    });
    final backdrop = detail.backdrop;
    return FollowTitles(
      titles: FollowedTitles([
        CatalogInput(ref: title, libraryId: destination?.id),
        ...related.followed,
      ]),
      child: TvBackdrop(
        sources: [
          if (backdrop != null) ArtSource(backdrop, largest: ArtworkSize.large),
        ],
        child: TvHeaderList(
          header: _header(l, availability, seasons, buttons),
          rows: [
            if (title.isShow && seasons.isNotEmpty)
              TvRow(
                title: l.titleSeasons,
                row: _Rows.seasons,
                memory: _memory,
                height: tvCaptionedHeight(),
                itemCount: seasons.length,
                itemBuilder: (context, index) =>
                    _seasonCard(l, seasons, index, availability, destination),
              ),
            if (people.isNotEmpty)
              TvRow(
                title: l.tvDetailPeople,
                row: _Rows.people,
                memory: _memory,
                height: tvPersonHeight,
                itemCount: people.length,
                itemBuilder: (context, index) {
                  final person = people[index];
                  return TvPersonCard(
                    person: person,
                    focusNode: _memory.node(_Rows.people, personKey(person)),
                    onPressed: () => context.push(
                      Routes.person(person.name, tmdbId: person.tmdbId),
                    ),
                  );
                },
              ),
            for (final (_, _, row) in related.rows) row,
          ],
        ),
      ),
    );
  }

  /// The page's buttons, by their keys: an admin's answers to the title's
  /// request while it waits, else the one thing the viewer may do. A
  /// Request the viewer can't make shows no button; the state line says
  /// why.
  List<(String, Widget)> _buttons(
    AppLocalizations l,
    Availability availability,
    List<CatalogSeason> seasons,
    CatalogDestination? destination,
  ) {
    final detail = widget.detail;
    final title = detail.ref;
    final hub = ref.read(requestsProvider.notifier);
    final waiting = waitingRequest(ref, availability);
    final held = ref.watch(requestsProvider.select((state) => state.held));
    final answering = waiting != null && !held.contains(waiting.id)
        ? waiting
        : null;
    if (answering != null) {
      final choice = choosesLibrary(answering);
      final goes = ref.watch(
        requestsProvider.select((state) => state.goesTo(answering).name),
      );
      return [
        (
          _Rows.add,
          TvButton(
            label: choice ? l.webRequestsAddTo(goes) : l.webRequestsAdd,
            icon: Lucide.check,
            minWidth: 180,
            focusNode: _memory.node(_Rows.actions, _Rows.add),
            onPressed: () => unawaited(
              hub.answer(l, answering, const AddAnswer(), undo: false),
            ),
          ),
        ),
        if (choice)
          (
            _Rows.goesTo,
            TvButton(
              label: l.webRequestsGoesToTitle,
              icon: Lucide.libraryBig,
              trailingIcon: Lucide.chevronDown,
              focusNode: _memory.node(_Rows.actions, _Rows.goesTo),
              onPressed: () => unawaited(showTvGoesTo(context, answering)),
            ),
          ),
        (
          _Rows.decline,
          TvButton(
            label: l.webRequestsDecline,
            icon: Lucide.x,
            focusNode: _memory.node(_Rows.actions, _Rows.decline),
            onPressed: () => unawaited(showTvDecline(context, answering)),
          ),
        ),
      ];
    }
    final more =
        title.isShow &&
        posterAction(availability) == null &&
        seasons.any((season) => season.availability.asTitle().asks);
    final action = more ? PosterAction.request : posterAction(availability);
    // One node for Request and Cancel request, so focus stays put as one
    // becomes the other.
    final node = _memory.node(_Rows.actions, _Rows.action);
    return switch (action) {
      PosterAction.request => [
        (
          _Rows.action,
          TvButton(
            label: more ? l.webAskMore : l.webAskAsk,
            icon: Lucide.plus,
            minWidth: 180,
            focusNode: node,
            onPressed: () {
              if (title.isShow) {
                _openAsk(seasons, availability, destination);
              } else {
                // A film asks at once; the toast says so.
                unawaited(
                  hub.ask(
                    l,
                    title,
                    detail.name,
                    libraryId: destination?.id,
                    undo: false,
                  ),
                );
              }
            },
          ),
        ),
      ],
      PosterAction.cancel => [
        (
          _Rows.action,
          TvButton(
            label: l.webAskCancel,
            icon: Lucide.x,
            minWidth: 180,
            focusNode: node,
            onPressed: () async {
              final id = availability.requestId;
              if (id == null) return;
              if (!await confirmTvCancel(context, detail.name)) return;
              unawaited(hub.cancel(l, id, detail.name));
            },
          ),
        ),
      ],
      null => const [],
    };
  }

  Widget _header(
    AppLocalizations l,
    Availability availability,
    List<CatalogSeason> seasons,
    List<(String, Widget)> buttons,
  ) {
    final colors = MatineeTheme.of(context);
    final detail = widget.detail;
    final numbered = seasons.where((season) => season.number > 0).length;
    final facts = [
      ?detail.year?.toString(),
      if (detail.ref.isShow && numbered > 0) l.requestsSeasonCount(numbered),
    ];
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start,
        end: TvPage.end,
        top: Overscan.vertical + 8,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 720,
            child: Text(
              detail.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TvType.hero.style(color: colors.foreground),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: TvFacts(
              facts: facts,
              contentRating: detail.contentRating,
              rating: detail.rating,
            ),
          ),
          if (detail.genres.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                detail.genres.take(4).join(', '),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TvType.label.style(color: colors.mutedForeground),
              ),
            ),
          _StateLine(availability: availability),
          if (detail.stale)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l.webCatalogPageStale,
                style: TvType.caption.style(color: colors.mutedForeground),
              ),
            ),
          if (detail.overview case final overview?)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: SizedBox(
                width: 560,
                child: Text(
                  overview,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.body.style(
                    color: colors.foreground.withValues(alpha: .78),
                  ),
                ),
              ),
            ),
          if (buttons.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 28),
              child: TvMemoryRow(
                memory: _memory,
                row: _Rows.actions,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 14,
                  children: [for (final (_, button) in buttons) button],
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// A season by its poster, its state in the corner and under its name.
  /// Select on one the viewer may still request opens the ask with only
  /// it ticked.
  Widget _seasonCard(
    AppLocalizations l,
    List<CatalogSeason> seasons,
    int index,
    Availability availability,
    CatalogDestination? destination,
  ) {
    final detail = widget.detail;
    final season = seasons[index];
    final state = season.availability.asTitle();
    final name = seasonName(season.number, l);
    final asks = posterAction(state) == PosterAction.request;
    return TvCaptionedPoster(
      name: name,
      toneKey: l.titleSeasonOf(detail.name, name),
      poster: season.poster ?? detail.poster,
      detail: seasonLineText(season, l),
      corner: CatalogBadge(availability: state, size: 28),
      focusNode: _memory.node(_Rows.seasons, '${season.number}'),
      onPressed: () {
        if (asks) {
          _openAsk(seasons, availability, destination, only: season.number);
        }
      },
    );
  }

  /// The rows of related titles: the rest of a film's series, and more
  /// like it, each loading on its own. A row with nothing in it stays out,
  /// and rows that didn't load at all leave no gap.
  ({List<(String, String?, Widget)> rows, List<CatalogInput> followed})
  _related(AppLocalizations l) {
    final relatedTo = keyOf(widget.detail.ref, libraryId: widget.library);
    final rails = ref.watch(relatedRailsProvider(relatedTo)).value;
    if (rails == null) return (rows: const [], followed: const []);
    final rows = <(String, String?, Widget)>[];
    final followed = <CatalogInput>[];
    for (final rail in rails.rails) {
      final heading = rail.id == RelatedRailId.collection && rail.name != null
          ? rail.name!
          : l.webCatalogRelatedMoreLikeThis;
      final row = _Rows.related(rail.id);
      final read = (key: relatedTo, rail: rail.id);
      final page = ref.watch(relatedTitlesProvider(read));
      final items = page.value?.items;
      if (items == null) {
        rows.add((
          row,
          null,
          page.hasError && !page.isLoading
              ? TvRowNotice(
                  title: heading,
                  headline: l.webDiscoverRailFailed,
                  message: describeFailure(l, page.error!),
                  onRetry: () => ref.invalidate(relatedTitlesProvider(read)),
                  retryNode: _memory.node(row, TvRowNotice.retryKey),
                )
              : TvRowNotice(title: heading, height: _posterHeight),
        ));
        continue;
      }
      if (items.isEmpty) continue;
      followed.addAll([
        for (final item in items)
          if (item.availability.state != AvailabilityState.here)
            CatalogInput(ref: item.ref),
      ]);
      rows.add((
        row,
        refKey(items.first.ref),
        TvRow(
          title: heading,
          row: row,
          memory: _memory,
          height: _posterHeight,
          itemCount: items.length,
          itemBuilder: (context, index) => TvCatalogPoster.related(
            items[index],
            focusNode: _memory.node(row, refKey(items[index].ref)),
          ),
        ),
      ));
    }
    return (rows: rows, followed: followed);
  }
}

/// Where the title stands, in the server's words, under its facts: the
/// state by its mark, how long it has left while on its way, for an admin
/// who asked for it, and why a Request can't be made or a declined one
/// isn't coming. Nothing for a title nobody asked for that can be asked.
class _StateLine extends ConsumerWidget {
  const _StateLine({required this.availability});

  final Availability availability;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final availability = this.availability;
    final word = stateWord(availability, percent: true);
    final badge = badgeOf(availability);
    final waiting = waitingRequest(ref, availability);
    final eta = availability.etaSeconds;
    final blocked =
        posterAction(availability) == null &&
        requestBlocked(availability) != null;
    final lines = [
      if (availability.state == AvailabilityState.coming && eta != null)
        l.webRequestsProgressLeft(formatSpan(eta, l)),
      if (waiting != null) requestedText(waiting, l),
      if (blocked)
        ?dimmedText(
          availability,
          l,
          admin: ref.watch(canProvider(Permission.adminRequestDecline)),
        )
      else
        ?declinedText(availability, l),
    ];
    if (word == null && lines.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: SizedBox(
        width: 560,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          spacing: 4,
          children: [
            if (word != null && badge != null)
              Row(
                spacing: 10,
                children: [
                  DefaultTextStyle.merge(
                    style: TextStyle(color: colors.foreground),
                    child: StateGlyph(badge: badge, size: 18),
                  ),
                  Flexible(
                    child: Text(
                      stateText(word, l),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.facts.style(color: colors.foreground),
                    ),
                  ),
                ],
              ),
            for (final line in lines)
              Text(
                line,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TvType.caption.style(color: colors.mutedForeground),
              ),
          ],
        ),
      ),
    );
  }
}
