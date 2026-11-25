import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import type { RenderProp } from "@ui-sdk/solid/primitive"
import { Show } from "solid-js"

import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@/kit/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import { isPhone } from "@/lib/viewport"

/** The props a popup's trigger part hands the element it renders. */
export type TriggerProps = Parameters<RenderProp>[0]

/**
 * A trigger's element, which spreads the props it's handed on the element
 * it renders, as ui-sdk's `render` takes them.
 */
export type TriggerRender = (props: TriggerProps) => JSX.Element

/**
 * What a request button opens: a popover beside it on wider screens, a
 * drawer from the bottom on phones, where the thumb is. Both close with
 * Escape and give focus back to the trigger.
 */
export function AskSheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  renderTrigger: TriggerRender
  title: JSX.Element
  align?: "start" | "center" | "end"
  class?: string
  children: JSX.Element
}) {
  return (
    <Show
      when={isPhone()}
      fallback={
        <Popover open={props.open} onOpenChange={props.onOpenChange}>
          <PopoverTrigger render={props.renderTrigger} />
          <PopoverContent
            align={props.align ?? "start"}
            sideOffset={8}
            class={cn("w-[22rem] gap-3 p-4", props.class)}
          >
            <PopoverTitle class="text-base leading-6 font-semibold tracking-tight">
              {props.title}
            </PopoverTitle>
            {props.children}
          </PopoverContent>
        </Popover>
      }
    >
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerTrigger render={props.renderTrigger} />
        <DrawerContent>
          <DrawerHandle />
          <DrawerTitle class="px-5 pt-3 text-lg leading-7 font-semibold tracking-tight">
            {props.title}
          </DrawerTitle>
          <div
            class={cn(
              "text-15px flex min-h-0 flex-col gap-3 overflow-y-auto px-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
              props.class,
            )}
          >
            {props.children}
          </div>
        </DrawerContent>
      </Drawer>
    </Show>
  )
}
