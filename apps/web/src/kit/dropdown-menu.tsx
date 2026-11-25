import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@ui-sdk/solid/menu"
import { Check, ChevronRight } from "lucide"
import { type ComponentProps, createUniqueId, omit, useContext } from "solid-js"

import { OverlayKeepMounted } from "@/kit/dialog"
import { Icon } from "@/kit/icon"

export { DialogPortal as DropdownMenuPortal } from "@/kit/dialog"
export {
  MenuGroup as DropdownMenuGroup,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuSub as DropdownMenuSub,
  MenuTrigger as DropdownMenuTrigger,
}

/** An anchored menu of actions, with checkbox, radio and submenu items. */
export function DropdownMenu(props: ComponentProps<typeof Menu>) {
  return <Menu {...props} modal={props.modal ?? false} />
}

const MENU_SURFACE =
  "z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border-0 glass p-1 text-popover-foreground shadow-xl shadow-black/40 ring-1 ring-foreground/10 outline-none transition-[opacity,scale,translate] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-starting-style:data-[side=bottom]:-translate-y-1 data-starting-style:data-[side=left]:translate-x-2 data-starting-style:data-[side=right]:-translate-x-2 data-starting-style:data-[side=top]:translate-y-2 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none"

type PopupProps = Omit<ComponentProps<typeof MenuContent>, "class"> & {
  class?: string
  portalContainer?: ComponentProps<typeof MenuContent>["container"]
}

export function DropdownMenuContent(props: PopupProps) {
  const keepMounted = useContext(OverlayKeepMounted)
  return (
    <MenuContent
      {...omit(props, "class", "portalContainer")}
      container={props.container ?? props.portalContainer}
      keepMounted={props.keepMounted ?? keepMounted()}
      align={props.align ?? "start"}
      alignOffset={props.alignOffset ?? 0}
      side={props.side ?? "bottom"}
      sideOffset={props.sideOffset ?? 4}
      class={cn(MENU_SURFACE, "w-(--anchor-width) min-w-40", props.class)}
    />
  )
}

export function DropdownMenuSubContent(props: PopupProps) {
  const keepMounted = useContext(OverlayKeepMounted)
  return (
    <MenuSubContent
      {...omit(props, "class", "portalContainer")}
      container={props.container ?? props.portalContainer}
      keepMounted={props.keepMounted ?? keepMounted()}
      align={props.align ?? "start"}
      alignOffset={props.alignOffset ?? -3}
      side={props.side ?? "end"}
      sideOffset={props.sideOffset ?? 0}
      class={cn(MENU_SURFACE, "w-auto min-w-[96px]", props.class)}
    />
  )
}

type Inset = { class?: string; inset?: boolean }
const MENU_ITEM =
  "relative flex cursor-default items-center gap-1.5 rounded-md text-sm outline-hidden select-none data-highlighted:bg-foreground/10 data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

export function DropdownMenuLabel(
  props: Omit<ComponentProps<typeof MenuGroupLabel>, "class"> & Inset,
) {
  return (
    <MenuGroupLabel
      {...omit(props, "class", "inset")}
      data-inset={props.inset || undefined}
      class={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground data-inset:pl-7",
        props.class,
      )}
    />
  )
}

export function DropdownMenuItem(
  props: Omit<ComponentProps<typeof MenuItem>, "class"> &
    Inset & {
      variant?: "default" | "destructive"
    },
) {
  return (
    <MenuItem
      {...omit(props, "class", "inset", "variant")}
      data-inset={props.inset || undefined}
      data-variant={props.variant ?? "default"}
      class={cn(
        MENU_ITEM,
        "group/dropdown-menu-item px-2 py-1.5 [@media(pointer:coarse)]:py-2.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20",
        props.class,
      )}
    />
  )
}

export function DropdownMenuSubTrigger(
  props: Omit<ComponentProps<typeof MenuSubTrigger>, "class" | "children"> &
    Inset & { children?: JSX.Element },
) {
  return (
    <MenuSubTrigger
      {...omit(props, "class", "inset", "children")}
      data-inset={props.inset || undefined}
      class={cn(
        MENU_ITEM,
        "px-2 py-1.5 aria-expanded:bg-foreground/10",
        props.class,
      )}
    >
      {props.children}
      <Icon icon={ChevronRight} class="ml-auto" />
    </MenuSubTrigger>
  )
}

export function DropdownMenuCheckboxItem(
  props: Omit<
    ComponentProps<typeof MenuCheckboxItem>,
    "class" | "children" | "value"
  > &
    Inset & { children?: JSX.Element; value?: string },
) {
  const id = createUniqueId()
  return (
    <MenuCheckboxItem
      {...omit(props, "class", "inset", "children", "value")}
      value={props.value ?? id}
      data-inset={props.inset || undefined}
      class={cn(MENU_ITEM, "py-1.5 pr-8 pl-2", props.class)}
    >
      {props.children}
      <MenuItemIndicator class="pointer-events-none absolute right-2 flex items-center justify-center data-unchecked:hidden">
        <Icon icon={Check} />
      </MenuItemIndicator>
    </MenuCheckboxItem>
  )
}

export function DropdownMenuRadioItem(
  props: Omit<ComponentProps<typeof MenuRadioItem>, "class" | "children"> &
    Inset & { children?: JSX.Element },
) {
  return (
    <MenuRadioItem
      {...omit(props, "class", "inset", "children")}
      data-inset={props.inset || undefined}
      class={cn(MENU_ITEM, "py-1.5 pr-8 pl-2", props.class)}
    >
      {props.children}
      <MenuItemIndicator class="pointer-events-none absolute right-2 flex items-center justify-center data-unchecked:hidden">
        <Icon icon={Check} />
      </MenuItemIndicator>
    </MenuRadioItem>
  )
}

export function DropdownMenuSeparator(
  props: Omit<ComponentProps<typeof MenuSeparator>, "class"> & {
    class?: string
  },
) {
  return (
    <MenuSeparator
      {...omit(props, "class")}
      class={cn("-mx-1 my-1 h-px bg-foreground/10", props.class)}
    />
  )
}

export function DropdownMenuShortcut(
  props: Omit<JSX.IntrinsicElements["span"], "class"> & { class?: string },
) {
  return (
    <span
      {...omit(props, "class")}
      data-slot="dropdown-menu-shortcut"
      class={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-highlighted/dropdown-menu-item:text-foreground",
        props.class,
      )}
    />
  )
}
