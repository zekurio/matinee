/*
 * The rules Home's showcase lays itself out by, from the Flutter app's
 * `ShowcaseLayout` (`lib/screens/home/home_layout.dart`), with the room the
 * desktop frame takes. Lengths are CSS pixels. The web has no text scale of
 * its own, so text counts at its set size.
 */

/**
 * The width of a 16:9 card in a rail from `lg` up, as `RailItem`'s
 * `clamp(280px, 30vh, 360px)` makes it.
 */
export function landscapeCardWidth(windowHeight: number): number {
  return Math.min(360, Math.max(280, windowHeight * 0.3))
}

/** How long a title stays before the next one takes its place. */
export const ADVANCE_MS = 8000

/** How long the art and the words take to cross over to the next title. */
export const FADE_MS = 450

/**
 * The card's share of a landscape window's height: half, under the Flutter
 * tablet's 58%, so a desktop monitor shows the first row whole and the
 * start of the next.
 */
const LANDSCAPE_SHARE = 0.5

/** The least of a landscape window's height it takes, for the rule below. */
const LANDSCAPE_FLOOR = 0.45

/** The most of a portrait window's height it takes. */
const PORTRAIT_CAP = 0.52

/** The card's padding inside its edge, and the gap over its buttons. */
export const SHOWCASE_PADDING = 32
const BUTTON_GAP = 16

/** The kit's large button. */
const BUTTON_HEIGHT = 40

const WORDS_SHARE = 0.5
const WORDS_MAX = 640

/** The logo's widest. */
export const LOGO_MAX = 420

/** The gap over the overview, and its line height. */
export const OVERVIEW_GAP = 10
export const OVERVIEW_LEADING = 24

/** How far above the card's bottom its words end. */
export const WORDS_BOTTOM = SHOWCASE_PADDING + BUTTON_HEIGHT + BUTTON_GAP

/** The rail's width and the bar's height (`app-shell.tsx`). */
const RAIL = 64
const BAR = 64

/** The space over the card, under the bar, as the Flutter header leaves. */
export const SHOWCASE_TOP = 8

/** Between Home's sections from `sm` up (`home.tsx`), and a heading's row. */
const SECTION_GAP = 32
const HEADING = 28 + 12

/** A 16:9 card's two lines of text under its picture. */
const CARD_TEXT = 8 + 40

/** What's kept clear under the first row, so it doesn't touch the edge. */
const FOLD_MARGIN = 24

/** The page's gutter beside the rail: `pageGutter`'s `sm` and `xl` steps. */
export function showcaseGutter(windowWidth: number): number {
  return windowWidth >= 1280 ? 32 : 24
}

export type Window = { readonly width: number; readonly height: number }

/** The card's width in the desktop frame. */
export function cardWidth(window: Window): number {
  return Math.max(window.width - RAIL - 2 * showcaseGutter(window.width), 0)
}

/**
 * The card's height before its words have a say. In a landscape window,
 * half of it, but no more than leaves the first row
 * whole above the fold on a desktop monitor, and no less than 45%, where a
 * short window lets the row run past the fold instead. In portrait, 16:9
 * of its width, up to 52% of the window.
 */
export function baseHeight(window: Window): number {
  const card = cardWidth(window)
  if (window.width > window.height) {
    const row = (landscapeCardWidth(window.height) * 9) / 16 + CARD_TEXT
    const fit =
      window.height -
      BAR -
      SHOWCASE_TOP -
      SECTION_GAP -
      HEADING -
      row -
      FOLD_MARGIN
    return Math.max(
      Math.min(window.height * LANDSCAPE_SHARE, fit),
      window.height * LANDSCAPE_FLOOR,
    )
  }
  return Math.min((card * 9) / 16, window.height * PORTRAIT_CAP)
}

/** The logo's room in a card `base` tall. */
export function logoHeight(base: number): number {
  return Math.min(112, Math.max(56, base * 0.21))
}

/** A title's name in a card `base` tall, when it has no logo. */
export function titleSize(base: number): number {
  return Math.min(52, Math.max(28, base * 0.09))
}

/**
 * The tallest the words can be in a card `base` tall with `overview` lines
 * of overview: every line a title may show, and the logo's room.
 */
function wordsRoom(base: number, overview: number): number {
  const name = titleSize(base)
  return (
    Math.max(logoHeight(base), 2 * name * 1.1) +
    12 +
    // Two runs of facts, since a narrow card wraps the rating under them.
    2 * 24 +
    6 +
    8 +
    20 +
    (overview > 0 ? OVERVIEW_GAP + overview * OVERVIEW_LEADING : 0) +
    16 +
    16
  )
}

/**
 * The card's height. It starts at {@link baseHeight} and, in portrait,
 * grows for three lines of overview up to 52% of the window. In landscape
 * it keeps its height, and a short card shows fewer lines of overview, or
 * none. Its place while it loads takes the same, so the page doesn't jump.
 */
export function showcaseHeight(window: Window): number {
  const base = baseHeight(window)
  const needs = (overview: number) =>
    SHOWCASE_PADDING + wordsRoom(base, overview) + WORDS_BOTTOM
  const most =
    window.width > window.height
      ? base
      : Math.max(base, window.height * PORTRAIT_CAP)
  return Math.max(Math.max(base, Math.min(needs(3), most)), needs(0))
}

/** How many of the overview's three lines fit the card. */
export function overviewLines(window: Window): number {
  const base = baseHeight(window)
  const room =
    showcaseHeight(window) -
    SHOWCASE_PADDING -
    wordsRoom(base, 0) -
    WORDS_BOTTOM
  return Math.min(
    3,
    Math.max(0, Math.floor((room - OVERVIEW_GAP) / OVERVIEW_LEADING)),
  )
}

/** How wide the words run: no more than half the card. */
export function wordsWidth(window: Window): number {
  return Math.min(cardWidth(window) * WORDS_SHARE, WORDS_MAX)
}
