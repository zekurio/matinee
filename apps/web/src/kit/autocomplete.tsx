import { cn } from "@matinee/ui/lib/utils"
import {
  Autocomplete as AutocompleteRoot,
  AutocompleteContent as AutocompletePopup,
  AutocompleteEmpty as AutocompleteEmptyPart,
  AutocompleteGroup as AutocompleteGroupPart,
  AutocompleteGroupLabel as AutocompleteGroupLabelPart,
  AutocompleteInput,
  AutocompleteItem as AutocompleteItemPart,
  AutocompleteItems,
  AutocompleteList as AutocompleteListPart,
  type AutocompleteProps,
  AutocompleteStatus,
} from "@ui-sdk/solid/autocomplete"
import { type ComponentProps, omit } from "solid-js"

/**
 * ui-sdk's combobox for free text: a search field whose suggestions are
 * places to go, not a value to pick. Styled like the dropdown menu. The
 * field itself is the app's to style, so `AutocompleteInput` is bare.
 */
function Autocomplete(props: AutocompleteProps) {
  return <AutocompleteRoot {...props} modal={props.modal ?? false} />
}

/**
 * Data suggestions as bare parts. For styled rows, render `AutocompleteItem`
 * from the array with `For`.
 */
const AutocompleteCollection = AutocompleteItems

function AutocompleteContent(
  props: Omit<ComponentProps<typeof AutocompletePopup>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompletePopup
      {...omit(props, "class")}
      side={props.side ?? "bottom"}
      sideOffset={props.sideOffset ?? 8}
      align={props.align ?? "start"}
      alignOffset={props.alignOffset ?? 0}
      class={cn(
        "isolate z-50 flex max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl border-0 bg-popover p-0 text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 outline-none [--list-height:var(--available-height)] transition-[opacity,scale,translate] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-1 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none",
        props.class,
      )}
    />
  )
}

function AutocompleteList(
  props: Omit<ComponentProps<typeof AutocompleteListPart>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompleteListPart
      {...omit(props, "class")}
      class={cn(
        "max-h-[min(28rem,var(--list-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0",
        props.class,
      )}
    />
  )
}

function AutocompleteGroup(
  props: Omit<ComponentProps<typeof AutocompleteGroupPart>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompleteGroupPart
      {...omit(props, "class")}
      class={cn("not-last:mb-1", props.class)}
    />
  )
}

function AutocompleteGroupLabel(
  props: Omit<ComponentProps<typeof AutocompleteGroupLabelPart>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompleteGroupLabelPart
      {...omit(props, "class")}
      class={cn(
        "flex items-center gap-1.5 px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground select-none [&_svg]:size-3.5 [&_svg]:shrink-0",
        props.class,
      )}
    />
  )
}

function AutocompleteItem(
  props: Omit<ComponentProps<typeof AutocompleteItemPart>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompleteItemPart
      {...omit(props, "class")}
      class={cn(
        "relative flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-foreground/10 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
    />
  )
}

function AutocompleteEmpty(
  props: Omit<ComponentProps<typeof AutocompleteEmptyPart>, "class"> & {
    class?: string
  },
) {
  return (
    <AutocompleteEmptyPart
      {...omit(props, "class")}
      class={cn(
        "px-3 py-3 text-sm text-muted-foreground empty:hidden",
        props.class,
      )}
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
