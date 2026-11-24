import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { children, Show } from "solid-js"

import { Logo } from "./brand"

/**
 * Centered column for the sign-in and setup screens. The extra padding below
 * lifts it a little above the true middle, where centered content looks
 * right; a fixed top offset left short forms sitting high.
 */
export function AuthScreen(props: {
  title: string
  /** A line above the title, such as the step of a longer flow. */
  eyebrow?: string
  description?: JSX.Element
  /** Room for settings, as setup's steps after the admin account show. */
  wide?: boolean
  /** Behind everything, such as the login backdrop. */
  backdrop?: JSX.Element
  /** Fill the parent rather than the window, as a preview does. */
  contained?: boolean
  children?: JSX.Element
}) {
  const content = children(() => props.children)
  return (
    <main
      class={cn(
        "relative isolate flex flex-col items-center justify-center overflow-hidden px-4",
        props.contained
          ? "h-full py-16"
          : "min-h-dvh pt-24 pb-[calc(3rem+8vh)]",
      )}
    >
      {props.backdrop}
      <header class="absolute top-8 left-6 sm:left-10">
        <Logo class="text-2xl" />
      </header>
      <div
        class={cn(
          "relative w-full",
          props.wide ? "max-w-2xl" : "max-w-[360px]",
        )}
      >
        <Show when={props.eyebrow}>
          <p class="text-muted-foreground mb-2 text-sm">{props.eyebrow}</p>
        </Show>
        <h1 class="text-2xl font-semibold tracking-tight">{props.title}</h1>
        <Show when={props.description}>
          <p class="text-muted-foreground mt-2 text-sm leading-5">
            {props.description}
          </p>
        </Show>
        <Show when={content.toArray().length > 0}>
          <div class="mt-8">{content()}</div>
        </Show>
      </div>
    </main>
  )
}
