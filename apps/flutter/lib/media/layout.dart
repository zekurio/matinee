import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../core/width_class.dart';
import '../kit/kit.dart';

/// What a rail holds, which sets how wide its cards are.
enum RailArt { wide, poster, person }

/// How wide a card is in a rail, as the Kotlin app's `railItemWidth`: on a
/// phone a share of the window, so the next card peeks in, and stills no
/// taller than a third of the window, so two rails fit under the carousel;
/// from a tablet's width up, the web's fixed sizes.
double railItemWidth(RailArt art, Size window) {
  if (!WidthClass.of(window.width).isCompact) {
    return switch (art) {
      RailArt.wide => 300,
      RailArt.poster => 176,
      RailArt.person => 116,
    };
  }
  final inner = window.width - 2 * CardMetrics.gutter;
  return switch (art) {
    RailArt.wide => math.min(inner * .66, window.height * .34 * 16 / 9),
    RailArt.poster => inner * .44,
    RailArt.person => inner * .28,
  };
}

/// How wide a request's card is in Explore's Requests row, the web's
/// `min(88%, 21rem)`: one and a bit on a phone, 336 from a tablet up.
double requestCardWidth(Size window) => WidthClass.of(window.width).isCompact
    ? math.min((window.width - 2 * CardMetrics.gutter) * .88, 336)
    : 336;

/// The art's width to height in a rail of [art].
double railAspect(RailArt art) => switch (art) {
  RailArt.wide => CardMetrics.wide,
  RailArt.poster => CardMetrics.poster,
  RailArt.person => 1,
};

/// A rail's card sizes in this window, at this text size: its width, and
/// the height its art and two lines take.
({double width, double height}) railCardSize(
  BuildContext context,
  RailArt art,
) {
  final width = railItemWidth(art, MediaQuery.sizeOf(context));
  return (
    width: width,
    height: CardMetrics.height(
      width,
      railAspect(art),
      MediaQuery.textScalerOf(context),
    ),
  );
}

/// How many posters a grid [width] wide (inside the gutters) puts in a row,
/// by the window's width class: two on a phone, four on a tablet in
/// portrait, six across a tablet on its side. Near the Kotlin app's
/// 150-wide adaptive columns on the usual screens.
int posterColumns(double width) =>
    switch (WidthClass.of(width + 2 * CardMetrics.gutter)) {
      WidthClass.compact => 2,
      WidthClass.medium => 4,
      WidthClass.expanded => 6,
    };

/// How many stills a grid [width] wide puts in a row: one, two, or three.
int wideColumns(double width) =>
    switch (WidthClass.of(width + 2 * CardMetrics.gutter)) {
      WidthClass.compact => 1,
      WidthClass.medium => 2,
      WidthClass.expanded => 3,
    };
