import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import {
  ScrollArea as ScrollAreaPrimitive,
  ScrollAreaCorner,
  ScrollAreaScrollbar as ScrollAreaScrollbarPrimitive,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { omit } from "solid-js"

/**
 * A region with its own scrolling and styled scrollbars. Give it a size; the
 * viewport fills it and the content scrolls inside.
 */
function ScrollArea(
  props: ComponentProps<typeof ScrollAreaPrimitive> & {
    viewportClassName?: string
    /** The element that scrolls, for scroll position and in-view tracking. */
    viewportRef?: ComponentProps<"div">["ref"]
    /**
     * The content has controls of its own, which Tab reaches instead, so the
     * viewport leaves the tab order and draws no ring. A click on its text
     * still focuses it, and a browser rings what has focus once a key is
     * pressed, so scrolling by keyboard would outline the whole region.
     */
    hasControls?: boolean
  },
) {
  return (
    <ScrollAreaPrimitive
      data-slot="scroll-area"
      class={cn("relative", props.class)}
      {...omit(
        props,
        "class",
        "children",
        "viewportClassName",
        "viewportRef",
        "hasControls",
      )}
    >
      <ScrollAreaViewport
        data-slot="scroll-area-viewport"
        ref={props.viewportRef}
        tabindex={props.hasControls ? -1 : undefined}
        class={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none",
          !props.hasControls &&
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          props.viewportClassName,
        )}
      >
        {props.children}
      </ScrollAreaViewport>
      <ScrollBar />
      <ScrollAreaCorner />
    </ScrollAreaPrimitive>
  )
}

/** One axis of a scroll area's scrollbar, with its draggable thumb. */
function ScrollBar(props: ComponentProps<typeof ScrollAreaScrollbarPrimitive>) {
  return (
    <ScrollAreaScrollbarPrimitive
      data-slot="scroll-area-scrollbar"
      orientation={props.orientation ?? "vertical"}
      class={cn(
        "flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2.5 data-[orientation=vertical]:border-l data-[orientation=vertical]:border-l-transparent",
        props.class,
      )}
      {...omit(props, "class", "orientation", "children")}
    >
      <ScrollAreaThumb
        data-slot="scroll-area-thumb"
        class="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaScrollbarPrimitive>
  )
}

export { ScrollArea, ScrollBar }
