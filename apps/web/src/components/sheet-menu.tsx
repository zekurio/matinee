import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHandle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import type { ComponentType, ReactElement, ReactNode } from "react"

/**
 * Below Tailwind's `sm`: phones, which get the shell's header instead of the
 * floating bar, and menus as sheets, where the thumb is.
 */
export function usePhone() {
  return useMediaQuery("(width < 40rem)")
}

/** A menu on phones, as a sheet from the bottom edge. */
export function SheetMenu({
  trigger,
  header,
  children,
}: {
  /** The button that opens it, rendered as the sheet's trigger. */
  trigger: ReactElement
  /** Must contain a `DrawerTitle`, which names the sheet. */
  header: ReactNode
  children: ReactNode
}) {
  return (
    <Drawer>
      <DrawerTrigger render={trigger} />
      <DrawerContent>
        <DrawerHandle />
        {header}
        <div className="min-h-0 overflow-y-auto px-2 pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/** A row in a `SheetMenu` that does its thing and closes the sheet. */
export function SheetItem({
  icon: Icon,
  onClick,
  destructive = false,
  children,
}: {
  icon: ComponentType<{ className?: string }>
  onClick: () => void
  destructive?: boolean
  children: ReactNode
}) {
  return (
    <DrawerClose
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 active:bg-foreground/10",
        destructive && "text-destructive",
      )}
    >
      <Icon
        className={cn(
          "size-5 shrink-0",
          destructive ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DrawerClose>
  )
}

/** A divider between groups of `SheetItem`s. */
export function SheetSeparator() {
  return <div aria-hidden className="bg-border mx-3 my-1.5 h-px" />
}
