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
                  builder: (context, state) => Container(
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
          const ItemTopBar(),
        ],
      ),
    );
  }
}

/// The page scrolling under its buttons, the sections [gap] apart. Once
/// it scrolls, a [TopVeil] comes in behind the buttons and the status
/// bar, so the text going under them doesn't show through.
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

  @override
  void dispose() {
    _veil.dispose();
    super.dispose();
  }

  bool _scrolled(ScrollNotification notification) {
    if (notification.depth == 0) {
      _veil.value = (notification.metrics.pixels / TopVeil.travel).clamp(0, 1);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
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
                itemCount: widget.sections.length,
                separatorBuilder: (context, index) =>
                    SizedBox(height: widget.gap),
                itemBuilder: (context, index) => widget.sections[index],
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
  });

  final List<PictureSource> sources;
  final String toneKey;
  final double top;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final background = MatineeTheme.of(context).background;
    final height = backdropHeight(context);
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
  const HeadingPoster({super.key, required this.name, required this.art});

  final String name;
  final Artwork? art;

  @override
  Widget build(BuildContext context) {
    final art = this.art;
    return SizedBox(
      width: isWide(context) ? 180 : 112,
      child: ArtFrame(
        toneKey: name,
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
class LinkedNames extends StatelessWidget {
  const LinkedNames({
    super.key,
    required this.names,
    required this.onPressed,
    this.color,
  });

  final List<String> names;
  final void Function(String name) onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final style = KitText.sm.style(color: color ?? colors.foreground);
    final quiet = KitText.sm.style(color: colors.mutedForeground);
    return Wrap(
      children: [
        for (final (index, name) in names.indexed) ...[
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
          if (index < names.length - 1)
            ExcludeSemantics(
              child: Text(
                index == names.length - 2 ? ' ${l.commonAnd} ' : ', ',
                style: quiet,
              ),
            ),
        ],
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
  const Overview({super.key, required this.text, this.tagline, this.lines = 3});

  final String text;
  final String? tagline;
  final int lines;

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
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
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
                text,
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
    final l = AppLocalizations.of(context);
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
                Row(
                  mainAxisSize: MainAxisSize.min,
                  spacing: 4,
                  children: [
                    KitIcon(
                      Lucide.star,
                      size: 14,
                      color: colors.warning,
                      label: l.mediaHeroRated,
                    ),
                    Text(
                      formatRating(rating, l),
                      style: KitText.sm.style(color: colors.foreground),
                    ),
                  ],
                ),
              for (final flag in flags) Badge(flag),
            ],
          ),
      ],
    );
  }
}

/// A title's name and facts, its poster beside them when [poster] says, as
/// the web's title header.
class TitleHeading extends StatelessWidget {
  const TitleHeading({
    super.key,
    required this.title,
    this.flags = const [],
    this.poster = true,
  });

  final Title title;
  final List<String> flags;
  final bool poster;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final original = title.originalName;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: CardMetrics.gutter),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        spacing: 16,
        children: [
          if (poster) HeadingPoster(name: title.name, art: title.images.poster),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      title.name,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: headlineStyle(colors),
                    ),
                  ),
                  if (original != null && original != title.name)
                    Text(
                      original,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.base.style(color: colors.mutedForeground),
                    ),
                  const SizedBox(height: 8),
                  HeadingFacts(
                    facts: titleFacts(title, l),
                    contentRating: title.contentRating,
                    rating: title.rating,
                    flags: flags,
                  ),
                  if (title.genres.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    LinkedNames(
                      names: title.genres,
                      color: colors.mutedForeground,
                      onPressed: (genre) =>
                          context.push(Routes.browse(genre: genre)),
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
      builder: (context, state) => DecoratedBox(
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
      toneKey: title.name,
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

/// An episode in a season's list: its still, name, and details, opening
/// its page; Play beside it starts it, and a long press opens its menu.
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
              label: [names.title, if (detail.isNotEmpty) detail].join(', '),
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
                            if (detail.isNotEmpty)
                              Text(
                                detail,
                                maxLines: 1,
                                style: KitText.xs.style(
                                  color: colors.mutedForeground,
                                ),
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
