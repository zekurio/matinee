import type { Artwork } from "@matinee/contracts"
import { Star } from "lucide"
import makeQrCode from "qrcode-generator"
import { For, Show, createMemo } from "solid-js"

import { tr } from "../i18n"
import { formatRating } from "../model/format"
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
  style?: Record<string, string>
}) {
  const any = () =>
    props.facts.length > 0 ||
    Boolean(props.contentRating) ||
    (props.rating !== null && props.rating !== undefined) ||
    (props.flags?.length ?? 0) > 0
  return (
    <Show when={any()}>
      <div class={cx("facts t-facts", props.class)} style={props.style}>
        {props.facts.length > 0 && <span>{props.facts.join("  ·  ")}</span>}
        {props.contentRating && (
          <span class="boxed t-caption">{props.contentRating}</span>
        )}
        {props.rating !== null && props.rating !== undefined && (
          <span class="rating" aria-label={tr("mediaHeroRated")}>
            <Icon icon={Star} size={16} filled />
            {formatRating(props.rating)}
          </span>
        )}
        <For each={props.flags ?? []}>
          {(flag) => <span class="boxed t-caption">{flag}</span>}
        </For>
      </div>
    </Show>
  )
}

/**
 * The focused card's name and facts on one line, for a grid's header, so
 * the cards themselves stay pictures. Empty while nothing has focus, at
 * the same height, so what's under it doesn't move.
 */
export function FocusLine(props: { item: FocusedItem | null }) {
  return (
    <div class="facts" style={{ height: "30rem" }}>
      <Show when={props.item}>
        {(item) => (
          <>
            <span
              class="t-title one-line"
              style={{ color: "var(--fg)", "min-width": 0 }}
            >
              {item().name}
            </span>
            <Facts
              facts={item().facts}
              contentRating={item().contentRating}
              rating={item().rating}
            />
          </>
        )}
      </Show>
    </div>
  )
}

/**
 * A QR code of `text`, dark on a light card with the quiet zone a phone's
 * camera needs, `size` units across.
 */
export function QrCode(props: { text: string; label: string; size: number }) {
  const cells = createMemo(() => {
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
  })
  const quiet = 3
  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${cells().count + quiet * 2} ${cells().count + quiet * 2}`}
      style={{
        width: `${props.size}rem`,
        height: `${props.size}rem`,
        background: "#ffffff",
        "border-radius": `${props.size / 14}rem`,
        // Whole cells, with no seams between them at any size.
        "shape-rendering": "crispEdges",
      }}
      role="img"
      aria-label={props.label}
    >
      <path d={cells().path} fill="#000000" />
    </svg>
  )
}
