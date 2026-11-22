"use client"

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import * as React from "react"

/**
 * Base UI's combobox for picking several values from a list: the chosen
 * ones as chips inside a field that finds the rest as it's typed, in the
 * select's popup. `ComboboxChips` is the field, so pass its ref from
 * `useComboboxAnchor` to `ComboboxContent` to line the list up under it.
 */
const Combobox = ComboboxPrimitive.Root
const ComboboxValue = ComboboxPrimitive.Value
const ComboboxStatus = ComboboxPrimitive.Status

function ComboboxChips({
  className,
  children,
  ...props
}: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        FIELD_CLASS_NAME,
        "relative flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-lg py-1 pr-8 pl-1 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 has-disabled:pointer-events-none has-disabled:opacity-50 has-aria-invalid:border-destructive/60 has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 md:min-h-9 [@media(pointer:coarse)]:min-h-11",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2"
      />
    </ComboboxPrimitive.Chips>
  )
}

/** A chosen value, with a button that takes it off again. */
function ComboboxChip({
  className,
  label,
  ...props
}: Omit<ComboboxPrimitive.Chip.Props, "children"> & {
  /** What the chip says, and what its remove button names. */
  label: string
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "bg-secondary text-secondary-foreground text-13px flex h-6 max-w-full items-center gap-0.5 rounded-md pr-0.5 pl-2 outline-none focus:ring-2 focus:ring-ring/60",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ComboboxPrimitive.ChipRemove
        data-slot="combobox-chip-remove"
        aria-label={uiText().remove(label)}
        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground grid size-5 shrink-0 place-items-center rounded-sm"
      >
        <XIcon aria-hidden className="size-3.5" />
      </ComboboxPrimitive.ChipRemove>
    </ComboboxPrimitive.Chip>
  )
}

/** The text field among the chips. */
function ComboboxChipsInput({
  className,
  ...props
}: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chips-input"
      className={cn(
        "placeholder:text-muted-foreground h-6 min-w-24 flex-1 bg-transparent px-2 text-base outline-none md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 outline-none"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content relative flex max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl glass text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(18rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0",
        className,
      )}
      {...props}
    />
  )
}

/** A value in the list, ticked while it's chosen. */
function ComboboxItem({
  className,
  children,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-foreground/10 data-selected:font-medium data-disabled:pointer-events-none data-disabled:opacity-50 [@media(pointer:coarse)]:py-2.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" strokeWidth={2.5} />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )
}

/** What the list says when nothing matches; renders only then. */
function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-3 text-sm text-muted-foreground empty:hidden",
        className,
      )}
      {...props}
    />
  )
}

/** The ref `ComboboxChips` and `ComboboxContent` share. */
function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
  ComboboxValue,
  useComboboxAnchor,
}
