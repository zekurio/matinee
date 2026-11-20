import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../router.dart';
import 'home_layout.dart';

/// The web's `hero.tsx` at the top of a tablet's Home, as the Kotlin app's
/// `Hero`: new and well-rated titles over their art, low on the left the
/// name, the facts, the genres, the overview, and how far the person is,
/// with Play and Details under them. The slides swipe as pages, the art
/// crossfading under them while the text slides. It moves on every eight
/// seconds, always forward; not while a finger or a pointer is on it,
/// while focus is in it, with animations off, with a screen reader on, or
/// while Home is out of sight. [box] is Home's own, the space between the
/// shell's header and its tabs.
class HomeBanner extends StatefulWidget {
  const HomeBanner({
    super.key,
    required this.slides,
    required this.box,
    required this.rowsBelow,
  });

  final List<FeaturedTitle> slides;
  final Size box;
  final bool rowsBelow;

  @override
  State<HomeBanner> createState() => _HomeBannerState();
}

/// Room over a slide's text, which in the Kotlin app was Home's header.
const _topRoom = 24.0;

/// The buttons' height: the kit's large buttons.
final _buttons = ButtonSize.lg.height;

class _HomeBannerState extends State<HomeBanner> {
  late final _pager = PageController(
    initialPage: HeroPaging.initialPage(_count),
  );
  Timer? _advance;
  bool _touched = false;
  bool _hovered = false;
  bool _focused = false;
  late int _page = HeroPaging.initialPage(_count);

  int get _count => widget.slides.length;

  @override
  void dispose() {
    _advance?.cancel();
    _pager.dispose();
    super.dispose();
  }

  bool get _paused =>
      _touched ||
      _hovered ||
      _focused ||
      _count < 2 ||
      MediaQuery.disableAnimationsOf(context) ||
      MediaQuery.accessibleNavigationOf(context) ||
      !TickerMode.valuesOf(context).enabled;

  void _restart() {
    _advance?.cancel();
    if (!mounted || _paused) return;
    _advance = Timer(HeroPaging.advance, () {
      if (!mounted || _paused || !_pager.hasClients) return;
      unawaited(
        _pager.animateToPage(
          _page + 1,
          duration: const Duration(milliseconds: 500),
          curve: Curves.easeInOutCubic,
        ),
      );
    });
  }

  void _hold({bool? touched, bool? hovered, bool? focused}) {
    _touched = touched ?? _touched;
    _hovered = hovered ?? _hovered;
    _focused = focused ?? _focused;
    _restart();
  }

  void _go(int page) {
    if (!_pager.hasClients) return;
    final motion = MediaQuery.disableAnimationsOf(context);
    if (motion) {
      _pager.jumpToPage(page);
    } else {
      unawaited(
        _pager.animateToPage(
          page,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOutCubic,
        ),
      );
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _restart();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final layout = HeroLayout(
      widget.box.width,
      widget.box.height,
      rowsBelow: widget.rowsBelow,
    );
    final reserved = layout.buttonsBottom + _buttons + layout.textGap;
    final current = HeroPaging.slide(_page, _count);
    final textPadding = EdgeInsets.fromLTRB(
      CardMetrics.gutter,
      _topRoom,
      CardMetrics.gutter,
      reserved,
    );
    return Semantics(
      label: l.tvHomeFeatured,
      container: true,
      child: Focus(
        canRequestFocus: false,
        skipTraversal: true,
        onFocusChange: (focused) => _hold(focused: focused),
        child: MouseRegion(
          onEnter: (_) => _hold(hovered: true),
          onExit: (_) => _hold(hovered: false),
          child: Listener(
            onPointerDown: (_) => _hold(touched: true),
            onPointerUp: (_) => _hold(touched: false),
            onPointerCancel: (_) => _hold(touched: false),
            child: Stack(
              children: [
                // As tall as the layout says, or as the tallest slide's
                // text needs at large text sizes.
                SizedBox(width: double.infinity, height: layout.height),
                for (final slide in widget.slides)
                  Visibility(
                    visible: false,
                    maintainSize: true,
                    maintainAnimation: true,
                    maintainState: true,
                    child: Padding(
                      padding: textPadding,
                      child: _HeroText(slide: slide, layout: layout),
                    ),
                  ),
                Positioned.fill(
                  child: ListenableBuilder(
                    listenable: _pager,
                    builder: (context, _) => _art(),
                  ),
                ),
                Positioned.fill(
                  child: NotificationListener<ScrollEndNotification>(
                    onNotification: (_) {
                      _restart();
                      return false;
                    },
                    child: PageView.builder(
                      controller: _pager,
                      itemCount: HeroPaging.pages(_count),
                      onPageChanged: (page) => setState(() => _page = page),
                      itemBuilder: (context, page) {
                        final text = Padding(
                          padding: textPadding,
                          child: Align(
                            alignment: AlignmentDirectional.bottomStart,
                            child: _HeroText(
                              slide:
                                  widget.slides[HeroPaging.slide(page, _count)],
                              layout: layout,
                            ),
                          ),
                        );
                        // The pages beside it are laid out for the swipe,
                        // not there to read.
                        return page == _page
                            ? text
                            : ExcludeSemantics(child: text);
                      },
                    ),
                  ),
                ),
                Positioned(
                  left: CardMetrics.gutter,
                  right: CardMetrics.gutter - 6,
                  bottom: layout.buttonsBottom,
                  child: Row(
                    children: [
                      _HeroButtons(slide: widget.slides[current]),
                      if (layout.dotsBesideButtons) ...[
                        const Spacer(),
                        _pagerControls(l, current),
                      ],
                    ],
                  ),
                ),
                if (!layout.dotsBesideButtons)
                  PositionedDirectional(
                    end: CardMetrics.gutter - 6,
                    bottom: math.max(layout.dotsBottom - 4, 0),
                    child: _pagerControls(l, current),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The slide showing, with the next one fading over it as the pages
  /// move, rather than the pictures sliding edge to edge.
  Widget _art() {
    final position = _pager.hasClients && _pager.position.haveDimensions
        ? _pager.page ?? _page.toDouble()
        : _page.toDouble();
    final under = position.floor();
    final over = position - under;
    return Stack(
      fit: StackFit.expand,
      children: [
        _HeroArt(
          key: ValueKey(HeroPaging.slide(under, _count)),
          slide: widget.slides[HeroPaging.slide(under, _count)],
        ),
        if (over > 0)
          Opacity(
            opacity: over,
            child: _HeroArt(
              key: ValueKey(HeroPaging.slide(under + 1, _count)),
              slide: widget.slides[HeroPaging.slide(under + 1, _count)],
            ),
          ),
      ],
    );
  }

  /// The dots and previous and next, with more than one slide.
  Widget _pagerControls(AppLocalizations l, int current) {
    if (_count < 2) return const SizedBox.shrink();
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 12,
      children: [
        PageDots(
          count: _count,
          current: current,
          onSelected: (index) => _go(HeroPaging.page(index, _page, _count)),
          labelForPage: (index) => l.homeFeaturedShowSlide(index + 1),
        ),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            MatineeButton(
              look: ButtonLook.ghost,
              size: ButtonSize.icon,
              label: l.homeFeaturedPrevious,
              leading: Lucide.chevronLeft,
              onPressed: () => _go(_page - 1),
            ),
            MatineeButton(
              look: ButtonLook.ghost,
              size: ButtonSize.icon,
              label: l.homeFeaturedNext,
              leading: Lucide.chevronRight,
              onPressed: () => _go(_page + 1),
            ),
          ],
        ),
      ],
    );
  }
}

/// A slide's picture and the web's shade in the page's color, so in a
/// light theme the picture fades into a light page: across from the text's
/// side, and up the lower half into the page.
class _HeroArt extends StatelessWidget {
  const _HeroArt({super.key, required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final background = MatineeTheme.of(context).background;
    final backdrop = slide.title.images.backdrop;
    final still = slide.item.episode?.still;
    return Tone(
      toneKey: slide.title.name,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Picture([
            if (backdrop != null)
              ArtSource(backdrop, largest: ArtworkSize.xlarge),
            if (still != null) ArtSource(still, largest: ArtworkSize.xlarge),
            FrameSource(slide.item.id),
          ], alignment: Alignment.topCenter),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                stops: const [0, .3, .65],
                colors: [
                  background.withValues(alpha: .85),
                  background.withValues(alpha: .45),
                  background.withValues(alpha: 0),
                ],
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [.5, .825, 1],
                colors: [
                  background.withValues(alpha: 0),
                  background.withValues(alpha: .3),
                  background,
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// A slide's words, each as the web's.
class _HeroText extends StatelessWidget {
  const _HeroText({required this.slide, required this.layout});

  final FeaturedTitle slide;
  final HeroLayout layout;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final foreground = colors.foreground;
    final title = slide.title;
    final item = slide.item;
    final ratio = progressRatio(item);
    final left = timeLeft(item, l);
    final genres = shownGenres(slide);
    final overview = title.overview;
    final large = MediaQuery.textScalerOf(context).scale(10) >= 15;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 672),
          child: Semantics(
            header: true,
            child: Text(
              title.name,
              maxLines: large ? 3 : 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontFamily: KitText.family,
                fontSize: layout.titleSize,
                height: 1.1,
                fontWeight: FontWeight.w700,
                fontVariations: const [FontVariation('wght', 700)],
                letterSpacing: layout.titleSize * -.025,
                color: foreground,
                shadows: const [
                  Shadow(color: Color(0x73000000), blurRadius: 24),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),
        _HeroFacts(slide: slide),
        if (layout.showsGenres && genres.isNotEmpty) ...[
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [for (final genre in genres) _GenreBadge(genre: genre)],
          ),
        ],
        if (layout.showsOverview && overview != null) ...[
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 576),
            child: Text(
              overview,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: KitText.sm.style(
                color: foreground.withValues(alpha: .7),
                leading: 24,
              ),
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
                  [?episodeCode(item, l), left].join(' · '),
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
    );
  }
}

/// The year and episode count, the age rating, and the score, in a line
/// that wraps.
class _HeroFacts extends StatelessWidget {
  const _HeroFacts({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final foreground = MatineeTheme.of(context).foreground;
    final dim = foreground.withValues(alpha: .8);
    final title = slide.title;
    final facts = heroFacts(slide, l.mediaEpisodeCount);
    final contentRating = title.contentRating;
    final rating = title.rating;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 576),
      child: Wrap(
        spacing: 12,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (facts.isNotEmpty)
            Text(
              facts.join(' · '),
              maxLines: 1,
              style: KitText.base.style(color: dim),
            ),
          if (contentRating != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              decoration: BoxDecoration(
                border: Border.all(color: foreground.withValues(alpha: .3)),
                borderRadius: const BorderRadius.all(
                  Radius.circular(KitRadius.sm),
                ),
              ),
              child: Text(
                contentRating,
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
      ),
    );
  }
}

/// A genre over the art, as the web's: a small frosted capsule, opening
/// the genre's titles.
class _GenreBadge extends StatelessWidget {
  const _GenreBadge({required this.genre});

  final String genre;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: () => context.push(Routes.browse(genre: genre)),
      label: genre,
      shape: KitRadius.pill,
      builder: (context, state) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
        decoration: BoxDecoration(
          color: colors.background.withValues(
            alpha: state == PressState.pressed ? .5 : .3,
          ),
          borderRadius: KitRadius.pill,
          border: Border.all(color: colors.foreground.withValues(alpha: .15)),
        ),
        child: ExcludeSemantics(
          child: Text(
            genre,
            maxLines: 1,
            style: KitText.xs.style(
              color: colors.foreground.withValues(alpha: .85),
            ),
          ),
        ),
      ),
    );
  }
}

/// Play, from where the person is, and the title's page, for the slide
/// showing: one row that stays while the slides swipe under it.
class _HeroButtons extends StatelessWidget {
  const _HeroButtons({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 8,
      children: [
        MatineeButton(
          size: ButtonSize.lg,
          leading: Lucide.play,
          onPressed: () => context.push(Routes.play(slide.item.id)),
          child: Text(l.titlePlay),
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

/// The banner's place while the featured titles load, as tall as it'll be.
class HomeBannerSkeleton extends StatelessWidget {
  const HomeBannerSkeleton({
    super.key,
    required this.box,
    required this.rowsBelow,
  });

  final Size box;
  final bool rowsBelow;

  @override
  Widget build(BuildContext context) {
    final layout = HeroLayout(box.width, box.height, rowsBelow: rowsBelow);
    final colors = MatineeTheme.of(context);
    return Semantics(
      label: AppLocalizations.of(context).loadingInProgress,
      container: true,
      child: Container(
        height: layout.height,
        color: colors.surface,
        alignment: AlignmentDirectional.bottomStart,
        padding: EdgeInsetsDirectional.only(
          start: CardMetrics.gutter,
          bottom: layout.buttonsBottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 16,
          children: [
            const SkeletonBox(width: 320, height: 48),
            const SkeletonBox(width: 180, height: 20),
            Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 8,
              children: [
                SkeletonBox(width: 104, height: _buttons, radius: KitRadius.lg),
                SkeletonBox(width: 120, height: _buttons, radius: KitRadius.lg),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
