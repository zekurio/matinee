import type { Artwork } from "@matinee/contracts"
import { Star } from "lucide"
import { useMemo } from "preact/hooks"
import makeQrCode from "qrcode-generator"

import { tr } from "@/i18n"
import { formatRating } from "@/model/format"

import { cx, Icon } from "./base"

/** What a page's header says about a focused card, and the picture behind it. */
export type FocusedItem = {
  name: string
  /** The title's logo, a show's for an episode, shown in place of `name`. */
  logo: Artwork | null
  /** The episode, or what a show got last. */
  subtitle: string | null
  facts: readonly string[]
  contentRating: string | null
  rating: number | null
  overview: string | null
  backdrop: readonly string[]
}

/** Year, length, and the like, then the age rating in a box, the score by its star, and the file's badges. */
export function Facts(props: {
  facts: readonly string[]
  contentRating?: string | null
  rating?: number | null
  flags?: readonly string[]
  class?: string
  style?: { marginTop?: string }
}) {
  const { facts, contentRating, rating, flags = [] } = props
  if (
    facts.length === 0 &&
    !contentRating &&
    (rating === null || rating === undefined) &&
    flags.length === 0
  ) {
    return null
  }
  return (
    <div class={cx("facts t-facts", props.class)} style={props.style}>
      {facts.length > 0 && <span>{facts.join("  ·  ")}</span>}
      {contentRating && <span class="boxed t-caption">{contentRating}</span>}
      {rating !== null && rating !== undefined && (
        <span class="rating" aria-label={tr("media_hero_rated")}>
          <Icon icon={Star} size={16} filled />
          {formatRating(rating)}
        </span>
      )}
      {flags.map((flag) => (
        <span key={flag} class="boxed t-caption">
          {flag}
        </span>
      ))}
    </div>
  )
}

/**
 * The focused card's name and facts on one line, for a grid's header, so
 * the cards themselves stay pictures. Empty while nothing has focus, at
 * the same height, so what's under it doesn't move.
 */
export function FocusLine(props: { item: FocusedItem | null }) {
  const { item } = props
  return (
    <div class="facts" style={{ height: "30rem" }}>
      {item && (
        <>
          <span
            class="t-title one-line"
            style={{ color: "var(--fg)", minWidth: 0 }}
          >
            {item.name}
          </span>
          <Facts
            facts={item.facts}
            contentRating={item.contentRating}
            rating={item.rating}
          />
        </>
      )}
    </div>
  )
}

/**
 * A QR code of `text`, dark on a light card with the quiet zone a phone's
 * camera needs, `size` units across.
 */
export function QrCode(props: { text: string; label: string; size: number }) {
  const cells = useMemo(() => {
    const code = makeQrCode(0, "M")
    code.addData(props.text)
    code.make()
    const count = code.getModuleCount()
    const rows: string[] = []
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) rows.push(`M${column} ${row}h1v1h-1z`)
      }
    }
    return { count, path: rows.join("") }
  }, [props.text])
  const quiet = 3
  const side = cells.count + quiet * 2
  const size = `${props.size}rem`
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${side} ${side}`}
      style={{
        width: size,
        height: size,
        background: "#ffffff",
        borderRadius: `${props.size / 14}rem`,
        // Whole cells, with no seams between them at any size.
        "shape-rendering": "crispEdges",
      }}
      role="img"
      aria-label={props.label}
    >
      <path d={cells.path} fill="#000000" />
    </svg>
  )
}
