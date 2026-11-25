import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { omit } from "solid-js"

/** A pulsing block that holds a spot while its content loads. */
function Skeleton(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      class={cn("animate-pulse rounded-md bg-muted", props.class)}
      {...omit(props, "class")}
    />
  )
}

export { Skeleton }
