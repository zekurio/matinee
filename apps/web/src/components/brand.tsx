import { cn } from "@matinee/ui/lib/utils"

/**
 * The ticket's outline with its side notches, and the play triangle cut out
 * of it. One even-odd path, so the cuts show whatever sits behind the mark.
 * Keep in sync with public/favicon.svg.
 */
const TICKET =
  "M3.5 5h17a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5V7a2 2 0 0 1 2-2Z" +
  "M10 8.5v7l5.75-3.5Z"

/**
 * The Matinee mark: a matinee ticket with a play button punched through,
 * in the theme's accent.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("text-brand size-6 shrink-0", className)}
    >
      <path d={TICKET} fillRule="evenodd" fill="currentColor" />
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
