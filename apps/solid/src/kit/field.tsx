import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps, JSX } from "@solidjs/web"
import {
  Field as FieldPrimitive,
  FieldDescription as FieldDescriptionPrimitive,
  FieldError as FieldErrorPrimitive,
  FieldGroup as FieldGroupPrimitive,
  FieldLabel as FieldLabelPrimitive,
  FieldLegend as FieldLegendPrimitive,
  FieldSet as FieldSetPrimitive,
} from "@ui-sdk/solid/field"
import { cva, type VariantProps } from "class-variance-authority"
import { For, omit, Show } from "solid-js"

import { Separator } from "@/kit/separator"

/** A set of fields under one legend, which can be disabled together. */
function FieldSet(props: ComponentProps<typeof FieldSetPrimitive>) {
  return (
    <FieldSetPrimitive
      data-slot="field-set"
      class={cn(
        "flex flex-col gap-4 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The heading that names a field set. */
function FieldLegend(
  props: ComponentProps<typeof FieldLegendPrimitive> & {
    variant?: "legend" | "label"
  },
) {
  return (
    <FieldLegendPrimitive
      data-slot="field-legend"
      data-variant={props.variant ?? "legend"}
      class={cn(
        "mb-1.5 font-medium data-[variant=label]:text-sm data-[variant=legend]:text-base",
        props.class,
      )}
      {...omit(props, "class", "variant")}
    />
  )
}

/** Lays a run of fields out as one column. */
function FieldGroup(props: ComponentProps<typeof FieldGroupPrimitive>) {
  return (
    <FieldGroupPrimitive
      data-slot="field-group"
      class={cn(
        "group/field-group @container/field-group flex w-full flex-col gap-5 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

const fieldVariants = cva(
  "group/field flex w-full gap-2 data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "flex-col *:w-full [&>.sr-only]:w-auto",
        horizontal:
          "flex-row items-center has-[>[data-slot=field-content]]:items-start *:data-[slot=field-label]:flex-auto has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "flex-col *:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:*:w-auto @md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:*:data-[slot=field-label]:flex-auto [&>.sr-only]:w-auto @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
)

/** One control with its label, description, and error message. */
function Field(
  props: ComponentProps<typeof FieldPrimitive> &
    VariantProps<typeof fieldVariants>,
) {
  return (
    <FieldPrimitive
      role="group"
      data-slot="field"
      data-orientation={props.orientation ?? "vertical"}
      class={cn(fieldVariants({ orientation: props.orientation }), props.class)}
      {...omit(props, "class", "orientation")}
    />
  )
}

/** The body of a horizontal field: its text, kept apart from the control. */
function FieldContent(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      class={cn(
        "group/field-content flex flex-1 flex-col gap-0.5 leading-snug",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The label of a field, which names its control. */
function FieldLabel(props: ComponentProps<typeof FieldLabelPrimitive>) {
  return (
    <FieldLabelPrimitive
      data-slot="field-label"
      class={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        "group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50 has-data-checked:border-primary/30 has-data-checked:bg-primary/5 has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border has-[>[data-slot=field]]:not-has-[:disabled,[data-disabled]]:hover:bg-muted/50 has-[>[data-slot=field]]:has-[:focus-visible]:border-ring has-[>[data-slot=field]]:has-[:focus-visible]:ring-3 has-[>[data-slot=field]]:has-[:focus-visible]:ring-ring *:data-[slot=field]:p-2.5 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
        "has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A field's label when the whole row is the target, as on a choice card. */
function FieldTitle(props: ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      class={cn(
        "flex w-fit items-center gap-2 text-sm font-medium group-data-[disabled=true]/field:opacity-50",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** The help text under a field's control. */
function FieldDescription(
  props: ComponentProps<typeof FieldDescriptionPrimitive>,
) {
  return (
    <FieldDescriptionPrimitive
      data-slot="field-description"
      class={cn(
        "text-left text-sm leading-normal font-normal text-muted-foreground group-has-data-horizontal/field:text-balance [[data-variant=legend]+&]:-mt-1.5",
        "last:mt-0 nth-last-2:-mt-1",
        "[&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/** A divider between groups of fields, with an optional word in the middle. */
function FieldSeparator(
  props: ComponentProps<"div"> & {
    children?: JSX.Element
  },
) {
  return (
    <div
      data-slot="field-separator"
      data-content={props.children ? true : undefined}
      class={cn(
        "relative -my-2 h-5 text-sm group-data-[variant=outline]/field-group:-mb-2",
        props.class,
      )}
      {...omit(props, "class", "children")}
    >
      <Separator class="absolute inset-0 top-1/2" />
      <Show when={props.children}>
        <span
          class="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
          data-slot="field-separator-content"
        >
          {props.children}
        </span>
      </Show>
    </div>
  )
}

/**
 * The error under a field. Pass `children` for your own message, or `errors`
 * for a list of them; with neither it shows nothing, like the React version.
 */
function FieldError(
  props: ComponentProps<typeof FieldErrorPrimitive> & {
    errors?: Array<{ message?: string } | undefined>
  },
) {
  const messages = () => errorMessages(props.errors)
  return (
    <Show
      when={Boolean(props.children) || messages().length > 0}
      fallback={null}
    >
      <FieldErrorPrimitive
        role="alert"
        data-slot="field-error"
        match={props.match ?? true}
        class={cn("text-sm font-normal text-destructive", props.class)}
        {...omit(props, "class", "children", "errors", "match")}
      >
        {props.children ?? (
          <Show
            when={messages().length === 1}
            fallback={
              <ul class="ml-4 flex list-disc flex-col gap-1">
                <For each={messages()}>{(message) => <li>{message}</li>}</For>
              </ul>
            }
          >
            {messages()[0]}
          </Show>
        )}
      </FieldErrorPrimitive>
    </Show>
  )
}

/** The distinct messages of a field's errors, in their first order. */
function errorMessages(errors: Array<{ message?: string } | undefined> = []) {
  const unique = [
    ...new Map(errors.map((error) => [error?.message, error])).values(),
  ]
  return unique.flatMap((error) => (error?.message ? [error.message] : []))
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}
