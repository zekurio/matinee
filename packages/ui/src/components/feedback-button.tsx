import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "cn"
import { CheckIcon, CircleAlertIcon } from "lucide-react"
import {
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useRef,
} from "react"

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
  children: ReactNode
  /** Shown beside a spinner while pending. */
  pendingLabel?: ReactNode
  successLabel?: ReactNode
  errorLabel?: ReactNode
}

/**
 * A button that reports how its own action went, in place of a toast. The
 * caller owns the state, so it can follow a mutation or a longer workflow.
 *
 * Every state's label stays mounted and crossfades. Only the active one is
 * laid out, and the button eases between the old and new label's width, so
 * a longer "Saving…" never shoves its neighbours.
 */
function FeedbackButton({
  state = "idle",
  children,
  pendingLabel,
  successLabel,
  errorLabel,
  variant,
  className,
  disabled,
  ...props
}: FeedbackButtonProps) {
  // A filled button already carries its state in the fill; tinting its icon
  // would fight the label colour.
  const tinted =
    variant !== undefined &&
    variant !== null &&
    variant !== "default" &&
    variant !== "destructive"
  const labels = new Map<FeedbackState, ReactNode>([
    ["idle", children],
    [
      "pending",
      <>
        <Spinner />
        {pendingLabel ?? children}
      </>,
    ],
    [
      "success",
      <>
        <CheckIcon className={tinted ? "text-success" : undefined} />
        {successLabel ?? children}
      </>,
    ],
    [
      "error",
      <>
        <CircleAlertIcon className={tinted ? "text-destructive" : undefined} />
        {errorLabel ?? children}
      </>,
    ],
  ])

  const layersRef = useRef<HTMLSpanElement>(null)
  const shownStateRef = useRef(state)
  const resizeRef = useRef<Animation | null>(null)
  useLayoutEffect(() => {
    const previous = shownStateRef.current
    shownStateRef.current = state
    const layers = layersRef.current
    if (!layers || previous === state) return
    // A resize still running starts the next one from wherever it got to.
    const running = resizeRef.current?.playState === "running"
    const from = running
      ? layers.offsetWidth
      : layerWidth(layers, FEEDBACK_STATES.indexOf(previous))
    resizeRef.current?.cancel()
    resizeRef.current = null
    const to = layerWidth(layers, FEEDBACK_STATES.indexOf(state))
    // A hidden button measures 0; there is nothing to ease.
    if (!from || !to || from === to) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    resizeRef.current = layers.animate(
      { width: [`${from}px`, `${to}px`] },
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
  }, [state])

  return (
    <Button
      data-feedback-state={state}
      aria-live="polite"
      variant={variant}
      className={cn(
        "overflow-hidden",
        (state === "pending" || state === "success") && "disabled:opacity-100",
        className,
      )}
      disabled={disabled || state === "pending" || state === "success"}
      {...props}
    >
      <span ref={layersRef} className="relative inline-flex justify-center">
        {FEEDBACK_STATES.map((layerState) => (
          <span
            key={layerState}
            aria-hidden={layerState !== state || undefined}
            className={cn(
              "inline-flex items-center justify-center gap-1.5",
              "transition-[opacity,visibility] duration-150 ease-out motion-reduce:transition-none",
              layerState === state
                ? "relative"
                : "invisible absolute top-1/2 left-1/2 w-max -translate-x-1/2 -translate-y-1/2 opacity-0",
            )}
          >
            {labels.get(layerState)}
          </span>
        ))}
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
