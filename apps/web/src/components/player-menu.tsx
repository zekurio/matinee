import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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
import { CheckIcon, MinusIcon, PlusIcon } from "lucide-react"
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

/** Something to turn on and off, like the playback stats. */
export type MenuToggle = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}

/** A button that changes a value and leaves the menu open. */
type MenuStep = {
  /** What it does, for screen readers. */
  label: string
  /** The tooltip, when it says more than the label. */
  title?: string
  onSelect: () => void
}

/**
 * A row below the sections: its title, then the value between a minus and
 * a plus button. Pressing the value puts it back where it started.
 */
export type MenuAdjust = {
  title: string
  /** The current value, as shown. */
  value: string
  /** Still where it started, so there's nothing to reset. */
  atStart: boolean
  decrease: MenuStep
  increase: MenuStep
  reset: MenuStep
  /** Why it can't change, in place of the buttons. */
  disabledNote?: string
}

const sheetRowClass =
  "flex min-h-12 w-full items-center rounded-lg px-3 text-left text-sm outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

const sheetIconClass =
  "grid size-11 shrink-0 place-items-center rounded-full outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

const menuIconClass = "size-8 shrink-0 justify-center rounded-full p-0"

// Wide enough for -10,0 s, so the plus doesn't move as the value does.
const valueClass =
  "h-8 min-w-16 justify-center rounded-full px-2 font-medium tabular-nums"

function Detail({ children }: { children?: string }) {
  if (!children) return null
  return (
    <span className="text-foreground/70 ml-auto pl-4 text-xs font-medium tabular-nums">
      {children}
    </span>
  )
}

/** The menu's {@link MenuAdjust} row. */
function AdjustRow({ adjust }: { adjust: MenuAdjust }) {
  const { decrease, increase, reset } = adjust
  return (
    <DropdownMenuGroup
      aria-label={adjust.title}
      className="flex items-center gap-1 py-0.5 pr-1 pl-2"
    >
      <span className="min-w-0 flex-1 truncate pr-3 text-sm">
        {adjust.title}
      </span>
      {adjust.disabledNote ? (
        <span className="text-muted-foreground py-1.5 pr-1 text-sm">
          {adjust.disabledNote}
        </span>
      ) : (
        <>
          <DropdownMenuItem
            aria-label={decrease.label}
            title={decrease.title ?? decrease.label}
            closeOnClick={false}
            onClick={decrease.onSelect}
            className={menuIconClass}
          >
            <MinusIcon />
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-label={reset.label}
            title={reset.title ?? reset.label}
            disabled={adjust.atStart}
            closeOnClick={false}
            onClick={reset.onSelect}
            className={cn(
              valueClass,
              adjust.atStart &&
                "text-muted-foreground data-disabled:opacity-100",
            )}
          >
            {adjust.value}
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-label={increase.label}
            title={increase.title ?? increase.label}
            closeOnClick={false}
            onClick={increase.onSelect}
            className={menuIconClass}
          >
            <PlusIcon />
          </DropdownMenuItem>
          <span aria-live="polite" className="sr-only">
            {adjust.value}
          </span>
        </>
      )}
    </DropdownMenuGroup>
  )
}

/** The bottom sheet's {@link AdjustRow}, a size up for fingers. */
function SheetAdjustRow({ adjust }: { adjust: MenuAdjust }) {
  const { decrease, increase, reset } = adjust
  return (
    <div
      role="group"
      aria-label={adjust.title}
      className="mt-2 flex min-h-12 items-center gap-1 border-t pt-2 pl-3"
    >
      <span className="min-w-0 flex-1 truncate pr-3 text-sm">
        {adjust.title}
      </span>
      {adjust.disabledNote ? (
        <span className="text-muted-foreground pr-3 text-sm">
          {adjust.disabledNote}
        </span>
      ) : (
        <>
          <button
            type="button"
            aria-label={decrease.label}
            className={sheetIconClass}
            onClick={decrease.onSelect}
          >
            <MinusIcon className="size-5" />
          </button>
          <button
            type="button"
            aria-label={reset.label}
            disabled={adjust.atStart}
            className={cn(
              sheetIconClass,
              "w-auto min-w-18 px-2 text-sm font-medium tabular-nums disabled:opacity-100",
              adjust.atStart && "text-muted-foreground",
            )}
            onClick={reset.onSelect}
          >
            {adjust.value}
          </button>
          <button
            type="button"
            aria-label={increase.label}
            className={sheetIconClass}
            onClick={increase.onSelect}
          >
            <PlusIcon className="size-5" />
          </button>
          <span aria-live="polite" className="sr-only">
            {adjust.value}
          </span>
        </>
      )}
    </div>
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
    // The button or submenu that opened it names it, so it has no heading.
    <DropdownMenuRadioGroup
      aria-label={section.title}
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
 * pick, the way Jellyfin's settings menu does. Nothing heads a list: the
 * button, or the submenu's row, says what it holds. An `adjust` comes
 * last, with buttons that leave the menu open. The player keeps which menu
 * is open, so its controls stay up meanwhile.
 */
export function PlayerMenu({
  label,
  shortcut,
  icon,
  active = false,
  sections,
  adjust,
  toggles = [],
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
  sections: MenuSection[]
  adjust?: MenuAdjust
  /** Below the sections, each a row with a check while it's on. */
  toggles?: MenuToggle[]
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
          {/* Names the sheet for screen readers; the button showed it. */}
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          <div className="min-h-0 overflow-y-auto px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {sections.map((section, at) => (
              <div
                key={section.title}
                role="radiogroup"
                aria-label={section.title}
                // A rule between lists in place of headings.
                className={cn(at > 0 && "mt-2 border-t pt-2")}
              >
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
            {adjust && <SheetAdjustRow adjust={adjust} />}
            {toggles.length > 0 && (
              <div className="mt-2 border-t pt-2">
                {toggles.map((toggle) => (
                  <button
                    key={toggle.label}
                    type="button"
                    role="switch"
                    aria-checked={toggle.checked}
                    className={sheetRowClass}
                    onClick={() => {
                      toggle.onChange(!toggle.checked)
                      onOpenChange(false)
                    }}
                  >
                    <span className="min-w-0 truncate">{toggle.label}</span>
                    {toggle.checked && (
                      <CheckIcon className="ml-auto size-4 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
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
        {single ? (
          <RadioItems section={single} />
        ) : (
          sections.map((section) => (
            <DropdownMenuSub key={section.title}>
              <DropdownMenuSubTrigger>
                {/* Takes the free space, so the current pick sits next to
                    the chevron rather than splitting the gap with it. */}
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="text-foreground/70 pl-6 text-xs font-medium">
                  {section.choices.find((choice) => choice.id === section.value)
                    ?.label ?? ""}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                side="left"
                portalContainer={container}
                className="w-max max-w-(--available-width) min-w-52"
              >
                <RadioItems section={section} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ))
        )}
        {adjust && (
          <>
            <DropdownMenuSeparator />
            <AdjustRow adjust={adjust} />
          </>
        )}
        {toggles.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {toggles.map((toggle) => (
              <DropdownMenuCheckboxItem
                key={toggle.label}
                checked={toggle.checked}
                onCheckedChange={toggle.onChange}
                closeOnClick
              >
                {toggle.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
