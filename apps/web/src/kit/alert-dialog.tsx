import { MODAL_OVERLAY_CLASS_NAME } from "@matinee/ui/lib/modal"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent as AlertDialogPopup,
  AlertDialogDescription as AlertDialogText,
  AlertDialogTitle as AlertDialogHeading,
  AlertDialogTrigger,
} from "@ui-sdk/solid/alert-dialog"
import { type ComponentProps, omit, useContext } from "solid-js"

import { Button, buttonVariants } from "@/kit/button"
import { OverlayKeepMounted } from "@/kit/dialog"
export { DialogPortal as AlertDialogPortal } from "@/kit/dialog"

export { AlertDialog, AlertDialogTrigger }

export function AlertDialogOverlay(
  props: Omit<ComponentProps<typeof AlertDialogBackdrop>, "class"> & {
    class?: string
    forceRender?: boolean
  },
) {
  return (
    <AlertDialogBackdrop
      {...omit(props, "class", "forceRender")}
      class={cn(
        "fixed inset-0 isolate z-50 transition-opacity duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in motion-reduce:transition-none",
        MODAL_OVERLAY_CLASS_NAME,
        props.class,
      )}
    />
  )
}

/** A confirmation dialog that keeps outside presses from dismissing it. */
export function AlertDialogContent(
  props: Omit<ComponentProps<typeof AlertDialogPopup>, "class"> & {
    class?: string
    size?: "default" | "sm"
  },
) {
  const keepMounted = useContext(OverlayKeepMounted)
  return (
    <>
      <AlertDialogOverlay />
      <AlertDialogPopup
        {...omit(props, "class", "size")}
        keepMounted={props.keepMounted ?? keepMounted()}
        data-size={props.size ?? "default"}
        class={cn(
          "group/alert-dialog-content fixed inset-0 z-50 m-auto grid h-fit w-[calc(100%-2rem)] max-w-xs gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none data-[size=default]:sm:max-w-sm",
          "transition-[opacity,scale] duration-200 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in motion-reduce:transition-none",
          props.class,
        )}
      />
    </>
  )
}

export function AlertDialogHeader(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="alert-dialog-header"
      class={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        props.class,
      )}
    />
  )
}

export function AlertDialogFooter(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="alert-dialog-footer"
      class={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        props.class,
      )}
    />
  )
}

export function AlertDialogMedia(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="alert-dialog-media"
      class={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        props.class,
      )}
    />
  )
}

export function AlertDialogTitle(
  props: Omit<ComponentProps<typeof AlertDialogHeading>, "class"> & {
    class?: string
  },
) {
  return (
    <AlertDialogHeading
      {...omit(props, "class")}
      class={cn(
        "text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        props.class,
      )}
    />
  )
}

export function AlertDialogDescription(
  props: Omit<ComponentProps<typeof AlertDialogText>, "class"> & {
    class?: string
  },
) {
  return (
    <AlertDialogText
      {...omit(props, "class")}
      class={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        props.class,
      )}
    />
  )
}

export function AlertDialogAction(props: ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />
}

export function AlertDialogCancel(
  props: Omit<ComponentProps<typeof AlertDialogClose>, "class"> &
    Pick<ComponentProps<typeof Button>, "variant" | "size"> & {
      class?: string
    },
) {
  return (
    <AlertDialogClose
      {...omit(props, "class", "variant", "size")}
      class={cn(
        buttonVariants({
          variant: props.variant ?? "outline",
          size: props.size,
        }),
        props.class,
      )}
    />
  )
}
