import type { JSX } from "@solidjs/web"

/**
 * A row of chips. Phones scroll it sideways, out to the screen edge; wider
 * screens wrap it.
 */
export const chipRow =
  "-mx-4 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"

// A chip's fixed classes never conflict with what a caller adds, so this
// skips the tailwind merge that `cn` would do for each chip.
export function chipClass(
  active: boolean,
  className?: JSX.ClassValue,
): JSX.ClassValue[] {
  return [
    "focus-visible:ring-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-13px font-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 [@media(pointer:coarse)]:h-10",
    active
      ? "bg-foreground text-background border-transparent"
      : "text-foreground/80 hover:text-foreground border-foreground/15 hover:border-foreground/30",
    className,
  ]
}
