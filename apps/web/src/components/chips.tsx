import { cn } from "@matinee/ui/lib/utils"

/**
 * A row of chips. Phones scroll it sideways, out to the screen edge; wider
 * screens wrap it.
 */
export const chipRow =
  "-mx-4 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"

/** One chip in a row: filled when chosen, outlined otherwise. */
export function chipClass(active: boolean, className?: string): string {
  return cn(
    "focus-visible:ring-ring inline-flex h-9 shrink-0 cursor-default items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 [@media(pointer:coarse)]:h-11",
    active
      ? "bg-foreground text-background border-transparent"
      : "text-foreground/75 hover:text-foreground border-foreground/10 hover:border-foreground/25",
    className,
  )
}
