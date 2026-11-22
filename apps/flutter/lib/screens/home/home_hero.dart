import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/artwork.dart';
import '../../media/format.dart';
import '../../router.dart';
import 'home_layout.dart';

const _white = Color(0xFFFFFFFF);
const _ink = Color(0xFF111111);

/// A shadow under a word or an icon on a picture: black at 60%, soft, one
/// down.
const _shadow = [
  Shadow(color: Color(0x99000000), offset: Offset(0, 1), blurRadius: 8),
];

/// The featured titles at the top of Home, as one full-bleed hero on a phone
/// and a tablet: the title's art under its logo, facts, overview, and Play,
/// with the slideshow's pause and dots under them. A wide screen puts the
/// words low on the left; a phone centres them. A tap opens the title, and
/// Play starts the file. The slides move on every eight seconds, always
/// forward; not while a finger or pointer is on it, while focus is in it,
/// while the pause button holds it, with animations off, with a screen reader
/// on, or while Home is out of sight.
///
/// It's dark in either scheme, as the web's: art under a white wash looks
/// faded, and light text over a dark shade reads on any picture. In light it
/// ends at the dark page colour in a straight edge, the light page below, as
/// the banner did. [box] is Home's own, not the window, so the dots stay above
/// the tab bar.
class HomeHero extends StatefulWidget {
  const HomeHero({super.key, required this.slides, required this.box});

  final List<FeaturedTitle> slides;
  final Size box;

  @override
  State<HomeHero> createState() => _HomeHeroState();
}

class _HomeHeroState extends State<HomeHero> {
  late final _pager = PageController(
    initialPage: HeroPaging.initialPage(_count),
  );
  Timer? _advance;
  bool _touched = false;
  bool _hovered = false;
  bool _focused = false;
  bool _held = false;
  late int _page = HeroPaging.initialPage(_count);

  int get _count => widget.slides.length;

  int get _current => HeroPaging.slide(_page, _count);

  @override
  void dispose() {
    _advance?.cancel();
    _pager.dispose();
    super.dispose();
  }

  bool get _paused =>
      _held ||
      _touched ||
      _hovered ||
      _focused ||
      _count < 2 ||
      MediaQuery.disableAnimationsOf(context) ||
      MediaQuery.accessibleNavigationOf(context) ||
      !TickerMode.valuesOf(context).enabled;

  void _hold({bool? touched, bool? hovered, bool? focused, bool? held}) {
    _touched = touched ?? _touched;
    _hovered = hovered ?? _hovered;
    _focused = focused ?? _focused;
    _held = held ?? _held;
    _restart();
  }

  /// Waits eight seconds wherever the row rests, then moves on.
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

  void _go(int page) {
    if (!_pager.hasClients) return;
    if (MediaQuery.disableAnimationsOf(context)) {
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
    final layout = HomeHeroLayout(
      width: widget.box.width,
      height: widget.box.height,
    );
    return MatineeTheme.alwaysDark(context, _hero(l, layout));
  }

  Widget _hero(AppLocalizations l, HomeHeroLayout layout) {
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
            child: SizedBox(
              height: layout.heroHeight,
              width: double.infinity,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Positioned.fill(child: _backdrop(layout)),
                  Positioned.fill(
                    child: NotificationListener<ScrollEndNotification>(
                      onNotification: (_) {
                        _restart();
                        return false;
                      },
                      child: PageView.builder(
                        controller: _pager,
                        itemCount: HeroPaging.pages(_count),
                        onPageChanged: (page) {
                          setState(() => _page = page);
                          _restart();
                        },
                        itemBuilder: (context, page) {
                          final slide = HeroPaging.slide(page, _count);
                          final content = _HeroPage(
                            slide: widget.slides[slide],
                            layout: layout,
                            position: l.homeFeaturedPosition(slide + 1, _count),
                          );
                          // The pages beside it are laid out for the swipe,
                          // not there to read.
                          return page == _page
                              ? content
                              : ExcludeSemantics(child: content);
                        },
                      ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: HomeHeroLayout.controlsBottom,
                    child: _controls(l),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The art crossfading between slides while they move, and the shades that
  /// carry the words and the header.
  Widget _backdrop(HomeHeroLayout layout) => _HeroBackdrop(
    controller: _pager,
    page: _page,
    count: _count,
    slides: widget.slides,
    alignsLeft: layout.alignsLeft,
  );

  /// The pause and the dots, centred under the words.
  Widget _controls(AppLocalizations l) {
    if (_count < 2) return const SizedBox.shrink();
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        MatineeButton(
          look: ButtonLook.ghost,
          size: ButtonSize.icon,
          leading: _held ? Lucide.play : Lucide.pause,
          label: _held ? l.playerPlay : l.playerPause,
          onPressed: () => _hold(held: !_held),
        ),
        const SizedBox(width: 8),
        PageDots(
          count: _count,
          current: _current,
          onSelected: (index) => _go(HeroPaging.page(index, _page, _count)),
          labelForPage: (index) => l.homeFeaturedShowSlide(index + 1),
        ),
      ],
    );
  }
}

/// The art layer behind the hero's pages: each backdrop fades into the one
/// coming over it while the swipe moves it a little sideways, rather than the
/// pictures sliding past each other with a seam. Reduced motion keeps the
/// fade and drops the drift. Its neighbour stays built, so its picture is
/// ready when a swipe starts.
class _HeroBackdrop extends StatelessWidget {
  const _HeroBackdrop({
    required this.controller,
    required this.page,
    required this.count,
    required this.slides,
    required this.alignsLeft,
  });

  /// Share of the width a backdrop travels on its way in or out.
  static const _drift = .25;

  /// The most the drift may zoom art with no spare width to move in.
  static const _maxDriftZoom = 1.2;

  final PageController controller;
  final int page;
  final int count;
  final List<FeaturedTitle> slides;
  final bool alignsLeft;

  /// Drift for a viewport of [aspectRatio], as a share of its width. Art
  /// that already overflows a narrower viewport spends that spare width; a
  /// wider one may only zoom up to [_maxDriftZoom], which shortens the drift.
  static double _driftFor(double aspectRatio) {
    final spare = math.max(1 / aspectRatio, 1.0) * _maxDriftZoom;
    return math.min(_drift, (spare - 1) / 2);
  }

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    final last = HeroPaging.pages(count) - 1;
    final current = page.clamp(0, last);
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    final background = MatineeTheme.of(context).background;
    return LayoutBuilder(
      builder: (context, constraints) {
        final viewport = constraints.biggest;
        final drift = reduceMotion || viewport.isEmpty
            ? 0.0
            : _driftFor(viewport.aspectRatio);
        return Stack(
          fit: StackFit.expand,
          children: [
            // Ascending: the later page paints over the earlier one, so a
            // fade always runs over an opaque picture.
            for (
              var index = math.max(0, current - 1);
              index <= math.min(last, current + 1);
              index++
            )
              _HeroBackdropLayer(
                key: ValueKey(index),
                controller: controller,
                page: index,
                settled: current,
                drift: drift,
                child: _HeroArt(slide: slides[HeroPaging.slide(index, count)]),
              ),
            // The shades stay over every slide, so the words and the header
            // read on whichever picture is showing. The art fades into the
            // page's own dark background at the bottom, where the next row
            // starts on solid colour.
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [.5, .85, .94, 1],
                  colors: [
                    background.withValues(alpha: 0),
                    background.withValues(alpha: .9),
                    background,
                    background,
                  ],
                ),
              ),
            ),
            if (alignsLeft)
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                    stops: const [0, .6],
                    colors: [
                      background.withValues(alpha: .8),
                      background.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                height: 120,
                width: double.infinity,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        background.withValues(alpha: .65),
                        background.withValues(alpha: 0),
                      ],
                    ),
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

/// One backdrop, laid out wider than the hero so it can drift without
/// showing an edge, and faded by how far the swipe has moved it.
class _HeroBackdropLayer extends StatelessWidget {
  const _HeroBackdropLayer({
    super.key,
    required this.controller,
    required this.page,
    required this.settled,
    required this.drift,
    required this.child,
  });

  final PageController controller;
  final int page;
  final int settled;
  final double drift;
  final Widget child;

  double get _position =>
      (controller.hasClients ? controller.page : null) ?? settled.toDouble();

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      child: FractionallySizedBox(widthFactor: 1 + 2 * drift, child: child),
      builder: (context, child) {
        // > 0: still ahead of the swipe; < 0: already passed.
        final offset = page - _position;
        final opacity = offset <= -1 || offset >= 1
            ? 0.0
            : offset <= 0
            ? 1.0
            : 1.0 - offset;
        return FractionalTranslation(
          translation: Offset(offset.clamp(-1.0, 1.0) * drift, 0),
          child: Opacity(opacity: opacity, child: child),
        );
      },
    );
  }
}

/// A slide's picture: its backdrop, or its episode's still, or a frame from
/// the file, over the title's tone while nothing has loaded.
class _HeroArt extends StatelessWidget {
  const _HeroArt({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final backdrop = slide.title.images.backdrop;
    final still = slide.item.episode?.still;
    return Tone(
      toneKey: slide.title.name,
      child: Picture([
        if (backdrop != null) ArtSource(backdrop, largest: ArtworkSize.xlarge),
        if (still != null) ArtSource(still, largest: ArtworkSize.xlarge),
        FrameSource(slide.item.id),
      ], alignment: Alignment.topCenter),
    );
  }
}

/// One slide's words, placed low on the left on a wide hero and centred on a
/// phone. On a tablet the overview comes over the Play button; on a phone
/// the button comes first and the overview takes two lines under it.
class _HeroPage extends StatelessWidget {
  const _HeroPage({
    required this.slide,
    required this.layout,
    required this.position,
  });

  final FeaturedTitle slide;
  final HomeHeroLayout layout;
  final String position;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final title = slide.title;
    final item = slide.item;
    final facts = heroFacts(
      slide,
      show: l.webRequestsKindShow,
      movie: l.webRequestsKindMovie,
    );
    final episode = item.episode;
    final overview = switch (episode?.overview) {
      final text? when text.trim().isNotEmpty => text,
      _ => title.overview,
    };
    final play = _HeroPlayButton(slide: slide);
    final wide = layout.alignsLeft;
    final content = Column(
      crossAxisAlignment: wide
          ? CrossAxisAlignment.start
          : CrossAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        _HeroLogo(slide: slide, layout: layout),
        if (facts.isNotEmpty) ...[
          SizedBox(height: wide ? 16 : 12),
          Text(
            facts.join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: wide ? TextAlign.start : TextAlign.center,
            style: KitText.sm
                .style(
                  color: _white.withValues(alpha: .9),
                  weight: FontWeight.w600,
                )
                .copyWith(shadows: _shadow),
          ),
        ],
        if (wide) ...[
          if (overview != null) ...[
            const SizedBox(height: 8),
            _overview(context, item, overview, wide: true),
          ],
          const SizedBox(height: 20),
          play,
        ] else ...[
          const SizedBox(height: 20),
          play,
          if (overview != null) ...[
            const SizedBox(height: 12),
            _overview(context, item, overview, wide: false),
          ],
        ],
      ],
    );
    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: [title.name, position].join(', '),
      button: true,
      onTap: () => context.push(Routes.title(title.id)),
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => context.push(Routes.title(title.id)),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            layout.pagePadding,
            0,
            layout.pagePadding,
            layout.contentBottom,
          ),
          child: Align(
            alignment: wide ? Alignment.bottomLeft : Alignment.bottomCenter,
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: wide ? 672 : 480),
              child: content,
            ),
          ),
        ),
      ),
    );
  }

  /// The overview in one line on a wide hero and two on a phone, an
  /// episode's code bold before it.
  Widget _overview(
    BuildContext context,
    MediaItem item,
    String overview, {
    required bool wide,
  }) {
    final l = AppLocalizations.of(context);
    final code = episodeCode(item, l);
    return Text.rich(
      TextSpan(
        children: [
          if (code != null)
            TextSpan(
              text: '$code: ',
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: _white,
              ),
            ),
          TextSpan(text: overview),
        ],
      ),
      maxLines: wide ? 1 : 2,
      overflow: TextOverflow.ellipsis,
      textAlign: wide ? TextAlign.start : TextAlign.center,
      style: KitText.sm.style(color: _white.withValues(alpha: .7), leading: 20),
    );
  }
}

/// The slide's logo, fit into the hero's logo box, or its name when the
/// title has none or the picture won't load. A logo is see-through, so it's
/// drawn with no blurred stand-in beneath it.
class _HeroLogo extends ConsumerStatefulWidget {
  const _HeroLogo({required this.slide, required this.layout});

  final FeaturedTitle slide;
  final HomeHeroLayout layout;

  @override
  ConsumerState<_HeroLogo> createState() => _HeroLogoState();
}

class _HeroLogoState extends ConsumerState<_HeroLogo> {
  /// The logo that wouldn't load.
  String? _failed;

  @override
  Widget build(BuildContext context) {
    final logo = widget.slide.title.images.logo;
    final api = ref.watch(apiProvider);
    final layout = widget.layout;
    final width = math.min(
      HomeHeroLayout.logoWidth,
      MediaQuery.sizeOf(context).width - layout.pagePadding * 2,
    );
    final fallback = ExcludeSemantics(
      child: Text(
        widget.slide.title.name,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: layout.alignsLeft ? TextAlign.start : TextAlign.center,
        style: TextStyle(
          fontFamily: KitText.family,
          fontSize: layout.compact ? 32 : 44,
          height: 1.1,
          fontWeight: FontWeight.w700,
          fontVariations: const [FontVariation('wght', 700)],
          letterSpacing: -.025,
          color: _white,
          shadows: _shadow,
        ),
      ),
    );
    if (logo == null || api == null || _failed == logo.id) return fallback;
    return SizedBox(
      width: width,
      height: layout.logoHeight,
      child: Image(
        image: ArtworkImage(
          api.paths.artwork(
            logo.id,
            size: artworkSizeFor(
              width * MediaQuery.devicePixelRatioOf(context),
              largest: ArtworkSize.large,
            ),
          ),
          ref.watch(artworkLoaderProvider),
        ),
        fit: BoxFit.contain,
        alignment: layout.alignsLeft ? Alignment.centerLeft : Alignment.center,
        excludeFromSemantics: true,
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

/// The white Play pill: Play, or where the file stopped, a small bar and the
/// minutes left. Tapping it starts the file the slide's Play starts.
class _HeroPlayButton extends StatelessWidget {
  const _HeroPlayButton({required this.slide});

  final FeaturedTitle slide;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final item = slide.item;
    final ratio = progressRatio(item);
    final left = timeLeft(item, l);
    final resuming = ratio != null && left != null;
    return PressIndication(
      onPressed: () => context.push(Routes.play(item.id)),
      label: resuming ? l.titleResume : l.titlePlay,
      shape: KitRadius.pill,
      builder: (context, state) => Container(
        height: 44,
        padding: const EdgeInsets.symmetric(horizontal: 18),
        decoration: BoxDecoration(
          color: _white.withValues(
            alpha: state == PressState.pressed ? .85 : 1,
          ),
          borderRadius: KitRadius.pill,
          boxShadow: const [
            BoxShadow(
              color: Color(0x40000000),
              offset: Offset(0, 2),
              blurRadius: 12,
            ),
          ],
        ),
        child: ExcludeSemantics(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 8,
            children: [
              const KitIcon(Lucide.play, size: 18, color: _ink),
              if (resuming) ...[
                ClipRRect(
                  borderRadius: KitRadius.pill,
                  child: SizedBox(
                    width: 40,
                    height: 6,
                    child: ColoredBox(
                      color: _ink.withValues(alpha: .2),
                      child: FractionallySizedBox(
                        alignment: AlignmentDirectional.centerStart,
                        widthFactor: ratio,
                        child: const ColoredBox(color: _ink),
                      ),
                    ),
                  ),
                ),
                Text(
                  left,
                  style: KitText.sm.style(color: _ink, weight: FontWeight.w600),
                ),
              ] else
                Text(
                  l.titlePlay,
                  style: KitText.sm.style(color: _ink, weight: FontWeight.w600),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The hero's place while the featured titles load, in the same shape: the
/// logo's block, its facts, the overview, the Play pill, and the controls.
class HomeHeroSkeleton extends StatelessWidget {
  const HomeHeroSkeleton({super.key, required this.box});

  final Size box;

  @override
  Widget build(BuildContext context) {
    final layout = HomeHeroLayout(width: box.width, height: box.height);
    // Dark as the hero it stands for, so light doesn't flash to dark.
    return MatineeTheme.alwaysDark(context, _skeleton(context, layout));
  }

  Widget _skeleton(BuildContext context, HomeHeroLayout layout) {
    final colors = MatineeTheme.of(context);
    final wide = layout.alignsLeft;
    return Semantics(
      label: AppLocalizations.of(context).loadingInProgress,
      container: true,
      child: Container(
        height: layout.heroHeight,
        color: colors.surface,
        child: Stack(
          children: [
            Padding(
              padding: EdgeInsets.fromLTRB(
                layout.pagePadding,
                0,
                layout.pagePadding,
                layout.contentBottom,
              ),
              child: Align(
                alignment: wide ? Alignment.bottomLeft : Alignment.bottomCenter,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: wide
                      ? CrossAxisAlignment.start
                      : CrossAxisAlignment.center,
                  spacing: 16,
                  children: [
                    SkeletonBox(
                      width: math.min(
                        320,
                        layout.width - layout.pagePadding * 2,
                      ),
                      height: layout.logoHeight * .6,
                      color: colors.secondary,
                    ),
                    SkeletonBox(
                      width: 180,
                      height: 16,
                      color: colors.secondary,
                    ),
                    SkeletonBox(
                      width: 300,
                      height: 16,
                      color: colors.secondary,
                    ),
                    SkeletonBox(
                      width: 140,
                      height: 44,
                      radius: 999,
                      color: colors.secondary,
                    ),
                  ],
                ),
              ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              bottom: HomeHeroLayout.controlsBottom,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SkeletonBox(
                    width: 36,
                    height: 36,
                    radius: 999,
                    color: Color(0x33FFFFFF),
                  ),
                  SizedBox(width: 8),
                  SkeletonBox(
                    width: 64,
                    height: 6,
                    radius: 999,
                    color: Color(0x66FFFFFF),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
