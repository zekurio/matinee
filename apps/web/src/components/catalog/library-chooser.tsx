import { Check } from "lucide"
import { createSignal, For, Show } from "solid-js"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { isPhone } from "@/lib/viewport"

import { AskSheet, type TriggerRender } from "./ask-sheet"

/**
 * Which library something goes to, picked from `renderTrigger`: a menu on
 * wider screens, a drawer on phones. Picking the one it's on does nothing.
 */
export function LibraryChooser(props: {
  libraries: readonly { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  /** The drawer's heading on phones. */
  title: string
  renderTrigger: TriggerRender
}) {
  const [open, setOpen] = createSignal(false)
  return (
    <Show
      when={isPhone()}
      fallback={
        <DropdownMenu>
          <DropdownMenuTrigger render={props.renderTrigger} />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={props.value}
              onValueChange={(id: string) => {
                if (id !== props.value) props.onChange(id)
              }}
            >
              <For each={props.libraries}>
                {(library) => (
                  <DropdownMenuRadioItem value={library.id} closeOnSelect>
                    {library.name}
                  </DropdownMenuRadioItem>
                )}
              </For>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <AskSheet
        open={open()}
        onOpenChange={setOpen}
        title={props.title}
        renderTrigger={props.renderTrigger}
      >
        <div role="radiogroup" class="-mx-2 flex flex-col">
          <For each={props.libraries}>
            {(library) => (
              <button
                type="button"
                role="radio"
                aria-checked={library.id === props.value ? "true" : "false"}
                onClick={() => {
                  setOpen(false)
                  if (library.id !== props.value) props.onChange(library.id)
                }}
                class="active:bg-foreground/[0.06] flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 text-left font-medium"
              >
                {library.name}
                <Show when={library.id === props.value}>
                  <Icon icon={Check} class="text-primary size-5" />
                </Show>
              </button>
            )}
          </For>
        </div>
      </AskSheet>
    </Show>
  )
}
