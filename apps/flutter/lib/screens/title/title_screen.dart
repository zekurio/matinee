import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../query/refresh.dart';
import '../../router.dart';
import '../requests/related.dart';
import '../requests/requests_hub.dart' show FollowTitles;
import '../requests/show_gaps.dart';
import 'pending_marks.dart';
import 'title_data.dart';
import 'title_parts.dart';

/// A movie's or a show's page, as the web's title page: the backdrop under the
/// heading and its facts, the overview and crew, a movie's file with a picker
/// when it has several, Play and the buttons beside it, a show's episode up
/// next and seasons, the cast, and the related titles.
class TitleScreen extends ConsumerStatefulWidget {
  const TitleScreen({super.key, required this.id});

  final String id;

  @override
  ConsumerState<TitleScreen> createState() => _TitleScreenState();
}

class _TitleScreenState extends ConsumerState<TitleScreen> with PendingMarks {
  /// The file picked for a movie with several; the server's pick until then.
  String? _fileId;

  void _refresh() {
    ref
      ..invalidate(titleProvider(widget.id))
      ..invalidate(movieFilesProvider(widget.id))
      ..invalidate(seasonItemsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    ref.listen(mediaChangesProvider, (_, _) => _refresh());
    final async = ref.watch(titleProvider(widget.id));
    final title = async.value;
    return ReturnWatcher(
      path: Routes.title(widget.id),
      onReturn: _refresh,
      child: title == null
          ? PageState(
              error: async.error,
              errorTitle: l.titleLoadError,
              onRetry: () => ref.invalidate(titleProvider(widget.id)),
            )
          : _page(context, title),
    );
  }

  Widget _page(BuildContext context, Title title) {
    final wide = isWide(context);
    final summary = title.summary;
    final show = title.isShow;
    final files = show
        ? const <MediaItem>[]
        : ref.watch(movieFilesProvider(title.id)).value ?? const [];
    final next = title.next;
    // A movie plays the file picked, else the one the server names.
    final file = show
        ? null
        : files.where((f) => f.id == _fileId).firstOrNull ?? next;
    final play = show ? next : file;
    final watched = marked('watched', title, title.watched);
    final favorite = marked('favorite', title, title.favorite);
    final only = title.seasons.length == 1 ? title.seasons.single : null;
    final more = TitleActions(summary, file: file, here: true);
    final backdrop = title.images.backdrop;
    final related = relatedKey(title);
    final gaps = watchShowGaps(ref, title);
    final page = TitleScaffold(
      sections: [
        Backdrop(
          sources: [
            if (backdrop != null) ArtSource(backdrop),
            if (play != null) FrameSource(play.id),
          ],
          toneKey: title.name,
          top: wide ? headingTop(context) : phoneHeadingTop(context),
          // Phones leave the poster out, for the name to have the width.
          child: TitleHeading(
            title: title,
            flags: file == null ? const [] : mediaFlags(file),
            poster: wide,
          ),
        ),
        if (title.overview case final overview?)
          Overview(text: overview, tagline: title.tagline),
        if (CrewLines.any(title.credits, title.studios))
          CrewLines(credits: title.credits, studios: title.studios),
        // A movie's file: what it holds. A show's differ by episode.
        if (file != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: MediaInfo(item: file),
          ),
        if (file != null && files.length > 1)
          FilePicker(
            files: files,
            selected: file,
            onSelected: (picked) => setState(() => _fileId = picked.id),
          ),
        ActionRow(
          play: play,
          watched: watched,
          onWatched: () => toggleWatched(
            context,
            watched: watched,
            name: title.name,
            send: (api, to, at) =>
                MediaMarks.title(api, title.id, watched: to, at: at),
            pending: pendingFor('watched', title),
            askUnwatched: show
                ? askShowUnwatched(title.name, count: title.itemCount)
                : null,
          ),
          favorite: favorite,
          onFavorite: () => toggleFavorite(
            context,
            favorite: favorite,
            send: (api, to) =>
                MediaMarks.favoriteTitle(api, title.id, favorite: to),
            pending: pendingFor('favorite', title),
          ),
          onMore: hasActionsFor(ref, more)
              ? () => showActions(context, more)
              : null,
          trailers: title.trailers,
        ),
        if (show) ...[
          if (next != null && showsNextUp(title)) NextUpEpisode(item: next),
          // One season, so its episodes go right on the show's page.
          if (only != null) ...[
            _OnlySeason(title: title, season: only, next: next, gaps: gaps),
            if (SeasonsRail.any(title, gaps: gaps, extraOnly: true))
              SeasonsRail(title: title, gaps: gaps, extraOnly: true),
          ] else if (SeasonsRail.any(title, gaps: gaps))
            SeasonsRail(title: title, gaps: gaps),
        ],
        if (CastRail.any(title.credits)) CastRail(credits: title.credits),
        ?(related == null ? null : CatalogRelatedRows(relatedTo: related)),
      ],
    );
    // The gaps' seasons change state as the stream says.
    return gaps == null
        ? page
        : FollowTitles(titles: gaps.followed, child: page);
  }
}

/// A one-season show's episodes as a row of stills, starting at the one up
/// next; nothing while they load or when they fail.
class _OnlySeason extends ConsumerWidget {
  const _OnlySeason({
    required this.title,
    required this.season,
    this.next,
    this.gaps,
  });

  final Title title;
  final Season season;
  final MediaItem? next;
  final ShowGaps? gaps;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final items = ref
        .watch(seasonItemsProvider((titleId: title.id, season: season.number)))
        .value;
    if (items == null || items.isEmpty) return const SizedBox.shrink();
    final gaps = this.gaps;
    final partial = gaps?.partialOf(season.number);
    return EpisodesRail(
      title: l.titleEpisodes,
      items: items,
      next: next,
      // The ask for the episodes the server lacks, after the last.
      trailing: gaps == null || partial == null
          ? null
          : RestOfSeasonCard(showName: title.name, gaps: gaps, season: partial),
    );
  }
}
