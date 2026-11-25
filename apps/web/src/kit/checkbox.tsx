import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import {
  Checkbox as CheckboxPrimitive,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import { Check } from "lucide"
import { omit } from "solid-js"

import { Icon } from "@/kit/icon"

/** A square box that ticks, in the accent once checked, like the switch. */
function Checkbox(props: ComponentProps<typeof CheckboxPrimitive>) {
  return (
    <CheckboxPrimitive
      data-slot="checkbox"
      class={cn(
        // The after: box widens the hit area past the visible square.
        "peer relative grid size-[18px] shrink-0 cursor-pointer place-items-center rounded-[5px] border border-input-hover outline-none transition-colors after:absolute after:-inset-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
        props.class,
      )}
      {...omit(props, "class", "children")}
    >
      <CheckboxIndicator
        data-slot="checkbox-indicator"
        class="grid place-items-center"
      >
        <Icon icon={Check} class="size-3.5" stroke-width={3} />
      </CheckboxIndicator>
    </CheckboxPrimitive>
  )
}

export { Checkbox }
