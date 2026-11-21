import 'package:flutter/widgets.dart';

import '../tokens.dart';

/// Type for TV pages, read from three metres on a 960 by 540 screen, as
/// the Kotlin app's `TvType`. The phone's [KitText] stays as it is; TV
/// pages take their styles from here.
enum TvType {
  /// The name a detail page is about: a title, an episode, a person.
  hero(44, 50, FontWeight.w700, -.02),

  /// The focused item's name in a page's header.
  display(34, 40, FontWeight.w700, -.02),

  /// A page's own name, or a large heading.
  headline(26, 32, FontWeight.w700, -.02),

  /// A row's heading.
  title(20, 26, FontWeight.w600, -.01),

  /// The facts under a name: year, runtime, rating.
  facts(16, 22, FontWeight.w500),

  /// Running text, like an overview.
  body(16, 24, FontWeight.w400),

  /// A line under a card, or a drawer entry.
  label(15, 20, FontWeight.w500),

  /// The least that reads from the couch.
  caption(14, 20, FontWeight.w400),

  /// The clock at the top right.
  clock(20, 26, FontWeight.w500),

  /// A number inside an icon, like the seconds in the player's skip arrows,
  /// no smaller than [caption] so it reads from the couch.
  iconNumber(15, 16, FontWeight.w700);

  const TvType(this.size, this.lineHeight, this.weight, [this.tracking = 0]);

  final double size;
  final double lineHeight;
  final FontWeight weight;

  /// Letter spacing, in ems.
  final double tracking;

  TextStyle style({Color? color, List<Shadow>? shadows}) => TextStyle(
    fontFamily: KitText.family,
    fontSize: size,
    height: lineHeight / size,
    fontWeight: weight,
    fontVariations: [FontVariation('wght', weight.value.toDouble())],
    letterSpacing: tracking * size,
    color: color,
    shadows: shadows,
  );

  /// Holds a line to [lineHeight] whatever font its glyphs fall back to,
  /// for text in a box sized by it, like a card's caption.
  StrutStyle get strut => StrutStyle(
    fontFamily: KitText.family,
    fontSize: size,
    height: lineHeight / size,
    forceStrutHeight: true,
  );
}

/// A code to type on another device, like the sign-in code.
const tvCodeStyle = TextStyle(
  fontFamily: 'monospace',
  fontSize: 44,
  height: 54 / 44,
  fontWeight: FontWeight.w600,
  letterSpacing: 4,
);

/// Margins for what a person reads or focuses on a TV, as Wholphin keeps
/// them: 32 at the sides, 27 at the top and bottom. Backdrops still reach
/// the edges, rows run off the right one, and the drawer's rail sits closer
/// to the left edge, its icons centred [railCenter] in.
abstract final class Overscan {
  static const horizontal = 32.0;
  static const vertical = 27.0;

  /// [horizontal] and [vertical] as padding, for a screen with no drawer,
  /// like the player.
  static const padding = EdgeInsets.symmetric(
    horizontal: horizontal,
    vertical: vertical,
  );

  /// Where the collapsed drawer's icons are centred, from the left edge.
  static const railCenter = 32.0;
}

/// Where TV pages start and end across: clear of the drawer's rail on the
/// left, of the overscan on the right.
abstract final class TvPage {
  /// Past the collapsed drawer's rail, with room for a first card's ring.
  static const start = 80.0;
  static const end = Overscan.horizontal;
}

/// Sizes of TV cards and the room around them.
abstract final class TvCards {
  static const posterWidth = 124.0;
  static const landscapeWidth = 224.0;
  static const gap = 20.0;
  static const radius = BorderRadius.all(Radius.circular(10));

  /// Between a row's heading and its cards, with room for the focus ring.
  static const titleGap = 14.0;

  /// A row's heading, one line of [TvType.title].
  static const titleHeight = 26.0;

  /// Room a row keeps beside its focused card, for the ring and growth.
  static const rowInset = 20.0;
}

/// The TV's poster grid.
abstract final class TvGrid {
  /// Columns across a page: posters a little narrower than a row's.
  static const columns = 7;
  static const gap = 18.0;
  static const rowGap = 24.0;

  /// Room above the top row and beside the outer columns, for the ring.
  static const inset = 20.0;

  /// How far down the grid's top edge fades in.
  static const fade = 12.0;

  /// The row key a grid gives its cards in a page's focus memory.
  static const row = 'grid';

  /// Where a grid page's header starts, under the top overscan.
  static const top = Overscan.vertical + 6;

  /// Between the header and the line that names the focused card.
  static const lineGap = 18.0;

  /// Clear of the clock at the top right, for the line while the header
  /// is away.
  static const clockRoom = 140.0;
}

/// The size TV buttons share, so a row of them lines up.
abstract final class TvButtons {
  static const height = 48.0;
  static const iconSize = 20.0;
}

/// How list rows on TV pages and panels look.
abstract final class TvListItems {
  static const radius = BorderRadius.all(Radius.circular(14));
  static const height = 60.0;

  /// Between a row's edge and its content.
  static const inset = 20.0;

  /// Room a row that runs to the overscan keeps beyond it, for its growth
  /// while focused: [TvFocus.rowScale] adds a hundredth of its width on
  /// each side, so a focused row stays where every TV shows it.
  static const focusRoom = 8.0;
}

/// The size of every right-edge panel on a TV, the player's too.
abstract final class TvPanels {
  static const width = 404.0;

  /// Between the panel's edges and its rows: the overscan, and room for a
  /// focused row's growth, so it stays inside the edge the panel sits on.
  static const listPadding = Overscan.horizontal + 4;

  /// Where the panel's heading starts, in line with its rows' text.
  static const textStart = listPadding + TvListItems.inset;
}

/// The Kotlin app's `Motion`, the web's timings.
abstract final class TvMotion {
  /// The web's cubic-bezier(0.22, 1, 0.36, 1).
  static const easing = Cubic(.22, 1, .36, 1);

  /// The web's ease-in, for things on their way out.
  static const exitEasing = Cubic(.4, 0, 1, 1);

  static const move = Duration(milliseconds: 280);
  static const enter = Duration(milliseconds: 200);
  static const exit = Duration(milliseconds: 150);
  static const color = Duration(milliseconds: 120);
}
