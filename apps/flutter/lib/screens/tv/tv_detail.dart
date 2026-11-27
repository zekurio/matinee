import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../person/person_data.dart';
import '../search/search_data.dart';
import '../title/pending_marks.dart';
import '../title/title_data.dart';
import '../title/title_parts.dart' show mediaInfoLines;
import 'tv_actions.dart';
import 'tv_home.dart' show TvPageMessage;
import 'tv_media.dart';
import 'tv_shell.dart';

/// The rows and buttons of the detail pages, by their keys in the focus memory.
abstract final class _Rows {
  static const actions = 'actions';
  static const play = 'play';
  static const restart = 'restart';
  static const watched = 'watched';
  static const favorite = 'favorite';
  static const season = 'season';
  static const show = 'show';
  static const nextUp = 'nextUp';
  static const episodes = 'episodes';
  static const seasons = 'seasons';
  static const people = 'people';
  static const links = 'links';
  static const more = 'more';
  static const tabs = 'tabs';
}

/// The header's room from the top of the screen, level with the clock.
const _headerTop = Overscan.vertical + 8;

/// How wide a header's text runs, clear of the art on the right.
const _textWidth = 560.0;

/// A season with no number, the files without one, in keys and the route.
const _noSeason = -1;

/// A detail page that has nothing to show but its load: a spinner while it
/// loads, why it failed with Retry, or [builder]'s page once it's there.
Widget _loaded<T>(
  BuildContext context,
  AsyncValue<T> load, {
  required String error,
  required VoidCallback retry,
  required Widget Function(T value) builder,
}) {
  if (load.value case final value?) return builder(value);
  if (load.error case final cause?) {
    return TvPageMessage(
      title: error,
      message: describeFailure(AppLocalizations.of(context), cause),
      onRetry: retry,
    );
  }
  return Center(
    child: Spinner(size: 36, color: MatineeTheme.of(context).mutedForeground),
  );
}

/// The header's column: from the top of the page, at the page's start.
class _HeaderColumn extends StatelessWidget {
  const _HeaderColumn({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: TvPage.start,
      end: TvPage.end,
      top: _headerTop,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: children,
    ),
  );
}

/// An overview cut to [lines], under its [tagline] if it has one.
class _Overview extends StatelessWidget {
  const _Overview(this.text, {this.lines = 3, this.tagline});

  final String text;
  final int lines;
  final String? tagline;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return SizedBox(
      width: _textWidth,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (tagline case final line?)
            Text(
              line,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.facts.style(color: colors.foreground),
            ),
          Text(
            text,
            maxLines: lines,
            overflow: TextOverflow.ellipsis,
            style: TvType.body.style(
              color: colors.foreground.withValues(alpha: .78),
            ),
          ),
        ],
      ),
    );
  }
}

/// What a file holds, a line each with its icon, set small beside a
/// header's text, from the phone's `mediaInfoLines`.
class _FileInfo extends ConsumerWidget {
  const _FileInfo(this.item);

  final MediaItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (item.probe == null) return const SizedBox.shrink();
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final tracks = ref.watch(fileTracksProvider(item.id)).value;
    final lines = mediaInfoLines(item, tracks, l);
    if (lines.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      width: 240,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        spacing: 8,
        children: [
          for (final (icon, label, text) in lines)
            MergeSemantics(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 10,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: KitIcon(
                      icon,
                      size: 16,
                      color: colors.mutedForeground,
                      label: label,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      text,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TvType.caption.style(
                        color: colors.foreground.withValues(alpha: .8),
                      ),
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

/// The overview, if any, with [file]'s tracks at the right.
Widget _aboutRow(Widget? overview, MediaItem? file) => Padding(
  padding: const EdgeInsets.only(top: 16),
  child: Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [overview ?? const SizedBox.shrink(), ?_fileOf(file)],
  ),
);

Widget? _fileOf(MediaItem? file) => file == null ? null : _FileInfo(file);

/// The buttons under a header, a row in [memory] so focus coming up from
/// the rows lands on the one it left.
Widget _buttons(
  TvFocusMemory memory,
  List<Widget> children, {
  double top = 28,
}) => Padding(
  padding: EdgeInsets.only(top: top),
  child: TvMemoryRow(
    memory: memory,
    row: _Rows.actions,
    child: Row(mainAxisSize: MainAxisSize.min, spacing: 14, children: children),
  ),
);

/// Play, or Resume with the time left, as the phone decides it.
Widget _play(BuildContext context, TvFocusMemory memory, MediaItem? item) {
  final l = AppLocalizations.of(context);
  final resume = isResuming(item);
  return TvButton(
    label: resume ? l.titleResume : l.titlePlay,
    icon: Lucide.play,
    detail: resume ? timeLeft(item!, l) : null,
    minWidth: 180,
    enabled: item != null,
    focusNode: memory.node(_Rows.actions, _Rows.play),
    onPressed: item == null ? null : () => context.push(Routes.play(item.id)),
  );
}

Widget _restart(BuildContext context, TvFocusMemory memory, MediaItem item) =>
    TvIconButton(
      icon: Lucide.rotateCcw,
      label: AppLocalizations.of(context).actionsPlayFromStart,
      focusNode: memory.node(_Rows.actions, _Rows.restart),
      onPressed: () => context.push(Routes.play(item.id), extra: 0.0),
    );

Widget _watchedButton(
  BuildContext context,
  TvFocusMemory memory, {
  required bool watched,
  required VoidCallback onPressed,
}) {
  final l = AppLocalizations.of(context);
  return TvIconButton(
    icon: watched ? Lucide.circleCheck : Lucide.check,
    label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
    tint: watched ? MatineeTheme.of(context).accent : null,
    focusNode: memory.node(_Rows.actions, _Rows.watched),
    onPressed: onPressed,
  );
}

Widget _favoriteButton(
  BuildContext context,
  TvFocusMemory memory, {
  required bool favorite,
  required VoidCallback onPressed,
}) {
  final l = AppLocalizations.of(context);
  return TvIconButton(
    icon: favorite ? Lucide.heartFilled : Lucide.heart,
    label: favorite ? l.mediaRemoveFavorite : l.mediaAddFavorite,
    tint: favorite ? MatineeTheme.of(context).danger : null,
    focusNode: memory.node(_Rows.actions, _Rows.favorite),
    onPressed: onPressed,
  );
}

/// "S1, E2: Name" style caption: the number and the name, or the name
/// alone when the episode has none of its own.
String _codedName(MediaItem item, AppLocalizations l) {
  final names = itemNames(item, l);
  final number = episodeNumberLabel(item, l);
  return number == null || names.untitled
      ? names.title
      : l.titleEpisodesCodedName(number, names.title);
}

/// An episode as a 16:9 card in a row: its still, how far in the person
/// is, its name, and its number with the time left or its length. Select
/// opens its page; holding Select offers the rest. Without [detail] the
/// number goes in the caption, as the season page's row has it.
Widget _episodeCard(
  BuildContext context,
  MediaItem item,
  String row,
  TvFocusMemory memory, {
  bool detail = true,
  VoidCallback? onFocused,
}) {
  final l = AppLocalizations.of(context);
  final names = itemNames(item, l);
  final number = episodeNumberLabel(item, l);
  final left = item.progress?.completed == false ? timeLeft(item, l) : null;
  final line = [
    if (!names.untitled) ?number,
    ?(left ?? formatRuntime(runtimeMinutes(item), l)),
  ];
  return TvLandscapeCard(
    toneKey: names.showName,
    art: landscapeSources(item),
    caption: detail ? names.title : _codedName(item, l),
    detail: detail && line.isNotEmpty ? line.join(' · ') : null,
    progress: progressRatio(item),
    watched: isWatched(item),
    focusNode: memory.node(row, item.id),
    onPressed: () => context.push(itemRoute(item)),
    onLongPress: () => showTvActions(context, ItemActions(item)),
    onFocused: onFocused,
  );
}

/// A season's episodes as a row titled [heading], without [exclude]. The
/// first time focus comes into it, it lands on [start], like the episode
/// Play starts. Nothing until they load, or if there are none.
class _EpisodesRow extends ConsumerWidget {
  const _EpisodesRow({
    required this.heading,
    required this.row,
    required this.titleId,
    required this.season,
    required this.memory,
    this.exclude,
    this.start,
  });

  final String heading;
  final String row;
  final String titleId;
  final int? season;
  final TvFocusMemory memory;
  final String? exclude;
  final String? start;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = ref
        .watch(seasonItemsProvider((titleId: titleId, season: season)))
        .value;
    final list = [
      for (final item in items ?? const <MediaItem>[])
        if (item.id != exclude) item,
    ];
    if (list.isEmpty) return const SizedBox.shrink();
    if (start case final id? when list.any((item) => item.id == id)) {
      memory.startAt(row, id);
    }
    return TvRow(
      title: heading,
      row: row,
      memory: memory,
      height: tvLandscapeHeight,
      itemCount: list.length,
      itemBuilder: (context, index) =>
          _episodeCard(context, list[index], row, memory),
    );
  }
}

/// The cast, then the creators, directors, and writers, each opening their
/// page.
Widget? _peopleRow(BuildContext context, Title title, TvFocusMemory memory) {
  final l = AppLocalizations.of(context);
  final people = tvPeople(title.credits, l);
  if (people.isEmpty) return null;
  String key(TvPerson person) => '${person.name}-${person.role}';
  return TvRow(
    title: l.tvDetailPeople,
    row: _Rows.people,
    memory: memory,
    height: tvPersonHeight,
    itemCount: people.length,
    itemBuilder: (context, index) {
      final person = people[index];
      return TvPersonCard(
        person: person,
        focusNode: memory.node(_Rows.people, key(person)),
        onPressed: () =>
            context.push(Routes.person(person.name, tmdbId: person.tmdbId)),
      );
    },
  );
}

/// How tall a row of [TvChip]s is.
const _chipHeight = 40.0;

/// A title's genres and studios, each opening its titles across the server.
Widget? _linksRow(BuildContext context, Title title, TvFocusMemory memory) {
  final links = [
    for (final genre in title.genres)
      ('genre-$genre', genre, Routes.browse(genre: genre)),
    for (final studio in title.studios)
      ('studio-$studio', studio, Routes.browse(studio: studio)),
  ];
  if (links.isEmpty) return null;
  return TvRow(
    title: AppLocalizations.of(context).tvDetailLinks,
    row: _Rows.links,
    memory: memory,
    height: _chipHeight,
    itemCount: links.length,
    itemBuilder: (context, index) {
      final (key, label, route) = links[index];
      return TvChip(
        label: label,
        focusNode: memory.node(_Rows.links, key),
        onPressed: () => context.push(route),
      );
    },
  );
}

// ---------------------------------------------------------------------------
// The title page.

/// A movie's or show's page on a TV: its name or logo, facts, genres, and
/// overview over its backdrop, with Play and its marks under them, focus on
/// Play. Below, for a show, the episode up next, the episodes of a show with
/// one season, and its seasons; then the cast and crew, and its genres and
/// studios.
class TvTitleScreen extends ConsumerStatefulWidget {
  const TvTitleScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<TvTitleScreen> createState() => _TvTitleScreenState();
}

class _TvTitleScreenState extends ConsumerState<TvTitleScreen>
    with PendingMarks {
  final _memory = TvFocusMemory();

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  void _refresh() {
    ref
      ..invalidate(titleProvider(widget.id))
      ..invalidate(seasonItemsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final load = ref.watch(titleProvider(widget.id));
    return ReturnWatcher(
      path: Routes.title(widget.id),
      onReturn: _refresh,
      child: _loaded(
        context,
        load,
        error: l.titleLoadError,
        retry: () => ref.invalidate(titleProvider(widget.id)),
        builder: _page,
      ),
    );
  }

  Widget _page(Title title) {
    final l = AppLocalizations.of(context);
    final next = title.next;
    _memory.restore(
      context,
      () => (_Rows.actions, next != null ? _Rows.play : _Rows.watched),
    );
    final backdrop = title.images.backdrop;
    // One season, so no specials either: its episodes go right on the
    // show's page too, as on the phone.
    final only = title.seasons.length == 1 ? title.seasons.single : null;
    return TvBackdrop(
      sources: [
        if (backdrop != null) ArtSource(backdrop),
        if (next != null) FrameSource(next.id),
      ],
      child: TvHeaderList(
        header: _header(title),
        rows: [
          if (title.isShow) ...[
            if (next != null && showsNextUp(title)) _nextUpRow(next),
            if (only != null)
              _EpisodesRow(
                heading: seasonName(only.number, l),
                row: _Rows.episodes,
                titleId: title.id,
                season: only.number,
                memory: _memory,
                start: next?.id,
              ),
            ?_seasonsRow(title),
          ],
          ?_peopleRow(context, title, _memory),
          ?_linksRow(context, title, _memory),
        ],
      ),
    );
  }

  Widget _header(Title title) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final next = title.next;
    final movie = !title.isShow;
    final original = title.originalName;
    return _HeaderColumn(
      children: [
        TvTitleLogo(
          name: title.name,
          logo: title.images.logo,
          width: 420,
          height: 110,
          alignment: Alignment.centerLeft,
          fallback: SizedBox(
            width: 720,
            child: Text(
              title.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TvType.hero.style(color: colors.foreground),
            ),
          ),
        ),
        if (original != null && original != title.name)
          Text(
            original,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.body.style(color: colors.mutedForeground),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TvFacts(
            facts: titleFacts(title, l),
            contentRating: title.contentRating,
            rating: title.rating,
            flags: movie && next != null ? mediaFlags(next) : const [],
          ),
        ),
        if (title.genres.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              title.genres.join(', '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.label.style(color: colors.mutedForeground),
            ),
          ),
        _aboutRow(
          title.overview == null
              ? null
              : _Overview(title.overview!, tagline: title.tagline),
          // A movie's file: its picture, audio, and subtitles. A show's
          // differ by episode.
          movie ? next : null,
        ),
        _buttons(_memory, [
          _play(context, _memory, next),
          if (movie && next != null && isResuming(next))
            _restart(context, _memory, next),
          ..._marks(title),
        ]),
      ],
    );
  }

  /// The tick, which asks when before marking watched, and the heart.
  List<Widget> _marks(Title title) {
    final watched = marked('watched', title, title.watched);
    final favorite = marked('favorite', title, title.favorite);
    return [
      _watchedButton(
        context,
        _memory,
        watched: watched,
        onPressed: () => toggleWatched(
          context,
          watched: watched,
          name: title.name,
          ask: askTvWatchedAt,
          askUnwatched: title.kind == TitleKind.show
              ? askTvShowUnwatched(title.name, count: title.itemCount)
              : null,
          send: (api, to, at) =>
              MediaMarks.title(api, title.id, watched: to, at: at),
          pending: pendingFor('watched', title),
        ),
      ),
      _favoriteButton(
        context,
        _memory,
        favorite: favorite,
        onPressed: () => toggleFavorite(
          context,
          favorite: favorite,
          send: (api, to) =>
              MediaMarks.favoriteTitle(api, title.id, favorite: to),
          pending: pendingFor('favorite', title),
        ),
      ),
    ];
  }

  /// The episode up next, in a row of its own, as the phone's page leads
  /// with it.
  Widget _nextUpRow(MediaItem item) {
    final l = AppLocalizations.of(context);
    final left = item.progress?.completed == false
        ? timeLeft(item, l)
        : formatRuntime(runtimeMinutes(item), l);
    final detail = [?formatDay(item.episode?.airDate, l), ?left];
    return TvRow(
      title: item.progress != null ? l.titleNextUpContinue : l.titleNextUpNext,
      row: _Rows.nextUp,
      memory: _memory,
      height: tvLandscapeHeight,
      itemCount: 1,
      itemBuilder: (context, _) => TvLandscapeCard(
        toneKey: itemNames(item, l).showName,
        art: landscapeSources(item),
        caption: _codedName(item, l),
        detail: detail.isEmpty ? null : detail.join(' · '),
        progress: progressRatio(item),
        watched: isWatched(item),
        focusNode: _memory.node(_Rows.nextUp, item.id),
        onPressed: () => context.push(Routes.episode(item.id)),
        onLongPress: () => showTvActions(context, ItemActions(item)),
      ),
    );
  }

  /// A show's seasons by their posters, with how many episodes are left in
  /// each.
  Widget? _seasonsRow(Title title) {
    final l = AppLocalizations.of(context);
    final seasons = title.seasons;
    if (seasons.isEmpty) return null;
    return TvRow(
      title: l.titleSeasons,
      row: _Rows.seasons,
      memory: _memory,
      height: tvCaptionedHeight(),
      itemCount: seasons.length,
      itemBuilder: (context, index) {
        final season = seasons[index];
        final left = season.itemCount - season.watchedCount;
        return TvCaptionedPoster(
          name: seasonName(season.number, l),
          toneKey: l.titleSeasonOf(title.name, seasonName(season.number, l)),
          poster: season.poster ?? title.images.poster,
          detail: l.mediaEpisodeCount(season.itemCount),
          watched: left <= 0,
          badge: '$left',
          focusNode: _memory.node(
            _Rows.seasons,
            '${season.number ?? _noSeason}',
          ),
          onPressed: () => context.push(seasonRoute(title.id, season.number)),
          onLongPress: () =>
              showTvActions(context, SeasonActions(title.summary, season)),
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// The season page.

/// The row of episodes on a season's page, cards and their names, from
/// under the drawer's rail to the screen's edge.
const _seasonRowHeight = 200.0;

/// The key of the Try again button in a season's row of episodes, so the
/// first episode takes focus when they load.
const _retry = 'retry';

/// Room for what the focused episode is about, above the row.
const _aboutHeight = 100.0;

/// A season's page on a TV: the show's name, the season, or tabs for every
/// season of a show with more than one, how many episodes it has and are
/// watched, its score, and Play with the marks. Below, its episodes in a
/// row, with what the focused one is about above them, its score with its
/// facts. Focus starts on the episode Play would start. [season] null is
/// the files without a season number.
class TvSeasonScreen extends ConsumerStatefulWidget {
  const TvSeasonScreen({
    super.key,
    required this.titleId,
    required this.season,
  });

  final String titleId;
  final int? season;

  @override
  ConsumerState<TvSeasonScreen> createState() => _TvSeasonScreenState();
}

class _TvSeasonScreenState extends ConsumerState<TvSeasonScreen>
    with PendingMarks {
  final _memory = TvFocusMemory();

  /// The season on screen, which the tabs change without leaving the page.
  late int? _shown = widget.season;
  MediaItem? _focused;

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  SeasonKey get _key => (titleId: widget.titleId, season: _shown);

  void _refresh() {
    ref
      ..invalidate(titleProvider(widget.titleId))
      ..invalidate(seasonItemsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final load = ref.watch(titleProvider(widget.titleId));
    return ReturnWatcher(
      path: seasonRoute(widget.titleId, widget.season),
      onReturn: _refresh,
      child: _loaded(
        context,
        load,
        error: l.titleSeasonShowError,
        retry: () => ref.invalidate(titleProvider(widget.titleId)),
        builder: (title) => switch (_find(title)) {
          final season? => _page(title, season),
          null => TvPageMessage(title: l.titleSeasonMissing(title.name)),
        },
      ),
    );
  }

  /// The season on screen, or its specials, which still open from a link
  /// when the library hides them.
  Season? _find(Title title) {
    for (final season in title.seasons) {
      if (season.number == _shown) return season;
    }
    final specials = title.specials;
    return specials != null && specials.number == _shown ? specials : null;
  }

  Widget _page(Title title, Season season) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final itemsLoad = ref.watch(seasonItemsProvider(_key));
    final items = itemsLoad.value;
    final next = seasonNext(items, title.next);
    final row = '${_Rows.episodes}-${season.number ?? _noSeason}';
    _memory.restore(context, () {
      if (next != null) return (row, next.id);
      // Episodes that didn't load: Try again.
      return itemsLoad.hasError && items == null ? (row, _retry) : null;
    });
    if (next != null) _memory.startAt(row, next.id);
    final backdrop = title.images.backdrop;
    // Hidden specials, opened from a link, get a tab while on screen.
    final tabs = identical(season, title.specials)
        ? [season, ...title.seasons]
        : title.seasons;
    final about = _focused ?? next;
    return TvBackdrop(
      sources: [if (backdrop != null) ArtSource(backdrop)],
      child: Padding(
        padding: const EdgeInsets.only(top: _headerTop),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: TvPage.start,
                end: TvPage.end,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TvType.title.style(
                      color: colors.foreground.withValues(alpha: .9),
                    ),
                  ),
                  if (tabs.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: _tabs(tabs, season),
                    )
                  else
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        seasonName(season.number, l),
                        maxLines: 1,
                        style: TvType.hero.style(color: colors.foreground),
                      ),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: TvFacts(
                      facts: [
                        l.mediaEpisodeCount(season.itemCount),
                        l.titleSeasonWatchedCount(season.watchedCount),
                      ],
                      rating: season.rating,
                    ),
                  ),
                  _buttons(
                    _memory,
                    _seasonButtons(title, season, items, next),
                    top: 18,
                  ),
                ],
              ),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: TvPage.start,
                end: TvPage.end,
              ),
              child: _EpisodeAbout(item: about, left: about?.id != next?.id),
            ),
            SizedBox(
              height: _seasonRowHeight,
              child: switch (itemsLoad) {
                AsyncValue(value: final list?) => _episodeRow(list, row),
                AsyncValue(error: final cause?) => Padding(
                  padding: const EdgeInsetsDirectional.only(
                    start: TvPage.start,
                    end: TvPage.end,
                    top: 24,
                  ),
                  child: Row(
                    spacing: 20,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Flexible(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            l.titleEpisodesError(describeFailure(l, cause)),
                            style: TvType.body.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                        ),
                      ),
                      TvButton(
                        label: l.commonRetry,
                        icon: Lucide.refreshCw,
                        focusNode: _memory.node(row, _retry),
                        onPressed: () =>
                            ref.invalidate(seasonItemsProvider(_key)),
                      ),
                    ],
                  ),
                ),
                _ => Center(
                  child: Spinner(size: 32, color: colors.mutedForeground),
                ),
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _episodeRow(List<MediaItem> list, String row) => Padding(
    // The row keeps 4 under its cards already.
    padding: const EdgeInsets.only(bottom: Overscan.vertical - 4),
    child: TvRow(
      key: ValueKey(row),
      title: null,
      row: row,
      memory: _memory,
      height: tvLandscapeHeight - 20,
      itemCount: list.length,
      itemBuilder: (context, index) {
        final item = list[index];
        return _episodeCard(
          context,
          item,
          row,
          _memory,
          detail: false,
          onFocused: () {
            if (!identical(_focused, item)) setState(() => _focused = item);
          },
        );
      },
    ),
  );

  /// Play the season's next episode, or resume it, then the season's tick,
  /// its heart, and the show. The files without a season number aren't a
  /// season to mark, so they get no heart.
  List<Widget> _seasonButtons(
    Title title,
    Season season,
    List<MediaItem>? items,
    MediaItem? next,
  ) {
    final l = AppLocalizations.of(context);
    final number = season.number;
    final watched = marked('watched', items, seasonWatched(items));
    final favorite = marked('favorite', title, season.favorite);
    return [
      _play(context, _memory, next),
      _watchedButton(
        context,
        _memory,
        watched: watched,
        onPressed: () => toggleWatched(
          context,
          watched: watched,
          name: l.titleSeasonOf(title.name, seasonName(number, l)),
          ask: askTvWatchedAt,
          askUnwatched: askTvSeasonUnwatched(
            title.name,
            seasonName(number, l),
            count: season.itemCount,
          ),
          send: (api, to, at) =>
              MediaMarks.season(api, title.id, number, watched: to, at: at),
          pending: items == null ? null : pendingFor('watched', items),
        ),
      ),
      if (number != null)
        _favoriteButton(
          context,
          _memory,
          favorite: favorite,
          onPressed: () => toggleFavorite(
            context,
            favorite: favorite,
            send: (api, to) =>
                MediaMarks.favoriteSeason(api, title.id, number, favorite: to),
            pending: pendingFor('favorite', title),
          ),
        ),
      TvIconButton(
        icon: Lucide.tv,
        label: l.actionsGoToShow(title.name),
        focusNode: _memory.node(_Rows.actions, _Rows.show),
        onPressed: () => tvGoUp(context, Routes.title(title.id)),
      ),
    ];
  }

  /// The show's seasons as tabs; Select shows that season's episodes here.
  Widget _tabs(List<Season> seasons, Season current) {
    final l = AppLocalizations.of(context);
    return TvMemoryRow(
      memory: _memory,
      row: _Rows.tabs,
      child: Row(
        spacing: 10,
        children: [
          for (final season in seasons)
            TvChip(
              label: seasonName(season.number, l),
              selected: season.number == current.number,
              focusNode: _memory.node(
                _Rows.tabs,
                '${season.number ?? _noSeason}',
              ),
              onPressed: () => setState(() {
                _shown = season.number;
                _focused = null;
              }),
            ),
        ],
      ),
    );
  }
}

/// An episode's number and name, facts and score, and the start of its
/// overview, above the season's row. [left] adds the time left in it.
class _EpisodeAbout extends StatelessWidget {
  const _EpisodeAbout({required this.item, required this.left});

  final MediaItem? item;
  final bool left;

  @override
  Widget build(BuildContext context) {
    final item = this.item;
    if (item == null) return const SizedBox(height: _aboutHeight);
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    // In the one being resumed, the time left in place of its length.
    final resuming = left && isResuming(item);
    final facts = [
      ?formatDay(item.episode?.airDate, l),
      ?(resuming ? timeLeft(item, l) : formatRuntime(runtimeMinutes(item), l)),
    ];
    return SizedBox(
      height: _aboutHeight,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _codedName(item, l),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TvType.title.style(color: colors.foreground),
          ),
          if (facts.isNotEmpty || item.episode?.rating != null)
            TvFacts(
              facts: facts,
              rating: item.episode?.rating,
              style: TvType.caption,
              color: colors.mutedForeground,
            ),
          if (item.episode?.overview case final overview?)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: SizedBox(
                width: _textWidth + 120,
                child: Text(
                  overview,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.body.style(
                    color: colors.foreground.withValues(alpha: .78),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// The episode page.

/// An episode's page on a TV, or a loose file's: over its still, or its show's
/// art, the show, season and number, name, facts, overview, and file, with Play
/// and its marks and the ways to its season and show. Below, the rest of its
/// season.
class TvEpisodeScreen extends ConsumerStatefulWidget {
  const TvEpisodeScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<TvEpisodeScreen> createState() => _TvEpisodeScreenState();
}

class _TvEpisodeScreenState extends ConsumerState<TvEpisodeScreen>
    with PendingMarks {
  final _memory = TvFocusMemory();

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  void _refresh() {
    ref
      ..invalidate(itemProvider(widget.id))
      ..invalidate(seasonItemsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final load = ref.watch(itemProvider(widget.id));
    return ReturnWatcher(
      path: Routes.episode(widget.id),
      onReturn: _refresh,
      child: _loaded(
        context,
        load,
        error: l.titleEpisodeLoadError,
        retry: () => ref.invalidate(itemProvider(widget.id)),
        builder: _page,
      ),
    );
  }

  Widget _page(MediaItem item) {
    final l = AppLocalizations.of(context);
    _memory.restore(context, () => (_Rows.actions, _Rows.play));
    final title = item.title;
    final season = item.seasonNumber;
    return TvBackdrop(
      sources: [
        if (item.episode?.still case final still?) ArtSource(still),
        if (title?.images.backdrop case final art?) ArtSource(art),
        FrameSource(item.id),
      ],
      child: TvHeaderList(
        header: _header(item),
        rows: [
          if (title != null)
            _EpisodesRow(
              heading: l.titleEpisodeMoreFrom(seasonName(season, l)),
              row: _Rows.more,
              titleId: title.id,
              season: season,
              memory: _memory,
              exclude: item.id,
            ),
        ],
      ),
    );
  }

  Widget _header(MediaItem item) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final names = itemNames(item, l);
    final season = item.seasonNumber;
    final number = item.episodeNumber;
    final where = [
      if (season != null)
        season == 0 ? l.titleEpisodeSpecials : l.titleEpisodeSeason(season),
      if (number != null) l.titleEpisodeNumber(number),
    ].join(' · ');
    return _HeaderColumn(
      children: [
        Text(
          names.showName,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TvType.title.style(
            color: colors.foreground.withValues(alpha: .9),
          ),
        ),
        if (where.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              where,
              style: TvType.facts.style(color: colors.mutedForeground),
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: SizedBox(
            width: 720,
            child: Text(
              names.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TvType.hero.style(color: colors.foreground),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: TvFacts(
            facts: episodeFacts(item, l),
            contentRating: item.title?.contentRating,
            // The episode's own score, never its show's.
            rating: item.episode?.rating,
          ),
        ),
        _aboutRow(
          item.episode?.overview == null
              ? null
              : _Overview(item.episode!.overview!, lines: 4),
          item,
        ),
        _buttons(_memory, _episodeButtons(item)),
      ],
    );
  }

  /// Play, or Resume with the time left, play from the start while it's in
  /// progress, the marks, then its season and its show.
  List<Widget> _episodeButtons(MediaItem item) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final title = item.title;
    final season = item.seasonNumber;
    final watched = marked('watched', item, isWatched(item));
    final favorite = marked('favorite', item, isFavoriteItem(item));
    return [
      _play(context, _memory, item),
      if (isResuming(item)) _restart(context, _memory, item),
      _watchedButton(
        context,
        _memory,
        watched: watched,
        onPressed: () => toggleWatched(
          context,
          watched: watched,
          name: names.title,
          ask: askTvWatchedAt,
          send: (api, to, at) =>
              MediaMarks.item(api, item, watched: to, at: at),
          pending: pendingFor('watched', item),
        ),
      ),
      _favoriteButton(
        context,
        _memory,
        favorite: favorite,
        onPressed: () => toggleFavorite(
          context,
          favorite: favorite,
          send: (api, to) => MediaMarks.favoriteItem(api, item, favorite: to),
          pending: pendingFor('favorite', item),
        ),
      ),
      if (title != null && season != null)
        TvIconButton(
          icon: Lucide.list,
          label: l.actionsGoToShow(seasonName(season, l)),
          focusNode: _memory.node(_Rows.actions, _Rows.season),
          onPressed: () => tvGoUp(context, seasonRoute(title.id, season)),
        ),
      if (title != null)
        TvIconButton(
          icon: Lucide.tv,
          label: l.actionsGoToShow(title.name),
          focusNode: _memory.node(_Rows.actions, _Rows.show),
          onPressed: () => tvGoUp(context, Routes.title(title.id)),
        ),
    ];
  }
}

// ---------------------------------------------------------------------------
// The person page.

/// Posters across the page, as many as fit between the rail and the edge.
const _personColumns = 6;

/// Under a poster in the person's grid: the gap, the name, and the role.
const _captionHeight = 12 + 20 + 20.0;

/// Someone in the cast or crew on a TV, and everything they're in: their photo,
/// name, job, and how many titles they're in, then those titles as a grid of
/// posters, each with their role in it. The header steps aside while focus is
/// below the first row. The focused title's backdrop goes behind the page.
class TvPersonScreen extends ConsumerStatefulWidget {
  const TvPersonScreen({super.key, required this.name, this.tmdbId});

  final String name;
  final String? tmdbId;

  @override
  ConsumerState<TvPersonScreen> createState() => _TvPersonScreenState();
}

class _TvPersonScreenState extends ConsumerState<TvPersonScreen> {
  final _memory = TvFocusMemory();
  PersonCredit? _focused;

  PersonKey get _key => (name: widget.name, tmdbId: widget.tmdbId);

  @override
  void dispose() {
    _memory.dispose();
    super.dispose();
  }

  static String _creditKey(PersonCredit credit) =>
      '${credit.title.id}-${credit.kind}';

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final load = ref.watch(personProvider(_key));
    return _loaded(
      context,
      load,
      error: l.personLoadFailed,
      retry: () => ref.invalidate(personProvider(_key)),
      builder: _page,
    );
  }

  Widget _page(Person person) {
    final l = AppLocalizations.of(context);
    final credits = person.credits;
    _memory.restore(
      context,
      () => credits.isEmpty ? null : (TvGrid.row, _creditKey(credits.first)),
    );
    return TvBackdrop(
      sources: switch (_focused) {
        final credit? => titleBackdrop(credit.title),
        null => const [],
      },
      child: TvPosterGrid(
        memory: _memory,
        itemCount: credits.length,
        columns: _personColumns,
        cellAspect: 2 / 3,
        cellExtra: _captionHeight,
        header: _PersonHeader(person: person),
        itemBuilder: (context, index) {
          final credit = credits[index];
          final title = credit.title;
          return TvCaptionedPoster(
            name: title.name,
            poster: title.images.poster,
            detail:
                credit.role ??
                title.year?.toString() ??
                creditKind(credit.kind, l),
            watched: title.watched,
            width: null,
            focusNode: _memory.node(TvGrid.row, _creditKey(credit)),
            onPressed: () => context.push(Routes.title(title.id)),
            onLongPress: () => showTvActions(context, TitleActions(title)),
            onFocused: () {
              if (!identical(_focused, credit)) {
                setState(() => _focused = credit);
              }
            },
          );
        },
      ),
    );
  }
}

class _PersonHeader extends StatelessWidget {
  const _PersonHeader({required this.person});

  final Person person;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final photo = person.photo;
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: TvPage.start,
        end: TvPage.end,
        top: 2,
        bottom: 16,
      ),
      child: Row(
        spacing: 28,
        children: [
          ClipOval(
            child: SizedBox.square(
              dimension: 120,
              child: ColoredBox(
                color: colors.secondary,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Center(
                      child: Text(
                        _initials(person.name),
                        style: TvType.headline.style(
                          color: colors.mutedForeground,
                        ),
                      ),
                    ),
                    if (photo != null)
                      Picture([ArtSource(photo, largest: ArtworkSize.small)]),
                  ],
                ),
              ),
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  person.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TvType.hero.style(color: colors.foreground),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    [
                      creditKind(person.kind, l),
                      l.browseTitleCount(person.titleCount),
                    ].join(' · '),
                    style: TvType.facts.style(
                      color: colors.foreground.withValues(alpha: .85),
                    ),
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

String _initials(String name) {
  final words = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
  return words.take(2).map((w) => w.characters.first.toUpperCase()).join();
}
