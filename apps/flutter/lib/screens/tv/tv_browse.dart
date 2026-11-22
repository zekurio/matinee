import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../query/server_data.dart';
import '../../router.dart';
import '../home/home_data.dart';
import '../library/list_choices.dart';
import '../library/title_pages.dart';
import '../profile/profile_data.dart';
import '../requests/request_words.dart' show askable, refKey;
import '../requests/requests_data.dart' show catalogSearchProvider;
import '../requests/requests_hub.dart' show FollowTitles, FollowedTitles;
import '../search/search_data.dart';
import 'tv_actions.dart';
import 'tv_catalog.dart' show TvCatalogPoster;
import 'tv_home.dart' show TvRowNotice;
import 'tv_media.dart';
import 'tv_shell.dart';

/// The genres the titles of a kind have in every library, with how many
/// each, for the TV's genre filter.
final tvKindGenresProvider = serverQueryFamily(
  (api, String kind) async => (await api.titles.facets(kind: kind)).genres,
);

/// The row key a grid page gives its controls in its focus memory.
const _controls = tvGridControls;

/// The row key a grid page gives its controls in its focus memory.
const tvGridControls = 'controls';

/// A grid page's heading and the count beside it, and its controls, if any,
/// under them.
class TvGridHeader extends StatelessWidget {
  const TvGridHeader({
    super.key,
    required this.title,
    required this.detail,
    required this.controls,
  });

  final String title;
  final String? detail;
  final List<Widget> controls;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(start: TvPage.start),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(
              end: TvPage.end + TvGrid.clockRoom,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              spacing: 16,
              children: [
                Flexible(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TvType.headline.style(color: colors.foreground),
                  ),
                ),
                if (detail case final text?)
                  Flexible(
                    child: Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.facts.style(color: colors.mutedForeground),
                    ),
                  ),
              ],
            ),
          ),
          if (controls.isNotEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.only(
                top: 16,
                end: TvPage.end,
              ),
              child: SizedBox(
                height: TvButtons.height,
                child: Row(spacing: 14, children: controls),
              ),
            ),
        ],
      ),
    );
  }
}

/// A page of titles as a poster grid under [header], with the line that names
/// the focused one, loading more as the end nears. One grid whatever the state,
/// so the header stays put and keeps focus while a new sort or filter loads.
class TvTitleGrid extends ConsumerWidget {
  const TvTitleGrid({
    super.key,
    required this.request,
    required this.memory,
    required this.empty,
    required this.focused,
    required this.onFocus,
    required this.header,
    this.scrollKey,
  });

  final TitleListRequest request;
  final TvFocusMemory memory;
  final String empty;
  final FocusedItem? focused;
  final ValueChanged<TitleSummary> onFocus;
  final Widget header;
  final Object? scrollKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final provider = titlePagesProvider(request);
    final pages = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    ref.listen(mediaChangesProvider, (_, _) => unawaited(notifier.refresh()));
    final items = pages.items;
    final none = items.isEmpty;
    final error = pages.error;
    return TvPosterGrid(
      memory: memory,
      itemCount: items.length,
      cellAspect: 2 / 3,
      header: header,
      line: TvFocusLine(focused),
      lineHeight: tvFocusLineHeight,
      onNearEnd: notifier.more,
      scrollKey: scrollKey,
      footer: switch (error) {
        final error? => TvNotice(
          headline: none ? l.tvGridFailed : l.tvGridMoreFailed,
          message: describeFailure(l, error),
          onRetry: notifier.retry,
          retryLabel: l.commonRetry,
          top: none ? 28 : 8,
        ),
        null when none && pages.done => TvNotice(headline: empty),
        null when none || pages.loading => TvLoading(
          size: none ? 32 : 28,
          top: none ? 76 : 16,
        ),
        null => null,
      },
      itemBuilder: (context, index) {
        final title = items[index];
        return TvPosterCard(
          name: title.name,
          poster: title.images.poster,
          watched: title.watched,
          width: null,
          focusNode: memory.node(TvGrid.row, title.id),
          onPressed: () => context.push(Routes.title(title.id)),
          onLongPress: () => showTvActions(context, TitleActions(title)),
          onFocused: () => onFocus(title),
        );
      },
    );
  }
}

/// A library's orders, in the order the sort offers them.
List<(String, String)> _sorts(AppLocalizations l) => [
  (TitleSort.name, l.librarySortName),
  (TitleSort.recent, l.librarySortRecent),
  (TitleSort.year, l.librarySortYear),
];

/// Every movie, or every show, in every library: the drawer's Movies and Shows.
/// A sort, a genre, and a search narrow it, each from the controls over the
/// grid.
class TvKindScreen extends ConsumerStatefulWidget {
  const TvKindScreen({super.key, required this.kind});

  final String kind;

  @override
  ConsumerState<TvKindScreen> createState() => _TvKindScreenState();
}

class _TvKindScreenState extends ConsumerState<TvKindScreen> {
  final _memory = TvFocusMemory();
  final _query = TextEditingController();
  String _sort = TitleSort.name;
  String? _genre;
  String _settled = '';
  Timer? _pause;
  FocusedItem? _focused;

  @override
  void dispose() {
    _memory.dispose();
    _query.dispose();
    _pause?.cancel();
    super.dispose();
  }

  void _typed(String text) {
    _pause?.cancel();
    _pause = Timer(searchDebounce, () {
      if (mounted) _narrow(() => _settled = text.trim());
    });
  }

  /// Another order or filter: the line named a title that may have moved.
  void _narrow(VoidCallback change) => setState(() {
    change();
    _focused = null;
  });

  Future<void> _pickSort() async {
    final l = AppLocalizations.of(context);
    final picked = await showTvPicker(
      context,
      title: l.librarySort,
      current: _sort,
      options: [for (final (value, label) in _sorts(l)) TvOption(value, label)],
    );
    if (picked != null && mounted) _narrow(() => _sort = picked);
  }

  Future<void> _pickGenre() async {
    final l = AppLocalizations.of(context);
    final kind = widget.kind;
    final picked = await showTvPanel<String>(
      context,
      title: l.libraryGenre,
      loading: (context) =>
          ProviderScope.containerOf(context)
              .read(tvKindGenresProvider(kind))
              .isLoading,
      builder: (panel) {
        final genres =
            ProviderScope.containerOf(panel)
                .read(tvKindGenresProvider(kind))
                .value ??
            const <Facet>[];
        Widget option(String value, String label, String? detail) => TvListItem(
          title: label,
          quiet: true,
          checked: (_genre ?? '') == value,
          autofocus: (_genre ?? '') == value,
          trailing: detail == null ? null : TvListValue(detail, chevron: false),
          onPressed: () => Navigator.of(panel).pop(value),
        );
        return [
          option('', l.libraryAnyGenre, null),
          for (final genre in genres)
            option(genre.name, genre.name, '${genre.titleCount}'),
        ];
      },
    );
    if (picked != null && mounted) {
      _narrow(() => _genre = picked.isEmpty ? null : picked);
    }
  }

  String _empty(AppLocalizations l, bool shows) {
    if (_settled.isNotEmpty) {
      return shows
          ? l.libraryNoMatchShows(_settled)
          : l.libraryNoMatchMovies(_settled);
    }
    if (_genre != null) {
      return shows ? l.libraryNoFilterMatchShows : l.libraryNoFilterMatchMovies;
    }
    return shows ? l.libraryNoneShows : l.libraryNoneMovies;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final shows = widget.kind == TitleKind.show;
    // The genres load while the page shows, so the panel opens on them.
    ref.watch(tvKindGenresProvider(widget.kind));
    final request = TitleListRequest(
      kind: widget.kind,
      sort: _sort,
      filters: ListFilters(genres: [?_genre]),
      query: _settled.isEmpty ? null : _settled,
    );
    final pages = ref.watch(titlePagesProvider(request));
    _memory.restore(context, () {
      final now = ref.read(titlePagesProvider(request));
      if (now.items.firstOrNull case final first?) {
        return (TvGrid.row, first.id);
      }
      // Nothing to show: the controls, so the drawer and the filters stay
      // in reach.
      return now.done || now.error != null ? (_controls, 'sort') : null;
    });
    final sortLabel =
        _sorts(l).where((sort) => sort.$1 == _sort).firstOrNull?.$2 ??
        l.librarySortName;
    final onPicture = TvFocus.restOnPicture(MatineeTheme.of(context));
    return TvBackdrop(
      sources: _focused?.backdrop ?? const [],
      child: TvTitleGrid(
        request: request,
        memory: _memory,
        empty: _empty(l, shows),
        focused: _focused,
        onFocus: (title) => setState(() => _focused = titleInfo(title, l)),
        scrollKey: '$_sort-$_genre-$_settled',
        header: TvGridHeader(
          title: shows ? l.browseKindShow : l.browseKindMovie,
          detail: pages.total == null ? null : l.browseTitleCount(pages.total!),
          controls: [
            TvButton(
              label: sortLabel,
              icon: Lucide.arrowUpDown,
              trailingIcon: Lucide.chevronDown,
              rest: onPicture,
              focusNode: _memory.node(_controls, 'sort'),
              onPressed: _pickSort,
            ),
            TvButton(
              label: _genre ?? l.libraryAnyGenre,
              icon: Lucide.listFilter,
              trailingIcon: Lucide.chevronDown,
              active: _genre != null,
              rest: _genre == null ? onPicture : null,
              focusNode: _memory.node(_controls, 'genre'),
              onPressed: _pickGenre,
            ),
            SizedBox(
              width: 300,
              child: TvSearchField(
                controller: _query,
                placeholder: shows
                    ? l.librarySearchShows
                    : l.librarySearchMovies,
                clearLabel: l.libraryClearSearch,
                rest: onPicture,
                focusNode: _memory.node(_controls, 'search'),
                onChanged: _typed,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A genre's or a studio's titles from every library, with a choice of kind.
class TvBrowseScreen extends ConsumerStatefulWidget {
  const TvBrowseScreen({super.key, this.genre, this.studio});

  final String? genre;
  final String? studio;

  @override
  ConsumerState<TvBrowseScreen> createState() => _TvBrowseScreenState();
}

class _TvBrowseScreenState extends ConsumerState<TvBrowseScreen> {
  final _memory = TvFocusMemory();
  String? _kind;
  FocusedItem? _focused;

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final genre = widget.genre;
    final studio = widget.studio;
    final request = TitleListRequest(
      kind: _kind,
      genre: genre,
      studio: studio,
      sort: TitleSort.name,
      filters: ListFilters.none,
    );
    final pages = ref.watch(titlePagesProvider(request));
    _memory.restore(context, () {
      final now = ref.read(titlePagesProvider(request));
      if (now.items.firstOrNull case final first?) {
        return (TvGrid.row, first.id);
      }
      return now.done || now.error != null ? (_controls, _kind ?? 'all') : null;
    });
    final kinds = [
      (null, l.browseKindAll, Lucide.libraryBig),
      (TitleKind.movie, l.browseKindMovie, Lucide.film),
      (TitleKind.show, l.browseKindShow, Lucide.tv),
    ];
    return TvBackdrop(
      sources: _focused?.backdrop ?? const [],
      child: TvTitleGrid(
        request: request,
        memory: _memory,
        empty: genre != null ? l.browseGenreEmpty : l.browseStudioEmpty,
        focused: _focused,
        onFocus: (title) => setState(
          () =>
              _focused = titleInfo(title, l, kind: _kind == null, genres: true),
        ),
        scrollKey: _kind,
        header: TvGridHeader(
          title: genre ?? studio ?? '',
          detail: [
            genre != null ? l.browseGenre : l.browseStudio,
            if (pages.total case final total?) l.browseTitleCount(total),
          ].join('  ·  '),
          controls: [
            for (final (value, label, icon) in kinds)
              TvButton(
                label: label,
                icon: icon,
                active: _kind == value,
                rest: _kind == value
                    ? null
                    : TvFocus.restOnPicture(MatineeTheme.of(context)),
                focusNode: _memory.node(_controls, value ?? 'all'),
                onPressed: () => setState(() {
                  _kind = value;
                  _focused = null;
                }),
              ),
          ],
        ),
      ),
    );
  }
}

/// Above the focused card in a page of rows under a header: the list's top
/// padding, a row's heading, and the gap under it.
const _rowPivot = 8 + TvCards.titleHeight + TvCards.titleGap;
const _posterHeight = TvCards.posterWidth * 1.5;

/// Everything the person marked a favorite, a row of each kind.
class TvFavoritesScreen extends ConsumerStatefulWidget {
  const TvFavoritesScreen({super.key});

  @override
  ConsumerState<TvFavoritesScreen> createState() => _TvFavoritesScreenState();
}

abstract final class _Fav {
  static const shows = 'shows';
  static const seasons = 'seasons';
  static const episodes = 'episodes';
  static const movies = 'movies';
  static const empty = 'empty';
  static String season(FavoriteSeason entry) =>
      '${entry.title.id}/${entry.season.number}';
}

class _TvFavoritesScreenState extends ConsumerState<TvFavoritesScreen> {
  final _memory = TvFocusMemory();
  FocusedItem? _focused;

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  void _focus(FocusedItem item) => setState(() => _focused = item);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final username = tvUsername(ref);
    final provider = favoritesProvider(username);
    ref.listen(mediaChangesProvider, (_, _) => ref.invalidate(provider));
    final load = ref.watch(provider);
    final lists = load.value;
    _memory.restore(context, () {
      final now = ref.read(provider);
      final loaded = now.value;
      if (loaded == null) return now.hasError ? (_Fav.empty, _Fav.empty) : null;
      if (loaded.shows.firstOrNull case final first?) {
        return (_Fav.shows, first.id);
      }
      if (loaded.seasons.firstOrNull case final first?) {
        return (_Fav.seasons, _Fav.season(first));
      }
      if (loaded.episodes.firstOrNull case final first?) {
        return (_Fav.episodes, first.id);
      }
      if (loaded.movies.firstOrNull case final first?) {
        return (_Fav.movies, first.id);
      }
      return (_Fav.empty, _Fav.empty);
    });

    Widget titleRow(String key, String heading, List<TitleSummary> titles) =>
        TvRow(
          title: heading,
          row: key,
          memory: _memory,
          height: _posterHeight,
          itemCount: titles.length,
          itemBuilder: (context, index) {
            final title = titles[index];
            return TvPosterCard(
              name: title.name,
              poster: title.images.poster,
              watched: title.watched,
              focusNode: _memory.node(key, title.id),
              onPressed: () => context.push(Routes.title(title.id)),
              onLongPress: () => showTvActions(context, TitleActions(title)),
              onFocused: () => _focus(titleInfo(title, l)),
            );
          },
        );

    final Widget body;
    if (lists == null && load.hasError) {
      body = _Notice(
        headline: l.favoritesLoadFailed,
        detail: describeFailure(l, load.error!),
        icon: Lucide.refreshCw,
        action: l.commonRetry,
        focusNode: _memory.node(_Fav.empty, _Fav.empty),
        onAction: () => ref.invalidate(provider),
      );
    } else if (lists == null) {
      body = const TvLoading(top: 48);
    } else if (lists.isEmpty) {
      body = _Notice(
        headline: l.favoritesEmpty,
        detail: l.tvFavoritesEmptyHint,
        icon: Lucide.house,
        glyph: Lucide.heart,
        action: l.tabHome,
        focusNode: _memory.node(_Fav.empty, _Fav.empty),
        onAction: () => context.go(Routes.home),
      );
    } else {
      body = TvPinnedList(
        pivot: _rowPivot,
        top: 8,
        fade: 8,
        children: [
          if (lists.shows.isNotEmpty)
            titleRow(_Fav.shows, l.favoritesShows, lists.shows),
          if (lists.seasons.isNotEmpty)
            TvRow(
              title: l.favoritesSeasons,
              row: _Fav.seasons,
              memory: _memory,
              height: _posterHeight,
              itemCount: lists.seasons.length,
              itemBuilder: (context, index) {
                final entry = lists.seasons[index];
                final FavoriteSeason(:title, :season) = entry;
                return TvPosterCard(
                  name: l.titleSeasonOf(
                    title.name,
                    seasonName(season.number, l),
                  ),
                  poster: season.poster ?? title.images.poster,
                  watched:
                      season.itemCount > 0 &&
                      season.watchedCount >= season.itemCount,
                  focusNode: _memory.node(_Fav.seasons, _Fav.season(entry)),
                  onPressed: () =>
                      context.push(seasonRoute(title.id, season.number)),
                  onLongPress: () =>
                      showTvActions(context, SeasonActions(title, season)),
                  onFocused: () => _focus(seasonInfo(title, season, l)),
                );
              },
            ),
          if (lists.episodes.isNotEmpty)
            TvRow(
              title: l.favoritesEpisodes,
              row: _Fav.episodes,
              memory: _memory,
              height: tvLandscapeHeight,
              itemCount: lists.episodes.length,
              itemBuilder: (context, index) => _ItemCard(
                item: lists.episodes[index],
                row: _Fav.episodes,
                memory: _memory,
                onFocus: _focus,
              ),
            ),
          if (lists.movies.isNotEmpty)
            titleRow(_Fav.movies, l.favoritesMovies, lists.movies),
        ],
      );
    }
    final focused = _focused;
    return ReturnWatcher(
      path: Routes.favorites,
      onReturn: () => ref.invalidate(provider),
      child: TvBackdrop(
        sources: focused?.backdrop ?? const [],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                TvPage.start,
                Overscan.vertical + 6,
                TvPage.end,
                0,
              ),
              child: SizedBox(
                height: 150,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l.favoritesTitle,
                      maxLines: 1,
                      style: TvType.headline.style(color: colors.foreground),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 14, right: 120),
                      child: TvFocusLine(focused),
                    ),
                    if (focused?.overview case final overview?)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 600),
                          child: Text(
                            overview,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TvType.body.style(
                              color: colors.foreground.withValues(alpha: .75),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Expanded(child: body),
          ],
        ),
      ),
    );
  }
}

/// The username of who's signed in, for the profile reads.
String tvUsername(WidgetRef ref) => switch (ref.watch(authStateProvider)) {
  SignedIn(:final user) || Offline(:final user) => user.username,
  _ => '',
};

/// A file as a landscape card, for an episode in a row: the show's name,
/// then the episode and the time left.
class _ItemCard extends StatelessWidget {
  const _ItemCard({
    required this.item,
    required this.row,
    required this.memory,
    required this.onFocus,
  });

  final MediaItem item;
  final String row;
  final TvFocusMemory memory;
  final ValueChanged<FocusedItem> onFocus;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    final left = item.progress?.completed == false ? timeLeft(item, l) : null;
    final detail = [?code, ?(left ?? (code == null ? names.year : null))];
    return TvLandscapeCard(
      toneKey: names.showName,
      art: landscapeSources(item),
      caption: names.showName,
      detail: detail.isEmpty ? null : detail.join(' · '),
      progress: progressRatio(item),
      watched: isWatched(item),
      focusNode: memory.node(row, item.id),
      onPressed: () => context.push(itemRoute(item)),
      onLongPress: () => showTvActions(context, ItemActions(item)),
      onFocused: () => onFocus(itemInfo(item, l)),
    );
  }
}

/// Why a page of rows has none, with the one thing to do about it.
class _Notice extends StatelessWidget {
  const _Notice({
    required this.headline,
    required this.detail,
    required this.icon,
    required this.action,
    required this.focusNode,
    required this.onAction,
    this.glyph,
  });

  final String headline;
  final String? detail;
  final String icon;
  final String action;
  final FocusNode focusNode;
  final VoidCallback onAction;
  final String? glyph;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(TvPage.start, 24, TvPage.end, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (glyph case final name?)
            KitIcon(name, size: 40, color: colors.mutedForeground),
          Padding(
            padding: EdgeInsets.only(top: glyph != null ? 18 : 0),
            child: Text(
              headline,
              style: TvType.headline.style(color: colors.foreground),
            ),
          ),
          if (detail case final text?)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: Text(
                  text,
                  style: TvType.body.style(color: colors.mutedForeground),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 28),
            child: TvButton(
              label: action,
              icon: icon,
              focusNode: focusNode,
              onPressed: onAction,
            ),
          ),
        ],
      ),
    );
  }
}

abstract final class _Search {
  static const field = 'field';
  static const people = 'people';
  static const genres = 'genres';
  static const studios = 'studios';
  static const catalog = 'catalog';
  static String library(String id) => 'lib-$id';
}

/// Search on a TV: the field at the top, and the matches under it, a row for
/// each library's titles, then the people, genres, and studios.
class TvSearchScreen extends ConsumerStatefulWidget {
  const TvSearchScreen({super.key});

  @override
  ConsumerState<TvSearchScreen> createState() => _TvSearchScreenState();
}

class _TvSearchScreenState extends ConsumerState<TvSearchScreen> {
  final _memory = TvFocusMemory();
  final _query = TextEditingController();
  Timer? _pause;
  String _text = '';
  SearchResults? _last;
  FocusedItem? _focused;
  FocusNode? _firstResult;

  @override
  void dispose() {
    _memory.dispose();
    _query.dispose();
    _pause?.cancel();
    super.dispose();
  }

  void _typed(String text) {
    _pause?.cancel();
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      setState(() {
        _text = '';
        _focused = null;
      });
      return;
    }
    _pause = Timer(searchDebounce, () {
      if (mounted) setState(() => _text = trimmed);
    });
  }

  void _focus(FocusedItem item) => setState(() => _focused = item);

  /// Down from the field goes to the first result, not to whichever card
  /// sits under it.
  KeyEventResult _fieldKey(FocusNode node, KeyEvent event) {
    final first = _firstResult;
    if (event.logicalKey != LogicalKeyboardKey.arrowDown ||
        first == null ||
        first.context == null) {
      return KeyEventResult.ignored;
    }
    final field = _memory.node(_Search.field, _Search.field);
    if (!field.hasPrimaryFocus) return KeyEventResult.ignored;
    if (event is KeyDownEvent) first.requestFocus();
    return KeyEventResult.handled;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    _memory.restore(context, () => (_Search.field, _Search.field));
    final text = _text;
    final load = text.isEmpty ? null : ref.watch(searchProvider(text));
    if (load?.value case final value?) _last = value;
    final searching = load != null && load.isLoading;
    final found = text.isEmpty ? null : (load?.value ?? _last);
    final names = {
      for (final library
          in ref.watch(librariesProvider).value ?? const <Library>[])
        library.id: library.name,
    };
    _firstResult = null;

    // The catalog's "Not here yet", which loads on its own: the titles the
    // viewer may ask for, none while requests are off.
    final catalog = text.isEmpty
        ? null
        : ref.watch(catalogSearchProvider(text));
    final page = catalog?.value;
    final catalogFailed =
        catalog != null &&
        page == null &&
        catalog.hasError &&
        !catalog.isLoading;
    final notHere = page == null
        ? null
        : askable(page.items, (item) => item.availability);
    final catalogPending = catalog != null && notHere == null && !catalogFailed;

    Widget body;
    if (text.isEmpty) {
      body = const SizedBox.shrink();
    } else if (load != null && load.hasError && !load.hasValue) {
      body = _Hint(headline: l.searchFailed);
    } else if (found == null) {
      body = const TvLoading(top: 48);
    } else if (found.isEmpty && !catalogPending && (notHere?.isEmpty ?? true)) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Hint(headline: l.searchNoMatch(text), detail: l.searchNoMatchHint),
          if (catalogFailed)
            Padding(
              padding: const EdgeInsets.only(top: 28),
              child: _catalogRow(l, text, catalog, notHere),
            ),
        ],
      );
    } else {
      final groups = found.titlesByLibrary.entries.toList();
      final firstGroup = groups.firstOrNull;
      if (firstGroup != null) {
        _firstResult = _memory.node(
          _Search.library(firstGroup.key),
          firstGroup.value.first.id,
        );
      } else if (notHere?.firstOrNull case final first?) {
        _firstResult = _memory.node(_Search.catalog, refKey(first.ref));
      }
      body = TvPinnedList(
        pivot: _rowPivot,
        top: 8,
        fade: 8,
        children: [
          for (final MapEntry(key: libraryId, value: titles) in groups)
            TvRow(
              title:
                  '${names[libraryId] ?? l.searchTitlesHeading}  ·  '
                  '${l.browseTitleCount(titles.length)}',
              row: _Search.library(libraryId),
              memory: _memory,
              height: _posterHeight,
              itemCount: titles.length,
              itemBuilder: (context, index) {
                final title = titles[index];
                return TvPosterCard(
                  name: title.name,
                  poster: title.images.poster,
                  watched: title.watched,
                  focusNode: _memory.node(_Search.library(libraryId), title.id),
                  onPressed: () => context.push(Routes.title(title.id)),
                  onFocused: () => _focus(titleInfo(title, l)),
                );
              },
            ),
          if (found.people.isNotEmpty)
            TvRow(
              title: l.searchSectionCast,
              row: _Search.people,
              memory: _memory,
              height: tvPersonHeight,
              itemCount: found.people.length,
              itemBuilder: (context, index) {
                final person = found.people[index];
                return Focus(
                  canRequestFocus: false,
                  skipTraversal: true,
                  onFocusChange: (focused) {
                    if (!focused) return;
                    _focus(
                      FocusedItem(
                        name: person.name,
                        facts: [
                          creditKind(person.kind, l),
                          l.browseTitleCount(person.titleCount),
                        ],
                      ),
                    );
                  },
                  child: TvPersonCard(
                    person: (
                      name: person.name,
                      role: null,
                      photo: person.photo,
                      tmdbId: null,
                    ),
                    focusNode: _memory.node(_Search.people, person.name),
                    onPressed: () => context.push(Routes.person(person.name)),
                  ),
                );
              },
            ),
          ?_facetRow(
            _Search.genres,
            l.searchSectionGenres,
            found.genres,
            (facet) => Routes.browse(genre: facet.name),
          ),
          ?_facetRow(
            _Search.studios,
            l.searchSectionStudios,
            found.studios,
            (facet) => Routes.browse(studio: facet.name),
          ),
          if (catalog != null && (notHere?.isNotEmpty ?? true))
            _catalogRow(l, text, catalog, notHere),
        ],
      );
    }
    final focused = text.isEmpty ? null : _focused;
    body = FollowTitles(
      titles: FollowedTitles([
        for (final item in notHere ?? const <CatalogTitleSummary>[])
          CatalogInput(ref: item.ref),
      ]),
      child: body,
    );
    return TvBackdrop(
      sources: focused?.backdrop ?? const [],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: TvPage.start,
              end: TvPage.end + TvGrid.clockRoom,
              top: Overscan.vertical,
            ),
            child: Row(
              spacing: 20,
              children: [
                Flexible(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 640),
                    child: Focus(
                      canRequestFocus: false,
                      skipTraversal: true,
                      onKeyEvent: _fieldKey,
                      child: TvSearchField(
                        controller: _query,
                        placeholder: l.searchField,
                        clearLabel: l.searchClear,
                        focusNode: _memory.node(_Search.field, _Search.field),
                        onChanged: _typed,
                        rest: TvFocus.restOnPicture(MatineeTheme.of(context)),
                        height: 56,
                        textStyle: TvType.title.style(),
                      ),
                    ),
                  ),
                ),
                if (searching && _last != null)
                  Text(
                    l.searchSearching,
                    style: TvType.caption.style(color: colors.mutedForeground),
                  ),
              ],
            ),
          ),
          if (text.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                TvPage.start,
                16,
                TvPage.end,
                0,
              ),
              child: TvFocusLine(focused),
            ),
          Expanded(child: body),
        ],
      ),
    );
  }

  /// "Not here yet", last: the catalog's titles, a spinner while they
  /// load, or why they didn't, with Try again. Its cards open the
  /// catalog's page.
  Widget _catalogRow(
    AppLocalizations l,
    String text,
    AsyncValue<CatalogPage>? catalog,
    List<CatalogTitleSummary>? items,
  ) {
    final heading = l.webCatalogNotHere;
    if (items == null) {
      if (catalog != null && catalog.hasError && !catalog.isLoading) {
        return TvRowNotice(
          title: heading,
          headline: l.catalogSearchFailed,
          message: describeFailure(l, catalog.error!),
          onRetry: () => ref.invalidate(catalogSearchProvider(text)),
          retryNode: _memory.node(_Search.catalog, TvRowNotice.retryKey),
          height: _posterHeight,
        );
      }
      return TvRowNotice(title: heading, height: _posterHeight);
    }
    return TvRow(
      title: '$heading  ·  ${l.browseTitleCount(items.length)}',
      row: _Search.catalog,
      memory: _memory,
      height: _posterHeight,
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return TvCatalogPoster.summary(
          item,
          key: ValueKey(refKey(item.ref)),
          focusNode: _memory.node(_Search.catalog, refKey(item.ref)),
          onFocus: _focus,
        );
      },
    );
  }

  Widget? _facetRow(
    String key,
    String heading,
    List<Facet> facets,
    String Function(Facet facet) route,
  ) {
    if (facets.isEmpty) return null;
    final l = AppLocalizations.of(context);
    return TvRow(
      title: heading,
      row: key,
      memory: _memory,
      height: TvButtons.height,
      itemCount: facets.length,
      itemBuilder: (context, index) {
        final facet = facets[index];
        return Focus(
          canRequestFocus: false,
          skipTraversal: true,
          onFocusChange: (focused) {
            if (focused) {
              _focus(
                FocusedItem(
                  name: facet.name,
                  facts: [l.browseTitleCount(facet.titleCount)],
                ),
              );
            }
          },
          child: TvButton(
            label: facet.name,
            focusNode: _memory.node(key, facet.name),
            onPressed: () => context.push(route(facet)),
          ),
        );
      },
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.headline, this.detail});

  final String headline;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(TvPage.start, 40, TvPage.end, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            headline,
            style: TvType.title.style(
              color: colors.foreground.withValues(alpha: .9),
            ),
          ),
          if (detail case final text?)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                text,
                style: TvType.body.style(color: colors.mutedForeground),
              ),
            ),
        ],
      ),
    );
  }
}
