"use client"

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import {
  MODAL_OVERLAY_CLASS_NAME,
  MODAL_OVERLAY_FORCE_RENDER,
} from "@matinee/ui/lib/modal"
import { cn } from "cn"
import * as React from "react"

/**
 * A sheet that slides up from the bottom and swipes down to close, for
 * menus on touch screens. Adapted from alloy's drawer, bottom edge only.
 * The motion lives in globals.css.
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return (
    <DrawerPrimitive.Root data-slot="drawer" swipeDirection="down" {...props} />
  )
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-handle"
      className={cn(
        "mx-auto mt-2 mb-1 h-1 w-10 shrink-0 rounded-full bg-foreground/20",
        className,
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  container,
  ...props
}: DrawerPrimitive.Popup.Props & {
  /** Portal target, document.body by default. Pass a full-screen element
   *  so the sheet shows above it. */
  container?: DrawerPrimitive.Portal.Props["container"]
}) {
  return (
    <DrawerPrimitive.Portal data-slot="drawer-portal" container={container}>
      <DrawerPrimitive.Backdrop
        data-slot="drawer-overlay"
        forceRender={MODAL_OVERLAY_FORCE_RENDER}
        className={cn("fixed inset-0 z-50", MODAL_OVERLAY_CLASS_NAME)}
      />
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        className="pointer-events-none fixed inset-0 z-50"
      >
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "pointer-events-auto fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-xl bg-popover text-popover-foreground ring-1 ring-white/10 outline-none",
            className,
          )}
          {...props}
        >
          {children}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-medium text-foreground", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
}
