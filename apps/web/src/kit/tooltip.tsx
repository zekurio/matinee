import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Tooltip as TooltipRoot,
  TooltipArrow,
  TooltipContent as TooltipPopup,
  TooltipTrigger,
} from "@ui-sdk/solid/tooltip"
import { type ComponentProps, createContext, omit, useContext } from "solid-js"

export { TooltipTrigger }

type TooltipTiming = { delay?: number; closeDelay?: number }
const Timing = createContext<TooltipTiming | null>(null)

/** Shares timing defaults across hints. ui-sdk groups nearby tooltips itself. */
export function TooltipProvider(
  props: TooltipTiming & { children?: JSX.Element },
) {
  return <Timing value={props}>{props.children}</Timing>
}

export function Tooltip(props: ComponentProps<typeof TooltipRoot>) {
  const timing = useContext(Timing)
  return (
    <TooltipRoot
      {...props}
      delay={props.delay ?? timing?.delay ?? 0}
      closeDelay={props.closeDelay ?? timing?.closeDelay}
    />
  )
}

/** A short hint, shown on hover or focus. */
export function TooltipContent(
  props: Omit<ComponentProps<typeof TooltipPopup>, "class" | "children"> & {
    class?: string
    children?: JSX.Element
  },
) {
  return (
    <TooltipPopup
      {...omit(props, "class", "children")}
      side={props.side ?? "top"}
      sideOffset={props.sideOffset ?? 4}
      align={props.align ?? "center"}
      alignOffset={props.alignOffset ?? 0}
      class={cn(
        "isolate z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm transition-[opacity,scale,translate] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-2 data-starting-style:data-[side=left]:translate-x-2 data-starting-style:data-[side=right]:-translate-x-2 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 data-instant:transition-none motion-reduce:transition-none",
        props.class,
      )}
    >
      {props.children}
      <TooltipArrow class="bg-foreground pointer-events-none size-2.5 rotate-45 rounded-[2px] data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1 data-[side=top]:-bottom-1" />
    </TooltipPopup>
  )
}
