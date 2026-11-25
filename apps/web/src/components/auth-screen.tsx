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

/**
 * A page outside the shell that only reports something, such as a missing
 * page, an error, or a link that no longer works. The actions stack the full
 * width of the column, as the sign-in form's buttons do, so they line up with
 * the text above them. `detail` is a smaller line under them, for what the
 * reader can do about it.
 */
export function StatusScreen(props: {
  title: string
  description: JSX.Element
  /** `Button`s, and links styled as one, the main one first. */
  actions?: JSX.Element
  detail?: JSX.Element
}) {
  return (
    <AuthScreen title={props.title} description={props.description}>
      <Show when={props.actions}>
        <div class="grid gap-2">{props.actions}</div>
      </Show>
      <Show when={props.detail}>
        <p
          class={cn(
            "text-muted-foreground text-13px leading-5",
            props.actions && "mt-4",
          )}
        >
          {props.detail}
        </p>
      </Show>
    </AuthScreen>
  )
}
