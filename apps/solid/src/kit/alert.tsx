import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { cva, type VariantProps } from "class-variance-authority"
import { omit } from "solid-js"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "border-destructive/40 bg-destructive/10 text-foreground *:data-[slot=alert-description]:text-foreground/90 *:[svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

/** A short message that stays in the flow of the page. */
function Alert(
  props: ComponentProps<"div"> & VariantProps<typeof alertVariants>,
) {
  return (
    <div
      data-slot="alert"
      role="alert"
      class={cn(alertVariants({ variant: props.variant }), props.class)}
      {...omit(props, "class", "variant")}
    />
  )
}

/** The heading of an alert. */
function AlertTitle(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      class={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The sentence under an alert's title. */
function AlertDescription(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      class={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A control placed in an alert's top right corner. */
function AlertAction(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      class={cn("absolute top-2 right-2", props.class)}
      {...omit(props, "class")}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
