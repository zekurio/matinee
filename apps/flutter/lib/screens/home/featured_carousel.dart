import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/blurhash.dart';
import '../../router.dart';
import 'home_layout.dart';

/// The featured titles at the top of a phone's Home: a row of cards that
/// swipes one at a time, each the title's backdrop under a dark shade with
/// its genres and its name in white. A tap opens the title. A card runs from
/// margin to margin, with the next one just off the screen. It moves to the
/// next card every five seconds, and back to the first after the last; not
/// while a finger is on it, with animations off, with a screen reader on, or
/// while Home is out of sight.
class FeaturedCarouselView extends StatefulWidget {
  const FeaturedCarouselView({super.key, required this.slides});

  final List<FeaturedTitle> slides;

  @override
  State<FeaturedCarouselView> createState() => _FeaturedCarouselViewState();
}

class _FeaturedCarouselViewState extends State<FeaturedCarouselView> {
  PageController? _pager;
  double _fraction = 0;
  Timer? _advance;
  bool _touched = false;
  int _current = 0;

  int get _count => widget.slides.length;

  @override
  void dispose() {
    _advance?.cancel();
    _pager?.dispose();
    super.dispose();
  }

  PageController _pagerFor(double fraction) {
    final pager = _pager;
    if (pager != null && fraction == _fraction) return pager;
    final page = pager != null && pager.hasClients
        ? pager.page?.round() ?? _current
        : _current;
    // The page view lets go of the old one as it rebuilds with the new.
    if (pager != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => pager.dispose());
    }
    _fraction = fraction;
    return _pager = PageController(
      viewportFraction: fraction,
      initialPage: page,
    );
  }

  bool _paused(BuildContext context) =>
      _touched ||
      _count < 2 ||
      MediaQuery.disableAnimationsOf(context) ||
      MediaQuery.accessibleNavigationOf(context) ||
      !TickerMode.valuesOf(context).enabled;

  /// Waits five seconds wherever the row rests, then moves on.
  void _restart() {
    _advance?.cancel();
    if (!mounted || _paused(context)) return;
    _advance = Timer(FeaturedCarousel.advance, () {
      final pager = _pager;
      if (!mounted || pager == null || !pager.hasClients || _paused(context)) {
        return;
      }
      unawaited(
        pager.animateToPage(
          (_current + 1) % _count,
          duration: FeaturedCarousel.move,
          curve: Curves.easeInOutCubic,
        ),
      );
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _restart();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final window = MediaQuery.sizeOf(context);
    final scaler = MediaQuery.textScalerOf(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final row = constraints.maxWidth;
        final width = FeaturedCarousel.cardWidth(row, CardMetrics.gutter);
        final base = FeaturedCarousel.cardHeight(width, window.height);
        final nameStyle = _nameStyle(width);
        final lines = scaler.scale(10) >= 15 ? 3 : 2;
        final height = math.max(
          base,
          _neededHeight(widget.slides, width, base, nameStyle, lines, scaler),
        );
        final stride = width + CardMetrics.gutter;
        final pager = _pagerFor(row == 0 ? 1 : stride / row);
        return SizedBox(
          height: height,
          child: Listener(
            onPointerDown: (_) {
              _touched = true;
              _advance?.cancel();
            },
            onPointerUp: (_) {
              _touched = false;
              _restart();
            },
            onPointerCancel: (_) {
              _touched = false;
              _restart();
            },
            child: NotificationListener<ScrollEndNotification>(
              onNotification: (_) {
                _restart();
                return false;
              },
              child: PageView.builder(
                controller: pager,
                itemCount: _count,
                onPageChanged: (page) => setState(() => _current = page),
                itemBuilder: (context, index) => Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: CardMetrics.gutter / 2,
                  ),
                  child: _FeaturedCard(
                    slide: widget.slides[index],
                    position: l.homeFeaturedPosition(index + 1, _count),
                    height: height,
                    nameStyle: nameStyle,
                    nameLines: lines,
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

const _white = Color(0xFFFFFFFF);

/// A small shadow under text on a picture: black at 60%, soft, 1 down.
const _shadow = [
  Shadow(color: Color(0x99000000), offset: Offset(0, 1), blurRadius: 1),
];

/// text-22 semibold and tight, or text-28 on a card 560 or wider.
TextStyle _nameStyle(double cardWidth) {
  final text = cardWidth >= 560 ? KitText.px28 : KitText.px22;
  return text
      .style(color: _white, weight: FontWeight.w600)
      .copyWith(letterSpacing: text.size * -.025, shadows: _shadow);
}

/// text-13 medium, white at 80%.
final _genresStyle = KitText.px13
    .style(color: _white.withValues(alpha: .8), weight: FontWeight.w500)
    .copyWith(shadows: _shadow);

/// How tall the cards must be for the longest name and its genres at this
/// text size, so every card keeps one height.
double _neededHeight(
  List<FeaturedTitle> slides,
  double cardWidth,
  double base,
  TextStyle nameStyle,
  int lines,
  TextScaler scaler,
) {
  var tallest = 0.0;
  for (final slide in slides) {
    final poster = _art(slide) is _PosterArt;
    final textWidth = math.max(
      0.0,
      cardWidth -
          FeaturedCarousel.padding * 2 -
          (poster ? FeaturedCarousel.posterRoom(base) : 0),
    );
    double measure(String text, TextStyle style, int maxLines) {
      final painter = TextPainter(
        text: TextSpan(text: text, style: style),
        maxLines: maxLines,
        ellipsis: '…',
        textDirection: TextDirection.ltr,
        textScaler: scaler,
      )..layout(maxWidth: textWidth);
      final height = painter.height;
      painter.dispose();
      return height;
    }

    final line = cardLine(slide);
    final height =
        measure(slide.title.name, nameStyle, lines) +
        (line == null
            ? 0
            : measure(line, _genresStyle, 1) + FeaturedCarousel.lineGap) +
        FeaturedCarousel.padding * 2;
    tallest = math.max(tallest, height);
  }
  return tallest;
}

/// What a card shows: wide pictures, a poster alone, or nothing but the
/// title's tone.
sealed class _CardArt {
  const _CardArt();
}

final class _WideArt extends _CardArt {
  const _WideArt(this.sources);

  final List<PictureSource> sources;
}

final class _PosterArt extends _CardArt {
  const _PosterArt(this.art);

  final Artwork art;
}

/// The backdrop, or a show's episode still, or a frame from the file; a
/// title with only a poster gets the poster whole at the end over a blur
/// of itself.
_CardArt _art(FeaturedTitle slide) {
  final backdrop = slide.title.images.backdrop;
  final still = slide.item.episode?.still;
  final frame = FrameSource(slide.item.id);
  if (backdrop != null || still != null) {
    return _WideArt([
      if (backdrop != null) ArtSource(backdrop),
      if (still != null) ArtSource(still),
      frame,
    ]);
  }
  final poster = slide.title.images.poster;
  if (poster != null) return _PosterArt(poster);
  return _WideArt([frame]);
}

/// The shade over a card's picture: black whatever the theme, so the words
/// on it are always white on dark, darkest at the bottom where they sit.
const _shade = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  stops: [0, .4, .7, 1],
  colors: [
    Color(0x1A000000),
    Color(0x4D000000),
    Color(0x99000000),
    Color(0xCC000000),
  ],
);

/// One featured title: its picture under the shade, its genres and name at
/// the bottom. To a screen reader it's one button: the name, the genres,
/// and where it is in the row.
class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({
    required this.slide,
    required this.position,
    required this.height,
    required this.nameStyle,
    required this.nameLines,
  });

  final FeaturedTitle slide;
  final String position;
  final double height;
  final TextStyle nameStyle;
  final int nameLines;

  static const _radius = BorderRadius.all(Radius.circular(KitRadius.xl));

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final art = _art(slide);
    final line = cardLine(slide);
    final name = slide.title.name;
    return PressIndication(
      onPressed: () => context.push(Routes.title(slide.title.id)),
      shape: _radius,
      label: [name, ?line, position].join(', '),
      builder: (context, state) => DecoratedBox(
        position: DecorationPosition.foreground,
        decoration: BoxDecoration(
          borderRadius: _radius,
          border: Border.all(color: colors.foreground.withValues(alpha: .1)),
        ),
        child: ClipRRect(
          borderRadius: _radius,
          // One clip for the picture and its shade, so the picture's edge
          // doesn't show through the shade as a line.
          clipBehavior: Clip.antiAliasWithSaveLayer,
          child: Tone(
            toneKey: slide.title.id,
            child: Stack(
              fit: StackFit.expand,
              children: [
                ...switch (art) {
                  _WideArt(:final sources) => [Picture(sources)],
                  _PosterArt(art: final poster) => _poster(poster),
                },
                const DecoratedBox(decoration: BoxDecoration(gradient: _shade)),
                if (state == PressState.pressed)
                  ColoredBox(color: colors.foreground.withValues(alpha: .1)),
                Positioned(
                  left: FeaturedCarousel.padding,
                  bottom: FeaturedCarousel.padding,
                  right:
                      FeaturedCarousel.padding +
                      (art is _PosterArt
                          ? FeaturedCarousel.posterRoom(height)
                          : 0),
                  child: ExcludeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      spacing: FeaturedCarousel.lineGap,
                      children: [
                        if (line != null)
                          Text(
                            line,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: _genresStyle,
                          ),
                        Text(
                          name,
                          maxLines: nameLines,
                          overflow: TextOverflow.ellipsis,
                          style: nameStyle,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The poster blurred across the card, and the poster itself at the end.
  List<Widget> _poster(Artwork poster) {
    final hash = poster.placeholder?.blurhash;
    final posterHeight = height - FeaturedCarousel.posterInset * 2;
    return [
      if (hash != null)
        Image(
          image: BlurHashImage(hash),
          fit: BoxFit.cover,
          excludeFromSemantics: true,
        )
      else
        ImageFiltered(
          imageFilter: ui.ImageFilter.blur(sigmaX: 24, sigmaY: 24),
          child: Transform.scale(
            scale: 1.2,
            child: Picture([ArtSource(poster)]),
          ),
        ),
      Positioned(
        right: FeaturedCarousel.posterInset,
        top: FeaturedCarousel.posterInset,
        width: posterHeight * 2 / 3,
        height: posterHeight,
        child: ClipRRect(
          borderRadius: const BorderRadius.all(Radius.circular(KitRadius.md)),
          child: Picture([ArtSource(poster)]),
        ),
      ),
    ];
  }
}

/// The carousel's place while the featured titles load: its card as it'll
/// sit.
class FeaturedCarouselSkeleton extends StatelessWidget {
  const FeaturedCarouselSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final window = MediaQuery.sizeOf(context);
    return Semantics(
      label: AppLocalizations.of(context).loadingInProgress,
      container: true,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = FeaturedCarousel.cardWidth(
            constraints.maxWidth,
            CardMetrics.gutter,
          );
          final height = FeaturedCarousel.cardHeight(width, window.height);
          return SizedBox(
            height: height,
            child: Center(
              child: SkeletonBox(
                width: width,
                height: height,
                radius: KitRadius.xl,
                color: MatineeTheme.of(context).surface,
              ),
            ),
          );
        },
      ),
    );
  }
}
