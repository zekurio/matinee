import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../home/home_data.dart';
import '../home/home_layout.dart';
import 'tv_actions.dart';
import 'tv_media.dart';
import 'tv_shell.dart';

/// The header's room above the rows, so the rows start in the same place
/// whatever it says.
const _headerHeight = 226.0;

/// The header's room under the overscan.
const _headerBody = _headerHeight - Overscan.vertical - 8;

/// Above the focused card in the rows: the list's top padding, a row's
/// heading, and the gap under it.
const _rowPivot = 12 + TvCards.titleHeight + TvCards.titleGap;

const _posterHeight = TvCards.posterWidth * 1.5;

/// A row of posters under its heading, as tall as its posters, so the rows
/// under one still loading stay put when it comes.
const _shelfHeight = _posterHeight + 4;
const _noticeHeight = 96.0;

const _logoWidth = 360.0;
const _logoHeight = 70.0;
const _nameLine = 40.0;

/// Between a logo and the episode line under it, so the two don't touch.
const _subtitleGap = 10.0;
const _subtitleHeight = _subtitleGap + 26;
const _factsHeight = 32.0;
const _overviewLine = 24.0;

/// Fetch again on return after this long, when nothing asked sooner.
const _refreshAfter = Duration(seconds: 30);
const _recommendationsAfter = Duration(minutes: 10);

abstract final class _Rows {
  static const featured = 'featured';
  static const resume = 'continue';
  static const nextUp = 'nextUp';
  static String shelf(Library library) => 'shelf-${library.id}';
  static String recommended(HomeRecommendationRail rail) =>
      'recommended-${rail.id}-${rail.seed?.ref.providerId ?? ''}';
}

/// Home on a TV, as Wholphin's: the focused card's backdrop behind the page,
/// its name, facts, and overview in a header at the top, and Home's rows under
/// it, the phone's rows in the phone's order from the same reads. The focused
/// row scrolls to the same place under the header.
class TvHomeScreen extends ConsumerStatefulWidget {
  const TvHomeScreen({super.key});

  @override
  ConsumerState<TvHomeScreen> createState() => _TvHomeScreenState();
}

class _TvHomeScreenState extends ConsumerState<TvHomeScreen> {
  final _memory = TvFocusMemory();
  final _scroll = ScrollController();
  FocusedItem? _focused;
  var _fetched = DateTime.now();
  var _recommended = DateTime.now();

  /// The featured titles on screen. The server picks others each time it's
  /// asked, and Home asks again whenever something is watched; a row that
  /// changed under the person would lose the card focus was on, so a new
  /// pick waits in [_pending] until the row is out of sight.
  List<FeaturedTitle>? _featured;
  List<FeaturedTitle>? _pending;

  /// Each row's first card, and the rows' order, for focus the first time.
  final _firsts = <String, String>{};
  var _order = const <String>[];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeSwap);
  }

  @override
  void dispose() {
    _memory.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _offer(List<FeaturedTitle> next) {
    final shown = _featured;
    if (shown == null) {
      _featured = next;
    } else if (!_sameTitles(shown, next)) {
      _pending = next;
    }
  }

  static bool _sameTitles(List<FeaturedTitle> a, List<FeaturedTitle> b) =>
      a.length == b.length &&
      [for (var i = 0; i < a.length; i++) a[i].title.id == b[i].title.id]
          .every((same) => same);

  void _maybeSwap() {
    if (_pending == null || _memory.lastRow == _Rows.featured) return;
    if (!_scroll.hasClients || _scroll.offset < _shelfHeight + 60) return;
    setState(() {
      _featured = _pending;
      _pending = null;
    });
  }

  void _returned() {
    final now = DateTime.now();
    if (now.difference(_fetched) >= _refreshAfter) {
      _fetched = now;
      ref
        ..invalidate(librariesProvider)
        ..invalidate(continueWatchingProvider)
        ..invalidate(nextUpProvider)
        ..invalidate(shelfProvider);
    }
    if (now.difference(_recommended) >= _recommendationsAfter ||
        ref.read(recommendationsProvider).hasError) {
      _recommended = now;
      ref.invalidate(recommendationsProvider);
    }
    if (ref.read(featuredProvider).hasError) ref.invalidate(featuredProvider);
  }

  void _retryAll() {
    _fetched = _recommended = DateTime.now();
    ref
      ..invalidate(librariesProvider)
      ..invalidate(continueWatchingProvider)
      ..invalidate(nextUpProvider)
      ..invalidate(featuredProvider)
      ..invalidate(recommendationsProvider)
      ..invalidate(shelfProvider);
  }

  void _changed() {
    _fetched = DateTime.now();
    ref
      ..invalidate(continueWatchingProvider)
      ..invalidate(nextUpProvider)
      ..invalidate(recommendationsProvider)
      ..invalidate(shelfProvider)
      ..invalidate(featuredProvider);
  }

  void _focus(FocusedItem item) {
    if (identical(item, _focused)) return;
    setState(() => _focused = item);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _changed());
    final libraries = ref.watch(librariesProvider);
    final resume = ref.watch(continueWatchingProvider);
    final nextUp = ref.watch(nextUpProvider);
    final featuredLoad = ref.watch(featuredProvider);
    final recommendations = ref.watch(recommendationsProvider);
    if (featuredLoad.value case final loaded?) _offer(loaded);

    _memory.restore(context, () {
      // The rows above the libraries show only once loaded, so wait for
      // them: focus taken sooner would sit in a row they then push down.
      if ([
        featuredLoad,
        resume,
        nextUp,
      ].any((load) => load.isLoading && !load.hasValue)) {
        return null;
      }
      // The row focus was in last comes first, for when its card is gone.
      for (final row in [?_memory.lastRow, ..._order]) {
        if (_firsts[row] case final first?) return (row, first);
      }
      return null;
    });

    Widget page;
    if (failedOutright(libraries, [resume, nextUp, featuredLoad])) {
      page = _Message(
        title: l.homeFailed,
        message: libraries.error == null
            ? null
            : describeFailure(l, libraries.error!),
        onRetry: _retryAll,
      );
    } else {
      final libs = libraries.value;
      final featured = _featured;
      final rails =
          recommendations.value?.rails ?? const <HomeRecommendationRail>[];
      final rows = <(String, Widget)>[
        if (featured != null && featured.isNotEmpty)
          (_Rows.featured, _featuredRow(l, featured)),
        ?_itemRow(
          _Rows.resume,
          l.browseContinueWatching,
          l.homeContinueFailed,
          resume,
          () => ref.invalidate(continueWatchingProvider),
        ),
        ?_itemRow(
          _Rows.nextUp,
          l.browseNextUp,
          l.homeNextUpFailed,
          nextUp,
          () => ref.invalidate(nextUpProvider),
        ),
        for (final rail in rails)
          if (rail.items.isNotEmpty)
            (_Rows.recommended(rail), _recommendedRow(l, rail)),
        if (libs == null && libraries.hasError)
          (
            'libraries-failed',
            _RowNotice(
              headline: l.homeLoadFailed,
              message: describeFailure(l, libraries.error!),
              onRetry: () => ref.invalidate(librariesProvider),
            ),
          )
        else if (libs == null)
          ('loading', const TvLoading(top: 32))
        else if (libs.isEmpty)
          ('empty', const _NoLibraries())
        else
          for (final library in libs)
            (
              _Rows.shelf(library),
              _ShelfRow(
                key: ValueKey(library.id),
                library: library,
                memory: _memory,
                firsts: _firsts,
                onFocus: _focus,
              ),
            ),
      ];
      _order = [for (final (key, _) in rows) key];
      for (final key in _firsts.keys.toList()) {
        if (!_order.contains(key)) _firsts.remove(key);
      }
      page = Stack(
        fit: StackFit.expand,
        children: [
          Positioned(
            left: TvPage.start,
            right: 220,
            top: Overscan.vertical + 8,
            height: _headerBody,
            child: _Header(item: _focused),
          ),
          Padding(
            padding: const EdgeInsets.only(top: _headerHeight),
            child: TvPinnedList(
              controller: _scroll,
              pivot: _rowPivot,
              fade: 12,
              children: [
                for (final (key, row) in rows)
                  KeyedSubtree(key: ValueKey(key), child: row),
              ],
            ),
          ),
        ],
      );
    }
    return ReturnWatcher(
      path: Routes.home,
      onReturn: _returned,
      child: TvBackdrop(sources: _focused?.backdrop ?? const [], child: page),
    );
  }

  Widget _featuredRow(AppLocalizations l, List<FeaturedTitle> slides) {
    _firsts[_Rows.featured] = slides.first.title.id;
    return TvRow(
      title: l.tvHomeFeatured,
      row: _Rows.featured,
      memory: _memory,
      height: _posterHeight,
      itemCount: slides.length,
      itemBuilder: (context, index) {
        final slide = slides[index];
        final title = slide.title;
        return TvPosterCard(
          name: title.name,
          poster: title.images.poster,
          watched: title.watched,
          focusNode: _memory.node(_Rows.featured, title.id),
          onPressed: () => context.push(Routes.title(title.id)),
          onLongPress: () => showTvActions(context, TitleActions(title)),
          onFocused: () => _focus(featuredInfo(slide, l)),
        );
      },
    );
  }

  /// Continue watching or Next up: nothing while loading or empty, as on
  /// the phone; a notice when it failed.
  (String, Widget)? _itemRow(
    String key,
    String title,
    String failed,
    AsyncValue<List<MediaItem>> load,
    VoidCallback retry,
  ) {
    final items = load.value;
    if (items == null) {
      if (!load.hasError) return null;
      final l = AppLocalizations.of(context);
      return (
        key,
        _RowNotice(
          title: title,
          headline: failed,
          message: describeFailure(l, load.error!),
          onRetry: retry,
          retryNode: _memory.node(key, _RowNotice.retryKey),
        ),
      );
    }
    if (items.isEmpty) {
      _firsts.remove(key);
      return null;
    }
    _firsts[key] = items.first.id;
    return (
      key,
      TvRow(
        title: title,
        row: key,
        memory: _memory,
        height: tvLandscapeHeight,
        itemCount: items.length,
        itemBuilder: (context, index) {
          final l = AppLocalizations.of(context);
          final item = items[index];
          final names = itemNames(item, l);
          final code = episodeCode(item, l);
          final left = item.progress?.completed == false
              ? timeLeft(item, l)
              : null;
          final detail = [?code, ?(left ?? (code == null ? names.year : null))];
          return TvLandscapeCard(
            toneKey: names.showName,
            art: landscapeSources(item),
            caption: names.showName,
            detail: detail.isEmpty ? null : detail.join(' · '),
            progress: progressRatio(item),
            watched: isWatched(item),
            focusNode: _memory.node(key, item.id),
            onPressed: () => context.push(itemRoute(item)),
            onLongPress: () => showTvActions(context, ItemActions(item)),
            onFocused: () => _focus(itemInfo(item, l)),
          );
        },
      ),
    );
  }

  Widget _recommendedRow(AppLocalizations l, HomeRecommendationRail rail) {
    final key = _Rows.recommended(rail);
    final items = rail.items;
    _firsts[key] = items.first.title.id;
    return TvRow(
      title: rail.id == RecommendationRailId.becauseWatched
          ? l.webDiscoverRailBecauseWatched(rail.seed?.name ?? '')
          : l.webDiscoverRailForYou,
      row: key,
      memory: _memory,
      height: _posterHeight,
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        final title = item.title;
        return TvPosterCard(
          name: title.name,
          poster: title.images.poster,
          watched: title.watched,
          focusNode: _memory.node(key, title.id),
          onPressed: () => context.push(Routes.title(title.id)),
          onLongPress: () => showTvActions(
            context,
            TitleActions(title, recommended: item.ref),
          ),
          onFocused: () => _focus(titleInfo(title, l)),
        );
      },
    );
  }
}

/// What a shelf's card says and opens: a movie its year, a show its count
/// of episodes, or what's new, opening the one new episode or the season
/// that got them, as the phone's `ShelfCard`.
({Artwork? poster, String? detail, String route}) _shelfCard(
  ShelfEntry entry,
  AppLocalizations l,
) {
  final title = entry.title;
  final added = entry.added;
  final own = Routes.title(title.id);
  if (title.kind == TitleKind.movie) {
    return (
      poster: title.images.poster,
      detail: title.year?.toString(),
      route: own,
    );
  }
  if (added == null) {
    return (
      poster: title.images.poster,
      detail: l.mediaEpisodeCount(entry.count),
      route: own,
    );
  }
  final poster = added.season?.poster ?? title.images.poster;
  if (added.count == 1) {
    final code = episodeCode(added.item, l);
    final name = itemNames(added.item, l).title;
    return (
      poster: poster,
      detail: code == null ? name : l.mediaCodeTitle(code, name),
      route: Routes.episode(added.item.id),
    );
  }
  final fresh = l.mediaNewEpisodes(added.count);
  final number = added.season?.number;
  return (
    poster: poster,
    detail: added.season == null ? fresh : '${seasonName(number, l)} · $fresh',
    route: number == null ? own : Routes.season(title.id, number),
  );
}

/// A library's newest titles as posters, or why there are none.
class _ShelfRow extends ConsumerWidget {
  const _ShelfRow({
    super.key,
    required this.library,
    required this.memory,
    required this.firsts,
    required this.onFocus,
  });

  final Library library;
  final TvFocusMemory memory;
  final Map<String, String> firsts;
  final ValueChanged<FocusedItem> onFocus;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final key = _Rows.shelf(library);
    final title = l.browseRecentlyAdded(library.name);
    final load = ref.watch(shelfProvider(library.id));
    final entries = load.value;
    if (entries == null || entries.isEmpty) {
      firsts.remove(key);
      if (entries == null && load.hasError) {
        return _RowNotice(
          title: title,
          headline: l.homeShelfFailed,
          message: describeFailure(l, load.error!),
          onRetry: () => ref.invalidate(shelfProvider(library.id)),
          retryNode: memory.node(key, _RowNotice.retryKey),
          height: _shelfHeight,
        );
      }
      return _RowNotice(
        title: title,
        headline: entries == null ? null : l.browseEmptyShelf,
        height: _shelfHeight,
      );
    }
    firsts[key] = entries.first.title.id;
    return TvRow(
      title: title,
      row: key,
      memory: memory,
      height: _posterHeight,
      itemCount: entries.length,
      itemBuilder: (context, index) {
        final entry = entries[index];
        final card = _shelfCard(entry, l);
        return TvPosterCard(
          name: entry.title.name,
          poster: card.poster,
          watched: entry.title.watched,
          focusNode: memory.node(key, entry.title.id),
          onPressed: () => context.push(card.route),
          onLongPress: () => showTvActions(context, TitleActions(entry.title)),
          onFocused: () => onFocus(shelfInfo(entry, card.detail, l)),
        );
      },
    );
  }
}

/// The focused card's logo or name, facts, and overview, over the
/// backdrop. It fades from one card to the next. Its height is fixed, so
/// the overview takes what lines the rest leaves.
class _Header extends StatelessWidget {
  const _Header({required this.item});

  final FocusedItem? item;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
    duration: TvMotion.enter,
    reverseDuration: TvMotion.exit,
    layoutBuilder: (current, previous) =>
        Stack(alignment: Alignment.topLeft, children: [...previous, ?current]),
    child: item == null
        ? const SizedBox.shrink()
        : _HeaderBody(key: ValueKey(item), item: item!),
  );
}

class _HeaderBody extends StatelessWidget {
  const _HeaderBody({super.key, required this.item});

  final FocusedItem item;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final style = TvType.display.style(color: colors.foreground);
    return LayoutBuilder(
      builder: (context, constraints) {
        // How many lines the name takes, when there's no logo to show.
        final painter = TextPainter(
          text: TextSpan(text: item.name, style: style),
          maxLines: 2,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final nameLines = painter.computeLineMetrics().length.clamp(1, 2);
        painter.dispose();
        final name = _nameLine * nameLines;
        final mark = item.logo != null
            ? (name > _logoHeight ? name : _logoHeight)
            : name;
        final subtitle = item.subtitle != null ? _subtitleHeight : 0;
        final lines =
            ((_headerBody - mark - subtitle - _factsHeight - 12) /
                    _overviewLine)
                .floor()
                .clamp(0, item.subtitle != null ? 2 : 3);
        final nameText = Text(
          item.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: style,
        );
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            TvTitleLogo(
              name: item.name,
              logo: item.logo,
              width: _logoWidth,
              height: _logoHeight,
              alignment: Alignment.bottomLeft,
              fallback: nameText,
            ),
            if (item.subtitle case final text?)
              Padding(
                padding: const EdgeInsets.only(top: _subtitleGap),
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.title.style(
                    color: colors.foreground.withValues(alpha: .9),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: TvFacts(
                facts: item.facts,
                contentRating: item.contentRating,
                rating: item.rating,
              ),
            ),
            if (item.overview case final overview? when lines > 0)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 560),
                  child: Text(
                    overview,
                    maxLines: lines,
                    overflow: TextOverflow.ellipsis,
                    style: TvType.body.style(
                      color: colors.foreground.withValues(alpha: .75),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// A row that has no cards to show: its heading and why, with a way to try
/// again where there is one. Without [headline], a row still loading.
class _RowNotice extends StatelessWidget {
  const _RowNotice({
    this.title,
    this.headline,
    this.message,
    this.onRetry,
    this.retryNode,
    this.height = _noticeHeight,
  });

  /// The key of the Try again button's node in its row's memory, so the
  /// row's first card takes focus when it loads.
  static const retryKey = 'retry';

  final String? title;
  final String? headline;
  final String? message;
  final VoidCallback? onRetry;
  final FocusNode? retryNode;
  final double height;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final l = AppLocalizations.of(context);
    final headline = this.headline;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (title case final text?) TvRowTitle(text),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            TvPage.start,
            TvCards.titleGap,
            TvPage.end,
            0,
          ),
          child: SizedBox(
            height: height,
            child: Row(
              spacing: 20,
              children: [
                if (headline == null)
                  Spinner(size: 28, color: colors.mutedForeground)
                else ...[
                  Flexible(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          headline,
                          style: TvType.body.style(
                            color: colors.foreground.withValues(alpha: .85),
                          ),
                        ),
                        if (message case final text?)
                          Text(
                            text,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TvType.caption.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (onRetry case final retry?)
                    TvButton(
                      label: l.commonRetry,
                      icon: Lucide.refreshCw,
                      focusNode: retryNode,
                      onPressed: retry,
                    ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _NoLibraries extends ConsumerWidget {
  const _NoLibraries();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final admin = switch (ref.watch(authStateProvider)) {
      // Whoever may add one is shown how.
      SignedIn(:final user) => can(user, Permission.libraryCreate),
      _ => false,
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: TvPage.start),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            admin ? l.browseHomeNoLibraries : l.browseHomeNothingYet,
            style: TvType.headline.style(color: colors.foreground),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              admin
                  ? l.browseHomeNoLibrariesAdmin
                  : l.browseHomeNothingYetDescription,
              style: TvType.body.style(color: colors.mutedForeground),
            ),
          ),
        ],
      ),
    );
  }
}

/// A page as one message, when nothing on it loaded, with Retry focused.
class _Message extends StatelessWidget {
  const _Message({required this.title, this.message, required this.onRetry});

  final String title;
  final String? message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) =>
      TvPageMessage(title: title, message: message, onRetry: onRetry);
}

/// A TV page as one message, as when it failed to load, with Retry.
class TvPageMessage extends StatelessWidget {
  const TvPageMessage({
    super.key,
    required this.title,
    this.message,
    this.onRetry,
  });

  final String title;
  final String? message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final l = AppLocalizations.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: TvPage.start),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TvType.headline.style(color: colors.foreground)),
          if (message case final text?)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                text,
                style: TvType.body.style(color: colors.mutedForeground),
              ),
            ),
          if (onRetry case final retry?)
            Padding(
              padding: const EdgeInsets.only(top: 28),
              child: TvButton(
                label: l.commonRetry,
                icon: Lucide.refreshCw,
                autofocus: true,
                onPressed: retry,
              ),
            ),
        ],
      ),
    );
  }
}
