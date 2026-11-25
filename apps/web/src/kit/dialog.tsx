import { MODAL_OVERLAY_CLASS_NAME } from "@matinee/ui/lib/modal"
import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import { Portal, type JSX } from "@solidjs/web"
import {
  Dialog as DialogRoot,
  DialogBackdrop,
  DialogClose,
  DialogContent as DialogPopup,
  DialogDescription as DialogText,
  DialogTitle as DialogHeading,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { X } from "lucide"
import {
  type ComponentProps,
  createContext,
  omit,
  Show,
  useContext,
} from "solid-js"

import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"

export { DialogClose, DialogTrigger }

export const OverlayKeepMounted = createContext<() => boolean>(() => false)

/** A modal editor that can keep outside presses from dismissing it. */
export function Dialog(
  props: ComponentProps<typeof DialogRoot> & {
    disablePointerDismissal?: boolean
  },
) {
  return (
    <DialogRoot
      {...omit(props, "disablePointerDismissal")}
      closeOnOutsidePress={
        props.disablePointerDismissal ? false : props.closeOnOutsidePress
      }
    />
  )
}

/** Keeps an explicit portal target available for callers that need one. */
export function DialogPortal(props: {
  container?: HTMLElement | ShadowRoot | null
  keepMounted?: boolean
  children?: JSX.Element
}) {
  return (
    <OverlayKeepMounted value={() => props.keepMounted ?? false}>
      <Show when={props.container} fallback={props.children}>
        {(container) => (
          // SAFETY: Portal only uses Node insertion methods on its mount.
          <Portal mount={container() as HTMLElement}>{props.children}</Portal>
        )}
      </Show>
    </OverlayKeepMounted>
  )
}

export function DialogOverlay(
  props: Omit<ComponentProps<typeof DialogBackdrop>, "class"> & {
    class?: string
    forceRender?: boolean
  },
) {
  return (
    <DialogBackdrop
      {...omit(props, "class", "forceRender")}
      class={cn(
        "fixed inset-0 isolate z-50 transition-opacity duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in motion-reduce:transition-none",
        MODAL_OVERLAY_CLASS_NAME,
        props.class,
      )}
    />
  )
}

/** A modal editor with a matching backdrop and an optional corner close button. */
export function DialogContent(
  props: Omit<ComponentProps<typeof DialogPopup>, "class" | "children"> & {
    class?: string
    children?: JSX.Element
    showCloseButton?: boolean
    disableZoom?: boolean
  },
) {
  const keepMounted = useContext(OverlayKeepMounted)
  return (
    <>
      <DialogOverlay />
      <DialogPopup
        {...omit(props, "class", "children", "showCloseButton", "disableZoom")}
        keepMounted={props.keepMounted ?? keepMounted()}
        class={cn(
          "fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none sm:max-w-sm",
          "transition-[opacity,scale] duration-200 ease-out data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-150 data-ending-style:ease-in motion-reduce:transition-none",
          !props.disableZoom &&
            "data-starting-style:scale-95 data-ending-style:scale-95",
          props.class,
        )}
      >
        {props.children}
        <Show when={props.showCloseButton ?? true}>
          <DialogClose
            class={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "absolute top-2 right-2",
            )}
            aria-label={uiText().close}
          >
            <Icon icon={X} />
          </DialogClose>
        </Show>
      </DialogPopup>
    </>
  )
}

export function DialogHeader(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="dialog-header"
      class={cn("flex flex-col gap-2", props.class)}
    />
  )
}

export function DialogFooter(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & {
    class?: string
    showCloseButton?: boolean
    showCancelButton?: boolean
  },
) {
  return (
    <div
      {...omit(
        props,
        "class",
        "children",
        "showCloseButton",
        "showCancelButton",
      )}
      data-slot="dialog-footer"
      class={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        props.class,
      )}
    >
      <Show when={props.showCancelButton}>
        <DialogClose class={buttonVariants({ variant: "ghost" })}>
          {uiText().cancel}
        </DialogClose>
      </Show>
      {props.children}
      <Show when={props.showCloseButton}>
        <DialogClose class={buttonVariants({ variant: "outline" })}>
          {uiText().close}
        </DialogClose>
      </Show>
    </div>
  )
}

export function DialogTitle(
  props: Omit<ComponentProps<typeof DialogHeading>, "class"> & {
    class?: string
  },
) {
  return (
    <DialogHeading
      {...omit(props, "class")}
      class={cn("text-base leading-none font-medium", props.class)}
    />
  )
}

export function DialogDescription(
  props: Omit<ComponentProps<typeof DialogText>, "class"> & { class?: string },
) {
  return (
    <DialogText
      {...omit(props, "class")}
      class={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        props.class,
      )}
    />
  )
}
