import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { Input as InputPrimitive } from "@ui-sdk/solid/input"
import { omit } from "solid-js"

/** A single-line text field, sized for thumbs and pointers alike. */
function Input(props: ComponentProps<typeof InputPrimitive>) {
  return (
    <InputPrimitive
      data-slot="input"
      class={cn(
        FIELD_CLASS_NAME,
        "h-10 w-full min-w-0 rounded-lg px-3 py-1 md:h-9 [@media(pointer:coarse)]:h-11 text-base file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export { Input }
