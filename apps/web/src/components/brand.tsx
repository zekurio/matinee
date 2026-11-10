import { cn } from "@matinee/ui/lib/utils"
import { useId } from "react"

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
      <defs>
        <linearGradient
          id={gradient}
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
      <path d={SUNSET} fill={`url(#${gradient})`} />
    </svg>
  )
}

/**
 * The mark with the wordmark beside it. The mark scales with the font size,
 * so set the size with a text class.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.5em] text-[15px] leading-none font-semibold tracking-tight",
        className,
      )}
    >
      <LogoMark className="size-[1.6em]" />
      Matinee
    </span>
  )
}
