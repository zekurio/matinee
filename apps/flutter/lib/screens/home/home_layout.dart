import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';

/// The rules Home lays itself out and moves by. Lengths are logical pixels.

/// A hero at least this wide puts its words low on the left, as a tablet's;
/// one narrower centres them, as a phone's.
const wideHeroFromWidth = 600.0;

bool heroAlignsLeft(double width) => width >= wideHeroFromWidth;

/// A featured title's facts: what it is, its age rating, and its year, as
/// the hero's one line. [show] and [movie] are the app's words for each.
List<String> heroFacts(
  FeaturedTitle slide, {
  required String show,
  required String movie,
}) => [
  slide.title.kind == TitleKind.movie ? movie : show,
  ?slide.title.contentRating,
  ?slide.title.year?.toString(),
];

/// The hero's slides, as its repeating pages.
abstract final class HeroPaging {
  /// How many times over the pages repeat, so it can keep going forward.
  static const loops = 1000;

  /// How long a slide stays: the web's 8 seconds.
  static const advance = Duration(seconds: 8);

  static int pages(int count) => count > 1 ? count * loops : count;

  /// The middle of the repeats, so it can go either way.
  static int initialPage(int count) => count > 1 ? count * (loops ~/ 2) : 0;

  /// The slide [page] shows.
  static int slide(int page, int count) =>
      count > 0 ? ((page % count) + count) % count : 0;

  /// The page nearest [from] that shows slide [showing], for a dot's tap.
  static int page(int showing, int from, int count) =>
      from - slide(from, count) + showing;
}

/// Where Home's hero stands in a box [width] by [height]: Home's own, under
/// the status bar and over the tab bar. A tablet gives it three quarters of
/// that; a phone fills it on its side and takes no more than 500 or two
/// thirds of it upright, leaving the first rows in sight.
final class HomeHeroLayout {
  HomeHeroLayout({required this.width, required this.height});

  final double width;
  final double height;

  /// The logo's box, as a tablet's hero shows it.
  static const logoWidth = 400.0;

  /// From the hero's bottom to the controls' bottom edge.
  static const controlsBottom = 16.0;

  /// A tablet's shorter side is at least this; a phone on its side is
  /// shorter than it.
  static const _tabletFrom = 600.0;

  late final bool tablet = math.min(width, height) >= _tabletFrom;

  late final double heroHeight = tablet
      ? height * .75
      : width > height
      ? math.min(500, height)
      : math.min(500, height * .65);

  /// A landscape phone has little height: its logo shrinks so the words
  /// stay off the controls.
  late final bool compact = heroHeight < 450;

  late final bool alignsLeft = heroAlignsLeft(width);

  late final double logoHeight = compact ? 80 : 120;

  /// The room beside the words on a wide hero, and on a phone.
  double get pagePadding => alignsLeft ? 40 : 24;

  /// From the hero's bottom to the words' bottom, over the dots.
  double get contentBottom => alignsLeft ? 80 : 56;
}

/// Home is one error page only when nothing on it could show: the
/// libraries failed, and every other section failed or came back empty.
/// Otherwise what failed is left out, as on the web.
bool failedOutright(
  AsyncValue<Object?> libraries,
  List<AsyncValue<List<Object?>>> sections,
) =>
    libraries.hasError &&
    !libraries.hasValue &&
    sections.every(
      (section) =>
          (section.hasError && !section.hasValue) ||
          (section.hasValue && section.requireValue.isEmpty),
    );
