import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import type { ReactNode, RefObject } from "react"

import { tr } from "@/i18n"

export type MenuChoice = {
  id: string
  label: string
  /** Small print on the right, like a codec or `Forced`. */
  detail?: string
  disabled?: boolean
}

/** One list of choices, of which one is picked. */
export type MenuSection = {
  title: string
  value: string
  choices: MenuChoice[]
  onSelect: (id: string) => void
  /** Shown in place of the choices when there are none. */
  empty?: string
}

const sheetRowClass =
  "flex min-h-12 w-full items-center rounded-lg px-3 text-left text-sm outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

function Detail({ children }: { children?: string }) {
  if (!children) return null
  return (
    <span className="text-muted-foreground ml-auto pl-4 text-xs tabular-nums">
      {children}
    </span>
  )
}

function RadioItems({ section }: { section: MenuSection }) {
  if (section.choices.length === 0) {
    return (
      <DropdownMenuItem disabled>
        {section.empty ?? tr("player.menu.none")}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuRadioGroup
      value={section.value}
      onValueChange={section.onSelect}
    >
      {section.choices.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.id}
          value={choice.id}
          disabled={choice.disabled}
          closeOnClick
        >
          <span className="min-w-0 truncate">{choice.label}</span>
          <Detail>{choice.detail}</Detail>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

/**
 * A button in the player's control bar that opens lists of choices: a
 * dropdown with a mouse, a bottom sheet on touch screens. One section lists
 * its choices directly; several get a submenu each, showing the current
 * pick, the way Jellyfin's settings menu does. The player keeps which menu
 * is open, so its controls stay up meanwhile.
 */
export function PlayerMenu({
  label,
  shortcut,
  icon,
  active = false,
  note,
  sections,
  open,
  onOpenChange,
  container,
  triggerClassName,
}: {
  label: string
  /** The key that does the same, for the tooltip. */
  shortcut?: string
  icon: ReactNode
  /** Underlines the icon, as for subtitles that are on. */
  active?: boolean
  /** A line above the sections, like how the file is playing. */
  note?: string
  sections: MenuSection[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The player, which may be the full-screen element. */
  container: RefObject<HTMLDivElement | null>
  triggerClassName: string
}) {
  const sheet = useMediaQuery("(pointer: coarse)")

  const trigger = (
    <button
      type="button"
      aria-label={label}
      title={
        shortcut ? tr("player.menu.withKey", { label, key: shortcut }) : label
      }
      className={cn(triggerClassName, "relative")}
    >
      {icon}
      {active && (
        <span
          aria-hidden
          className="bg-primary absolute bottom-1.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full"
        />
      )}
    </button>
  )

  if (sheet) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger render={trigger} />
        <DrawerContent container={container}>
          <DrawerHandle />
          <DrawerTitle className="px-4 pt-3 pb-1 text-base">
            {label}
          </DrawerTitle>
          {note && (
            <p className="text-muted-foreground px-4 pb-1 text-xs">{note}</p>
          )}
          <div className="min-h-0 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {sections.map((section) => (
              <div
                key={section.title}
                role="radiogroup"
                aria-label={section.title}
                className="pt-2"
              >
                {sections.length > 1 && (
                  <h3 className="text-muted-foreground px-3 pb-1 text-xs font-medium">
                    {section.title}
                  </h3>
                )}
                {section.choices.length === 0 && (
                  <p className="text-muted-foreground px-3 py-3 text-sm">
                    {section.empty ?? tr("player.menu.none")}
                  </p>
                )}
                {section.choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="radio"
                    aria-checked={choice.id === section.value}
                    disabled={choice.disabled}
                    className={sheetRowClass}
                    onClick={() => {
                      section.onSelect(choice.id)
                      onOpenChange(false)
                    }}
                  >
                    <span className="min-w-0 truncate">{choice.label}</span>
                    <Detail>{choice.detail}</Detail>
                    {choice.id === section.value && (
                      <CheckIcon
                        className={cn(
                          "size-4 shrink-0",
                          choice.detail ? "ml-3" : "ml-auto",
                        )}
                      />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  const single = sections.length === 1 ? sections[0] : undefined
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        portalContainer={container}
        // Wide enough for the longest label and its detail.
        className="w-max max-w-(--available-width) min-w-60"
      >
        {note && (
          <>
            {/* Base UI throws for a label outside a group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                {note}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        {single ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{single.title}</DropdownMenuLabel>
            <RadioItems section={single} />
          </DropdownMenuGroup>
        ) : (
          sections.map((section) => (
            <DropdownMenuSub key={section.title}>
              <DropdownMenuSubTrigger>
                {/* Takes the free space, so the current pick sits next to
                    the chevron rather than splitting the gap with it. */}
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="text-muted-foreground pl-6 text-xs">
                  {section.choices.find((choice) => choice.id === section.value)
                    ?.label ?? ""}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                side="left"
                portalContainer={container}
                className="w-max max-w-(--available-width) min-w-52"
              >
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
                  <RadioItems section={section} />
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
