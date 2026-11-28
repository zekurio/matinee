import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Select as SelectRoot,
  SelectContent as SelectPopup,
  SelectGroup as SelectGroupPart,
  SelectGroupLabel,
  SelectItem as SelectOption,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  type SelectProps,
  SelectSeparator as SelectDivider,
  SelectTrigger as SelectButton,
  SelectValue as SelectText,
} from "@ui-sdk/solid/select"
import { Check, ChevronDown, ChevronUp } from "lucide"
import { type ComponentProps, omit } from "solid-js"

import { Icon } from "@/kit/icon"

/** A field that opens a list of choices and shows the selected label. */
export function Select<
  T = string,
  Multiple extends boolean | undefined = false,
>(props: SelectProps<T, Multiple>) {
  return <SelectRoot<T, Multiple> {...props} modal={props.modal ?? false} />
}

export function SelectGroup(
  props: Omit<ComponentProps<typeof SelectGroupPart>, "class"> & {
    class?: string
  },
) {
  return (
    <SelectGroupPart
      {...omit(props, "class")}
      class={cn("scroll-my-1 p-1", props.class)}
    />
  )
}

export function SelectValue(
  props: Omit<ComponentProps<typeof SelectText>, "class"> & { class?: string },
) {
  return (
    <SelectText
      {...omit(props, "class")}
      class={cn("flex flex-1 text-left", props.class)}
    />
  )
}

export function SelectTrigger(
  props: Omit<ComponentProps<typeof SelectButton>, "class" | "children"> & {
    class?: string
    children?: JSX.Element
    size?: "sm" | "default"
  },
) {
  return (
    <SelectButton
      {...omit(props, "class", "size", "children")}
      data-size={props.size ?? "default"}
      class={cn(
        FIELD_CLASS_NAME,
        "flex w-fit items-center justify-between gap-1.5 rounded-lg py-2 pr-2 pl-2.5 text-sm whitespace-nowrap select-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input aria-invalid:border-destructive/60 aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-open:border-ring hover:data-open:border-ring data-placeholder:text-muted-foreground data-[size=default]:h-10 md:data-[size=default]:h-9 [@media(pointer:coarse)]:data-[size=default]:h-11 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
    >
      {props.children}
      <Icon
        icon={ChevronDown}
        class="text-muted-foreground pointer-events-none size-4"
      />
    </SelectButton>
  )
}

export function SelectContent(
  props: Omit<ComponentProps<typeof SelectPopup>, "class"> & { class?: string },
) {
  return (
    <SelectPopup
      {...omit(props, "class", "children")}
      side={props.side ?? "bottom"}
      sideOffset={props.sideOffset ?? 4}
      align={props.align ?? "center"}
      alignOffset={props.alignOffset ?? 0}
      alignItemWithTrigger={props.alignItemWithTrigger ?? false}
      data-align-trigger={props.alignItemWithTrigger ? "true" : undefined}
      class={cn(
        "isolate z-50 max-h-(--available-height) w-auto max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border-0 bg-popover p-0 text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 outline-none transition-[opacity,scale,translate] duration-100 data-[align-trigger=true]:transition-none data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-1 data-starting-style:data-[side=left]:translate-x-2 data-starting-style:data-[side=right]:-translate-x-2 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none",
        props.class,
      )}
    >
      <SelectList class="p-1">{props.children}</SelectList>
    </SelectPopup>
  )
}

export function SelectLabel(
  props: Omit<ComponentProps<typeof SelectGroupLabel>, "class"> & {
    class?: string
  },
) {
  return (
    <SelectGroupLabel
      {...omit(props, "class")}
      class={cn("px-1.5 py-1 text-xs text-muted-foreground", props.class)}
    />
  )
}

export function SelectItem<T = string>(
  props: Omit<ComponentProps<typeof SelectOption<T>>, "class" | "children"> & {
    class?: string
    children?: JSX.Element
  },
) {
  return (
    <SelectOption<T>
      {...omit(props, "class", "children")}
      class={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none [@media(pointer:coarse)]:py-2.5 data-highlighted:bg-foreground/10 data-selected:font-medium data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class,
      )}
    >
      <SelectItemText class="flex min-w-0 flex-1 flex-col whitespace-nowrap">
        {props.children}
      </SelectItemText>
      <SelectItemIndicator class="pointer-events-none absolute top-2 right-2 flex size-4 items-center justify-center not-data-selected:hidden [@media(pointer:coarse)]:top-3">
        <Icon icon={Check} stroke-width={2.5} />
      </SelectItemIndicator>
    </SelectOption>
  )
}

export function SelectSeparator(
  props: Omit<ComponentProps<typeof SelectDivider>, "class"> & {
    class?: string
  },
) {
  return (
    <SelectDivider
      {...omit(props, "class")}
      class={cn("pointer-events-none -mx-1 my-1 h-px bg-border", props.class)}
    />
  )
}

type ScrollButtonProps = Omit<JSX.IntrinsicElements["button"], "class"> & {
  class?: string
}

function ScrollButton(props: ScrollButtonProps & { direction: "up" | "down" }) {
  return (
    <button
      type="button"
      tabindex={-1}
      aria-hidden="true"
      data-slot={
        props.direction === "up"
          ? "select-scroll-up-button"
          : "select-scroll-down-button"
      }
      {...omit(props, "class", "direction", "onClick")}
      onClick={(event) => {
        event.currentTarget.closest('[data-slot="select-content"]')?.scrollBy({
          top: props.direction === "up" ? -80 : 80,
        })
      }}
      class={cn(
        "sticky z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg]:size-4",
        props.direction === "up" ? "top-0" : "bottom-0",
        props.class,
      )}
    >
      <Icon icon={props.direction === "up" ? ChevronUp : ChevronDown} />
    </button>
  )
}

/** Optional pointer scroll controls. The list itself handles keyboard scrolling. */
export function SelectScrollUpButton(props: ScrollButtonProps) {
  return <ScrollButton {...props} direction="up" />
}

export function SelectScrollDownButton(props: ScrollButtonProps) {
  return <ScrollButton {...props} direction="down" />
}
