import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { Textarea as TextareaPrimitive } from "@ui-sdk/solid/textarea"
import { omit } from "solid-js"

/** A multi-line text field that grows with what it holds. */
function Textarea(props: ComponentProps<typeof TextareaPrimitive>) {
  return (
    <TextareaPrimitive
      data-slot="textarea"
      class={cn(
        FIELD_CLASS_NAME,
        "field-sizing-content flex min-h-16 w-full min-w-0 rounded-lg px-3 py-2 text-base placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export { Textarea }
