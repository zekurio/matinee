import { cn } from "@matinee/ui/lib/utils"
import { useId } from "react"

import { LOGO } from "./logo.gen"

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

/**
 * The Matinee mark: an afternoon sun, amber at the top and blue at the
 * horizon. The colors are the logo's own (`--logo-*` in globals.css), a
 * deeper set in light mode, and don't follow the server's accent.
 */
export function LogoMark({ className }: { className?: string }) {
  const gradient = useId()
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6 shrink-0", className)}
    >
      <Sunset id={gradient} />
    </svg>
  )
}

/** The mark's gradient and path, on its 24 unit grid. */
function Sunset({ id, transform }: { id: string; transform?: string }) {
  return (
    <>
      <defs>
        <linearGradient
          id={id}
          x1="0"
          y1="3"
          x2="0"
          y2="20.7"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" style={{ stopColor: "var(--logo-sun)" }} />
          <stop offset="0.5" style={{ stopColor: "var(--logo-dusk)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-horizon)" }} />
        </linearGradient>
      </defs>
      <path d={SUNSET} fill={`url(#${id})`} transform={transform} />
    </>
  )
}

/**
 * The mark with the wordmark beside it, lowercase "matinee" in Unbounded
 * Bold drawn as outlines (brand/wordmark.py). The word takes the text
 * color. It is as tall as the font size, so set the size with a text class.
 */
export function Logo({ className }: { className?: string }) {
  const gradient = useId()
  return (
    <svg
      viewBox={`0 0 ${LOGO.width} ${LOGO.height}`}
      role="img"
      aria-label="Matinee"
      className={cn("h-[1em] w-auto shrink-0 text-[15px]", className)}
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
