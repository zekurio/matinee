import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Popover,
  PopoverContent as PopoverPopup,
  PopoverDescription,
  PopoverTitle as PopoverHeading,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { type ComponentProps, omit } from "solid-js"

export { Popover, PopoverDescription, PopoverTrigger }

/** A small frosted panel anchored to a trigger. */
export function PopoverContent(
  props: Omit<ComponentProps<typeof PopoverPopup>, "class"> & {
    class?: string
    portalContainer?: ComponentProps<typeof PopoverPopup>["container"]
    positionerClassName?: string
  },
) {
  return (
    <PopoverPopup
      {...omit(props, "class", "portalContainer", "positionerClassName")}
      container={props.container ?? props.portalContainer}
      align={props.align ?? "center"}
      alignOffset={props.alignOffset ?? 0}
      side={props.side ?? "bottom"}
      sideOffset={props.sideOffset ?? 4}
      class={cn(
        "isolate z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-xl glass p-2.5 text-sm text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 outline-hidden transition-[opacity,scale,translate] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-1 data-starting-style:data-[side=left]:translate-x-2 data-starting-style:data-[side=right]:-translate-x-2 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none",
        props.positionerClassName,
        props.class,
      )}
    />
  )
}

export function PopoverHeader(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="popover-header"
      class={cn(
        "border-border flex min-h-10 shrink-0 items-center justify-between gap-3 border-b px-3 py-1.5 text-sm",
        props.class,
      )}
    />
  )
}

export function PopoverTitle(
  props: Omit<ComponentProps<typeof PopoverHeading>, "class"> & {
    class?: string
  },
) {
  return (
    <PopoverHeading
      {...omit(props, "class")}
      class={cn("font-medium", props.class)}
    />
  )
}
