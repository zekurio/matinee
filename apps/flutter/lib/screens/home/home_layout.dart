import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/width_class.dart';

/// The rules Home lays itself out and moves by. Lengths are logical pixels.

/// Home's featured cards: one to a row from margin to margin on a phone, and
/// on a tablet one wide card centred with the cards before and after it
/// peeking in at the edges. Findroid shows two or three cards at a tablet's
/// width; Home shows one on purpose, like the large streaming apps.
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

  /// How much of the cards before and after a tablet's show at the edges.
  static const peek = 32.0;

  /// Whether the cards before and after show at the edges: a tablet's do. The
  /// window's shorter side decides, so a phone on its side keeps the phone's
  /// card rather than taking a tablet's.
  static bool showsNeighbours(Size window) =>
      !WidthClass.of(math.min(window.width, window.height)).isCompact;

  /// A card's width in [window] between [gutter]s. A phone's card runs from
  /// margin to margin; a tablet's leaves [peek] of the cards either side
  /// showing, and a gutter between each and its neighbour.
  static double cardWidth(Size window, double gutter) {
    final margins = showsNeighbours(window) ? 2 * (peek + gutter) : 2 * gutter;
    return math.max(window.width - margins, 0);
  }

  /// 16:9, but no more than 40% of a window [windowHeight] tall.
  static double cardHeight(double cardWidth, double windowHeight) =>
      math.min(cardWidth * 9 / 16, windowHeight * maxHeight);

  /// How much of the card a poster takes, with its inset, at [height].
  static double posterRoom(double height) =>
      (height - posterInset * 2) * 2 / 3 + posterInset;
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
