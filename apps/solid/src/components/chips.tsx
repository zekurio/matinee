import type { JSX } from "@solidjs/web"

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
