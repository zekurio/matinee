import 'dart:math' as math;

import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../api/matinee_api.dart';
import '../../core/device.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/avatar.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../profile/profile_data.dart';
import 'tv_actions.dart';
import 'tv_charts.dart';
import 'tv_media.dart';
import 'tv_sign_out.dart';

abstract final class _Rows {
  static const actions = 'actions';
  static const signOut = 'signOut';
  static const recent = 'recent';
  static const seeAll = 'seeAll';
  static const ranges = 'ranges';
  static const watchTime = 'watchTime';
  static const top = 'top';
  static const genres = 'genres';
  static const standing = 'standing';
  static const viewingTimes = 'viewingTimes';
}

/// A section on its way: a spinner centred in a row 96 high, as the
/// Kotlin app's `LoadingRow`.
class _LoadingRow extends StatelessWidget {
  const _LoadingRow();

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 96,
    child: Center(
      child: Spinner(size: 32, color: MatineeTheme.of(context).mutedForeground),
    ),
  );
}

/// The places a board lists at its top, before the person's own
/// neighbourhood, as the server sends them.
const _topPlaces = 10;

/// A board's card in the leaderboard row, and a place's line on it.
const _boardWidth = 300.0;
const _placeHeight = 40.0;

/// The page keeps a focused row this far from its top and bottom edges.
const _edge = 56.0;

/// The signed-in person on a TV, from the drawer's top entry, as the
/// Kotlin app's `TvProfileScreen`: who they are, Sign out, what they
/// watched last as a row of cards, then their statistics for a range: watch
/// time over the range as bars, the other totals as large figures, their
/// most watched titles, their genres, where they stand on the leaderboard,
/// and when in the week they watch. A board opens whole in the panel.
class TvProfileScreen extends ConsumerStatefulWidget {
  const TvProfileScreen({super.key});

  @override
  ConsumerState<TvProfileScreen> createState() => _TvProfileScreenState();
}

class _TvProfileScreenState extends ConsumerState<TvProfileScreen> {
  final _memory = TvFocusMemory();
  final _scroll = ScrollController();
  String _range = StatsRange.allValue;

  /// The last range's figures and boards, kept while the next range loads
  /// so the rows don't drop out from under focus.
  WatchStats? _lastStats;
  Leaderboard? _lastBoard;

  @override
  void dispose() {
    _memory.dispose();
    _scroll.dispose();
    super.dispose();
  }

  String? get _zone {
    final zone = ref.read(deviceProvider).timeZone;
    return zone.isEmpty ? null : zone;
  }

  StatsQuery _statsQuery(String username) =>
      (username: username, range: _range, timeZone: _zone);

  void _returned(String username) {
    ref
      ..invalidate(profileProvider(username))
      ..invalidate(statsProvider(_statsQuery(username)));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final user = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user,
      _ => null,
    };
    if (user == null) return const SizedBox.shrink();
    final username = user.username;
    ref.listen(mediaChangesProvider, (_, _) => _returned(username));
    final profile = ref.watch(profileProvider(username));
    final loaded = profile.value;
    // The first card they watched, rather than Sign out, once the profile
    // shows whether there is one.
    _memory.restore(context, () {
      final now = ref.read(profileProvider(username));
      if (now.value case final value?) {
        if (value.recent?.firstOrNull case final first?) {
          return (_Rows.recent, first.item.id);
        }
        return (_Rows.actions, _Rows.signOut);
      }
      return now.hasError ? (_Rows.actions, _Rows.signOut) : null;
    });

    // Into the ranges, the one picked rather than the chip under the card.
    _memory.startAt(_Rows.ranges, _range);

    final recent = [
      for (final entry in loaded?.recent ?? const <WatchedEntry>[]) entry.item,
    ];
    final sections = <Widget>[
      _Header(user: user, joined: loaded?.user.createdAt),
      TvMemoryRow(
        memory: _memory,
        row: _Rows.actions,
        child: Padding(
          padding: const EdgeInsetsDirectional.only(start: TvPage.start),
          child: Row(
            children: [
              TvButton(
                label: l.shellSignOut,
                icon: Lucide.logOut,
                focusNode: _memory.node(_Rows.actions, _Rows.signOut),
                onPressed: () => confirmTvSignOut(context, ref),
              ),
            ],
          ),
        ),
      ),
      if (loaded == null && profile.hasError)
        _Notice(
          title: l.profileLoadFailed,
          detail: describeFailure(l, profile.error!),
        )
      else if (loaded == null)
        const _LoadingRow()
      else if (recent.isNotEmpty)
        _recentRow(recent),
      ..._statistics(username),
    ];
    return ReturnWatcher(
      path: Routes.profile,
      onReturn: () => _returned(username),
      child: TvFollowFocus(
        controller: _scroll,
        rule: TvFollowFocus.clear(start: _edge, end: _edge),
        // The gap between its sections.
        sectionTop: 32,
        // Half a screen under the last section, so it can come up to the
        // top rather than stop with the one above it cut.
        child: LayoutBuilder(
          builder: (context, constraints) => ListView.separated(
            controller: _scroll,
            clipBehavior: Clip.none,
            // Its few sections all laid out, so a move up knows where the
            // one above starts.
            scrollCacheExtent: const ScrollCacheExtent.pixels(2400),
            padding: EdgeInsets.only(
              top: Overscan.vertical + 8,
              bottom: math.max(120, constraints.maxHeight / 2),
            ),
            itemCount: sections.length,
            separatorBuilder: (_, _) => const SizedBox(height: 32),
            itemBuilder: (context, index) => sections[index],
          ),
        ),
      ),
    );
  }

  /// The last files watched, a card each that opens its page, and a card
  /// for the whole list.
  Widget _recentRow(List<MediaItem> items) {
    final l = AppLocalizations.of(context);
    return TvRow(
      title: l.profileRecent,
      row: _Rows.recent,
      memory: _memory,
      height: tvLandscapeHeight,
      itemCount: items.length + 1,
      itemBuilder: (context, index) {
        if (index == items.length) return _SeeAll(memory: _memory);
        final item = items[index];
        return TvWatchedCard(
          item: item,
          focusNode: _memory.node(_Rows.recent, item.id),
        );
      },
    );
  }

  /// The heading and the ranges, then for the range picked the watch-time
  /// chart, the other totals, the most watched titles, the genres, the
  /// leaderboard, and the viewing times.
  List<Widget> _statistics(String username) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final query = _statsQuery(username);
    final result = ref.watch(statsProvider(query));
    if (result.value case final stats?) _lastStats = stats;
    final stats = result.value ?? (result.isLoading ? _lastStats : null);
    final neverWatched =
        stats != null &&
        _range == StatsRange.allValue &&
        stats.totals.plays == 0;
    final head = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(start: TvPage.start),
          child: Text(
            l.profileStatistics,
            style: TvType.headline.style(color: colors.foreground),
          ),
        ),
        // With nothing ever watched, picking a range changes nothing.
        if (!neverWatched)
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: TvPage.start,
              top: 18,
            ),
            child: TvMemoryRow(
              memory: _memory,
              row: _Rows.ranges,
              child: Row(
                spacing: 12,
                children: [
                  for (final range in StatsRange.all)
                    TvChip(
                      label: rangeName(range, l),
                      selected: range == _range,
                      focusNode: _memory.node(_Rows.ranges, range),
                      onPressed: () => setState(() => _range = range),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
    if (stats == null) {
      return [
        head,
        if (result.hasError && !result.isLoading)
          _Notice(
            title: l.profileStatsFailed,
            detail: describeFailure(l, result.error!),
          )
        else
          const _LoadingRow(),
      ];
    }
    if (neverWatched) {
      return [
        head,
        _Notice(title: l.profileSelfEmpty, detail: l.profileSelfEmptyHint),
      ];
    }
    if (stats.totals.plays == 0) {
      return [
        head,
        _Notice(title: l.profileNothingWatched(rangePhrase(_range, l))),
      ];
    }
    final boardLoad = ref.watch(
      leaderboardProvider((range: _range, timeZone: query.timeZone)),
    );
    if (boardLoad.value case final board?) _lastBoard = board;
    final boards = standings(boardLoad.value ?? _lastBoard);
    return [
      head,
      TvWatchTimeChart(
        stats: stats,
        focusNode: _memory.node(_Rows.watchTime, _Rows.watchTime),
      ),
      _Totals(stats: stats),
      if (stats.titles.isNotEmpty) _topRow(stats),
      if (stats.genres.isNotEmpty) _genresRow(stats),
      if (boards.isNotEmpty) _standingRow(boards),
      if (stats.activity.isNotEmpty)
        TvViewingTimes(
          stats: stats,
          focusNode: _memory.node(_Rows.viewingTimes, _Rows.viewingTimes),
        ),
    ];
  }

  /// The most watched titles as posters, each with how long under it.
  Widget _topRow(WatchStats stats) {
    final l = AppLocalizations.of(context);
    return TvRow(
      title: l.statsTop,
      row: _Rows.top,
      memory: _memory,
      height: tvCaptionedHeight(),
      itemCount: stats.titles.length,
      itemBuilder: (context, index) {
        final entry = stats.titles[index];
        final title = entry.title;
        return TvCaptionedPoster(
          name: title.name,
          poster: title.images.poster,
          detail: formatWatchTime(entry.watchSeconds, l),
          focusNode: _memory.node(_Rows.top, title.id),
          onPressed: () => context.push(Routes.title(title.id)),
          onLongPress: () => showTvActions(context, TitleActions(title)),
        );
      },
    );
  }

  /// Watch time per genre, each a pill that opens the genre.
  Widget _genresRow(WatchStats stats) {
    final l = AppLocalizations.of(context);
    return TvRow(
      title: l.statsGenres,
      row: _Rows.genres,
      memory: _memory,
      height: TvButtons.height,
      itemCount: stats.genres.length,
      itemBuilder: (context, index) {
        final genre = stats.genres[index];
        return TvButton(
          label: genre.name,
          detail: formatWatchTime(genre.watchSeconds, l),
          focusNode: _memory.node(_Rows.genres, genre.name),
          onPressed: () => context.push(Routes.browse(genre: genre.name)),
        );
      },
    );
  }

  /// Where the person stands on each board, a card per board with their
  /// place between the people just above and below them. Select opens
  /// the board whole in the panel.
  Widget _standingRow(List<BoardStanding> boards) {
    final l = AppLocalizations.of(context);
    // The cards are as tall as the one with the most places, so the row
    // reads as one.
    var places = 1;
    for (final standing in boards) {
      if (standing.places.length > places) places = standing.places.length;
    }
    final height = 16 + 20 + 8 + _placeHeight * places + 4 * (places - 1) + 16;
    return TvRow(
      title: l.statsStandingTitle,
      row: _Rows.standing,
      memory: _memory,
      height: height,
      itemCount: boards.length,
      itemBuilder: (context, index) {
        final standing = boards[index];
        return _BoardCard(
          standing: standing,
          places: places,
          focusNode: _memory.node(_Rows.standing, standing.board.metric),
          onPressed: () => _openBoard(standing.board),
        );
      },
    );
  }

  /// A whole board in the panel: the top places, then the person's
  /// neighbourhood, set off. Each place takes focus so a long board
  /// scrolls; focus starts on their own. Back gives focus back to the card.
  Future<void> _openBoard(LeaderboardBoard board) {
    final l = AppLocalizations.of(context);
    return showTvPanel<void>(
      context,
      title: metricName(board.metric, l),
      description: rangeName(_range, l),
      builder: (panel) => [
        for (final (index, place) in board.entries.indexed)
          Padding(
            padding: EdgeInsets.only(
              top: _startsNeighbourhood(board, index) ? 16 : 0,
            ),
            child: TvFocusable(
              autofocus: place.self,
              label: place.user.name,
              button: false,
              builder: (context, focused) => TvControl(
                focused: focused,
                radius: TvListItems.radius,
                scale: TvFocus.rowScale,
                rest: place.self
                    ? MatineeTheme.of(context).accentSoft
                    : const Color(0x00000000),
                builder: (context, content) => SizedBox(
                  height: TvListItems.height,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: TvListItems.inset - 6,
                    ),
                    child: _Place(
                      place: place,
                      value: metricValue(board.metric, place.value, l),
                      inverted: focused,
                      lit: false,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

/// The first place after the top ones that isn't next to them, where the
/// person's own neighbourhood starts on a board.
bool _startsNeighbourhood(LeaderboardBoard board, int index) =>
    index == _topPlaces &&
    board.entries[index].rank > board.entries[_topPlaces - 1].rank + 1;

/// The picture, the name and the username, when they joined, and whether
/// they're an admin.
class _Header extends StatelessWidget {
  const _Header({required this.user, this.joined});

  final User user;
  final String? joined;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final month = joined == null ? null : joinedMonth(joined!, l.localeName);
    final facts = [
      if (user.displayName?.trim().isNotEmpty ?? false) '@${user.username}',
      if (month != null) l.profileJoined(month),
      if (user.isAdmin) l.profileAdmin,
    ];
    return Padding(
      padding: const EdgeInsetsDirectional.only(start: TvPage.start, end: 220),
      child: Row(
        spacing: 24,
        children: [
          Avatar(avatarId: user.avatarId, name: user.name, size: 96),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  user.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.display.style(color: colors.foreground),
                ),
                if (facts.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      facts.join('  ·  '),
                      style: TvType.facts.style(color: colors.mutedForeground),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A line, and one under it, where a section has nothing to show.
class _Notice extends StatelessWidget {
  const _Notice({required this.title, this.detail});

  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start,
        end: TvPage.end,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: TvType.title.style(color: colors.foreground)),
          if (detail case final text?)
            Padding(
              padding: const EdgeInsets.only(top: 4),
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

/// Plays and what was finished, as large figures across. The watch time is
/// the chart's, above.
class _Totals extends StatelessWidget {
  const _Totals({required this.stats});

  final WatchStats stats;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final totals = stats.totals;
    final count = NumberFormat.decimalPattern(l.localeName).format;
    final figures = [
      (count(totals.plays), l.statsPlays),
      (count(totals.movies), l.statsMoviesFinished),
      (count(totals.episodes), l.statsEpisodesFinished),
      (count(totals.shows), l.statsShowsWatched),
    ];
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start,
        end: TvPage.end,
      ),
      child: Wrap(
        spacing: 48,
        runSpacing: 16,
        children: [
          for (final (value, label) in figures)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  value,
                  maxLines: 1,
                  style: TvType.display.style(color: colors.foreground),
                ),
                Text(
                  label,
                  maxLines: 1,
                  style: TvType.label.style(color: colors.mutedForeground),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

/// The card at the end of the recent row that opens the whole list.
class _SeeAll extends StatelessWidget {
  const _SeeAll({required this.memory});

  final TvFocusMemory memory;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return SizedBox(
      width: TvCards.landscapeWidth,
      child: TvArtCard(
        toneKey: _Rows.seeAll,
        aspect: 16 / 9,
        label: l.tvProfileSeeAll,
        focusNode: memory.node(_Rows.recent, _Rows.seeAll),
        onPressed: () => context.push(Routes.recent),
        children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              spacing: 8,
              children: [
                KitIcon(Lucide.clock, size: 28, color: colors.foreground),
                Text(
                  l.tvProfileSeeAll,
                  style: TvType.label.style(color: colors.foreground),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A file watched: its still, the show or movie, and the episode, opening
/// the file's page. [width] fills a grid's cell.
class TvWatchedCard extends StatelessWidget {
  const TvWatchedCard({
    super.key,
    required this.item,
    required this.focusNode,
    this.width = TvCards.landscapeWidth,
  });

  final MediaItem item;
  final FocusNode focusNode;

  /// Null fills the grid's cell.
  final double? width;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final code = episodeCode(item, l);
    return TvLandscapeCard(
      toneKey: names.showName,
      art: landscapeSources(item),
      caption: names.showName,
      detail: code == null ? names.year : l.mediaCodeTitle(code, names.title),
      progress: progressRatio(item),
      watched: isWatched(item),
      width: width,
      focusNode: focusNode,
      onPressed: () => context.push(itemRoute(item)),
      onLongPress: () => showTvActions(context, ItemActions(item)),
    );
  }
}

/// A board's name, and the person's place with their neighbours. Focused,
/// it fills with the text color.
class _BoardCard extends StatelessWidget {
  const _BoardCard({
    required this.standing,
    required this.places,
    required this.focusNode,
    required this.onPressed,
  });

  final BoardStanding standing;
  final int places;
  final FocusNode focusNode;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final metric = standing.board.metric;
    return TvFocusable(
      focusNode: focusNode,
      label: metricName(metric, l),
      onPressed: onPressed,
      builder: (context, focused) => TvControl(
        focused: focused,
        radius: const BorderRadius.all(Radius.circular(16)),
        rest: colors.foreground.withValues(alpha: .07),
        builder: (context, content) {
          final dim = focused
              ? content.withValues(alpha: .7)
              : colors.mutedForeground;
          return SizedBox(
            width: _boardWidth,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      start: 6,
                      bottom: 8,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            metricName(metric, l),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TvType.label.style(color: dim),
                          ),
                        ),
                        KitIcon(Lucide.chevronRight, size: 18, color: dim),
                      ],
                    ),
                  ),
                  SizedBox(
                    height: _placeHeight * places + 4 * (places - 1),
                    child: Column(
                      spacing: 4,
                      children: [
                        for (final place in standing.places)
                          SizedBox(
                            height: _placeHeight,
                            child: _Place(
                              place: place,
                              value: metricValue(metric, place.value, l),
                              inverted: focused,
                              small: true,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// A place: the rank, the podium's in the accent, the person, and the
/// value, the person's own lit unless [lit] is false, for a row that
/// lights it itself. [inverted] is for a place drawn on a focused control,
/// its text dark.
class _Place extends StatelessWidget {
  const _Place({
    required this.place,
    required this.value,
    required this.inverted,
    this.small = false,
    this.lit = true,
  });

  final LeaderboardEntry place;
  final String value;
  final bool inverted;
  final bool small;
  final bool lit;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final user = place.user;
    final name = user.name;
    final content = tvContent(context, inverted);
    final podium = switch (place.rank) {
      1 => colors.accent,
      2 => colors.accent.withValues(alpha: .6),
      3 => colors.accent.withValues(alpha: .3),
      _ => const Color(0x00000000),
    };
    final fill = !place.self || !lit
        ? const Color(0x00000000)
        : inverted
        ? colors.background.withValues(alpha: .08)
        : colors.accentSoft;
    final text = small ? TvType.label : TvType.facts;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: fill,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          spacing: 12,
          children: [
            SizedBox.square(
              dimension: 28,
              child: DecoratedBox(
                decoration: ShapeDecoration(
                  shape: const CircleBorder(),
                  color: podium,
                ),
                child: Center(
                  child: Text(
                    '${place.rank}',
                    maxLines: 1,
                    style: TvType.caption.style(
                      color: place.rank == 1
                          ? const Color(0xFF000000)
                          : place.rank <= 3 || inverted
                          ? content
                          : colors.mutedForeground,
                    ),
                  ),
                ),
              ),
            ),
            Avatar(avatarId: user.avatarId, name: name, size: small ? 28 : 36),
            Expanded(
              child: Text(
                place.self ? l.statsNameYou(name) : name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: text.style(color: content),
              ),
            ),
            Text(value, maxLines: 1, style: text.style(color: content)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Recently watched.

/// Everything the person watched last, a file per title, newest first, as
/// a grid of cards behind the profile's row, as the Kotlin app's
/// `TvRecentScreen`. The heading steps aside while focus is below the
/// first row.
class TvRecentScreen extends ConsumerStatefulWidget {
  const TvRecentScreen({super.key});

  @override
  ConsumerState<TvRecentScreen> createState() => _TvRecentScreenState();
}

class _TvRecentScreenState extends ConsumerState<TvRecentScreen> {
  final _memory = TvFocusMemory();

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final username = switch (ref.watch(authStateProvider)) {
      SignedIn(:final user) || Offline(:final user) => user.username,
      _ => '',
    };
    final provider = recentProvider(username);
    ref.listen(mediaChangesProvider, (_, _) => ref.invalidate(provider));
    final load = ref.watch(provider);
    // Read again until the list comes, so the first card takes focus once
    // it shows.
    _memory.restore(context, () {
      final now = ref.read(provider);
      if (now.value?.firstOrNull case final first?) {
        return (TvGrid.row, first.item.id);
      }
      return now.hasError ? (TvGrid.row, 'retry') : null;
    });
    final heading = Padding(
      padding: const EdgeInsetsDirectional.only(start: TvPage.start, top: 2),
      child: Text(
        l.profileRecent,
        style: TvType.headline.style(color: colors.foreground),
      ),
    );
    final entries = load.value;
    Widget page;
    if (entries == null && load.hasError) {
      page = _alone(
        heading,
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            top: 24,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            spacing: 8,
            children: [
              Text(
                l.profileRecentLoadFailed,
                style: TvType.title.style(color: colors.foreground),
              ),
              Text(
                describeFailure(l, load.error!),
                style: TvType.body.style(color: colors.mutedForeground),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: TvButton(
                  label: l.commonRetry,
                  icon: Lucide.refreshCw,
                  focusNode: _memory.node(TvGrid.row, 'retry'),
                  onPressed: () => ref.invalidate(provider),
                ),
              ),
            ],
          ),
        ),
      );
    } else if (entries == null) {
      page = _alone(
        heading,
        Expanded(
          child: Center(
            child: Spinner(size: 32, color: colors.mutedForeground),
          ),
        ),
      );
    } else if (entries.isEmpty) {
      page = _alone(
        heading,
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: TvPage.start,
            top: 24,
          ),
          child: Text(
            l.profileRecentEmpty,
            style: TvType.title.style(color: colors.mutedForeground),
          ),
        ),
      );
    } else {
      // As many cards a row as fit at a row's width, stretched to run to
      // the overscan, where the Kotlin app's fixed cells leave a strip.
      page = TvPosterGrid(
        memory: _memory,
        itemCount: entries.length,
        cellWidth: TvCards.landscapeWidth,
        cellAspect: 16 / 9,
        cellExtra: 12 + 20 + 20,
        header: Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: heading,
        ),
        itemBuilder: (context, index) {
          final item = entries[index].item;
          return TvWatchedCard(
            item: item,
            width: null,
            focusNode: _memory.node(TvGrid.row, item.id),
          );
        },
      );
    }
    return ReturnWatcher(
      path: Routes.recent,
      onReturn: () => ref.invalidate(provider),
      child: page,
    );
  }

  Widget _alone(Widget heading, Widget body) => Padding(
    padding: const EdgeInsets.only(top: TvGrid.top),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [heading, body],
    ),
  );
}
