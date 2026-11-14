import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { cn } from "@matinee/ui/lib/utils"
import type { ReactElement, ReactNode } from "react"

import { usePhone } from "@/components/sheet-menu"

/**
 * What a request button opens: a popover beside it on wider screens, a
 * drawer from the bottom on phones, where the thumb is. Both close with
 * Escape and give focus back to `trigger`.
 */
export function AskSheet({
  open,
  onOpenChange,
  trigger,
  title,
  align = "start",
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactElement
  title: ReactNode
  align?: "start" | "center" | "end"
  className?: string
  children: ReactNode
}) {
  const phone = usePhone()
  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger render={trigger} />
        <DrawerContent>
          <DrawerHandle />
          <DrawerTitle className="px-5 pt-3 text-lg leading-7 font-semibold tracking-tight">
            {title}
          </DrawerTitle>
          <div
            className={cn(
              "flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[15px]",
              className,
            )}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align={align}
        sideOffset={8}
        className={cn("w-[22rem] gap-3 p-4", className)}
      >
        <PopoverTitle className="text-base leading-6 font-semibold tracking-tight">
          {title}
        </PopoverTitle>
        {children}
      </PopoverContent>
    </Popover>
  )
}
