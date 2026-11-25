import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps, JSX } from "@solidjs/web"
import { ChevronRight } from "lucide"
import { omit } from "solid-js"

import { Icon } from "@/kit/icon"

const listRowClassName = "flex min-h-14 items-center gap-3 px-4 py-2.5"

/**
 * A bordered block of rows split by hairlines: the shape a managed
 * collection (passkeys, libraries) or a menu of destinations takes. Pair with
 * `ListItem` or `ListItemButton`.
 */
function List(props: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="list"
      class={cn(
        // shrink-0: in a full flex column, clipped corners would otherwise
        // let the block squash instead of scroll.
        "flex shrink-0 flex-col divide-y overflow-hidden rounded-xl border bg-foreground/[0.02]",
        props.class,
      )}
      {...omit(props, "class")}
    />
  )
}

/**
 * A row in a `List`. Lay out a `min-w-0 flex-1` block followed by
 * `shrink-0` controls and they space apart on their own.
 */
function ListItem(props: ComponentProps<"li">) {
  return (
    <li
      data-slot="list-item"
      class={cn(listRowClassName, props.class)}
      {...omit(props, "class")}
    />
  )
}

/**
 * A `List` row that is one tap target. It opens something by default, and
 * the trailing chevron says so; a row that acts in place passes its own
 * glyph as `trailing`.
 */
function ListItemButton(
  props: ComponentProps<"button"> & { trailing?: JSX.Element },
) {
  return (
    <li
      data-slot="list-item"
      class="has-[>button:focus-visible]:bg-foreground/[0.06] has-[>button:hover]:bg-foreground/[0.06] relative flex transition-colors"
    >
      <button
        type="button"
        class={cn(
          listRowClassName,
          "min-w-0 flex-1 cursor-pointer text-left outline-none",
          // Inset ring, so the first and last rows aren't clipped by the
          // list's rounded corners.
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset",
          "disabled:pointer-events-none disabled:opacity-60",
          props.class,
        )}
        {...omit(props, "class", "children", "trailing")}
      >
        {props.children}
        {props.trailing ?? (
          <Icon
            icon={ChevronRight}
            class="text-muted-foreground size-4 shrink-0"
          />
        )}
      </button>
    </li>
  )
}

export { List, ListItem, ListItemButton }
