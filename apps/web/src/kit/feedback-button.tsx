import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Check, CircleAlert } from "lucide"
import { type ComponentProps, createEffect, For, omit } from "solid-js"

import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"

type FeedbackState = "idle" | "pending" | "success" | "error"

const FEEDBACK_STATES: readonly FeedbackState[] = [
  "idle",
  "pending",
  "success",
  "error",
]

type FeedbackButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  state?: FeedbackState
  /**
   * The idle label. It also stands in for any missing pending, success, or
   * error label, so it can render more than once: pass plain content, such
   * as an icon and text, with no ids or state.
   */
  children: JSX.Element
  /** Shown beside a spinner while pending. */
  pendingLabel?: JSX.Element
  successLabel?: JSX.Element
  errorLabel?: JSX.Element
}

/**
 * A button that reports how its own action went, in place of a toast. The
 * caller owns the state, so it can follow a mutation or a longer workflow.
 *
 * Every state's label stays mounted and crossfades. Only the active one is
 * laid out, and the button eases between the old and new label's width, so
 * a longer "Saving…" never shoves its neighbours.
 */
function FeedbackButton(props: FeedbackButtonProps) {
  const state = () => props.state ?? "idle"
  // A filled button already carries its state in the fill; tinting its icon
  // would fight the label colour.
  const tinted = () =>
    props.variant !== undefined &&
    props.variant !== null &&
    props.variant !== "default" &&
    props.variant !== "destructive"
  const label = (layer: FeedbackState): JSX.Element => {
    switch (layer) {
      case "idle":
        return props.children
      case "pending":
        return (
          <>
            <Spinner />
            {props.pendingLabel ?? props.children}
          </>
        )
      case "success":
        return (
          <>
            <Icon icon={Check} class={{ "text-success": tinted() }} />
            {props.successLabel ?? props.children}
          </>
        )
      case "error":
        return (
          <>
            <Icon icon={CircleAlert} class={{ "text-destructive": tinted() }} />
            {props.errorLabel ?? props.children}
          </>
        )
    }
  }

  let layers: HTMLSpanElement | undefined
  let resize: Animation | undefined
  createEffect(state, (next, previous) => {
    if (!layers || previous === undefined || previous === next) return
    // A resize still running starts the next one from wherever it got to.
    const from =
      resize?.playState === "running"
        ? layers.offsetWidth
        : layerWidth(layers, FEEDBACK_STATES.indexOf(previous))
    resize?.cancel()
    resize = undefined
    const to = layerWidth(layers, FEEDBACK_STATES.indexOf(next))
    // A hidden button measures 0; there is nothing to ease.
    if (!from || !to || from === to) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    resize = layers.animate(
      { width: [`${from}px`, `${to}px`] },
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
  })

  return (
    <Button
      {...omit(
        props,
        "state",
        "children",
        "pendingLabel",
        "successLabel",
        "errorLabel",
        "class",
        "disabled",
      )}
      data-feedback-state={state()}
      aria-live="polite"
      class={cn(
        "overflow-hidden",
        (state() === "pending" || state() === "success") &&
          "disabled:opacity-100",
        props.class,
      )}
      disabled={
        props.disabled || state() === "pending" || state() === "success"
      }
    >
      <span
        ref={(element) => (layers = element)}
        class="relative inline-flex justify-center"
      >
        <For each={FEEDBACK_STATES}>
          {(layer) => (
            <span
              aria-hidden={layer === state() ? undefined : "true"}
              class={[
                "inline-flex items-center justify-center gap-1.5 transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none",
                layer === state()
                  ? "relative"
                  : "invisible absolute top-1/2 left-1/2 w-max -translate-x-1/2 -translate-y-1/2 opacity-0",
              ]}
            >
              {label(layer)}
            </span>
          )}
        </For>
      </span>
    </Button>
  )
}

function layerWidth(layers: HTMLElement, index: number): number {
  const layer = layers.children[index]
  return layer instanceof HTMLElement ? layer.offsetWidth : 0
}

export { FeedbackButton }
export type { FeedbackButtonProps, FeedbackState }
