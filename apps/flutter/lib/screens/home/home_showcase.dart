import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../router.dart';
import 'home_layout.dart';

/// The featured titles at the top of a tablet's Home: one tall card, inset
/// from the page by the same gutter the rows start at, its title's art
/// filling it under a shade. Low on the leading side are the title's logo or
/// its name, its facts, its genres, its overview, how far the person is, and
/// Play and Details. A swipe changes the title in place, the art crossing
/// over while Play and Details stay put; it moves on every eight seconds, and
/// not while a finger is on it, with animations off, with a screen reader on,
/// or while Home is out of sight.
class HomeShowcase extends ConsumerStatefulWidget {
  const HomeShowcase({super.key, required this.slides});

  final List<FeaturedTitle> slides;

  @override
  ConsumerState<HomeShowcase> createState() => _HomeShowcaseState();
}

/// The card's corners: a big card takes a bigger one than a rail's.
const _radius = BorderRadius.all(Radius.circular(KitRadius.xxl));

/// How far a swipe must go, or how fast, to change the title.
const _swipeDistance = 40.0;
const _swipeVelocity = 300.0;

class _HomeShowcaseState extends ConsumerState<HomeShowcase>
    with SingleTickerProviderStateMixin {
  /// The art and words crossing over: 0 shows [_leaving], 1 [_current].
  late final _fade = AnimationController(
    vsync: this,
    duration: ShowcaseLayout.fade,
    value: 1,
  );
  Timer? _advance;
  var _current = 0;

  /// The title fading out under the one that took its place.
  int? _leaving;
  var _touched = false;
  var _drag = 0.0;

  int get _count => widget.slides.length;

  @override
  void initState() {
    super.initState();
    _fade.addStatusListener(_settled);
  }

  void _settled(AnimationStatus status) {
    if (status == AnimationStatus.completed && _leaving != null) {
      setState(() => _leaving = null);
    }
  }

  @override
  void dispose() {
    _advance?.cancel();
    _fade.dispose();
    super.dispose();
  }

  bool get _paused =>
      _touched ||
      _count < 2 ||
      MediaQuery.disableAnimationsOf(context) ||
      MediaQuery.accessibleNavigationOf(context) ||
      !TickerMode.valuesOf(context).enabled;

  /// Waits eight seconds wherever the card rests, then changes the title.
  void _restart() {
    _advance?.cancel();
    if (!mounted || _paused) return;
    _advance = Timer(ShowcaseLayout.advance, () {
      if (!mounted || _paused) return;
      _show((_current + 1) % _count);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _restart();
    _prime();
  }

  /// The pictures already asked for ahead of their title.
  final _primed = <Uri>{};

  /// Loads the next title's art and logo before it takes the card, so the
  /// change shows its picture at once rather than its placeholder. One that
  /// fails is left to the card, which falls back as it would have.
  void _prime() {
    if (!mounted || _count < 2) return;
    final api = ref.read(apiProvider);
    if (api == null) return;
    final loader = ref.read(artworkLoaderProvider);
    final slide = widget.slides[(_current + 1) % _count];
    final pixels =
        ShowcaseLayout.width(MediaQuery.sizeOf(context), CardMetrics.gutter) *
        MediaQuery.devicePixelRatioOf(context);
    for (final url in [
      _artOf(slide).first.url(api.paths, pixels),
      if (slide.title.images.logo case final logo?) _logoUrl(api.paths, logo),
    ]) {
      if (!_primed.add(url)) continue;
      unawaited(
        precacheImage(ArtworkImage(url, loader), context, onError: (_, _) {}),
      );
    }
  }

  /// Changes the title in place. The one showing stays under the one coming
  /// until the fade is done, so the art never dips through the shade.
  void _show(int index) {
    if (!mounted || index == _current || index < 0 || index >= _count) return;
    final motion = MediaQuery.disableAnimationsOf(context);
    setState(() {
      _leaving = motion ? null : _current;
      _current = index;
    });
    if (motion) {
      _fade.value = 1;
    } else {
      _fade.forward(from: 0);
    }
    _restart();
    _prime();
  }

  void _endDrag(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    final on = _drag < -_swipeDistance || velocity < -_swipeVelocity;
    final back = _drag > _swipeDistance || velocity > _swipeVelocity;
    _drag = 0;
    if (!on && !back) return;
    _show(on ? (_current + 1) % _count : (_current - 1 + _count) % _count);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final window = MediaQuery.sizeOf(context);
    final gutter = CardMetrics.gutter;
    final base = ShowcaseLayout.baseHeight(window, gutter);
    final slide = widget.slides[_current];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Padding(
          padding: EdgeInsets.symmetric(horizontal: gutter),
          child: SizedBox(
            height: ShowcaseLayout.height(
              window,
              gutter,
              MediaQuery.textScalerOf(context),
            ),
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
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                excludeFromSemantics: true,
                onTap: () => context.push(Routes.title(slide.title.id)),
                onHorizontalDragStart: (_) => _drag = 0,
                onHorizontalDragUpdate: (details) =>
                    _drag += details.primaryDelta ?? 0,
                onHorizontalDragEnd: _endDrag,
                child: MatineeTheme.alwaysDark(
                  context,
                  _Card(
                    slides: widget.slides,
                    current: _current,
                    leaving: _leaving,
                    fade: _fade,
                    wordsWidth: ShowcaseLayout.wordsWidth(
                      ShowcaseLayout.width(window, gutter),
                    ),
                    logoHeight: ShowcaseLayout.logoHeight(base),
                    nameSize: ShowcaseLayout.titleSize(base),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (_count > 1)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: PageDots(
              count: _count,
              current: _current,
              onSelected: _show,
              labelForPage: (index) =>
                  l.homeFeaturedPosition(index + 1, _count),
            ),
          ),
      ],
    );
  }
}

/// One featured title's card: its art under the shades, its words low on the
/// leading side, and Play and Details under them. Play and Details stay while
/// the words and art change behind them, as the web's do.
class _Card extends StatelessWidget {
  const _Card({
    required this.slides,
    required this.current,
    required this.leaving,
    required this.fade,
    required this.wordsWidth,
    required this.logoHeight,
    required this.nameSize,
  });

  final List<FeaturedTitle> slides;
  final int current;
  final int? leaving;
  final Animation<double> fade;
  final double wordsWidth;
  final double logoHeight;
  final double nameSize;

  /// How much of a title's art shows: the one coming fades in over the one
  /// leaving, which stays whole underneath, so nothing dips through the
  /// shade between them.
  double _art(int index) =>
      leaving == null || index != current ? 1 : fade.value;

  /// How much of a title's words show: the leaving one's are gone by
  /// halfway, so the two never read over each other, and the new one's come
  /// in over the second half.
  double _words(int index) {
    if (leaving == null) return 1;
    final t = fade.value;
    return (index == current ? 2 * t - 1 : 1 - 2 * t).clamp(0, 1).toDouble();
  }

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    // Each is keyed by its place in the list, so a title keeps its own
    // picture and logo as it goes from showing to leaving, and the one
    // coming starts from its own placeholder, not the last title's art.
    final showing = [?leaving, current];
    return DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: _radius,
        border: Border.all(color: colors.foreground.withValues(alpha: .1)),
      ),
      child: ClipRRect(
        borderRadius: _radius,
        child: Stack(
          fit: StackFit.expand,
          children: [
            AnimatedBuilder(
              animation: fade,
              builder: (context, _) => Stack(
                fit: StackFit.expand,
                children: [
                  for (final index in showing)
                    Opacity(
                      key: ValueKey(index),
                      opacity: _art(index),
                      child: _Art(slide: slides[index]),
                    ),
                ],
              ),
            ),
            DecoratedBox(decoration: BoxDecoration(gradient: _bottom)),
            DecoratedBox(decoration: BoxDecoration(gradient: _side)),
            PositionedDirectional(
              start: ShowcaseLayout.padding,
              bottom: ShowcaseLayout.wordsBottom,
              width: wordsWidth,
              child: AnimatedBuilder(
                animation: fade,
                builder: (context, _) => Stack(
                  fit: StackFit.passthrough,
                  alignment: AlignmentDirectional.bottomStart,
                  children: [
                    for (final index in showing)
                      ExcludeSemantics(
                        key: ValueKey(index),
                        excluding: index != current,
                        child: Opacity(
                          opacity: _words(index),
                          child: _SlideWords(
                            slide: slides[index],
                            width: wordsWidth,
                            nameSize: nameSize,
                            logoHeight: logoHeight,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            PositionedDirectional(
              start: ShowcaseLayout.padding,
              bottom: ShowcaseLayout.padding,
              child: _Buttons(slide: slides[current]),
            ),
          ],
        ),
      ),
    );
  }
}

/// A title's pictures, best first: its backdrop, or a show's episode still,
/// or a frame from the file.
List<PictureSource> _artOf(FeaturedTitle slide) => [
  if (slide.title.images.backdrop case final backdrop?) ArtSource(backdrop),
  if (slide.item.episode?.still case final still?) ArtSource(still),
  FrameSource(slide.item.id),
];

/// Where a title's logo comes from, at the size the card draws it.
Uri _logoUrl(Paths paths, Artwork logo) =>
    paths.artwork(logo.id, size: ArtworkSize.medium);

/// A title's picture, whole across the card with its top kept.
class _Art extends StatelessWidget {
  const _Art({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) => Tone(
    toneKey: slide.title.name,
    child: Picture(_artOf(slide), alignment: Alignment.topCenter),
  );
}

/// The shade up from the card's bottom: black at 94% there, eased to nothing
/// by three tenths of the way up, with many stops on a smootherstep curve so
/// neither end shows as a line.
final _bottom = _shade(
  Alignment.topCenter,
  Alignment.bottomCenter,
  from: .3,
  to: 1,
  alpha: .94,
);

/// The shade in from the card's leading side, under the words: black at 72%
/// on the edge, eased to nothing by 70% of the way across.
final _side = _shade(
  AlignmentDirectional.centerEnd,
  AlignmentDirectional.centerStart,
  from: 0,
  to: .7,
  alpha: .72,
);

/// Black over the art, eased from nothing at [from] to [alpha] at [to], flat
/// where it starts and ends.
LinearGradient _shade(
  AlignmentGeometry begin,
  AlignmentGeometry end, {
  required double from,
  required double to,
  required double alpha,
}) {
  const steps = 24;
  const black = Color(0xFF000000);
  final stops = <double>[];
  final colors = <Color>[];
  if (from > 0) {
    stops.add(0);
    colors.add(black.withValues(alpha: 0));
  }
  for (var i = 0; i <= steps; i++) {
    final t = i / steps;
    final eased = t * t * t * (t * (t * 6 - 15) + 10);
    stops.add(from + (to - from) * t);
    colors.add(black.withValues(alpha: alpha * eased));
  }
  if (to < 1) {
    stops.add(1);
    colors.add(black.withValues(alpha: alpha));
  }
  return LinearGradient(begin: begin, end: end, stops: stops, colors: colors);
}

const _white = Color(0xFFFFFFFF);

/// A title's words: its logo or its name, its facts and genres, its
/// overview, and how far the person is.
class _SlideWords extends StatelessWidget {
  const _SlideWords({
    required this.slide,
    required this.width,
    required this.nameSize,
    required this.logoHeight,
  });

  final FeaturedTitle slide;

  /// The room the words have, which the logo never outgrows.
  final double width;
  final double nameSize;
  final double logoHeight;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final foreground = colors.foreground;
    final title = slide.title;
    final facts = heroFacts(slide, l.mediaEpisodeCount);
    final contentRating = title.contentRating;
    final rating = title.rating;
    final genres = shownGenres(slide);
    final overview = title.overview;
    final ratio = progressRatio(slide.item);
    final left = timeLeft(slide.item, l);
    return Semantics(
      container: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _TitleMark(
            name: title.name,
            logo: title.images.logo,
            width: math.min(ShowcaseLayout.logoMax, width),
            height: logoHeight,
            nameSize: nameSize,
          ),
          if (facts.isNotEmpty || contentRating != null || rating != null) ...[
            const SizedBox(height: 12),
            _Facts(facts: facts, contentRating: contentRating, rating: rating),
          ],
          if (genres.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              genres.join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: KitText.sm.style(color: foreground.withValues(alpha: .8)),
            ),
          ],
          if (overview != null) ...[
            const SizedBox(height: 10),
            Text(
              overview,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: KitText.sm.style(
                color: foreground.withValues(alpha: .72),
                leading: ShowcaseLayout.overviewLeading,
              ),
            ),
          ],
          if (ratio != null && left != null) ...[
            const SizedBox(height: 16),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 320),
              child: Row(
                spacing: 12,
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: KitRadius.pill,
                      child: SizedBox(
                        height: 4,
                        child: ColoredBox(
                          color: foreground.withValues(alpha: .25),
                          child: FractionallySizedBox(
                            alignment: AlignmentDirectional.centerStart,
                            widthFactor: ratio,
                            child: ColoredBox(color: foreground),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Text(
                    [?episodeCode(slide.item, l), left].join(' · '),
                    maxLines: 1,
                    style: KitText.xs.style(
                      color: foreground.withValues(alpha: .8),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The title's logo when the provider has one, else its name in large bold
/// white. Either way a screen reader hears the name, as the card's heading.
class _TitleMark extends ConsumerStatefulWidget {
  const _TitleMark({
    required this.name,
    required this.logo,
    required this.width,
    required this.height,
    required this.nameSize,
  });

  final String name;
  final Artwork? logo;
  final double width;
  final double height;
  final double nameSize;

  @override
  ConsumerState<_TitleMark> createState() => _TitleMarkState();
}

class _TitleMarkState extends ConsumerState<_TitleMark> {
  /// The logo that wouldn't load.
  String? _failed;

  @override
  Widget build(BuildContext context) {
    final logo = widget.logo;
    final api = ref.watch(apiProvider);
    if (logo == null || api == null || _failed == logo.id) {
      return Semantics(
        header: true,
        child: Text(
          widget.name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontFamily: KitText.family,
            fontSize: widget.nameSize,
            height: 1.1,
            fontWeight: FontWeight.w700,
            fontVariations: const [FontVariation('wght', 700)],
            letterSpacing: widget.nameSize * -.02,
            color: _white,
            shadows: _shadow,
          ),
        ),
      );
    }
    return Semantics(
      header: true,
      image: true,
      label: widget.name,
      child: ExcludeSemantics(
        child: SizedBox(
          width: widget.width,
          height: widget.height,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: AlignmentDirectional.centerStart,
            children: [
              // The mark's own shadow, so a light one reads on a light
              // picture, as the web's does.
              Positioned.fill(
                child: ImageFiltered(
                  imageFilter: ui.ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                  child: Transform.translate(
                    offset: const Offset(0, 2),
                    child: ColorFiltered(
                      colorFilter: const ui.ColorFilter.mode(
                        Color(0x99000000),
                        BlendMode.srcIn,
                      ),
                      child: _logo(api, logo),
                    ),
                  ),
                ),
              ),
              _logo(api, logo),
            ],
          ),
        ),
      ),
    );
  }

  Widget _logo(MatineeApi api, Artwork logo) => Image(
    image: ArtworkImage(
      _logoUrl(api.paths, logo),
      ref.watch(artworkLoaderProvider),
    ),
    fit: BoxFit.contain,
    alignment: AlignmentDirectional.centerStart,
    errorBuilder: (context, error, stack) {
      // The name takes the logo's place once this frame is done.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _failed = logo.id);
      });
      return const SizedBox.shrink();
    },
  );
}

/// A small, soft shadow under words on a picture, as the phone's cards have.
const _shadow = [Shadow(color: Color(0x73000000), blurRadius: 24)];

/// The year and episode count, the age rating, and the score, in a line that
/// wraps.
class _Facts extends StatelessWidget {
  const _Facts({
    required this.facts,
    required this.contentRating,
    required this.rating,
  });

  final List<String> facts;
  final String? contentRating;
  final double? rating;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final foreground = MatineeTheme.of(context).foreground;
    final dim = foreground.withValues(alpha: .8);
    final rating = this.rating;
    return Wrap(
      spacing: 12,
      runSpacing: 6,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (facts.isNotEmpty)
          Text(
            facts.join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: KitText.base.style(color: dim),
          ),
        if (contentRating case final age?)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              border: Border.all(color: foreground.withValues(alpha: .3)),
              borderRadius: const BorderRadius.all(
                Radius.circular(KitRadius.sm),
              ),
            ),
            child: Text(
              age,
              style: KitText.xs.style(
                color: dim,
                weight: FontWeight.w500,
                leading: 20,
              ),
            ),
          ),
        if (rating != null)
          Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 4,
            children: [
              KitIcon(
                Lucide.star,
                size: 14,
                color: const Color(0xFFFCD34D),
                label: l.mediaHeroRated,
              ),
              Text(
                NumberFormat.decimalPatternDigits(
                  locale: Localizations.localeOf(context).toString(),
                  decimalDigits: 1,
                ).format(rating),
                style: KitText.base.style(color: dim),
              ),
            ],
          ),
      ],
    );
  }
}

/// Play, from where the person is, and the title's page, for the title
/// showing.
class _Buttons extends StatelessWidget {
  const _Buttons({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final resuming = timeLeft(slide.item, l) != null;
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [
        MatineeButton(
          size: ButtonSize.lg,
          look: ButtonLook.inverse,
          leading: Lucide.play,
          onPressed: () => context.push(Routes.play(slide.item.id)),
          child: Text(resuming ? l.titleResume : l.titlePlay),
        ),
        MatineeButton(
          size: ButtonSize.lg,
          look: ButtonLook.frosted,
          leading: Lucide.info,
          onPressed: () => context.push(Routes.title(slide.title.id)),
          child: Text(l.mediaHeroDetails),
        ),
      ],
    );
  }
}

/// The showcase's place while the featured titles load: the card as dark as
/// it'll be, with the words' places low on the leading side, so light doesn't
/// flash to dark and the page doesn't jump.
class HomeShowcaseSkeleton extends StatelessWidget {
  const HomeShowcaseSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final window = MediaQuery.sizeOf(context);
    final width = ShowcaseLayout.width(window, CardMetrics.gutter);
    final height = ShowcaseLayout.height(
      window,
      CardMetrics.gutter,
      MediaQuery.textScalerOf(context),
    );
    final words = ShowcaseLayout.wordsWidth(width);
    final dark = MatineeTheme.darkOf(context);
    return Semantics(
      label: AppLocalizations.of(context).loadingInProgress,
      container: true,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
        child: SizedBox(
          height: height,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: dark.surface,
              borderRadius: _radius,
            ),
            child: Align(
              alignment: AlignmentDirectional.bottomStart,
              child: Padding(
                padding: const EdgeInsets.all(ShowcaseLayout.padding),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SkeletonBox(
                      width: math.min(words, 320),
                      height: 40,
                      color: dark.secondary,
                    ),
                    const SizedBox(height: 12),
                    SkeletonBox(width: 200, height: 16, color: dark.secondary),
                    const SizedBox(height: 10),
                    SkeletonBox(
                      width: math.min(words, 440),
                      height: 12,
                      color: dark.secondary,
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      spacing: 8,
                      children: [
                        SkeletonBox(
                          width: 112,
                          height: ButtonSize.lg.height,
                          radius: ButtonSize.lg.height / 2,
                          color: dark.secondary,
                        ),
                        SkeletonBox(
                          width: 120,
                          height: ButtonSize.lg.height,
                          radius: ButtonSize.lg.height / 2,
                          color: dark.secondary,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
