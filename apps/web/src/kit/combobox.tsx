import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Combobox as ComboboxRoot,
  ComboboxChip as ComboboxChipPart,
  ComboboxChipRemove,
  ComboboxChips as ComboboxChipsPart,
  ComboboxContent as ComboboxPopup,
  ComboboxEmpty as ComboboxEmptyPart,
  ComboboxInput,
  ComboboxItem as ComboboxOption,
  ComboboxItemIndicator,
  ComboboxList as ComboboxListPart,
  type ComboboxProps,
  ComboboxStatus,
  ComboboxValue,
} from "@ui-sdk/solid/combobox"
import { Check, ChevronDown, X } from "lucide"
import { type ComponentProps, createSignal, omit } from "solid-js"

import { Icon } from "@/kit/icon"

/**
 * ui-sdk's combobox for picking values from a list: the chosen ones as
 * chips inside a field that finds the rest as it's typed, in the select's
 * popup. The list lines up under `ComboboxChips` by itself.
 */
function Combobox<T = string, Multiple extends boolean | undefined = false>(
  props: ComboboxProps<T, Multiple>,
) {
  return <ComboboxRoot<T, Multiple> {...props} modal={props.modal ?? false} />
}

function ComboboxChips(
  props: Omit<ComponentProps<typeof ComboboxChipsPart>, "class"> & {
    class?: string
  },
) {
  return (
    <ComboboxChipsPart
      {...omit(props, "class", "children")}
      class={cn(
        FIELD_CLASS_NAME,
        "relative flex min-h-10 w-full cursor-text flex-wrap items-center gap-1 rounded-lg py-1 pr-8 pl-1 text-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 has-disabled:pointer-events-none has-disabled:opacity-50 has-aria-invalid:border-destructive/60 has-aria-invalid:ring-3 has-aria-invalid:ring-destructive/20 md:min-h-9 [@media(pointer:coarse)]:min-h-11",
        props.class,
      )}
    >
      {props.children}
      <Icon
        icon={ChevronDown}
        class="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2"
      />
    </ComboboxChipsPart>
  )
}

/** A chosen value, with a button that takes it off again. */
function ComboboxChip<T = string>(
  props: Omit<
    ComponentProps<typeof ComboboxChipPart<T>>,
    "class" | "children"
  > & {
    class?: string
    /** What the chip says, and what its remove button names. */
    label: string
  },
) {
  return (
    <ComboboxChipPart<T>
      {...omit(props, "class", "label")}
      class={cn(
        "bg-secondary text-secondary-foreground text-13px flex h-6 max-w-full items-center gap-0.5 rounded-md pr-0.5 pl-2 outline-none focus:ring-2 focus:ring-ring/60",
        props.class,
      )}
    >
      <span class="min-w-0 truncate">{props.label}</span>
      <ComboboxChipRemove
        aria-label={uiText().remove(props.label)}
        class="text-muted-foreground hover:bg-foreground/10 hover:text-foreground grid size-5 shrink-0 place-items-center rounded-sm"
      >
        <Icon icon={X} class="size-3.5" />
      </ComboboxChipRemove>
    </ComboboxChipPart>
  )
}

/** The text field among the chips. */
function ComboboxChipsInput(
  props: Omit<ComponentProps<typeof ComboboxInput>, "class"> & {
    class?: string
  },
) {
  return (
    <ComboboxInput
      {...omit(props, "class")}
      class={cn(
        "placeholder:text-muted-foreground h-6 min-w-24 flex-1 bg-transparent px-2 text-base outline-none md:text-sm",
        props.class,
      )}
    />
  )
}

function ComboboxContent(
  props: Omit<ComponentProps<typeof ComboboxPopup>, "class"> & {
    class?: string
  },
) {
  return (
    <ComboboxPopup
      {...omit(props, "class")}
      side={props.side ?? "bottom"}
      sideOffset={props.sideOffset ?? 4}
      align={props.align ?? "start"}
      alignOffset={props.alignOffset ?? 0}
      class={cn(
        "group/combobox-content isolate z-50 flex max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) flex-col overflow-hidden rounded-xl border-0 glass p-0 text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 outline-none [--list-height:var(--available-height)] transition-[opacity,scale,translate] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-1 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none",
        props.class,
      )}
    />
  )
}

function ComboboxList(
  props: Omit<ComponentProps<typeof ComboboxListPart>, "class"> & {
    class?: string
  },
) {
  return (
    <ComboboxListPart
      {...omit(props, "class")}
      class={cn(
        "max-h-[min(18rem,var(--list-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none data-empty:p-0",
        props.class,
      )}
    />
  )
}

/** A value in the list, ticked while it's chosen. */
function ComboboxItem<T = string>(
  props: Omit<
    ComponentProps<typeof ComboboxOption<T>>,
    "class" | "children"
  > & {
    class?: string
    children?: JSX.Element
  },
) {
  return (
    <ComboboxOption<T>
      {...omit(props, "class", "children")}
      class={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-foreground/10 data-selected:font-medium data-disabled:pointer-events-none data-disabled:opacity-50 [@media(pointer:coarse)]:py-2.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
    >
      {props.children}
      <ComboboxItemIndicator class="pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center">
        <Icon icon={Check} stroke-width={2.5} />
      </ComboboxItemIndicator>
    </ComboboxOption>
  )
}

/** What the list says when nothing matches; renders only then. */
function ComboboxEmpty(
  props: Omit<ComponentProps<typeof ComboboxEmptyPart>, "class"> & {
    class?: string
  },
) {
  return (
    <ComboboxEmptyPart
      {...omit(props, "class")}
      class={cn(
        "px-3 py-3 text-sm text-muted-foreground empty:hidden",
        props.class,
      )}
    />
  )
}

/**
 * An element for `ComboboxContent`'s `anchor`, for lining the list up with
 * something other than the chips, which it follows without one:
 * `ref={anchor.ref}` on the element and `anchor={anchor.element()}`.
 */
function useComboboxAnchor() {
  const [element, setElement] = createSignal<HTMLElement | null>(null)
  return { ref: (node: HTMLElement) => setElement(node), element }
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
