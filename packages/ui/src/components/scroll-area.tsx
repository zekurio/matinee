import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"
import * as React from "react"

function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportRef,
  hasControls = false,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  viewportClassName?: string
  /** The element that scrolls, for scroll position and in-view tracking. */
  viewportRef?: React.Ref<HTMLDivElement>
  /**
   * The content has controls of its own, which Tab reaches instead, so the
   * viewport leaves the tab order and draws no ring. A click on its text
   * still focuses it, and a browser rings what has focus once a key is
   * pressed, so scrolling by keyboard would outline the whole region.
   */
  hasControls?: boolean
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        ref={viewportRef}
        {...(hasControls && { tabIndex: -1 })}
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none",
          !hasControls &&
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
