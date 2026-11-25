import { cn } from "@matinee/ui/lib/utils"
import { Check, Minus, Plus } from "lucide"
import { For, Show } from "solid-js"

import { tr } from "@/i18n"
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@/kit/drawer"
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
} from "@/kit/dropdown-menu"
import { Icon, type IconNode } from "@/kit/icon"
import { mediaQuery } from "@/lib/viewport"

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

/** Keeps the menu open after an item runs. */
function stayOpen(run: () => void) {
  return (event: Event) => {
    event.preventDefault()
    run()
  }
}

function Detail(props: { children?: string }) {
  return (
    <Show when={props.children}>
      <span class="text-foreground/70 ml-auto pl-4 text-xs font-medium tabular-nums">
        {props.children}
      </span>
    </Show>
  )
}

/** The menu's {@link MenuAdjust} row. */
function AdjustRow(props: { adjust: MenuAdjust }) {
  return (
    <DropdownMenuGroup
      aria-label={props.adjust.title}
      class="flex items-center gap-1 py-0.5 pr-1 pl-2"
    >
      <span class="min-w-0 flex-1 truncate pr-3 text-sm">
        {props.adjust.title}
      </span>
      <Show
        when={props.adjust.disabledNote}
        fallback={
          <>
            <DropdownMenuItem
              aria-label={props.adjust.decrease.label}
              title={props.adjust.decrease.title ?? props.adjust.decrease.label}
              closeOnSelect={false}
              onSelect={stayOpen(() => props.adjust.decrease.onSelect())}
              class={menuIconClass}
            >
              <Icon icon={Minus} />
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={props.adjust.reset.label}
              title={props.adjust.reset.title ?? props.adjust.reset.label}
              disabled={props.adjust.atStart}
              closeOnSelect={false}
              onSelect={stayOpen(() => props.adjust.reset.onSelect())}
              class={cn(
                valueClass,
                props.adjust.atStart &&
                  "text-muted-foreground data-disabled:opacity-100",
              )}
            >
              {props.adjust.value}
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={props.adjust.increase.label}
              title={props.adjust.increase.title ?? props.adjust.increase.label}
              closeOnSelect={false}
              onSelect={stayOpen(() => props.adjust.increase.onSelect())}
              class={menuIconClass}
            >
              <Icon icon={Plus} />
            </DropdownMenuItem>
            <span aria-live="polite" class="sr-only">
              {props.adjust.value}
            </span>
          </>
        }
      >
        {(note) => (
          <span class="text-muted-foreground py-1.5 pr-1 text-sm">
            {note()}
          </span>
        )}
      </Show>
    </DropdownMenuGroup>
  )
}

/** The bottom sheet's {@link AdjustRow}, a size up for fingers. */
function SheetAdjustRow(props: { adjust: MenuAdjust }) {
  return (
    <div
      role="group"
      aria-label={props.adjust.title}
      class="mt-2 flex min-h-12 items-center gap-1 border-t pt-2 pl-3"
    >
      <span class="min-w-0 flex-1 truncate pr-3 text-sm">
        {props.adjust.title}
      </span>
      <Show
        when={props.adjust.disabledNote}
        fallback={
          <>
            <button
              type="button"
              aria-label={props.adjust.decrease.label}
              class={sheetIconClass}
              onClick={() => props.adjust.decrease.onSelect()}
            >
              <Icon icon={Minus} class="size-5" />
            </button>
            <button
              type="button"
              aria-label={props.adjust.reset.label}
              disabled={props.adjust.atStart}
              class={cn(
                sheetIconClass,
                "w-auto min-w-18 px-2 text-sm font-medium tabular-nums disabled:opacity-100",
                props.adjust.atStart && "text-muted-foreground",
              )}
              onClick={() => props.adjust.reset.onSelect()}
            >
              {props.adjust.value}
            </button>
            <button
              type="button"
              aria-label={props.adjust.increase.label}
              class={sheetIconClass}
              onClick={() => props.adjust.increase.onSelect()}
            >
              <Icon icon={Plus} class="size-5" />
            </button>
            <span aria-live="polite" class="sr-only">
              {props.adjust.value}
            </span>
          </>
        }
      >
        {(note) => (
          <span class="text-muted-foreground pr-3 text-sm">{note()}</span>
        )}
      </Show>
    </div>
  )
}

function RadioItems(props: { section: MenuSection }) {
  return (
    <Show
      when={props.section.choices.length > 0}
      fallback={
        <DropdownMenuItem disabled>
          {props.section.empty ?? tr("player.menu.none")}
        </DropdownMenuItem>
      }
    >
      {/* The button or submenu that opened it names it, so it has no heading. */}
      <DropdownMenuRadioGroup
        aria-label={props.section.title}
        value={props.section.value}
        onValueChange={(value: string) => props.section.onSelect(value)}
      >
        <For each={props.section.choices} keyed={(choice) => choice.id}>
          {(choice) => (
            <DropdownMenuRadioItem
              value={choice().id}
              disabled={choice().disabled}
              closeOnSelect
            >
              <span class="min-w-0 truncate">{choice().label}</span>
              <Detail>{choice().detail}</Detail>
            </DropdownMenuRadioItem>
          )}
        </For>
      </DropdownMenuRadioGroup>
    </Show>
  )
}

const coarsePointer = mediaQuery("(pointer: coarse)")

/**
 * A button in the player's control bar that opens lists of choices: a
 * dropdown with a mouse, a bottom sheet on touch screens. One section lists
 * its choices directly; several get a submenu each, showing the current
 * pick, the way Jellyfin's settings menu does. Nothing heads a list: the
 * button, or the submenu's row, says what it holds. An `adjust` comes
 * last, with buttons that leave the menu open. The player keeps which menu
 * is open, so its controls stay up meanwhile.
 */
export function PlayerMenu(props: {
  label: string
  /** The key that does the same, for the tooltip. */
  shortcut?: string
  icon: IconNode
  /** Underlines the icon, as for subtitles that are on. */
  active?: boolean
  sections: MenuSection[]
  adjust?: MenuAdjust
  /** Below the sections, each a row with a check while it's on. */
  toggles?: MenuToggle[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The player, which may be the full-screen element. */
  container: () => HTMLElement | undefined
  triggerClass: string
}) {
  const title = () =>
    props.shortcut
      ? tr("player.menu.withKey", { label: props.label, key: props.shortcut })
      : props.label
  const face = () => (
    <>
      <Icon icon={props.icon} />
      <Show when={props.active}>
        <span
          aria-hidden="true"
          class="bg-primary absolute bottom-2 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full"
        />
      </Show>
    </>
  )
  const toggles = () => props.toggles ?? []

  return (
    <Show
      when={coarsePointer()}
      fallback={
        <DropdownMenu
          open={props.open}
          onOpenChange={(open: boolean) => props.onOpenChange(open)}
        >
          <DropdownMenuTrigger
            aria-label={props.label}
            title={title()}
            class={cn(props.triggerClass, "relative")}
          >
            {face()}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            sideOffset={8}
            portalContainer={props.container()}
            // Wide enough for the longest label and its detail.
            class="w-max max-w-(--available-width) min-w-60"
          >
            <Show
              when={props.sections.length === 1 && props.sections[0]}
              fallback={
                <For each={props.sections} keyed={(section) => section.title}>
                  {(section) => (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {/* Takes the free space, so the current pick sits
                            next to the chevron rather than splitting the gap
                            with it. */}
                        <span class="min-w-0 flex-1 truncate">
                          {section().title}
                        </span>
                        <span class="text-foreground/70 pl-6 text-xs font-medium">
                          {section().choices.find(
                            (choice) => choice.id === section().value,
                          )?.label ?? ""}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        side="left"
                        portalContainer={props.container()}
                        class="w-max max-w-(--available-width) min-w-52"
                      >
                        <RadioItems section={section()} />
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                </For>
              }
            >
              {(single) => <RadioItems section={single()} />}
            </Show>
            <Show when={props.adjust}>
              {(adjust) => (
                <>
                  <DropdownMenuSeparator />
                  <AdjustRow adjust={adjust()} />
                </>
              )}
            </Show>
            <Show when={toggles().length > 0}>
              <DropdownMenuSeparator />
              <For each={toggles()} keyed={(toggle) => toggle.label}>
                {(toggle) => (
                  <DropdownMenuCheckboxItem
                    checked={toggle().checked}
                    onCheckedChange={(checked: boolean) =>
                      toggle().onChange(checked)
                    }
                    closeOnSelect
                  >
                    {toggle().label}
                  </DropdownMenuCheckboxItem>
                )}
              </For>
            </Show>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <Drawer
        open={props.open}
        onOpenChange={(open: boolean) => props.onOpenChange(open)}
      >
        <DrawerTrigger
          aria-label={props.label}
          title={title()}
          class={cn(props.triggerClass, "relative")}
        >
          {face()}
        </DrawerTrigger>
        <DrawerContent container={props.container()}>
          <DrawerHandle />
          {/* Names the sheet for screen readers; the button showed it. */}
          <DrawerTitle class="sr-only">{props.label}</DrawerTitle>
          <div class="min-h-0 overflow-y-auto px-2 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <For each={props.sections} keyed={(section) => section.title}>
              {(section, at) => (
                <div
                  role="radiogroup"
                  aria-label={section().title}
                  // A rule between lists in place of headings.
                  class={at() > 0 ? "mt-2 border-t pt-2" : undefined}
                >
                  <Show when={section().choices.length === 0}>
                    <p class="text-muted-foreground px-3 py-3 text-sm">
                      {section().empty ?? tr("player.menu.none")}
                    </p>
                  </Show>
                  <For each={section().choices} keyed={(choice) => choice.id}>
                    {(choice) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={
                          choice().id === section().value ? "true" : "false"
                        }
                        disabled={choice().disabled}
                        class={sheetRowClass}
                        onClick={() => {
                          section().onSelect(choice().id)
                          props.onOpenChange(false)
                        }}
                      >
                        <span class="min-w-0 truncate">{choice().label}</span>
                        <Detail>{choice().detail}</Detail>
                        <Show when={choice().id === section().value}>
                          <Icon
                            icon={Check}
                            class={[
                              "size-4 shrink-0",
                              choice().detail ? "ml-3" : "ml-auto",
                            ]}
                          />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              )}
            </For>
            <Show when={props.adjust}>
              {(adjust) => <SheetAdjustRow adjust={adjust()} />}
            </Show>
            <Show when={toggles().length > 0}>
              <div class="mt-2 border-t pt-2">
                <For each={toggles()} keyed={(toggle) => toggle.label}>
                  {(toggle) => (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={toggle().checked ? "true" : "false"}
                      class={sheetRowClass}
                      onClick={() => {
                        toggle().onChange(!toggle().checked)
                        props.onOpenChange(false)
                      }}
                    >
                      <span class="min-w-0 truncate">{toggle().label}</span>
                      <Show when={toggle().checked}>
                        <Icon icon={Check} class="ml-auto size-4 shrink-0" />
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  )
}
