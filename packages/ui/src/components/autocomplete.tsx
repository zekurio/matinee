"use client"

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"
import { cn } from "cn"

/**
 * Base UI's combobox for free text: a search field whose suggestions are
 * places to go, not a value to pick. Styled like the dropdown menu. The
 * field itself is the app's to style, so `AutocompleteInput` is bare.
 */
const Autocomplete = AutocompletePrimitive.Root
const AutocompleteInput = AutocompletePrimitive.Input
const AutocompleteCollection = AutocompletePrimitive.Collection
const AutocompleteStatus = AutocompletePrimitive.Status

function AutocompleteContent({
  className,
  side = "bottom",
  sideOffset = 8,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: AutocompletePrimitive.Popup.Props &
  Pick<
    AutocompletePrimitive.Positioner.Props,
    "side" | "sideOffset" | "align" | "alignOffset" | "anchor"
  >) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 outline-none"
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            "relative flex max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn(
        "max-h-[min(28rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteGroup({
  className,
  ...props
}: AutocompletePrimitive.Group.Props) {
  return (
    <AutocompletePrimitive.Group
      data-slot="autocomplete-group"
      className={cn("not-last:mb-1", className)}
      {...props}
    />
  )
}

function AutocompleteGroupLabel({
  className,
  ...props
}: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-group-label"
      className={cn(
        "flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground select-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteItem({
  className,
  ...props
}: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "relative flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-foreground/10 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn(
        "px-3 py-3 text-sm text-muted-foreground empty:hidden",
        className,
      )}
      {...props}
    />
  )
}

export {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
}
