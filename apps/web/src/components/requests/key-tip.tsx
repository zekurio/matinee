import { type ComponentProps, omit } from "solid-js"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"

/**
 * A button's tooltip with its key in it, as the search button has. Props
 * a trigger passes, as a popover's does, go through to the button, which
 * `render` draws with the props it's handed.
 */
export function KeyTip(
  props: ComponentProps<typeof TooltipTrigger> & {
    label: string
    keys: string
  },
) {
  return (
    <Tooltip>
      <TooltipTrigger {...omit(props, "label", "keys")} />
      <TooltipContent side="bottom" sideOffset={6}>
        {props.label}
        <kbd
          data-slot="kbd"
          class="bg-background/15 text-11px px-1 font-sans leading-4"
        >
          {props.keys}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}
