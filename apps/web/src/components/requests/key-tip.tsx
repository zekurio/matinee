import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import type { ComponentProps, ReactElement } from "react"

/** A key as the app draws one, like the search button's ⌘K. */
export function Key({ children }: { children: string }) {
  return (
    <kbd
      data-slot="kbd"
      className="bg-foreground/[0.06] text-foreground/80 border-foreground/10 inline-grid h-5 min-w-5 place-items-center rounded border px-1 font-sans text-[11px] leading-none font-medium"
    >
      {children}
    </kbd>
  )
}

/**
 * A button's tooltip with its key in it, as the search button has. Props
 * a trigger passes, as a popover's does, go through to the button.
 */
export function KeyTip({
  label,
  keys,
  children,
  ...props
}: Omit<ComponentProps<typeof TooltipTrigger>, "render" | "children"> & {
  label: string
  keys: string
  children: ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger {...props} render={children} />
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
        <kbd
          data-slot="kbd"
          className="bg-background/15 px-1 font-sans text-[11px] leading-4"
        >
          {keys}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}
