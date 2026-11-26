import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Show } from "solid-js"

import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"

/*
 * The settings' form dialogs: wide, with their sections side by side in
 * columns, so a long form reads across instead of down. The header and
 * the footer stay put and only the body scrolls. On a phone the columns
 * stack into one.
 */

const WIDTHS = {
  /** One column, for a short form. */
  sm: "sm:max-w-md",
  /** Two narrow columns, or a secret to copy. */
  md: "sm:max-w-3xl",
  /** Two columns. */
  lg: "sm:max-w-5xl",
  /** Two columns of rows with a hint beside their control. */
  xl: "sm:max-w-7xl",
  /**
   * Three columns of rows. They sit as two until the screen is wide, since
   * a row's name, hint, and control don't fit side by side in a third.
   * While the form shows only two, it is as wide as `lg`.
   */
  "2xl":
    "sm:max-w-5xl sm:has-[[data-columns=3]]:max-w-7xl 2xl:has-[[data-columns=3]]:max-w-[96rem]",
} satisfies Record<string, string>

export function FormDialogContent(props: {
  width?: keyof typeof WIDTHS
  children: JSX.Element
}) {
  return (
    <DialogContent
      showCloseButton={false}
      class={cn(
        "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
        WIDTHS[props.width ?? "lg"],
      )}
    >
      {props.children}
    </DialogContent>
  )
}

/** The dialog's form, which holds its header, body, and footer. */
export function FormDialogForm(props: {
  onSubmit: () => void
  children: JSX.Element
}) {
  return (
    <form
      class="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      {props.children}
    </form>
  )
}

export function FormDialogHeader(props: {
  title: JSX.Element
  description?: JSX.Element
}) {
  return (
    <DialogHeader class="border-b px-6 pt-6 pb-5">
      <DialogTitle class="text-lg leading-7 font-semibold">
        {props.title}
      </DialogTitle>
      <Show when={props.description}>
        <DialogDescription class="max-w-3xl">
          {props.description}
        </DialogDescription>
      </Show>
    </DialogHeader>
  )
}

/** What scrolls between the header and the footer. */
export function FormDialogBody(props: { children: JSX.Element }) {
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
      {props.children}
    </div>
  )
}

export function FormDialogFooter(props: {
  /** A Cancel button before the actions. */
  cancel?: boolean
  children: JSX.Element
}) {
  return (
    <DialogFooter showCancelButton={props.cancel ?? true} class="m-0 px-6 py-4">
      {props.children}
    </DialogFooter>
  )
}

/**
 * Columns of sections, each a {@link FormColumn}. `count` is how many sit
 * side by side on a wide screen; fewer fit on a narrower one.
 */
export function FormColumns(props: { count?: 2 | 3; children: JSX.Element }) {
  return (
    <div
      data-columns={props.count ?? 2}
      class={[
        "grid items-start gap-x-8 gap-y-6",
        (props.count ?? 2) === 2
          ? "md:grid-cols-2"
          : "md:grid-cols-2 2xl:grid-cols-3",
      ]}
    >
      {props.children}
    </div>
  )
}

export function FormColumn(props: {
  /**
   * For the longest of three columns. While they sit as two, it runs down
   * both rows, and the third column goes beside it, under the other one,
   * rather than below the pair.
   */
  tall?: boolean
  class?: string
  children: JSX.Element
}) {
  return (
    <div
      class={cn(
        "flex min-w-0 flex-col gap-6",
        props.tall && "md:row-span-2 2xl:row-span-1",
        props.class,
      )}
    >
      {props.children}
    </div>
  )
}

/** A titled part of a form dialog. */
export function FormSection(props: {
  title?: string
  /** A line under the title on what the part covers. */
  description?: JSX.Element
  children: JSX.Element
}) {
  return (
    <section class="flex min-w-0 flex-col gap-2.5">
      <Show when={props.title || props.description}>
        <div class="flex flex-col gap-0.5">
          <Show when={props.title}>
            <h3 class="text-sm font-semibold">{props.title}</h3>
          </Show>
          <Show when={props.description}>
            <p class="text-muted-foreground text-13px leading-5">
              {props.description}
            </p>
          </Show>
        </div>
      </Show>
      {props.children}
    </section>
  )
}
