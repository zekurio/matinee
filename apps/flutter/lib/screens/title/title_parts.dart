import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart' hide Title;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/matinee_api.dart';
import '../../core/link_opener.dart';
import '../../core/width_class.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../media/actions.dart';
import '../../media/artwork.dart';
import '../../media/cards.dart';
import '../../media/format.dart';
import '../../media/layout.dart';
import '../../query/failure_view.dart';
import '../../router.dart';
import '../requests/catalog_cards.dart' show CatalogSeasonCard;
import '../requests/request_sheet.dart' show showRequestSheet;
import '../requests/show_gaps.dart';
import 'title_data.dart';

/// The pieces the title, season, and episode pages share.

/// Whether the window is wide enough for a poster beside the heading.
bool isWide(BuildContext context) =>
    !WidthClass.of(MediaQuery.sizeOf(context).width).isCompact;

/// How tall the art across the top of a page is.
double backdropHeight(BuildContext context) =>
    math.min(MediaQuery.sizeOf(context).height * .46, 420);

/// How far down the backdrop a heading with a poster starts, so it
/// overlaps the art's faded end. A phone on its side has so short a
/// backdrop that this would put the poster under Back and Home, so it
/// never starts above the [ItemTopBar]'s lower edge.
double headingTop(BuildContext context) => math.max(
  backdropHeight(context) - 150,
  MediaQuery.paddingOf(context).top + TopVeil.bar,
);

/// Where a phone starts a heading without its poster, lower, for more of
/// the backdrop, as the web's `max(10rem, 30vh)`.
double phoneHeadingTop(BuildContext context) =>
    math.max(160, MediaQuery.sizeOf(context).height * .3);

/// How tall a title's backdrop is: 16:9 on a phone, so the details start
/// nearer the top, else as other pages' [backdropHeight].
double titleBackdropHeight(BuildContext context) => isWide(context)
    ? backdropHeight(context)
    : MediaQuery.sizeOf(context).width * 9 / 16;

/// Where a title's heading starts: on a phone the name just inside the
/// backdrop's foot, never under the [ItemTopBar]; from a tablet's width up
/// the poster, as other pages' [headingTop].
double titleTop(BuildContext context) => isWide(context)
    ? headingTop(context)
    : math.max(
        titleBackdropHeight(context) - 32,
        MediaQuery.paddingOf(context).top + TopVeil.bar,
      );

/// How a title's page lays out its poster beside the rest from a tablet's
/// width up, as the web's from its `sm` and `lg` widths: the poster's
/// width, the gap after it, and how much lower than it the column starts,
/// so the name sits at the foot of the backdrop. Null on a phone, which
/// leaves the poster out.
({double poster, double gap, double columnTop})? titleAside(
  BuildContext context,
) => switch (WidthClass.of(MediaQuery.sizeOf(context).width)) {
  WidthClass.compact => null,
  WidthClass.medium => (poster: 176, gap: 24, columnTop: 96),
  WidthClass.expanded => (poster: 240, gap: 40, columnTop: 112),
};

/// Goes to [route] as the page above in the person's way here: back to it when
/// it's the page before this one, else opened over this one.
void goUp(BuildContext context, String route) {
  final matches = GoRouter.of(context)
      .routerDelegate
      .currentConfiguration
      .matches;
  if (matches.length >= 2) {
    final before = matches[matches.length - 2];
    final location = before is ImperativeRouteMatch
        ? before.matches.uri.toString()
        : before.matchedLocation;
    if (location == route) {
      context.pop();
      return;
    }
  }
  unawaited(context.push(route));
}

/// The page's own buttons over the backdrop: Back, Home, and the page above
/// this one when there is one, each on a veil of the page's color.
class ItemTopBar extends StatelessWidget {
  const ItemTopBar({super.key, this.parent, this.onParent});

  final String? parent;
  final VoidCallback? onParent;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final veil = colors.background.withValues(alpha: .6);
    final parent = this.parent;
    final onParent = this.onParent;
    return SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          spacing: 6,
          children: [
            RoundIconButton(
              icon: Lucide.arrowLeft,
              label: l.commonBack,
              iconSize: 22,
              background: veil,
              onPressed: () =>
                  context.canPop() ? context.pop() : context.go(Routes.home),
            ),
            RoundIconButton(
              icon: Lucide.house,
              label: l.shellHomeLink,
              background: veil,
              onPressed: () => context.go(Routes.home),
            ),
            if (parent != null && onParent != null)
              Flexible(
                child: PressIndication(
                  onPressed: onParent,
                  label: parent,
                  shape: KitRadius.pill,
                  builder: (context, state) => PressFill(
                    height: 44,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: Color.lerp(
                        veil,
                        colors.foreground,
                        state == PressState.idle ? 0 : .08,
                      ),
                      borderRadius: KitRadius.pill,
                    ),
                    child: ExcludeSemantics(
                      child: Center(
                        widthFactor: 1,
                        child: Text(
                          parent,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: KitText.sm.style(
                            color: colors.foreground,
                            weight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A page that shows nothing else until its data comes: its buttons over
/// the spinner, or over what went wrong.
class PageState extends StatelessWidget {
  const PageState({super.key, this.error, this.errorTitle, this.onRetry});

  final Object? error;
  final String? errorTitle;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final error = this.error;
    return ColoredBox(
      color: MatineeTheme.of(context).background,
      child: Stack(
        children: [
          Positioned.fill(
            child: FadeSwitcher(
              value: error == null,
              child: Center(
                child: error == null
                    ? LoadingState(label: l.loadingInProgress)
                    : SingleChildScrollView(
                        padding: const EdgeInsets.symmetric(vertical: 72),
                        child: FailureState(
                          title: errorTitle ?? '',
                          error: error,
                          onRetry: onRetry,
                          onHome: () => context.go(Routes.home),
                        ),
                      ),
              ),
            ),
          ),
          const ItemTopBar(),
        ],
      ),
    );
  }
}

/// The page scrolling under its buttons, the sections [gap] apart. Once
/// it scrolls, a [TopVeil] comes in behind the buttons and the status
/// bar, so the text going under them doesn't show through.
///
/// Coming in over a spinner, it builds a section a frame, the first in
/// view first, holding the spinner's [FadeSwitcher] until every section
/// in view is built: building the page in one frame takes more than a
/// frame at 120 Hz has, and the page fading in over another stutters. A
/// [SectionGroup]'s sections count one a frame too.
class TitleScaffold extends StatefulWidget {
  const TitleScaffold({
    super.key,
    required this.sections,
    this.gap = 24,
    this.parent,
    this.onParent,
  });

  final List<Widget> sections;
  final double gap;
  final String? parent;
  final VoidCallback? onParent;

  @override
  State<TitleScaffold> createState() => _TitleScaffoldState();
}

class _TitleScaffoldState extends State<TitleScaffold> {
  /// How far the veil has come in, 0 at the top of the page to 1 once the
  /// page has scrolled [TopVeil.travel].
  final _veil = ValueNotifier<double>(0);

  /// How many sections are built while they're built one a frame, a
  /// [SectionGroup]'s counted one by one, or null once all are.
  int? _staged;

  /// The last section the list built, to tell when the next would be out
  /// of its reach.
  int _lastBuilt = -1;

  /// Lets the page fade in once its sections are built.
  VoidCallback? _release;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_staged != null || _release != null) return;
    _release = FadeSwitcher.hold(context);
    if (_release != null) {
      _staged = 1;
      _afterFrame();
    }
  }

  @override
  void dispose() {
    _release?.call();
    _veil.dispose();
    super.dispose();
  }

  /// Where each of the list's sections starts in the count of sections,
  /// a group's own counted one by one, and at the end the count of all.
  List<int> _starts() {
    final starts = [0];
    for (final section in widget.sections) {
      final count = section is SectionGroup ? section.sections.length : 1;
      starts.add(starts.last + math.max(1, count));
    }
    return starts;
  }

  void _afterFrame() => WidgetsBinding.instance.addPostFrameCallback((_) {
    final staged = _staged;
    if (!mounted || staged == null) return;
    final starts = _starts();
    // The list's section that holds the one added last frame.
    final last = starts.lastIndexWhere((start) => start <= staged - 1);
    // That section was out of the list's reach, and so are all after it;
    // or they're all in.
    final done = _lastBuilt < last || staged >= starts.last;
    setState(() => _staged = done ? null : staged + 1);
    if (done) {
      _release?.call();
      _release = null;
    } else {
      _afterFrame();
    }
  });

  bool _scrolled(ScrollNotification notification) {
    if (notification.depth == 0) {
      _veil.value = (notification.metrics.pixels / TopVeil.travel).clamp(0, 1);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final starts = _starts();
    final staged = _staged;
    return ColoredBox(
      color: MatineeTheme.of(context).background,
      child: Stack(
        children: [
          Positioned.fill(
            child: NotificationListener<ScrollNotification>(
              onNotification: _scrolled,
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
                child: ListView.separated(
                  padding: EdgeInsets.only(
                    bottom: 32 + MediaQuery.paddingOf(context).bottom,
                  ),
                  itemCount: staged == null || staged >= starts.last
                      ? widget.sections.length
                      : starts.indexWhere((start) => start >= staged, 1),
                  separatorBuilder: (context, index) =>
                      SizedBox(height: widget.gap),
                  itemBuilder: (context, index) {
                    if (index > _lastBuilt) _lastBuilt = index;
                    final section = widget.sections[index];
                    if (section is! SectionGroup) return section;
                    // Always in its scope, so the group keeps its state
                    // when the last of it is built.
                    return _GroupStage(
                      shown: staged == null ? null : staged - starts[index],
                      child: section,
                    );
                  },
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              child: ValueListenableBuilder(
                valueListenable: _veil,
                builder: (context, shown, child) => shown == 0
                    ? const SizedBox.shrink()
                    : Opacity(opacity: shown, child: child),
                child: const TopVeil(),
              ),
            ),
          ),
          ItemTopBar(parent: widget.parent, onParent: widget.onParent),
        ],
      ),
    );
  }
}

/// Sections a page lays out together, as the column beside a title's
/// poster, that [TitleScaffold] still builds one a frame: [builder] gets
/// those built so far, in order, and lays them out.
class SectionGroup extends StatelessWidget {
  const SectionGroup({
    super.key,
    required this.sections,
    required this.builder,
  });

  final List<Widget> sections;
  final Widget Function(BuildContext context, List<Widget> sections) builder;

  @override
  Widget build(BuildContext context) {
    final shown = context
        .dependOnInheritedWidgetOfExactType<_GroupStage>()
        ?.shown;
    return builder(
      context,
      shown == null || shown >= sections.length
          ? sections
          : sections.sublist(0, math.max(0, shown)),
    );
  }
}

/// How many of a [SectionGroup]'s sections are built, or null for all.
class _GroupStage extends InheritedWidget {
  const _GroupStage({required this.shown, required super.child});

  final int? shown;

  @override
  bool updateShouldNotify(_GroupStage oldWidget) => shown != oldWidget.shown;
}

/// The page's colour behind the status bar and the [ItemTopBar], solid as
/// far as the buttons' lower edge, then easing out over [fade], so the
/// text scrolling under them never shows through and the veil ends with
/// no edge to see. Its many stops follow an ease, which keeps the fade
/// from banding.
class TopVeil extends StatelessWidget {
  const TopVeil({super.key});

  /// How far the page scrolls while the veil comes in.
  static const travel = 48.0;

  /// How tall the fade is under the buttons.
  static const fade = 32.0;

  /// The bar's height under the status bar: the buttons and their margin.
  static const bar = 56.0;

  @override
  Widget build(BuildContext context) {
    final background = MatineeTheme.of(context).background;
    final solid = MediaQuery.paddingOf(context).top + bar;
    final height = solid + fade;
    const steps = 12;
    final stops = <double>[0];
    final colors = <Color>[background];
    for (var step = 0; step <= steps; step++) {
      final t = step / steps;
      stops.add((solid + fade * t) / height);
      // A smoothstep from the solid part to nothing, flat at both ends,
      // so neither the top nor the foot of the fade shows a line.
      final alpha = 1 - t * t * (3 - 2 * t);
      colors.add(background.withValues(alpha: alpha));
    }
    return SizedBox(
      height: height,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            stops: stops,
            colors: colors,
          ),
        ),
      ),
    );
  }
}

/// The art across the top of a page, faded into the page: from the start,
/// where the text sits, and up from the bottom, as the web's two shades.
/// [child] is the heading laid over it, from [top] down.
class Backdrop extends StatelessWidget {
  const Backdrop({
    super.key,
    required this.sources,
    required this.toneKey,
    required this.top,
    required this.child,
    this.height,
  });

  final List<PictureSource> sources;
  final String toneKey;
  final double top;
  final Widget child;

  /// How tall the art is; [backdropHeight] when null.
  final double? height;

  @override
  Widget build(BuildContext context) {
    final background = MatineeTheme.of(context).background;
    final height = this.height ?? backdropHeight(context);
    return Stack(
      children: [
        SizedBox(
          height: height,
          width: double.infinity,
          child: Tone(
            toneKey: toneKey,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Picture(sources, alignment: Alignment.topCenter),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: AlignmentDirectional.centerStart,
                      end: AlignmentDirectional.centerEnd,
                      colors: [
                        background.withValues(alpha: .95),
                        background.withValues(alpha: .5),
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
                      stops: const [0, .6, 1],
                      colors: [
                        background.withValues(alpha: 0),
                        background.withValues(alpha: .7),
                        background,
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: EdgeInsets.only(top: top),
          child: child,
        ),
      ],
    );
  }
}

/// A poster at a heading's side: 180 wide on a tablet, 112 on a phone.
class HeadingPoster extends StatelessWidget {
  const HeadingPoster({
    super.key,
    required this.name,
    required this.toneKey,
    required this.art,
  });

  final String name;

  /// What picks its tone while it has no picture: the title's id.
  final String toneKey;
  final Artwork? art;

  @override
  Widget build(BuildContext context) {
    final art = this.art;
    return SizedBox(
      width: isWide(context) ? 180 : 112,
      child: ArtFrame(
        toneKey: toneKey,
        aspectRatio: CardMetrics.poster,
        children: [
          if (art != null) Picture([ArtSource(art)]),
        ],
      ),
    );
  }
}

TextStyle headlineStyle(KitColors colors) => KitText.xxxl
    .style(color: colors.foreground, weight: FontWeight.w700)
    .copyWith(letterSpacing: KitText.xxxl.size * -.025);

/// Names in a run, each a link: "A, B and C".
///
/// With [limit], only so many are named and "2 more" ends the run; without
/// [and], the run is commas only, as the web lists units: "A, B, C".
class LinkedNames extends StatelessWidget {
  const LinkedNames({
    super.key,
    required this.names,
    required this.onPressed,
    this.color,
    this.weight = FontWeight.w400,
    this.limit,
    this.and = true,
  });

  final List<String> names;
  final void Function(String name) onPressed;
  final Color? color;
  final FontWeight weight;
  final int? limit;
  final bool and;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final style = KitText.sm.style(
      color: color ?? colors.foreground,
      weight: weight,
    );
    final quiet = KitText.sm.style(color: colors.mutedForeground);
    final limit = this.limit;
    final shown = limit == null || names.length <= limit
        ? names
        : names.sublist(0, limit);
    final rest = names.length - shown.length;
    final count = shown.length + (rest > 0 ? 1 : 0);
    String separator(int index) =>
        and && index == count - 2 ? ' ${l.commonAnd} ' : ', ';
    return Wrap(
      children: [
        for (final (index, name) in shown.indexed) ...[
          PressIndication(
            onPressed: () => onPressed(name),
            label: name,
            shape: const BorderRadius.all(Radius.circular(4)),
            builder: (context, state) => ExcludeSemantics(
              child: Text(
                name,
                style: state == PressState.idle
                    ? style
                    : style.copyWith(decoration: TextDecoration.underline),
              ),
            ),
          ),
          if (index < count - 1)
            ExcludeSemantics(child: Text(separator(index), style: quiet)),
        ],
        if (rest > 0) Text(l.webPeopleMore(rest), style: style),
      ],
    );
  }
}

/// "Directors  A and B", as the web lists the crew and studios.
class CreditLine extends StatelessWidget {
  const CreditLine({
    super.key,
    required this.label,
    required this.names,
    required this.onPressed,
  });

  final String label;
  final List<String> names;
  final void Function(String name) onPressed;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    spacing: 8,
    children: [
      Text(
        label,
        style: KitText.sm.style(
          color: MatineeTheme.of(context).mutedForeground,
        ),
      ),
      Expanded(
        child: LinkedNames(names: names, onPressed: onPressed),
      ),
    ],
  );
}

/// An overview cut to [lines], with More to read the rest and Less to
/// fold it again, the [tagline] over it.
class Overview extends StatefulWidget {
  const Overview({
    super.key,
    required this.text,
    this.tagline,
    this.lines = 3,
    this.padding = const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
  });

  final String text;
  final String? tagline;
  final int lines;
  final EdgeInsetsGeometry padding;

  @override
  State<Overview> createState() => _OverviewState();
}

class _OverviewState extends State<Overview> {
  var _open = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final style = KitText.base.style(
      color: colors.foreground.withValues(alpha: .85),
    );
    final tagline = widget.tagline;
    final body = TextSpan(
      style: style,
      children: [
        if (tagline != null)
          TextSpan(
            text: '$tagline\n',
            style: style.copyWith(
              color: colors.foreground,
              fontWeight: FontWeight.w500,
              fontVariations: const [FontVariation('wght', 500)],
            ),
          ),
        TextSpan(text: widget.text),
      ],
    );
    return Padding(
      padding: widget.padding,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final painter = TextPainter(
            text: body,
            maxLines: widget.lines,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: constraints.maxWidth);
          final overflows = painter.didExceedMaxLines;
          painter.dispose();
          final text = Text.rich(
            body,
            maxLines: _open ? null : widget.lines,
            overflow: _open ? null : TextOverflow.ellipsis,
          );
          if (!overflows) return text;
          return PressIndication(
            onPressed: () => setState(() => _open = !_open),
            label: _open ? l.titleLess : l.titleMore,
            builder: (context, state) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Opens and closes to its new height, as Findroid's
                // overview does with animateContentSize.
                AnimatedSize(
                  duration: KitMotion.of(context, KitMotion.move),
                  curve: KitMotion.easing,
                  alignment: AlignmentDirectional.topStart,
                  child: text,
                ),
                ExcludeSemantics(
                  child: Text(
                    _open ? l.titleLess : l.titleMore,
                    style: KitText.base.style(color: colors.mutedForeground),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Creators, directors, writers, and studios, each a link to their page.
class CrewLines extends StatelessWidget {
  const CrewLines({super.key, required this.credits, required this.studios});

  final List<Credit> credits;
  final List<String> studios;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final lines = <Widget>[
      for (final kind in [
        CreditKind.creator,
        CreditKind.director,
        CreditKind.writer,
      ])
        if (_people(kind) case final people when people.isNotEmpty)
          CreditLine(
            label: switch (kind) {
              CreditKind.creator => l.peopleCreditCreator(people.length),
              CreditKind.director => l.peopleCreditDirector(people.length),
              _ => l.peopleCreditWriter(people.length),
            },
            names: [for (final person in people) person.name],
            onPressed: (name) => context.push(
              Routes.person(
                name,
                tmdbId: people.firstWhere((p) => p.name == name).tmdbId,
              ),
            ),
          ),
      if (studios.isNotEmpty)
        CreditLine(
          label: l.peopleStudio(studios.length),
          names: studios,
          onPressed: (name) => context.push(Routes.browse(studio: name)),
        ),
    ];
    if (lines.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 6,
        children: lines,
      ),
    );
  }

  List<Credit> _people(String kind) {
    final seen = <String>{};
    return [
      for (final credit in credits)
        if (credit.kind == kind && seen.add(credit.name)) credit,
    ];
  }

  /// Whether there's anything to list.
  static bool any(List<Credit> credits, List<String> studios) =>
      studios.isNotEmpty ||
      credits.any((credit) => credit.kind != CreditKind.actor);
}

/// The cast as round photos, each opening the person's page.
class CastRail extends StatelessWidget {
  const CastRail({super.key, required this.credits});

  final List<Credit> credits;

  static bool any(List<Credit> credits) =>
      credits.any((credit) => credit.kind == CreditKind.actor);

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cast = [
      for (final credit in credits)
        if (credit.kind == CreditKind.actor) credit,
    ];
    final width = railItemWidth(RailArt.person, MediaQuery.sizeOf(context));
    return Rail(
      title: l.titleCast,
      itemWidth: width,
      itemHeight: PersonCard.height(width, MediaQuery.textScalerOf(context)),
      itemCount: cast.length,
      itemBuilder: (context, index) {
        final credit = cast[index];
        final photo = credit.photo;
        return PersonCard(
          name: credit.name,
          role: credit.role,
          photo: photo == null
              ? null
              : Picture([ArtSource(photo, largest: ArtworkSize.small)]),
          onPressed: () =>
              context.push(Routes.person(credit.name, tmdbId: credit.tmdbId)),
        );
      },
    );
  }
}

/// Play, then Trailer and the round watched, favorite, and more buttons,
/// as under a page's heading. Resume says the time left beside it, and
/// Trailer goes once the person has begun it, by resuming or [started],
/// since it's no use then and Resume wants the room. Without
/// [onFavorite], for what can't be a favorite, the heart stays out;
/// without [onMore], for a menu that would be empty, the dots do.
class ActionRow extends ConsumerWidget {
  const ActionRow({
    super.key,
    required this.play,
    required this.watched,
    required this.onWatched,
    this.favorite = false,
    this.onFavorite,
    this.onMore,
    this.trailers = const [],
    this.started = false,
  });

  final MediaItem? play;
  final bool watched;
  final VoidCallback onWatched;
  final bool favorite;
  final VoidCallback? onFavorite;
  final VoidCallback? onMore;
  final List<Trailer> trailers;

  /// Whether some of it is watched, as a show with an episode seen.
  final bool started;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final play = this.play;
    final resume = isResuming(play);
    final label = resume ? l.titleResume : l.titlePlay;
    final left = resume && play != null ? timeLeft(play, l) : null;
    final trailer = resume || started
        ? null
        : pickTrailer(trailers, l.localeName);
    final onFavorite = this.onFavorite;
    final onMore = this.onMore;
    final button = MatineeButton(
      size: ButtonSize.lg,
      label: [label, ?left].join(', '),
      leading: Lucide.play,
      onPressed: play == null ? null : () => context.push(Routes.play(play.id)),
      // The label stays whole and what's left over goes to the time; only where
      // the label alone doesn't fit, as on a 360 wide phone with every round
      // button, it shortens too.
      child: LayoutBuilder(
        builder: (context, constraints) {
          final painter = TextPainter(
            text: TextSpan(
              text: label,
              style: DefaultTextStyle.of(context).style,
            ),
            maxLines: 1,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout();
          final fits = painter.width <= constraints.maxWidth;
          painter.dispose();
          final text = Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          );
          // The button's label says both for a screen reader.
          return ExcludeSemantics(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: 6,
              children: [
                if (fits) text else Flexible(child: text),
                if (left != null && fits)
                  Flexible(
                    child: Text(
                      left,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.accentForeground.withValues(alpha: .6),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 10,
        children: [
          if (isWide(context))
            SizedBox(width: 260, child: button)
          else
            Expanded(child: button),
          if (trailer != null)
            RoundIconButton(
              icon: Lucide.clapperboard,
              label: l.titleTrailer,
              onPressed: () {
                final url = Uri.tryParse(trailer.url);
                if (url != null) unawaited(ref.read(linkOpenerProvider)(url));
              },
            ),
          RoundIconButton(
            icon: Lucide.check,
            label: watched ? l.mediaMarkUnwatched : l.mediaMarkWatched,
            toggled: watched,
            color: watched ? colors.accent : null,
            onPressed: onWatched,
          ),
          if (onFavorite != null)
            RoundIconButton(
              icon: favorite ? Lucide.heartFilled : Lucide.heart,
              label: favorite ? l.mediaRemoveFavorite : l.mediaAddFavorite,
              toggled: favorite,
              color: favorite ? colors.danger : null,
              onPressed: onFavorite,
            ),
          if (onMore != null)
            RoundIconButton(
              icon: Lucide.ellipsis,
              label: l.titleMoreActions,
              onPressed: onMore,
            ),
        ],
      ),
    );
  }
}

/// The facts under a heading in their line, with the rating and badges on
/// a line of their own, so a narrow screen doesn't strand the last badge.
class HeadingFacts extends StatelessWidget {
  const HeadingFacts({
    super.key,
    required this.facts,
    this.contentRating,
    this.rating,
    this.flags = const [],
  });

  final List<String> facts;
  final String? contentRating;
  final double? rating;
  final List<String> flags;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final contentRating = this.contentRating;
    final rating = this.rating;
    final badges = contentRating != null || rating != null || flags.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      spacing: 6,
      children: [
        if (facts.isNotEmpty)
          Text(
            facts.join(' · '),
            style: KitText.sm.style(
              color: colors.foreground.withValues(alpha: .8),
            ),
          ),
        if (badges)
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (contentRating != null) Badge(contentRating, outlined: true),
              if (rating != null)
                ScoreMark(
                  rating,
                  style: KitText.sm.style(color: colors.foreground),
                ),
              for (final flag in flags) Badge(flag),
            ],
          ),
      ],
    );
  }
}

/// A score out of ten by its star, as the web's `Score`: the star in the
/// warning color, [starSize] across, and the number in [style]. A screen
/// reader hears "Rated" and the number.
class ScoreMark extends StatelessWidget {
  const ScoreMark(
    this.score, {
    super.key,
    required this.style,
    this.starSize = 14,
  });

  final double score;
  final TextStyle style;
  final double starSize;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      spacing: 4,
      children: [
        KitIcon(
          Lucide.star,
          size: starSize,
          color: MatineeTheme.of(context).warning,
          label: l.mediaHeroRated,
        ),
        Text(formatRating(score, l), style: style),
      ],
    );
  }
}

/// A title's name, its original name when that differs, and its facts, as
/// the web's title header. A phone gives the name three lines at most.
class TitleHeading extends StatelessWidget {
  const TitleHeading({super.key, required this.title, this.flags = const []});

  final Title title;
  final List<String> flags;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final original = title.originalName;
    final wide = isWide(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              title.name,
              maxLines: wide ? null : 3,
              overflow: wide ? null : TextOverflow.ellipsis,
              style: headlineStyle(colors),
            ),
          ),
          if (original != null && original != title.name)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                original,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: (wide ? KitText.sm : KitText.base).style(
                  color: colors.mutedForeground,
                ),
              ),
            ),
          const SizedBox(height: 8),
          HeadingFacts(
            facts: titleFacts(title, l),
            contentRating: title.contentRating,
            rating: title.rating,
            flags: flags,
          ),
        ],
      ),
    );
  }
}

/// A title's page from a tablet's width up, as the web's: the backdrop,
/// a large poster on it, and beside the poster [sections], from the
/// heading down, starting lower so the name sits at the backdrop's foot.
/// The scaffold builds them one a frame as it would the page's own.
class TitleAside extends StatelessWidget {
  const TitleAside({
    super.key,
    required this.title,
    required this.sources,
    required this.sections,
  });

  final Title title;
  final List<PictureSource> sources;
  final List<Widget> sections;

  @override
  Widget build(BuildContext context) => SectionGroup(
    sections: sections,
    builder: (context, shown) {
      final aside = titleAside(context);
      final poster = title.images.poster;
      return Backdrop(
        sources: sources,
        toneKey: title.id,
        top: titleTop(context),
        child: Padding(
          // Each section keeps the gutter on both sides, so the row only
          // adds the one before the poster.
          padding: const EdgeInsetsDirectional.only(start: CardMetrics.gutter),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (aside != null) ...[
                SizedBox(
                  width: aside.poster,
                  child: ArtFrame(
                    toneKey: title.id,
                    aspectRatio: CardMetrics.poster,
                    children: [
                      if (poster != null) Picture([ArtSource(poster)]),
                    ],
                  ),
                ),
                SizedBox(width: aside.gap - CardMetrics.gutter),
              ],
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(top: aside?.columnTop ?? 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 20,
                    children: shown,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// The overview cut at six lines and the [TitleDetails] under it, or
/// beside it once the column has the room, as the web's from its `xl`
/// width.
class OverviewDetails extends StatelessWidget {
  const OverviewDetails({super.key, required this.title});

  final Title title;

  /// How wide the column is before the details go beside the overview:
  /// the web's at its `xl` width, the poster at its largest beside it.
  static const besideWidth = 880.0;

  /// How wide the details are beside the overview.
  static const detailsWidth = 320.0;

  /// Whether there's either to show.
  static bool any(Title title) =>
      title.overview != null || TitleDetails.any(title);

  @override
  Widget build(BuildContext context) {
    final overview = title.overview;
    final text = overview == null
        ? null
        : Overview(
            text: overview,
            tagline: title.tagline,
            lines: 6,
            padding: EdgeInsets.zero,
          );
    final details = TitleDetails.any(title)
        ? TitleDetails(title: title, padding: EdgeInsets.zero)
        : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: LayoutBuilder(
        builder: (context, constraints) {
          if (text != null &&
              details != null &&
              constraints.maxWidth >= besideWidth) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 40,
              children: [
                Expanded(child: text),
                SizedBox(width: detailsWidth, child: details),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 20,
            children: [?text, ?details],
          );
        },
      ),
    );
  }
}

/// What the provider knows beyond the overview, a label and its value a
/// row, as the web's `TitleDetails`: the genres, each opening its page,
/// the crew, each opening theirs, the studios, and the day it came out.
/// Rows without a value are left out, and the table when all are.
class TitleDetails extends StatelessWidget {
  const TitleDetails({
    super.key,
    required this.title,
    this.padding = const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
  });

  final Title title;
  final EdgeInsetsGeometry padding;

  /// The crew it names, in the web's order.
  static const crewKinds = [
    CreditKind.creator,
    CreditKind.director,
    CreditKind.writer,
  ];

  /// How many of a kind of crew it names before "2 more".
  static const crewNamed = 3;

  /// Whether it has a row to show.
  static bool any(Title title) =>
      title.genres.isNotEmpty ||
      title.studios.isNotEmpty ||
      title.releaseDate != null ||
      title.credits.any((credit) => crewKinds.contains(credit.kind));

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final value = colors.foreground.withValues(alpha: .9);
    final released = formatDay(title.releaseDate, l);
    final rows = <(String, Widget)>[
      if (title.genres.isNotEmpty)
        (
          l.webTitleDetailsGenres(title.genres.length),
          LinkedNames(
            names: title.genres,
            color: value,
            weight: FontWeight.w500,
            and: false,
            onPressed: (genre) => context.push(Routes.browse(genre: genre)),
          ),
        ),
      for (final kind in crewKinds)
        if (_people(kind) case final people when people.isNotEmpty)
          (
            switch (kind) {
              CreditKind.creator => l.peopleCreditCreator(people.length),
              CreditKind.director => l.peopleCreditDirector(people.length),
              _ => l.peopleCreditWriter(people.length),
            },
            LinkedNames(
              names: [for (final person in people) person.name],
              color: value,
              weight: FontWeight.w500,
              limit: crewNamed,
              onPressed: (name) => context.push(
                Routes.person(
                  name,
                  tmdbId: people.firstWhere((p) => p.name == name).tmdbId,
                ),
              ),
            ),
          ),
      if (title.studios.isNotEmpty)
        (
          l.peopleStudio(title.studios.length),
          LinkedNames(
            names: title.studios,
            color: value,
            weight: FontWeight.w500,
            onPressed: (name) => context.push(Routes.browse(studio: name)),
          ),
        ),
      if (released != null)
        (
          l.webTitleDetailsReleased,
          Text(
            released,
            style: KitText.sm.style(color: value, weight: FontWeight.w500),
          ),
        ),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    final label = KitText.sm.style(color: colors.mutedForeground);
    return Padding(
      padding: padding,
      child: Table(
        columnWidths: const {0: IntrinsicColumnWidth(), 1: FlexColumnWidth()},
        children: [
          for (final (index, (name, content)) in rows.indexed)
            TableRow(
              children: [
                Padding(
                  padding: EdgeInsetsDirectional.only(
                    end: 24,
                    top: index == 0 ? 0 : 6,
                  ),
                  child: Text(name, style: label),
                ),
                Padding(
                  padding: EdgeInsets.only(top: index == 0 ? 0 : 6),
                  child: content,
                ),
              ],
            ),
        ],
      ),
    );
  }

  /// The people credited as [kind], each once.
  List<Credit> _people(String kind) {
    final seen = <String>{};
    return [
      for (final credit in title.credits)
        if (credit.kind == kind && seen.add(credit.name)) credit,
    ];
  }
}

/// What a file holds, a line each with its icon: the picture, the audio,
/// and the subtitles. The languages come from the server's track lists,
/// which include subtitle files beside the video; until they load, or if
/// they fail, the probe's counts. Nothing until the server probed it.
class MediaInfo extends ConsumerWidget {
  const MediaInfo({super.key, required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (item.probe == null) return const SizedBox.shrink();
    final l = AppLocalizations.of(context);
    final tracks = ref.watch(fileTracksProvider(item.id)).value;
    final lines = mediaInfoLines(item, tracks, l);
    if (lines.isEmpty) return const SizedBox.shrink();
    final colors = MatineeTheme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        for (final (icon, label, text) in lines)
          MergeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 10,
              children: [
                SizedBox(
                  height: 20,
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
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.sm.style(
                      color: colors.foreground.withValues(alpha: .8),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

/// [MediaInfo]'s lines, each an icon, what it names, and the words: the
/// picture, the audio, and the subtitles, with [tracks] once they load.
/// None until the server probed the file.
List<(String, String, String)> mediaInfoLines(
  MediaItem item,
  FileTracks? tracks,
  AppLocalizations l,
) {
  final probe = item.probe;
  if (probe == null) return const [];
  final audioCount = tracks?.audio.length ?? probe.audio.length;
  final subtitleCount = tracks?.subtitles.length ?? probe.subtitles.length;
  final audioNames = tracks == null
      ? null
      : trackLanguages([
          for (final track
              in tracks.audio
                  .where((t) => t.primary)
                  .followedBy(tracks.audio.where((t) => !t.primary)))
            (language: track.language, title: track.title, label: track.label),
        ]);
  final subtitleNames = tracks == null
      ? null
      : trackLanguages([
          for (final track in tracks.subtitles)
            (language: track.language, title: track.title, label: track.label),
        ]);
  final layout = mainAudio(item)?.layout;
  final audio = [
    ?(audioNames ?? (audioCount > 0 ? l.mediaAudioTracks(audioCount) : null)),
    ?layout,
  ].join(' · ');
  final subtitles =
      subtitleNames ??
      (subtitleCount > 0 ? l.mediaSubtitles(subtitleCount) : null);
  return [
    if (videoSummary(item) case final video?)
      (Lucide.film, l.mediaInfoVideo, video),
    if (audio.isNotEmpty) (Lucide.audioLines, l.mediaInfoAudio, audio),
    if (subtitles != null) (Lucide.captions, l.mediaInfoSubtitles, subtitles),
  ];
}

/// One file in a line: its picture, main audio, and size, as the server
/// words its probe; the server's name for it when it wasn't probed.
String fileLine(MediaItem item, AppLocalizations l) => [
  videoSummary(item) ?? itemNames(item, l).title,
  ?mainAudio(item)?.layout,
  formatBytes(item.sizeBytes, l),
].join(' · ');

/// Which of a movie's files plays, for a movie with more than one: the
/// one picked in a line, opening a sheet of them all.
class FilePicker extends StatelessWidget {
  const FilePicker({
    super.key,
    required this.files,
    required this.selected,
    required this.onSelected,
  });

  final List<MediaItem> files;
  final MediaItem selected;
  final ValueChanged<MediaItem> onSelected;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final line = fileLine(selected, l);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: MatineeButton(
          look: ButtonLook.outline,
          size: ButtonSize.sm,
          leading: Lucide.film,
          trailing: Lucide.chevronDown,
          label: '${l.titleFilePick}, $line',
          onPressed: () => _pick(context),
          child: Text(line),
        ),
      ),
    );
  }

  Future<void> _pick(BuildContext context) async {
    final l = AppLocalizations.of(context);
    final picked = await Sheet.show<MediaItem>(
      context,
      dismissLabel: l.commonCancel,
      builder: (sheet) => Sheet(
        title: l.titleFilePick,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final file in files)
              _FileChoice(
                file: file,
                selected: file.id == selected.id,
                onPressed: () => Navigator.of(sheet).pop(file),
              ),
          ],
        ),
      ),
    );
    if (picked != null) onSelected(picked);
  }
}

class _FileChoice extends StatelessWidget {
  const _FileChoice({
    required this.file,
    required this.selected,
    required this.onPressed,
  });

  final MediaItem file;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final left = timeLeft(file, l);
    return PressIndication(
      onPressed: onPressed,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      shape: KitRadius.control,
      builder: (context, state) => PressFill(
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          color: state == PressState.idle
              ? const Color(0x00000000)
              : colors.secondary,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
          child: Row(
            spacing: 8,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(fileLine(file, l)),
                    if (left != null)
                      Text(
                        left,
                        style: KitText.xs.style(color: colors.mutedForeground),
                      ),
                  ],
                ),
              ),
              if (selected) const KitIcon(Lucide.check, size: 16),
            ],
          ),
        ),
      ),
    );
  }
}

/// A season by its poster, with how many episodes are left or a check. A
/// long press opens its menu. [partial] is what the server lacks of it,
/// for "3 of 10 episodes here".
class SeasonCard extends StatelessWidget {
  const SeasonCard({
    super.key,
    required this.title,
    required this.season,
    this.partial,
  });

  final TitleSummary title;
  final Season season;
  final CatalogSeason? partial;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final name = seasonName(season.number, l);
    final left = season.itemCount - season.watchedCount;
    final art = season.poster ?? title.images.poster;
    return PosterCard(
      name: name,
      toneKey: title.id,
      detail: switch (partial) {
        final partial? => partialLine(partial, l),
        null => l.mediaEpisodeCount(season.itemCount),
      },
      art: art == null ? null : Picture([ArtSource(art)]),
      artCovers: art?.placeholder != null,
      watchedLabel: left <= 0 ? l.mediaWatched : null,
      badge: left <= 0
          ? null
          : Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: colors.accent,
                borderRadius: KitRadius.pill,
              ),
              child: Text(
                '$left',
                style: KitText.xs.style(
                  color: colors.accentForeground,
                  weight: FontWeight.w600,
                ),
              ),
            ),
      onPressed: () => context.push(seasonRoute(title.id, season.number)),
      onLongPress: () => showActions(context, SeasonActions(title, season)),
      longPressLabel: l.titleMoreActions,
    );
  }
}

/// A show's seasons by their posters; on a season's page, [onSeason], the
/// others, as "More seasons". [current] is that season's number, null for
/// the files without one. After them, the seasons the server lacks, from
/// [gaps], each with its state and its ask.
class SeasonsRail extends StatelessWidget {
  const SeasonsRail({
    super.key,
    required this.title,
    this.onSeason = false,
    this.current,
    this.gaps,
  });

  final Title title;
  final bool onSeason;
  final int? current;
  final ShowGaps? gaps;

  /// Whether it has a card to show.
  static bool any(
    Title title, {
    bool onSeason = false,
    int? current,
    ShowGaps? gaps,
  }) =>
      shown(title, onSeason: onSeason, current: current).isNotEmpty ||
      (gaps?.missing.isNotEmpty ?? false);

  /// The seasons it shows.
  static List<Season> shown(
    Title title, {
    bool onSeason = false,
    int? current,
  }) => [
    for (final season in title.seasons)
      if (!onSeason || season.number != current) season,
  ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final seasons = shown(title, onSeason: onSeason, current: current);
    final gaps = this.gaps;
    final missing = gaps?.missing ?? const <CatalogSeason>[];
    final size = railCardSize(context, RailArt.poster);
    final summary = title.summary;
    return Rail(
      title: onSeason ? l.titleSeasonsMore : l.titleSeasons,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: seasons.length + missing.length,
      itemBuilder: (context, index) {
        if (index < seasons.length) {
          final season = seasons[index];
          return SeasonCard(
            title: summary,
            season: season,
            partial: gaps?.partialOf(season.number),
          );
        }
        final season = missing[index - seasons.length];
        return CatalogSeasonCard(
          show: gaps!.ref,
          showName: title.name,
          showPoster: title.images.poster,
          season: season,
          onRequest: () => showRequestSheet(
            context,
            title: gaps.ref,
            name: title.name,
            seasons: gaps.missing,
            first: gaps.first,
            libraryId: gaps.libraryId,
            showPoster: title.images.poster,
            only: season.number,
          ),
        );
      },
    );
  }
}

/// A season's episodes as a row of stills, starting at the one up next, or
/// at [start] when set.
class EpisodesRail extends StatelessWidget {
  const EpisodesRail({
    super.key,
    required this.title,
    required this.items,
    this.next,
    this.start,
    this.onSeeAll,
    this.seeAllLabel,
    this.trailing,
  });

  final String title;
  final List<MediaItem> items;

  /// A card after the episodes, as the ask for the rest of the season.
  final Widget? trailing;
  final MediaItem? next;

  /// The card to open at, the leading one.
  final int? start;
  final VoidCallback? onSeeAll;
  final String? seeAllLabel;

  @override
  Widget build(BuildContext context) {
    final size = railCardSize(context, RailArt.wide);
    final start = this.start ?? items.indexWhere((item) => item.id == next?.id);
    return Rail(
      title: title,
      itemWidth: size.width,
      itemHeight: size.height,
      itemCount: items.length + (trailing == null ? 0 : 1),
      initialIndex: math.max(0, start),
      onSeeAll: onSeeAll,
      seeAllLabel: seeAllLabel,
      itemBuilder: (context, index) => index < items.length
          ? EpisodeCard(item: items[index], showName: false)
          : trailing!,
    );
  }
}

/// A still that plays [item] on a tap, Play on it under a mouse or focus,
/// with the check or how far in the person is.
class Still extends StatelessWidget {
  const Still({
    super.key,
    required this.item,
    required this.onPressed,
    this.radius = CardMetrics.radius,
    this.playSize = 64,
  });

  final MediaItem item;
  final VoidCallback onPressed;
  final BorderRadius radius;
  final double playSize;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final names = itemNames(item, l);
    final ratio = progressRatio(item);
    final watched = isWatched(item);
    final play = l.mediaPlayNamed(names.title);
    return PressIndication(
      onPressed: onPressed,
      label: play,
      shape: radius,
      builder: (context, state) => ArtFrame(
        toneKey: names.showName,
        aspectRatio: CardMetrics.wide,
        children: [
          Picture(landscapeSources(item)),
          if (watched)
            PositionedDirectional(
              top: 8,
              end: 8,
              child: WatchedBadge(label: l.mediaWatched, size: 24),
            )
          else if (ratio != null && ratio > 0)
            Align(
              alignment: Alignment.bottomCenter,
              child: WatchProgressBar(progress: ratio),
            ),
          if (state == PressState.hovered || state == PressState.focused)
            Center(
              child: ExcludeSemantics(
                child: PlayGlyph(
                  onPressed: onPressed,
                  label: play,
                  size: playSize,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// The episode up next on a show's page, as the web's: a big still that
/// opens it, its number and name, air date and length, and what happens.
class NextUpEpisode extends StatelessWidget {
  const NextUpEpisode({super.key, required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final names = itemNames(item, l);
    final number = episodeNumberLabel(item, l);
    final heading = number == null
        ? names.title
        : l.titleEpisodesCodedName(number, names.title);
    final detail = [
      ?formatDay(item.episode?.airDate, l),
      ?(timeLeft(item, l) ?? formatRuntime(runtimeMinutes(item), l)),
    ].join(' · ');
    final overview = item.episode?.overview;
    void open() => context.push(Routes.episode(item.id));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SectionTitle(
            title: item.progress != null
                ? l.titleNextUpContinue
                : l.titleNextUpNext,
          ),
          const SizedBox(height: 12),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: Still(item: item, onPressed: open),
            ),
          ),
          const SizedBox(height: 10),
          PressIndication(
            onPressed: open,
            onLongPress: () => showActions(context, ItemActions(item)),
            longPressLabel: l.titleMoreActions,
            label: heading,
            builder: (context, state) => ExcludeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    heading,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: KitText.base.style(
                      color: colors.foreground,
                      weight: FontWeight.w600,
                    ),
                  ),
                  if (detail.isNotEmpty)
                    Text(
                      detail,
                      style: KitText.xs.style(color: colors.mutedForeground),
                    ),
                  if (overview != null) ...[
                    const SizedBox(height: 6),
                    Text(
                      overview,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.sm.style(
                        color: colors.foreground.withValues(alpha: .8),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// An episode in a season's list: its still, name, details, and score,
/// opening its page; Play beside it starts it, and a long press opens its
/// menu.
class EpisodeRow extends StatelessWidget {
  const EpisodeRow({super.key, required this.item});

  final MediaItem item;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final names = itemNames(item, l);
    final ratio = progressRatio(item);
    final watched = isWatched(item);
    final detail = [
      ?episodeNumberLabel(item, l),
      ?(timeLeft(item, l) ?? formatRuntime(runtimeMinutes(item), l)),
    ].join(' · ');
    final score = item.episode?.rating;
    final overview = item.episode?.overview;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        spacing: 4,
        children: [
          Expanded(
            child: PressIndication(
              onPressed: () => context.push(itemRoute(item)),
              onLongPress: () => showActions(context, ItemActions(item)),
              longPressLabel: l.titleMoreActions,
              label: [
                names.title,
                if (detail.isNotEmpty) detail,
                if (score != null)
                  l.webFiltersCardScoreSpoken(formatRating(score, l)),
              ].join(', '),
              shape: CardMetrics.radius,
              builder: (context, state) => ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    spacing: 14,
                    children: [
                      SizedBox(
                        width: 144,
                        child: ArtFrame(
                          toneKey: names.showName,
                          aspectRatio: CardMetrics.wide,
                          children: [
                            Picture(landscapeSources(item)),
                            if (watched)
                              PositionedDirectional(
                                top: 5,
                                end: 5,
                                child: WatchedBadge(
                                  label: l.mediaWatched,
                                  size: 18,
                                ),
                              )
                            else if (ratio != null && ratio > 0)
                              Align(
                                alignment: Alignment.bottomCenter,
                                child: WatchProgressBar(
                                  progress: ratio,
                                  inset: 6,
                                ),
                              ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              names.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: KitText.sm.style(
                                color: colors.foreground,
                                weight: names.untitled
                                    ? FontWeight.w400
                                    : FontWeight.w500,
                              ),
                            ),
                            // The score stays whole while the rest gives
                            // way, as the web's cards have it.
                            if (detail.isNotEmpty || score != null)
                              Row(
                                spacing: 8,
                                children: [
                                  if (detail.isNotEmpty)
                                    Flexible(
                                      child: Text(
                                        detail,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: KitText.xs.style(
                                          color: colors.mutedForeground,
                                        ),
                                      ),
                                    ),
                                  if (score != null)
                                    ScoreMark(
                                      score,
                                      starSize: 12,
                                      style: KitText.xs.style(
                                        color: colors.mutedForeground,
                                      ),
                                    ),
                                ],
                              ),
                            if (overview != null)
                              Text(
                                overview,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: KitText.xs.style(
                                  color: colors.textFaint,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          RoundIconButton(
            icon: Lucide.play,
            label: l.mediaPlayNamed(names.title),
            size: 40,
            iconSize: 16,
            background: const Color(0x00000000),
            onPressed: () => context.push(Routes.play(item.id)),
          ),
        ],
      ),
    );
  }
}
