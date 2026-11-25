import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { Separator as SeparatorPrimitive } from "@ui-sdk/solid/separator"
import { omit } from "solid-js"

/**
 * A hairline between groups of content. A vertical one takes the height of
 * the row it divides.
 */
function Separator(props: ComponentProps<typeof SeparatorPrimitive>) {
  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={props.orientation ?? "horizontal"}
      class={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        props.class,
      )}
      {...omit(props, "class", "orientation")}
    />
  )
}

export { Separator }
