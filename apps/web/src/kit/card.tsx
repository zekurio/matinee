import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { omit } from "solid-js"

/** A panel that groups related content and actions. */
function Card(props: ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={props.size ?? "default"}
      class={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        props.class,
      )}
      {...omit(props, "class", "size")}
    />
  )
}

/** A card's title, description, and action, laid out as a header. */
function CardHeader(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      class={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A card's heading. */
function CardTitle(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      class={cn(
        "text-base leading-snug font-medium group-data-[size=sm]/card:text-sm",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The explanatory line under a card's title. */
function CardDescription(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...omit(props, "class")}
    />
  )
}

/** A control in the top right of a card's header. */
function CardAction(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      class={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The main body of a card. */
function CardContent(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      class={cn("px-(--card-spacing)", props.class)}
      {...omit(props, "class")}
    />
  )
}

/** A card's closing row of actions, set off by a hairline. */
function CardFooter(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      class={cn(
        "flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
