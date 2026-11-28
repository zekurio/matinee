import { MODAL_OVERLAY_CLASS_NAME } from "@matinee/ui/lib/modal"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Drawer as DrawerRoot,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent as DrawerPopup,
  DrawerDescription,
  DrawerTitle as DrawerHeading,
  DrawerTrigger,
} from "@ui-sdk/solid/drawer"
import { type ComponentProps, omit } from "solid-js"

export { DrawerClose, DrawerDescription, DrawerTrigger }

const DRAWER_SIDES = {
  down: "bottom",
  up: "top",
  left: "left",
  right: "right",
} as const

/** A bottom sheet for touch menus, draggable toward the edge to dismiss it. */
export function Drawer(
  props: ComponentProps<typeof DrawerRoot> & {
    swipeDirection?: keyof typeof DRAWER_SIDES
    disablePointerDismissal?: boolean
  },
) {
  return (
    <DrawerRoot
      {...omit(props, "swipeDirection", "disablePointerDismissal")}
      closeOnOutsidePress={
        props.disablePointerDismissal ? false : props.closeOnOutsidePress
      }
      side={props.side ?? DRAWER_SIDES[props.swipeDirection ?? "down"]}
    />
  )
}

export function DrawerHandle(
  props: Omit<JSX.IntrinsicElements["div"], "class"> & { class?: string },
) {
  return (
    <div
      {...omit(props, "class")}
      data-slot="drawer-handle"
      aria-hidden="true"
      class={cn(
        "mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-foreground/20",
        props.class,
      )}
    />
  )
}

export function DrawerContent(
  props: Omit<ComponentProps<typeof DrawerPopup>, "class"> & { class?: string },
) {
  return (
    <>
      <DrawerBackdrop class={cn("fixed inset-0", MODAL_OVERLAY_CLASS_NAME)} />
      {/* The shared Base UI transform would compound ui-sdk’s translate. */}
      <DrawerPopup
        {...omit(props, "class")}
        class={cn(
          "flex w-full max-h-[85dvh] flex-col overflow-hidden rounded-t-xl bg-popover text-popover-foreground ring-1 ring-foreground/10 outline-none transform-none!",
          props.class,
        )}
      />
    </>
  )
}

export function DrawerTitle(
  props: Omit<ComponentProps<typeof DrawerHeading>, "class"> & {
    class?: string
  },
) {
  return (
    <DrawerHeading
      {...omit(props, "class")}
      class={cn("font-medium text-foreground", props.class)}
    />
  )
}
