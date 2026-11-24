import { cn } from "@matinee/ui/lib/utils"
import { createUniqueId } from "solid-js"

import { LOGO } from "@/components/logo.gen"

/**
 * A sun going down behind three horizon bands: the cap, then two slices
 * that the gaps cut out of the disc (radius 10, centered at 12,13). Each
 * piece is its own subpath, so the gaps show whatever sits behind the mark.
 * Keep in sync with brand/mark.svg.
 */
const SUNSET =
  "M2.22 15.1A10 10 0 1 1 21.78 15.1Z" +
  "M2.53 16.2H21.47A10 10 0 0 1 20.77 17.8H3.23A10 10 0 0 1 2.53 16.2Z" +
  "M4.15 19.2H19.85A10 10 0 0 1 18.38 20.7H5.62A10 10 0 0 1 4.15 19.2Z"

/** The mark's gradient and path, on its 24 unit grid. */
function Sunset(props: { id: string; transform?: string }) {
  return (
    <>
      <defs>
        <linearGradient
          id={props.id}
          x1="0"
          y1="3"
          x2="0"
          y2="20.7"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ "stop-color": "var(--logo-sun)" }} />
          <stop offset="0.5" style={{ "stop-color": "var(--logo-dusk)" }} />
          <stop offset="1" style={{ "stop-color": "var(--logo-horizon)" }} />
        </linearGradient>
      </defs>
      <path d={SUNSET} fill={`url(#${props.id})`} transform={props.transform} />
    </>
  )
}

/**
 * The Matinee mark: an afternoon sun, amber at the top and blue at the
 * horizon. The colors are the logo's own (`--logo-*` in globals.css), a
 * deeper set in light mode, and don't follow the server's accent.
 */
export function LogoMark(props: { class?: string }) {
  const gradient = createUniqueId()
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      class={cn("size-6 shrink-0", props.class)}
    >
      <Sunset id={gradient} />
    </svg>
  )
}

/**
 * The mark with the wordmark beside it, lowercase "matinee" drawn as
 * outlines (brand/wordmark.py). The word takes the text color. It is as
 * tall as the font size, so set the size with a text class or a height.
 */
export function Logo(props: { class?: string; label?: string }) {
  const gradient = createUniqueId()
  return (
    <svg
      viewBox={`0 0 ${LOGO.width} ${LOGO.height}`}
      role="img"
      aria-label={props.label ?? "Matinee"}
      class={cn("h-[1em] w-auto shrink-0 text-15px", props.class)}
    >
      <Sunset id={gradient} transform={LOGO.mark} />
      <path
        d={LOGO.path}
        fill="currentColor"
        transform={`translate(${LOGO.wordX} 0)`}
      />
    </svg>
  )
}
