import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../search/search_data.dart';

/// What a page's header says about the focused card, and the backdrop
/// behind it, as the Kotlin app's `FocusedItem`: the facts the phone shows
/// for the same thing.
@immutable
class FocusedItem {
  const FocusedItem({
    required this.name,
    this.logo,
    this.subtitle,
    this.facts = const [],
    this.contentRating,
    this.rating,
    this.overview,
    this.backdrop = const [],
  });

  final String name;

  /// The title's logo, a show's for an episode, shown in place of [name].
  final Artwork? logo;

  /// The episode, or what a show got last.
  final String? subtitle;
  final List<String> facts;
  final String? contentRating;
  final double? rating;
  final String? overview;
  final List<PictureSource> backdrop;
}

/// The art behind a file, best first, as the phone's banner has it.
List<PictureSource> _backdropOf(MediaItem item, Artwork? backdrop) => [
  if (backdrop != null) ArtSource(backdrop, largest: ArtworkSize.large),
  if (item.episode?.still case final still?)
    ArtSource(still, largest: ArtworkSize.large),
  FrameSource(item.id),
];

/// A title's backdrop, if it has one.
List<PictureSource> titleBackdrop(TitleSummary title) => [
  if (title.images.backdrop case final art?)
    ArtSource(art, largest: ArtworkSize.large),
];

FocusedItem featuredInfo(FeaturedTitle slide, AppLocalizations l) {
  final title = slide.title;
  return FocusedItem(
    name: title.name,
    logo: title.images.logo,
    facts: [
      ?title.year?.toString(),
      if (title.kind == TitleKind.show && slide.count > 1)
        l.mediaEpisodeCount(slide.count),
      ?timeLeft(slide.item, l),
    ],
    contentRating: title.contentRating,
    rating: title.rating,
    overview: title.overview,
    backdrop: _backdropOf(slide.item, title.images.backdrop),
  );
}

/// A file in Continue watching or Next up.
FocusedItem itemInfo(MediaItem item, AppLocalizations l) {
  final names = itemNames(item, l);
  final code = episodeCode(item, l);
  final left = item.progress?.completed == false ? timeLeft(item, l) : null;
  return FocusedItem(
    name: names.showName,
    logo: item.title?.images.logo,
    subtitle: code == null ? null : l.mediaCodeTitle(code, names.title),
    facts: [?names.year, ?formatRuntime(runtimeMinutes(item), l), ?left],
    contentRating: item.title?.contentRating,
    rating: item.title?.rating,
    overview: item.episode?.overview ?? item.title?.overview,
    backdrop: _backdropOf(item, item.title?.images.backdrop),
  );
}

/// A title on a library's shelf, with what its card says, [detail].
FocusedItem shelfInfo(ShelfEntry entry, String? detail, AppLocalizations l) {
  final title = entry.title;
  final movie = title.kind == TitleKind.movie;
  return FocusedItem(
    name: title.name,
    logo: title.images.logo,
    subtitle: movie ? null : detail,
    facts: [
      ?title.year?.toString(),
      if (movie) ?formatRuntime(runtimeMinutes(entry.item), l),
    ],
    contentRating: title.contentRating,
    rating: title.rating,
    overview: title.overview,
    backdrop: [...titleBackdrop(title), FrameSource(entry.item.id)],
  );
}

/// A movie or show by itself. [kind] says which, for a page that has both;
/// [genres] gives its first genres, as a grid's line does.
FocusedItem titleInfo(
  TitleSummary title,
  AppLocalizations l, {
  bool kind = false,
  bool genres = false,
}) => FocusedItem(
  name: title.name,
  logo: title.images.logo,
  facts: [
    ?title.year?.toString(),
    if (kind) title.kind == TitleKind.movie ? l.tvKindMovie : l.tvKindShow,
    if (genres && title.genres.isNotEmpty) title.genres.take(2).join(', '),
    if (!genres && title.kind == TitleKind.movie)
      ?formatRuntime(title.runtimeMinutes, l),
  ],
  contentRating: title.contentRating,
  rating: title.rating,
  overview: title.overview,
  backdrop: titleBackdrop(title),
);

/// As [titleInfo], for a season of a show.
FocusedItem seasonInfo(TitleSummary title, Season season, AppLocalizations l) =>
    FocusedItem(
      name: l.titleSeasonOf(title.name, seasonName(season.number, l)),
      facts: [l.mediaEpisodeCount(season.itemCount)],
      contentRating: title.contentRating,
      rating: title.rating,
      overview: season.overview ?? title.overview,
      backdrop: titleBackdrop(title),
    );

/// The year, length, and the like, then the age rating in a box and the
/// score by its star, as a header's facts read.
class TvFacts extends StatelessWidget {
  const TvFacts({
    super.key,
    required this.facts,
    this.contentRating,
    this.rating,
    this.style = TvType.facts,
    this.alpha = .85,
    this.flags = const [],
  });

  final List<String> facts;
  final String? contentRating;
  final double? rating;
  final TvType style;
  final double alpha;

  /// Short marks after the rest, like 4K or HDR, each in a box.
  final List<String> flags;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final l = AppLocalizations.of(context);
    final color = colors.foreground.withValues(alpha: alpha);
    Widget boxed(String text) => DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: colors.foreground.withValues(alpha: .4)),
        borderRadius: const BorderRadius.all(Radius.circular(4)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        child: Text(
          text,
          maxLines: 1,
          style: TvType.caption.style(color: color),
        ),
      ),
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 16,
      children: [
        if (facts.isNotEmpty)
          Flexible(
            child: Text(
              facts.join('  ·  '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: style.style(color: color),
            ),
          ),
        if (contentRating case final rated?) boxed(rated),
        if (rating case final score?)
          Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 6,
            children: [
              KitIcon(
                Lucide.star,
                size: 16,
                color: const Color(0xFFFCD34D),
                label: l.mediaHeroRated,
              ),
              Text(
                formatRating(score, l),
                style: TvType.facts.style(color: color),
              ),
            ],
          ),
        for (final flag in flags) boxed(flag),
      ],
    );
  }
}

/// Height of a [TvFocusLine], kept when nothing has focus so what's under
/// it doesn't move.
const tvFocusLineHeight = 30.0;

/// The focused card's name and facts on one line, for a grid's header, so
/// the cards themselves stay pictures. Empty while nothing has focus.
class TvFocusLine extends StatelessWidget {
  const TvFocusLine(this.item, {super.key});

  final FocusedItem? item;

  @override
  Widget build(BuildContext context) {
    final item = this.item;
    if (item == null) return const SizedBox(height: tvFocusLineHeight);
    final colors = MatineeTheme.of(context);
    return SizedBox(
      height: tvFocusLineHeight,
      child: Row(
        spacing: 16,
        children: [
          Flexible(
            child: Text(
              item.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TvType.title.style(color: colors.foreground),
            ),
          ),
          TvFacts(
            facts: item.facts,
            contentRating: item.contentRating,
            rating: item.rating,
            alpha: .8,
          ),
        ],
      ),
    );
  }
}

/// A title as its [logo], fit into [width] by [height], or as [fallback]
/// when it has none or the logo won't load. The fallback takes the room it
/// needs, never the logo's box, so a long name wraps rather than being cut
/// off. A logo is see-through, so it's drawn with no blurred stand-in
/// beneath it.
class TvTitleLogo extends ConsumerStatefulWidget {
  const TvTitleLogo({
    super.key,
    required this.name,
    required this.logo,
    required this.width,
    required this.height,
    required this.fallback,
    this.alignment = Alignment.centerLeft,
  });

  final String name;
  final Artwork? logo;
  final double width;
  final double height;
  final Alignment alignment;
  final Widget fallback;

  @override
  ConsumerState<TvTitleLogo> createState() => _TvTitleLogoState();
}

class _TvTitleLogoState extends ConsumerState<TvTitleLogo> {
  /// The logo that wouldn't load.
  String? _failed;

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(apiProvider);
    final logo = widget.logo;
    if (logo == null || api == null || _failed == logo.id) {
      return widget.fallback;
    }
    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: Image(
        image: ArtworkImage(
          api.paths.artwork(logo.id, size: ArtworkSize.medium),
          ref.watch(artworkLoaderProvider),
        ),
        fit: BoxFit.contain,
        alignment: widget.alignment,
        semanticLabel: widget.name,
        errorBuilder: (context, error, stack) {
          // The name lays out on its own once this frame is done.
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _failed = logo.id);
          });
          return const SizedBox.shrink();
        },
      ),
    );
  }
}

/// A movie or show as its 2:3 poster, its name on the tone until the
/// picture loads. [onLongPress] opens its actions.
class TvPosterCard extends StatelessWidget {
  const TvPosterCard({
    super.key,
    required this.name,
    required this.poster,
    required this.onPressed,
    this.focusNode,
    this.watched = false,
    this.onLongPress,
    this.onFocused,
    this.width = TvCards.posterWidth,
  });

  final String name;
  final Artwork? poster;
  final VoidCallback onPressed;
  final VoidCallback? onLongPress;
  final VoidCallback? onFocused;
  final FocusNode? focusNode;
  final bool watched;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final poster = this.poster;
    return TvArtCard(
      toneKey: name,
      aspect: 2 / 3,
      width: width,
      focusNode: focusNode,
      label: name,
      onPressed: onPressed,
      onLongPress: onLongPress,
      onFocusChange: onFocused == null
          ? null
          : (focused) {
              if (focused) onFocused!();
            },
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Text(
              name,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TvType.label.style(
                color: colors.foreground.withValues(alpha: .75),
              ),
            ),
          ),
        ),
        if (poster != null) Picture([ArtSource(poster)]),
        if (watched)
          const PositionedDirectional(top: 8, end: 8, child: TvWatchedMark()),
      ],
    );
  }
}

/// How tall a [TvLandscapeCard] is, its caption and detail with it.
const tvLandscapeHeight = TvCards.landscapeWidth * 9 / 16 + 12 + 20 + 20;

/// How tall a [TvCaptionedPoster] is at [width].
double tvCaptionedHeight([double width = TvCards.posterWidth]) =>
    width * 1.5 + 12 + 20 + 20;

/// A file as a 16:9 still, for Continue watching and Next up, with how far
/// in the person is along its bottom and a caption under it.
class TvLandscapeCard extends StatelessWidget {
  const TvLandscapeCard({
    super.key,
    required this.toneKey,
    required this.art,
    required this.caption,
    required this.onPressed,
    this.detail,
    this.progress,
    this.watched = false,
    this.focusNode,
    this.onLongPress,
    this.onFocused,
    this.width = TvCards.landscapeWidth,
  });

  final String toneKey;
  final List<PictureSource> art;
  final String caption;
  final String? detail;
  final double? progress;
  final bool watched;
  final FocusNode? focusNode;
  final VoidCallback onPressed;
  final VoidCallback? onLongPress;
  final VoidCallback? onFocused;
  final double width;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final progress = this.progress;
    return SizedBox(
      width: width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          TvArtCard(
            toneKey: toneKey,
            aspect: 16 / 9,
            focusNode: focusNode,
            label: caption,
            onPressed: onPressed,
            onLongPress: onLongPress,
            onFocusChange: onFocused == null
                ? null
                : (focused) {
                    if (focused) onFocused!();
                  },
            children: [
              Picture(art),
              if (watched)
                const PositionedDirectional(
                  top: 8,
                  end: 8,
                  child: TvWatchedMark(),
                )
              else if (progress != null && progress > 0)
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 10,
                  child: TvProgress(progress),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              caption,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              strutStyle: TvType.label.strut,
              style: TvType.label.style(color: colors.foreground),
            ),
          ),
          if (detail case final text?)
            Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              strutStyle: TvType.caption.strut,
              style: TvType.caption.style(color: colors.mutedForeground),
            ),
        ],
      ),
    );
  }
}

/// A [TvPosterCard] with a caption under it, as in a grid or a row of
/// seasons: [name] and a dimmer [detail]. [badge] sits at the poster's top
/// right while it isn't watched, like a season's episodes left.
class TvCaptionedPoster extends StatelessWidget {
  const TvCaptionedPoster({
    super.key,
    required this.name,
    required this.poster,
    required this.onPressed,
    this.detail,
    this.watched = false,
    this.badge,
    this.focusNode,
    this.onLongPress,
    this.onFocused,
    this.width = TvCards.posterWidth,
    this.toneKey,
  });

  final String name;
  final Artwork? poster;
  final String? detail;
  final bool watched;
  final String? badge;
  final FocusNode? focusNode;
  final VoidCallback onPressed;
  final VoidCallback? onLongPress;
  final VoidCallback? onFocused;
  final double? width;
  final String? toneKey;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return SizedBox(
      width: width,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              TvPosterCard(
                name: toneKey ?? name,
                poster: poster,
                onPressed: onPressed,
                onLongPress: onLongPress,
                onFocused: onFocused,
                focusNode: focusNode,
                watched: watched,
                width: width,
              ),
              if (badge != null && !watched)
                PositionedDirectional(
                  top: 8,
                  end: 8,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: ShapeDecoration(
                        shape: const StadiumBorder(),
                        color: colors.accent,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: Text(
                          badge!,
                          style: TvType.caption.style(
                            color: colors.accentForeground,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              strutStyle: TvType.label.strut,
              style: TvType.label.style(color: colors.foreground),
            ),
          ),
          if (detail case final text?)
            Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              strutStyle: TvType.caption.strut,
              style: TvType.caption.style(color: colors.mutedForeground),
            ),
        ],
      ),
    );
  }
}

/// Someone in a title's cast or crew, for a row of [TvPersonCard]s.
typedef TvPerson = ({
  String name,
  String? role,
  Artwork? photo,
  String? tmdbId,
});

/// A title's people the way its pages list them: the cast with their
/// roles, then the creators, directors, and writers, each with their job.
List<TvPerson> tvPeople(List<Credit> credits, AppLocalizations l) {
  final cast = [
    for (final credit in credits)
      if (credit.kind == CreditKind.actor)
        (
          name: credit.name,
          role: credit.role,
          photo: credit.photo,
          tmdbId: credit.tmdbId,
        ),
  ];
  final crew = <TvPerson>[];
  for (final kind in [
    CreditKind.creator,
    CreditKind.director,
    CreditKind.writer,
  ]) {
    final seen = <String>{};
    for (final credit in credits) {
      if (credit.kind != kind || !seen.add(credit.name)) continue;
      crew.add((
        name: credit.name,
        role: creditKind(kind, l),
        photo: credit.photo,
        tmdbId: credit.tmdbId,
      ));
    }
  }
  return [...cast, ...crew];
}

/// How wide a [TvPersonCard] is.
const tvPersonWidth = 112.0;

/// How tall a [TvPersonCard] is.
const tvPersonHeight = tvPersonWidth + 12 + 20 + 20;

/// A person as a round photo, their initials until it loads, with their
/// name and role under it. The photo takes focus.
class TvPersonCard extends StatelessWidget {
  const TvPersonCard({
    super.key,
    required this.person,
    required this.onPressed,
    this.focusNode,
  });

  final TvPerson person;
  final VoidCallback onPressed;
  final FocusNode? focusNode;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final photo = person.photo;
    return SizedBox(
      width: tvPersonWidth,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox.square(
            dimension: tvPersonWidth,
            child: TvFocusable(
              focusNode: focusNode,
              label: person.name,
              onPressed: onPressed,
              builder: (context, focused) => TvPictureFocus(
                focused: focused,
                circle: true,
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
                        Picture([ArtSource(photo, largest: ArtworkSize.thumb)]),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              person.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              strutStyle: TvType.label.strut,
              style: TvType.label.style(color: colors.foreground),
            ),
          ),
          if (person.role case final role?)
            Text(
              role,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              strutStyle: TvType.caption.strut,
              style: TvType.caption.style(color: colors.mutedForeground),
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
