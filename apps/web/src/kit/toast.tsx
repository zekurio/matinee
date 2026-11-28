import { t } from "@matinee/contracts/schema"
import { uiText } from "@matinee/ui/lib/ui-text"
import type { JSX } from "@solidjs/web"
import {
  createToaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  type ToastType,
} from "@ui-sdk/solid/toast"
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert, X } from "lucide"
import { createMemo, Show } from "solid-js"

import { Icon, type IconNode } from "@/kit/icon"

const bottom = createToaster({ duration: 4000 })
const top = createToaster({ duration: 4000 })

type ToastOptions = {
  id?: string | number
  duration?: number
  description?: JSX.Element
  position?: "bottom-right" | "top-center"
  action?: { label: JSX.Element; onClick: (event: Event) => void }
  onDismiss?: () => void
}

function show(type: ToastType) {
  return (message: JSX.Element, options?: ToastOptions): string | number => {
    const id = options?.id === undefined ? undefined : String(options.id)
    const toaster = options?.position === "top-center" ? top : bottom
    const other = toaster === top ? bottom : top
    if (id !== undefined) other.dismiss(id)
    const action = options?.action
    const result = toaster({
      id,
      type,
      title: message,
      description: options?.description,
      duration: options?.duration,
      action: action && {
        label: action.label,
        onAction: (event) => action.onClick(event ?? new Event("click")),
      },
      onDismiss: ({ reason }) => {
        const onDismiss = options?.onDismiss
        if (onDismiss && reason !== "timeout" && reason !== "action") {
          // A dismissal handler can dismiss the same id while committing its action.
          queueMicrotask(onDismiss)
        }
      },
    })
    return options?.id ?? result
  }
}

/** Shows brief notifications, with an optional inline action and corner close. */
export const toast = {
  message: show("default"),
  success: show("success"),
  info: show("info"),
  warning: show("warning"),
  error: show("error"),
  loading: show("loading"),
  dismiss(id?: string | number) {
    const key = id === undefined ? undefined : String(id)
    bottom.dismiss(key)
    top.dismiss(key)
    return id
  },
}

const STATUS_ICONS = new Map<ToastType, IconNode>([
  ["success", CircleCheck],
  ["info", Info],
  ["warning", TriangleAlert],
  ["error", OctagonX],
  ["loading", Loader2],
])

type Offset = string | number
const offsetValue = t.union([t.string(), t.number()])
const edgeOffsets = t.object({
  top: offsetValue.optional(),
  right: offsetValue.optional(),
  bottom: offsetValue.optional(),
  left: offsetValue.optional(),
})
type MobileOffset =
  | Offset
  | { top?: Offset; right?: Offset; bottom?: Offset; left?: Offset }

function distance(value: Offset | undefined, fallback: string) {
  if (value === undefined) return fallback
  const number = t.number().safeParse(value)
  return number.success ? `${number.data}px` : String(value)
}

function ToastStack(props: {
  side: "top" | "bottom"
  mobileOffset?: MobileOffset
}) {
  const mobile = createMemo(() => {
    const offset = props.mobileOffset
    const uniform = offsetValue.safeParse(offset)
    if (uniform.success) {
      return {
        top: uniform.data,
        right: uniform.data,
        bottom: uniform.data,
        left: uniform.data,
      }
    }
    const edges = edgeOffsets.safeParse(offset)
    return edges.success ? edges.data : undefined
  })
  return (
    <ToastRegion
      toaster={props.side === "top" ? top : bottom}
      side={props.side}
      align={props.side === "top" ? "center" : "end"}
      aria-label={uiText().notifications}
      maxVisible={5}
      style={{
        "--toast-mobile-top": distance(mobile()?.top, "16px"),
        "--toast-mobile-right": distance(mobile()?.right, "16px"),
        "--toast-mobile-bottom": distance(mobile()?.bottom, "16px"),
        "--toast-mobile-left": distance(mobile()?.left, "16px"),
      }}
      class="group/toast-stack fixed z-60 h-(--toast-front-height) w-[380px] max-w-[calc(100vw-3rem)] overflow-visible border-0 bg-transparent p-0 data-expanded:h-[calc(var(--toast-stack-height)_+_max(0,var(--toast-count)_-_1)*10px)] data-[side=bottom]:right-6 data-[side=bottom]:bottom-[calc(24px_+_var(--keyboard-inset,0px))] data-[side=top]:top-[max(24px,env(safe-area-inset-top))] max-sm:w-[calc(100vw-var(--toast-mobile-left)-var(--toast-mobile-right))] max-sm:max-w-none max-sm:data-[side=bottom]:right-(--toast-mobile-right) max-sm:data-[side=bottom]:bottom-[calc(var(--toast-mobile-bottom)_+_var(--keyboard-inset,0px))] max-sm:data-[side=top]:top-[max(var(--toast-mobile-top),env(safe-area-inset-top))]"
    >
      {(entry) => (
        <Toast
          data-styled="true"
          class="matinee-toast group/toast bg-popover ring-foreground/10 absolute inset-x-0 z-[calc(10-var(--toast-index))] h-(--toast-height) [translate:var(--toast-swipe-x,0px)_calc(var(--stack-y)_+_var(--toast-swipe-y,0px))] scale-[calc(1-var(--toast-index)*0.05)] touch-none rounded-lg shadow-xl ring-1 shadow-black/25 transition-[opacity,translate,scale,height] duration-400 select-none [--stack-direction:-1] [--stack-y:calc(var(--stack-direction)*var(--toast-index)*10px)] group-data-[side=bottom]/toast-stack:bottom-0 group-data-[side=top]/toast-stack:top-0 group-data-[side=top]/toast-stack:[--stack-direction:1] data-ending-style:pointer-events-none data-ending-style:opacity-0 data-expanded:scale-100 data-expanded:[--stack-y:calc(var(--stack-direction)*(var(--toast-offset)_+_var(--toast-index)*10px))] data-starting-style:opacity-0 data-starting-style:[--stack-y:calc(var(--stack-direction)*-100%)] data-swiping:transition-none motion-reduce:transition-opacity [&:not([data-front],[data-expanded])]:h-(--toast-front-height)"
        >
          <Show when={STATUS_ICONS.get(entry.type ?? "default")}>
            {(icon) => (
              <span data-icon="" class="matinee-toast-icon">
                <Icon
                  icon={icon()}
                  class={[
                    "size-4",
                    { "animate-spin": entry.type === "loading" },
                  ]}
                />
              </span>
            )}
          </Show>
          <div data-content="">
            <ToastTitle class="matinee-toast-title" />
            <ToastDescription class="matinee-toast-description" />
          </div>
          <ToastAction data-button="" />
          <ToastClose
            data-close-button=""
            aria-label={uiText().closeToast}
            class="flex cursor-pointer items-center justify-center rounded-full"
          >
            <Icon icon={X} class="size-3" stroke-width={2.25} />
          </ToastClose>
        </Toast>
      )}
    </ToastRegion>
  )
}

/** Mounts the notification stacks once near the router root. */
export function Toaster(props: { mobileOffset?: MobileOffset }) {
  return (
    <>
      <ToastStack side="bottom" mobileOffset={props.mobileOffset} />
      <ToastStack side="top" mobileOffset={props.mobileOffset} />
    </>
  )
}
