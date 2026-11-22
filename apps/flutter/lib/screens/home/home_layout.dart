import 'dart:math' as math;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';

/// The rules Home lays itself out and moves by. Lengths are logical pixels.

/// How wide Home's box is before it opens with the banner rather than the
/// cards: a tablet's.
const bannerFromWidth = 600.0;

bool opensWithBanner(double width) => width >= bannerFromWidth;

/// The phone's featured cards: one to a row from margin to margin, with a
/// gutter between, so the next card sits just off the screen.
abstract final class FeaturedCarousel {
  /// How long a card stays before the carousel moves on.
  static const advance = Duration(seconds: 5);

  /// How long the move to the next card takes.
  static const move = Duration(milliseconds: 600);

  /// The most of the window's height a card takes, unless large text needs
  /// more.
  static const maxHeight = .4;

  /// The card's padding around its text, and the gap over the name.
  static const padding = 16.0;
  static const lineGap = 4.0;

  /// The poster's inset from the card's edges, when that's all the title has.
  static const posterInset = 12.0;

  /// A card's width in a row [rowWidth] wide between [gutter]s.
  static double cardWidth(double rowWidth, double gutter) =>
      math.max(rowWidth - 2 * gutter, 0);

  /// 16:9, but no more than 40% of a window [windowHeight] tall.
  static double cardHeight(double cardWidth, double windowHeight) =>
      math.min(cardWidth * 9 / 16, windowHeight * maxHeight);

  /// How much of the card a poster takes, with its inset, at [height].
  static double posterRoom(double height) =>
      (height - posterInset * 2) * 2 / 3 + posterInset;
}

/// The banner's slides, as its repeating pages.
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

enum HeroSize {
  /// A tablet's: buttons well up from the bottom, the dots under them.
  medium,

  /// A desktop's, from 1024 wide: the buttons near the bottom, the dots
  /// level with them.
  large,

  /// Under 540 tall: everything low, no genres.
  short,
}

/// Where the banner puts things in a box [width] by [windowHeight], after
/// the web's breakpoints. [rowsBelow]: Continue watching or Next up follow
/// it (or may, while they load), which on a desktop-sized box keeps it
/// short enough for them to start on the first screen.
final class HeroLayout {
  HeroLayout(this.width, this.windowHeight, {required this.rowsBelow});

  final double width;
  final double windowHeight;
  final bool rowsBelow;

  late final HeroSize size = width >= 1024
      ? HeroSize.large
      : windowHeight <= 540
      ? HeroSize.short
      : HeroSize.medium;

  late final double height = switch (size) {
    HeroSize.large when rowsBelow => math.max(
      360,
      math.min(windowHeight * .64, width * .4),
    ),
    HeroSize.short => windowHeight,
    _ => math.max(math.min(windowHeight * .68, 720), 480),
  };

  /// From the bottom to the buttons' bottom edge.
  double get buttonsBottom => switch (size) {
    HeroSize.large => 32,
    HeroSize.short => 48,
    HeroSize.medium => 112,
  };

  /// Between the buttons and the slide's text above them.
  double get textGap => size == HeroSize.short ? 16 : 24;

  /// From the bottom to the dots, where they aren't level with the buttons.
  double get dotsBottom => size == HeroSize.short ? 12 : 48;

  bool get dotsBesideButtons => size == HeroSize.large;

  bool get showsOverview => switch (size) {
    HeroSize.large => windowHeight > 880,
    HeroSize.short => false,
    HeroSize.medium => windowHeight > 700,
  };

  bool get showsGenres => size != HeroSize.short;

  /// `clamp(2.25rem, 7vh, 3rem)` on a tablet, `clamp(3rem, 5.5vh, 4.5rem)`
  /// on a desktop.
  double get titleSize => size == HeroSize.large
      ? (windowHeight * .055).clamp(48, 72)
      : (windowHeight * .07).clamp(36, 48);
}

/// Whether Continue watching or Next up follow the banner: either has
/// titles, or still loads, as the web's fold assumes they'll come.
bool rowsFollowBanner(
  AsyncValue<List<MediaItem>> resume,
  AsyncValue<List<MediaItem>> nextUp,
) {
  bool coming(AsyncValue<List<MediaItem>> load) => switch (load) {
    AsyncData(:final value) => value.isNotEmpty,
    AsyncError() => false,
    _ => true,
  };
  return coming(resume) || coming(nextUp);
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

/// The genres a featured title lists, at most three.
List<String> shownGenres(FeaturedTitle slide) =>
    slide.title.genres.take(3).toList();

/// The line over a featured card's name: its genres; null with none.
String? cardLine(FeaturedTitle slide) {
  final genres = shownGenres(slide);
  return genres.isEmpty ? null : genres.join(' · ');
}

/// The year, and a show's episode count when it has more than one.
List<String> heroFacts(FeaturedTitle slide, String Function(int) episodes) => [
  if (slide.title.year case final year?) '$year',
  if (slide.title.isShow && slide.count > 1) episodes(slide.count),
];
