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
import '../shell/header.dart';
import '../shell/offline_note.dart';
import '../shell/shell.dart' show tabReselectProvider;
import 'list_choices.dart';
import 'title_grid.dart';
import 'title_pages.dart';

/// Fetch again on return after this long, as Home does.
const _refreshAfter = Duration(seconds: 30);

/// The kind of library that holds each kind of title.
String _libraryKind(String kind) =>
    kind == TitleKind.show ? LibraryKind.shows : LibraryKind.movies;

/// The Media tab: every movie and show the viewer can see, across the
/// libraries, starting on both. The type and the library narrow it from the
/// filter sheet; the sort follows what the server offers for what's picked.
///
/// Shows and Movies open it with the type preset, so a link to either still
/// lands on what it names.
class MediaScreen extends ConsumerStatefulWidget {
  const MediaScreen({super.key, this.initialKind});

  /// A `TitleKind` to start on, for `/shows` and `/movies`.
  final String? initialKind;

  @override
  ConsumerState<MediaScreen> createState() => _MediaScreenState();
}

class _MediaScreenState extends ConsumerState<MediaScreen> {
  final _scroll = ScrollController();
  var _fetched = DateTime.now();
  TitleListRequest? _request;
  FilterScope? _scope;

  /// A link's kind until the choices take it, so the first frame asks for
  /// that kind rather than every title.
  String? _presetKind;

  ListKey get _list => (kind: null, genre: null, studio: null);

  @override
  void initState() {
    super.initState();
    _schedulePreset();
  }

  @override
  void didUpdateWidget(MediaScreen old) {
    super.didUpdateWidget(old);
    if (old.initialKind != widget.initialKind) _schedulePreset();
  }

  /// A link to one kind starts the list on it, after the frame: a provider
  /// can't change while the tree is building.
  void _schedulePreset() {
    final kind = widget.initialKind;
    _presetKind = kind;
    if (kind == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _preset();
    });
  }

  /// A link to one kind starts the list on it, letting go of a library of
  /// the other kind.
  void _preset() {
    final kind = widget.initialKind;
    if (kind == null) return;
    if (ref.read(choicesProvider(_list)).kind == kind) {
      if (mounted) setState(() => _presetKind = null);
      return;
    }
    final notifier = ref.read(choicesProvider(_list).notifier);
    notifier.kind(kind);
    final picked = ref.read(choicesProvider(_list)).libraryId;
    final libraries = ref.read(librariesProvider).value;
    final library = libraries
        ?.where((library) => library.id == picked)
        .firstOrNull;
    if (library != null && library.kind != _libraryKind(kind)) {
      notifier.library(null);
    }
    if (mounted) setState(() => _presetKind = null);
  }

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
      _scroll.animateTo(0, duration: KitMotion.move, curve: KitMotion.easing);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(mediaChangesProvider, (_, _) => _changed());
    final colors = MatineeTheme.of(context);
    final l = AppLocalizations.of(context);
    if (ref.watch(authStateProvider) is Offline) {
      return ColoredBox(
        color: colors.background,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TabHeader(
              title: l.tabMedia,
              actions: [
                PageBarButton(
                  icon: Lucide.search,
                  label: l.searchTitle,
                  onPressed: () => context.push(Routes.search),
                ),
              ],
            ),
            const Expanded(child: _Offline()),
          ],
        ),
      );
    }
    ref.listen(tabReselectProvider, (_, tap) {
      if (tap?.path == Routes.media) _toTop();
    });
    final list = _list;
    final choices = ref.watch(choicesProvider(list));
    final type = _presetKind ?? choices.kind;
    final libraries = ref.watch(librariesProvider).value;
    final ofType = [
      for (final library in libraries ?? const <Library>[])
        if (type == null || library.kind == _libraryKind(type)) library,
    ];
    // A library that's gone, or another kind's, is every library. Until
    // the libraries come, the one picked, so the list isn't asked twice.
    final picked = choices.libraryId;
    final libraryId =
        libraries == null || ofType.any((library) => library.id == picked)
        ? picked
        : null;
    final FilterScope scope = libraryId == null
        ? (libraryId: null, kind: type, genre: null, studio: null)
        : (libraryId: libraryId, kind: null, genre: null, studio: null);
    final options = ref.watch(filterOptionsProvider(scope)).value;
    final order = choices.effectiveOrder(options?.sorts);
    final request = TitleListRequest(
      kind: type,
      libraryId: libraryId,
      sort: order.sort,
      order: order.order,
      filters: choices.filters,
    );
    _request = request;
    _scope = scope;
    final notifier = ref.read(choicesProvider(list).notifier);
    final filtered = choices.filterCount > 0;

    return ReturnWatcher(
      path: Routes.media,
      onReturn: _returned,
      child: ColoredBox(
        color: colors.background,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TabHeader(
              title: l.tabMedia,
              actions: [
                FilterButton(list: list, scope: scope),
                SortButton(list: list, current: order, offered: options?.sorts),
                PageBarButton(
                  icon: Lucide.search,
                  label: l.searchTitle,
                  onPressed: () => context.push(Routes.search),
                ),
              ],
            ),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: TitleGrid(
                  request: request,
                  controller: _scroll,
                  header: (context, shown) => const [],
                  empty: EmptyState(
                    icon: filtered ? Lucide.searchX : Lucide.libraryBig,
                    title: filtered
                        ? l.browseNoFilterMatch
                        : l.libraryNoneMedia,
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
            ),
          ],
        ),
      ),
    );
  }
}

/// A genre's or a studio's titles from every library, opened from a chip on a
/// title's page, with the filters and sorts Media has. The kind is a filter
/// there too.
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
      final filtered = choices.filterCount > 0;
      actions.addAll([
        FilterButton(list: list, scope: scope),
        SortButton(list: list, current: order, offered: options?.sorts),
      ]);
      body = TitleGrid(
        request: request,
        header: (context, shown) => [
          SliverToBoxAdapter(
            child: _BrowseHeading(
              label: genre != null ? l.browseGenre : l.browseStudio,
              total: shown.total,
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

/// Under a genre's or a studio's name: which it is and how many titles.
class _BrowseHeading extends StatelessWidget {
  const _BrowseHeading({required this.label, required this.total});

  final String label;
  final int? total;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final total = this.total;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        4,
        CardMetrics.gutter,
        12,
      ),
      child: Text(
        [label, if (total != null) l.browseTitleCount(total)].join(' · '),
        style: KitText.sm.style(color: colors.mutedForeground),
      ),
    );
  }
}

/// Offline, the lists can't be asked for; the downloads are their own tab.
class _Offline extends StatelessWidget {
  const _Offline();

  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
      child: OfflineNote(message: AppLocalizations.of(context).libraryOffline),
    ),
  );
}
