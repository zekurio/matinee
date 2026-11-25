import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { cva, type VariantProps } from "class-variance-authority"
import { omit } from "solid-js"

/** An empty state's frame: room for its media, title, text, and action. */
function Empty(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      class={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The title, description, and media of an empty state, kept narrow. */
function EmptyHeader(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      class={cn("flex max-w-sm flex-col items-center gap-2", props.class)}
      {...omit(props, "class")}
    />
  )
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

/** The picture or glyph above an empty state's title. */
function EmptyMedia(
  props: ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>,
) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={props.variant}
      class={cn(emptyMediaVariants({ variant: props.variant }), props.class)}
      {...omit(props, "class", "variant")}
    />
  )
}

/** The one line that says what an empty state is for. */
function EmptyTitle(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      class={cn("text-sm font-medium tracking-tight", props.class)}
      {...omit(props, "class")}
    />
  )
}

/** The supporting sentence under an empty state's title. */
function EmptyDescription(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-description"
      class={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The action, such as a button, under an empty state's text. */
function EmptyContent(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      class={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
