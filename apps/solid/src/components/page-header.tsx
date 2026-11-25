import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { createEffect, Show } from "solid-js"

import { isPhone } from "@/lib/viewport"

import { BackButton, CoverTabs, usePhoneTab } from "./phone-nav"

/**
 * Names the browser tab after the page while it's open. Until there's a
 * name, and after the page closes, the tab says just matinee.
 */
export function useDocumentTitle(name: () => string | null | undefined) {
  createEffect(name, (current) => {
    if (current) document.title = `${current} · matinee`
    return () => {
      document.title = "matinee"
    }
  })
}

/**
 * The gap the header leaves below it. A row right under the header leaves
 * the same below itself, so it sits evenly between the title and what
 * follows.
 */
export const belowHeader = "mb-4 max-sm:mb-2 md:mb-6"

/**
 * A page's name and controls. On phones it's the bar at the top of the
 * page, as the Flutter app has it: on a tab's first page the name under
 * the shell's header band; on a page opened from a tab, Back, the name and
 * `phoneActions` in place of the band. It stays put while the page scrolls.
 */
export function PageHeader(props: {
  title: string
  description?: JSX.Element
  /**
   * Controls beside the title from `sm` up. Phones don't show them; pages
   * give phones theirs in `phoneActions`.
   */
  actions?: JSX.Element
  /** Controls at the end of the bar on phones only. */
  phoneActions?: JSX.Element
  class?: string
}) {
  const tab = usePhoneTab()
  const back = () => tab() === null
  return (
    <header
      class={cn(
        "flex items-end justify-between gap-4",
        belowHeader,
        // The page's column pads its sides; the bar spans the screen.
        "max-sm:bg-background max-sm:sticky max-sm:z-20 max-sm:-mx-4 max-sm:mb-2 max-sm:block",
        back()
          ? "max-sm:top-0 max-sm:pt-[env(safe-area-inset-top)]"
          : "max-sm:top-[calc(env(safe-area-inset-top)+4rem)]",
        props.class,
      )}
    >
      <Show when={back() && isPhone()}>
        <CoverTabs />
      </Show>
      <div class="min-w-0 flex-1">
        <div
          class={cn(
            "flex items-center gap-2",
            "max-sm:h-16 max-sm:gap-1 max-sm:pr-1",
            back() ? "max-sm:pl-1" : "max-sm:pl-4",
          )}
        >
          <Show when={back()}>
            <BackButton class="sm:hidden" />
          </Show>
          <h1
            title={props.title}
            class={cn(
              "text-26px md:text-32px line-clamp-2 min-w-0 leading-8 font-semibold tracking-tight text-balance break-words md:leading-10",
              "max-sm:line-clamp-1 max-sm:flex-1 max-sm:pl-1 max-sm:text-xl max-sm:leading-7",
              !back() && "max-sm:pl-0",
            )}
          >
            {props.title}
          </h1>
          <Show when={props.phoneActions}>
            <div class="ml-auto flex shrink-0 items-center gap-1 sm:hidden">
              {props.phoneActions}
            </div>
          </Show>
        </div>
        <Show when={props.description}>
          <p class="text-muted-foreground max-sm:text-13px mt-1 text-sm max-sm:-mt-2 max-sm:truncate max-sm:px-4 max-sm:pb-2">
            {props.description}
          </p>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex items-center gap-2 max-sm:hidden">{props.actions}</div>
      </Show>
    </header>
  )
}
