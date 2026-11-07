import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

const listRowClassName = "flex min-h-14 items-center gap-3 px-4 py-2.5"

/**
 * A bordered block of rows split by hairlines: the shape a managed
 * collection (passkeys, libraries) or a menu of destinations takes. Pair with
 * {@link ListItem} or {@link ListItemButton}.
 */
function List({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="list"
      className={cn(
        // shrink-0: in a full flex column, clipped corners would otherwise
        // let the block squash instead of scroll.
        "flex shrink-0 flex-col divide-y overflow-hidden rounded-xl border bg-foreground/[0.02]",
        className,
      )}
      {...props}
    />
  )
}

/**
 * A row in a {@link List}. Lay out a `min-w-0 flex-1` block followed by
 * `shrink-0` controls and they space apart on their own.
 */
function ListItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="list-item"
      className={cn(listRowClassName, className)}
      {...props}
    />
  )
}

/**
 * A {@link List} row that is one tap target. It opens something by default,
 * and the trailing chevron says so; a row that acts in place passes its own
 * glyph as `trailing`.
 */
function ListItemButton({
  className,
  children,
  trailing,
  ...props
}: ComponentProps<"button"> & { trailing?: ReactNode }) {
  return (
    <li
      data-slot="list-item"
      className="has-[>button:focus-visible]:bg-foreground/[0.06] has-[>button:hover]:bg-foreground/[0.06] relative flex transition-colors"
    >
      <button
        type="button"
        className={cn(
          listRowClassName,
          "min-w-0 flex-1 cursor-pointer text-left outline-none",
          // Inset ring, so the first and last rows aren't clipped by the
          // list's rounded corners.
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset",
          "disabled:pointer-events-none disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
        {trailing ?? (
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
        )}
      </button>
    </li>
  )
}

export { List, ListItem, ListItemButton }
