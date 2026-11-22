import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/width_class.dart';

/// The rules Home lays itself out and moves by. Lengths are logical pixels.

/// Home's featured cards on a phone: one to a row from margin to margin, so
/// the next card sits just off the screen.
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

/// Home's featured titles on a tablet: one tall card, inset from the page by
/// the same gutter the rows under it start at, showing one title at a time.
/// [shows] picks it over the phone's cards by the window's shorter side, so a
/// phone on its side keeps the phone's cards.
abstract final class ShowcaseLayout {
  /// How long a title stays before the next one takes its place: the web's
  /// eight seconds.
  static const advance = Duration(seconds: 8);

  /// How long the art and the words take to cross over to the next title.
  static const fade = Duration(milliseconds: 450);

  /// The card's share of a landscape window's height, which leaves the next
  /// row's heading and the top of its cards showing under it.
  static const landscapeShare = .58;

  /// The most of a portrait window's height the card takes, for a window only
  /// just taller than it is wide.
  static const portraitCap = .52;

  /// The card's padding inside its edge, and the gap over its buttons.
  static const padding = 32.0;
  static const buttonGap = 16.0;

  /// The most of the card's width its words take, and their widest on a
  /// desktop.
  static const wordsShare = .5;
  static const wordsMax = 640.0;

  /// The logo's widest, and its room above the facts.
  static const logoMax = 420.0;

  /// Whether Home opens with the showcase: a window whose shorter side isn't
  /// a phone's. A phone on its side keeps the phone's cards.
  static bool shows(Size window) =>
      !WidthClass.of(math.min(window.width, window.height)).isCompact;

  /// The card's width in [window], with [gutter] on either side.
  static double width(Size window, double gutter) =>
      math.max(window.width - 2 * gutter, 0);

  /// The card's height in [window] with [gutter] on either side: roughly 58%
  /// of a landscape window, so the row under it still starts on screen, and
  /// 16:9 of its width in portrait.
  static double height(Size window, double gutter) {
    final card = width(window, gutter);
    if (window.width > window.height) return window.height * landscapeShare;
    return math.min(card * 9 / 16, window.height * portraitCap);
  }

  /// How wide the words in the card run: no more than half of it.
  static double wordsWidth(double cardWidth) =>
      math.min(cardWidth * wordsShare, wordsMax);

  /// The logo's room at a card [cardHeight] tall.
  static double logoHeight(double cardHeight) =>
      (cardHeight * .21).clamp(56, 112).toDouble();

  /// A title's name at a card [cardHeight] tall, when it has no logo.
  static double titleSize(double cardHeight) =>
      (cardHeight * .09).clamp(28, 52).toDouble();
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
