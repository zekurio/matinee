import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart' show mediaChangesProvider;
import '../../query/refresh.dart';
import '../../router.dart';
import '../home/home_data.dart' show librariesProvider;
import '../shell/shell.dart' show tabReselectProvider;
import 'filter_sheet.dart' show watchLanguageNames;
import 'list_choices.dart';
import 'list_words.dart';
import 'title_grid.dart';
import 'title_pages.dart';

/// Fetch again on return after this long, as Home does.
const _refreshAfter = Duration(seconds: 30);

/// The kind of library that holds each kind of title.
String _libraryKind(String kind) =>
    kind == TitleKind.show ? LibraryKind.shows : LibraryKind.movies;

/// The Shows or the Movies tab: every title of [kind] the viewer can see,
/// across the libraries, in place of the Kotlin app's Media tab and its
/// library pages. With more than one library of the kind, a menu in the
/// subtitle narrows it to one, as on the web.
class KindScreen extends ConsumerStatefulWidget {
  const KindScreen({super.key, required this.kind});

  /// A `TitleKind`.
  final String kind;

  String get path => kind == TitleKind.show ? Routes.shows : Routes.movies;

  @override
  ConsumerState<KindScreen> createState() => _KindScreenState();
}

class _KindScreenState extends ConsumerState<KindScreen> {
  final _scroll = ScrollController();
  var _fetched = DateTime.now();
  TitleListRequest? _request;
  FilterScope? _scope;

  ListKey get _list => (kind: widget.kind, genre: null, studio: null);

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Back on the tab, marks and new titles may have come meanwhile.
  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) < _refreshAfter) return;
    _changed();
  }

  /// Something was marked, liked, or played here or on another page: the
  /// ticks and the titles a filter keeps may have moved.
  void _changed() {
    _fetched = DateTime.now();
    _refreshList(ref, _request, _scope);
  }

  void _toTop() {
    if (!_scroll.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(0);
    } else {
      _scroll.animateTo(
        0,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(mediaChangesProvider, (_, _) => _changed());
    final colors = MatineeTheme.of(context);
    if (ref.watch(authStateProvider) is Offline) {
      return ColoredBox(color: colors.background, child: const _Offline());
    }
    ref.listen(tabReselectProvider, (_, tap) {
      if (tap?.path == widget.path) _toTop();
    });
    final l = AppLocalizations.of(context);
    final kind = widget.kind;
    final shows = kind == TitleKind.show;
    final list = _list;
    final choices = ref.watch(choicesProvider(list));
    final libraries = ref.watch(librariesProvider).value;
    final ofKind = [
      for (final library in libraries ?? const <Library>[])
        if (library.kind == _libraryKind(kind)) library,
    ];
    // A library that's gone, or another kind's, is every library. Until
    // the libraries come, the one picked, so the list isn't asked twice.
    final picked = choices.libraryId;
    final libraryId =
        libraries == null || ofKind.any((library) => library.id == picked)
        ? picked
        : null;
    final FilterScope scope = libraryId == null
        ? (libraryId: null, kind: kind, genre: null, studio: null)
        : (libraryId: libraryId, kind: null, genre: null, studio: null);
    final options = ref.watch(filterOptionsProvider(scope)).value;
    final order = choices.effectiveOrder(options?.sorts);
    final request = TitleListRequest(
      kind: kind,
      libraryId: libraryId,
      sort: order.sort,
      order: order.order,
      filters: choices.filters,
    );
    _request = request;
    _scope = scope;
    final notifier = ref.read(choicesProvider(list).notifier);
    final chips = activeFilters(
      context,
      choices.filters,
      bothRatings: (options?.ratings.length ?? 0) > 1,
      change: notifier.filters,
      languages: watchLanguageNames(ref, context, options),
    );
    final filtered = chips.isNotEmpty;

    return ReturnWatcher(
      path: widget.path,
      onReturn: _returned,
      child: ColoredBox(
        color: colors.background,
        child: TitleGrid(
          request: request,
          controller: _scroll,
          header: (context, shown) => [
            SliverToBoxAdapter(
              child: _Heading(
                title: shows ? l.tabShows : l.tabMovies,
                subtitle: [
                  if (ofKind.length > 1)
                    LibraryMenu(
                      libraries: ofKind,
                      value: libraryId,
                      onChanged: notifier.library,
                    ),
                  if (shown.total case final total?)
                    Text(l.browseTitleCount(total)),
                ],
                actions: [
                  FilterButton(list: list, scope: scope, kind: kind),
                  SortButton(
                    list: list,
                    current: order,
                    offered: options?.sorts,
                  ),
                ],
              ),
            ),
            if (filtered)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: ActiveFilterRow(
                    chips: chips,
                    onClear: notifier.clearFilters,
                  ),
                ),
              ),
          ],
          empty: EmptyState(
            icon: filtered
                ? Lucide.searchX
                : shows
                ? Lucide.tv
                : Lucide.film,
            title: switch ((filtered, shows)) {
              (true, true) => l.libraryNoFilterMatchShows,
              (true, false) => l.libraryNoFilterMatchMovies,
              (false, true) => l.libraryNoneShows,
              (false, false) => l.libraryNoneMovies,
            },
            action: filtered
                ? MatineeButton(
                    look: ButtonLook.outline,
                    onPressed: notifier.clearFilters,
                    child: Text(l.browseClearFilters),
                  )
                : null,
          ),
        ),
      ),
    );
  }
}

/// A genre's or a studio's titles from every library, opened from a chip
/// on a title's page, with the filters and sorts the tabs have and a
/// choice of movies or shows: the Kotlin app's `BrowseScreen`.
class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key, this.genre, this.studio});

  final String? genre;
  final String? studio;

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  var _fetched = DateTime.now();
  TitleListRequest? _request;
  FilterScope? _scope;

  ListKey get _list => (kind: null, genre: widget.genre, studio: widget.studio);

  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) < _refreshAfter) return;
    _changed();
  }

  /// Something was marked, liked, or played here or on another page: the
  /// ticks and the titles a filter keeps may have moved.
  void _changed() {
    _fetched = DateTime.now();
    _refreshList(ref, _request, _scope);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(mediaChangesProvider, (_, _) => _changed());
    final l = AppLocalizations.of(context);
    final genre = widget.genre;
    final studio = widget.studio;
    final Widget body;
    final actions = <Widget>[];
    if (ref.watch(authStateProvider) is Offline) {
      body = const _Offline();
    } else {
      final list = _list;
      final choices = ref.watch(choicesProvider(list));
      final kind = choices.kind;
      final FilterScope scope = (
        libraryId: null,
        kind: kind,
        genre: genre,
        studio: studio,
      );
      final options = ref.watch(filterOptionsProvider(scope)).value;
      final order = choices.effectiveOrder(options?.sorts);
      final request = TitleListRequest(
        kind: kind,
        genre: genre,
        studio: studio,
        sort: order.sort,
        order: order.order,
        filters: choices.filters,
      );
      _request = request;
      _scope = scope;
      final notifier = ref.read(choicesProvider(list).notifier);
      final chips = activeFilters(
        context,
        choices.filters,
        bothRatings: (options?.ratings.length ?? 0) > 1,
        change: notifier.filters,
        languages: watchLanguageNames(ref, context, options),
      );
      final filtered = chips.isNotEmpty;
      actions.addAll([
        FilterButton(list: list, scope: scope, kind: kind),
        SortButton(list: list, current: order, offered: options?.sorts),
      ]);
      body = TitleGrid(
        request: request,
        header: (context, shown) => [
          SliverToBoxAdapter(
            child: _BrowseHeading(
              label: genre != null ? l.browseGenre : l.browseStudio,
              total: shown.total,
              kinds: shown.kinds,
              kind: kind,
              onKind: notifier.kind,
            ),
          ),
          if (filtered)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ActiveFilterRow(
                  chips: chips,
                  onClear: notifier.clearFilters,
                ),
              ),
            ),
        ],
        empty: EmptyState(
          icon: filtered ? Lucide.searchX : Lucide.popcorn,
          title: filtered
              ? l.browseNoFilterMatch
              : genre != null
              ? l.browseGenreEmpty
              : l.browseStudioEmpty,
          action: filtered
              ? MatineeButton(
                  look: ButtonLook.outline,
                  onPressed: notifier.clearFilters,
                  child: Text(l.browseClearFilters),
                )
              : null,
        ),
      );
    }
    return ReturnWatcher(
      path: '/browse',
      onReturn: _returned,
      child: PageFrame(
        title: genre ?? studio,
        onBack: () => context.pop(),
        backLabel: l.commonBack,
        actions: actions,
        child: body,
      ),
    );
  }
}

/// Fetches a list again on return, keeping what's on screen, and what its
/// filters offer, whose counts move with it.
void _refreshList(
  WidgetRef ref,
  TitleListRequest? request,
  FilterScope? scope,
) {
  if (request != null) {
    final pages = ref.read(titlePagesProvider(request).notifier);
    if (ref.read(titlePagesProvider(request)).error != null) {
      pages.retry();
    } else {
      unawaited(pages.refresh());
    }
  }
  if (scope != null) ref.invalidate(filterOptionsProvider(scope));
}

/// A tab's heading: its name, the library menu and the count under it, and
/// the filter and sort at the end.
class _Heading extends StatelessWidget {
  const _Heading({
    required this.title,
    required this.subtitle,
    required this.actions,
  });

  final String title;
  final List<Widget> subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final muted = KitText.sm.style(color: colors.mutedForeground);
    return Padding(
      // A bar button's 48 holds its 22 icon 13 in, so the last icon ends
      // near the gutter the cards keep.
      padding: const EdgeInsetsDirectional.only(
        start: CardMetrics.gutter,
        end: 4,
        top: 8,
        bottom: 8,
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(
                  header: true,
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.xl
                        .style(
                          color: colors.foreground,
                          weight: FontWeight.w600,
                        )
                        .copyWith(letterSpacing: KitText.xl.size * -.025),
                  ),
                ),
                if (subtitle.isNotEmpty)
                  DefaultTextStyle(
                    style: muted,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: 20),
                      child: Row(
                        children: [
                          for (final (index, part) in subtitle.indexed) ...[
                            if (index > 0)
                              ExcludeSemantics(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 6,
                                  ),
                                  child: Text('·', style: muted),
                                ),
                              ),
                            Flexible(child: part),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          ...actions,
        ],
      ),
    );
  }
}

/// Under a genre's or a studio's name: which it is and how many titles,
/// then movies or shows, offered once there are both.
class _BrowseHeading extends StatelessWidget {
  const _BrowseHeading({
    required this.label,
    required this.total,
    required this.kinds,
    required this.kind,
    required this.onKind,
  });

  final String label;
  final int? total;
  final BrowsedTitlesKinds? kinds;
  final String? kind;
  final ValueChanged<String?> onKind;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final total = this.total;
    final kinds = this.kinds;
    final both =
        kind != null || (kinds != null && kinds.movie > 0 && kinds.show > 0);
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        4,
        CardMetrics.gutter,
        12,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 12,
        children: [
          Text(
            [label, if (total != null) l.browseTitleCount(total)].join(' · '),
            style: KitText.sm.style(color: colors.mutedForeground),
          ),
          if (both)
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final (value, name, count) in [
                  (
                    null,
                    l.browseKindAll,
                    kinds == null ? null : kinds.movie + kinds.show,
                  ),
                  (TitleKind.movie, l.browseKindMovie, kinds?.movie),
                  (TitleKind.show, l.browseKindShow, kinds?.show),
                ])
                  ChoiceChip(
                    label: name,
                    selected: kind == value,
                    count: count == null ? null : countText(context, count),
                    onPressed: () => onKind(value),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Offline, the lists can't be asked for; the downloads are their own tab.
class _Offline extends StatelessWidget {
  const _Offline();

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Center(
      child: EmptyState(
        icon: Lucide.cloudOff,
        title: l.unreachableOfflineTitle,
        message: l.unreachableOffline,
      ),
    );
  }
}
