import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "cn"
import * as React from "react"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        FIELD_CLASS_NAME,
        "field-sizing-content flex min-h-16 w-full min-w-0 rounded-lg px-3 py-2 text-base placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
