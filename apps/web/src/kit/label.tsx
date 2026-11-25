import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { Label as LabelPrimitive } from "@ui-sdk/solid/label"
import { omit } from "solid-js"

/** A name for a control, which focuses or toggles it when pressed. */
function Label(props: ComponentProps<typeof LabelPrimitive>) {
  return (
    <LabelPrimitive
      data-slot="label"
      class={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export { Label }
