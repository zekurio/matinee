import {
  formatCssColor,
  hsvaToRgba,
  hueColor,
  parseCssColor,
  rgbaToHsva,
  type Hsva,
} from "@matinee/ui/lib/color"
import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { createEffect, createSignal, Show } from "solid-js"

import { Input } from "@/kit/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/kit/popover"

const FALLBACK: Hsva = { h: 0, s: 0, v: 0, a: 1 }
const HEX_COLOR_RE = /^#?([0-9a-f]{6})$/i

/**
 * Checkerboard used behind translucent colours so alpha is visible rather than
 * blending into whatever the swatch happens to sit on.
 */
const ALPHA_CHECKERBOARD =
  "repeating-conic-gradient(oklch(0.5 0 0 / 0.35) 0% 25%, transparent 0% 50%) 50% / 8px 8px"

/**
 * Renders any CSS colour by handing the string straight to the browser, so
 * `oklch()`, `color-mix()`, and keywords preview correctly without the app
 * having to understand them.
 */
export function ColorSwatch(props: { color: string; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={cn(
        "border-border relative block size-full overflow-hidden rounded-md border",
        props.class,
      )}
      style={{ background: ALPHA_CHECKERBOARD }}
    >
      <span class="absolute inset-0" style={{ background: props.color }} />
    </span>
  )
}

function hsvaOf(value: string): Hsva | null {
  const rgba = parseCssColor(value)
  return rgba ? rgbaToHsva({ ...rgba, a: 1 }) : null
}

/**
 * Colour picker owned end to end: a saturation/value field, a hue rail, and a
 * swatch trigger. Replaces `<input type="color">`, which can't represent the
 * `oklch()` values the theme tokens actually use and renders differently in
 * every browser. It always emits an opaque `#rrggbb`.
 */
export function ColorPicker(props: {
  /** Any CSS colour. Unparseable values open the picker on black. */
  value: string
  onValueChange: (next: string) => void
  label: string
  /** Adds a `#rrggbb` field, for when the swatch has no text field beside it. */
  hexInput?: boolean
  disabled?: boolean
  class?: string
}) {
  // HSVA is component state, not derived from `value` each time: achromatic
  // colours (white/black/gray) project to hue 0 / saturation 0, so re-deriving
  // would snap the hue rail back and make it inert until saturation is raised.
  const [hsva, setHsva] = createSignal<Hsva>(FALLBACK)
  // A value from outside, the first one included, lands only when it no
  // longer matches our own RGB projection, so our own emits echoing back
  // don't wipe hue and saturation through gray.
  createEffect(
    () => {
      const next = hsvaOf(props.value)
      const same =
        next !== null &&
        formatCssColor(hsvaToRgba(next)) === formatCssColor(hsvaToRgba(hsva()))
      return same ? null : next
    },
    (next) => {
      if (next) setHsva(next)
    },
  )

  const emit = (next: Hsva) => {
    setHsva(next)
    props.onValueChange(formatCssColor(hsvaToRgba(next)))
  }

  return (
    <Popover>
      <PopoverTrigger
        disabled={props.disabled}
        aria-label={uiText().pickColor(props.label)}
        class={cn(
          "border-border hover:border-border-strong focus-visible:ring-ring focus-visible:ring-offset-background size-9 shrink-0 rounded-md border p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:size-8",
          props.class,
        )}
      >
        <ColorSwatch color={props.value} class="rounded-sm border-0" />
      </PopoverTrigger>
      <PopoverContent align="end" class="w-60 gap-3">
        <SaturationField
          label={props.label}
          hsva={hsva()}
          onChange={(s, v) => emit({ ...hsva(), s, v })}
        />
        <HueRail
          label={props.label}
          position={hsva().h / 360}
          thumbColor={hueColor(hsva().h)}
          onChange={(ratio) => emit({ ...hsva(), h: ratio * 360 })}
        />
        <Show when={props.hexInput}>
          <HexField
            label={props.label}
            value={props.value}
            onChange={(next) => props.onValueChange(next)}
          />
        </Show>
      </PopoverContent>
    </Popover>
  )
}

function SaturationField(props: {
  label: string
  hsva: Hsva
  onChange: (s: number, v: number) => void
}) {
  const track = dragTrack((x, y) => props.onChange(x, 1 - y))

  return (
    <div
      role="slider"
      aria-label={uiText().colorArea(props.label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.hsva.v * 100)}
      aria-valuetext={`${Math.round(props.hsva.s * 100)}% saturation, ${Math.round(props.hsva.v * 100)}% brightness`}
      tabindex={0}
      class="focus-visible:ring-ring focus-visible:ring-offset-background relative h-32 w-full cursor-crosshair touch-none rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      style={{ background: hueColor(props.hsva.h) }}
      onPointerDown={track}
      onKeyDown={(event) => {
        const { s, v } = props.hsva
        const step = event.shiftKey ? 0.1 : 0.02
        const next =
          event.key === "ArrowLeft"
            ? { s: Math.max(0, s - step), v }
            : event.key === "ArrowRight"
              ? { s: Math.min(1, s + step), v }
              : event.key === "ArrowDown"
                ? { s, v: Math.max(0, v - step) }
                : event.key === "ArrowUp"
                  ? { s, v: Math.min(1, v + step) }
                  : null
        if (!next) return
        event.preventDefault()
        props.onChange(next.s, next.v)
      }}
    >
      <div class="absolute inset-0 rounded-md bg-[linear-gradient(to_right,#fff,transparent)]" />
      <div class="absolute inset-0 rounded-md bg-[linear-gradient(to_top,#000,transparent)]" />
      <Thumb
        color={formatCssColor(hsvaToRgba({ ...props.hsva, a: 1 }))}
        left={`${props.hsva.s * 100}%`}
        top={`${(1 - props.hsva.v) * 100}%`}
      />
    </div>
  )
}

function HueRail(props: {
  label: string
  position: number
  thumbColor: string
  onChange: (ratio: number) => void
}) {
  const track = dragTrack((x) => props.onChange(x))

  return (
    <div
      role="slider"
      aria-label={uiText().colorHue(props.label)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(props.position * 100)}
      tabindex={0}
      class="focus-visible:ring-ring focus-visible:ring-offset-background relative h-3 w-full cursor-pointer touch-none rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      style={{
        background:
          "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
      }}
      onPointerDown={track}
      onKeyDown={(event) => {
        const position = props.position
        const step = event.shiftKey ? 0.1 : 0.01
        const next =
          event.key === "ArrowLeft" || event.key === "ArrowDown"
            ? Math.max(0, position - step)
            : event.key === "ArrowRight" || event.key === "ArrowUp"
              ? Math.min(1, position + step)
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 1
                  : null
        if (next === null) return
        // Arrow keys and Home/End scroll the page otherwise.
        event.preventDefault()
        props.onChange(next)
      }}
    >
      <Thumb
        color={props.thumbColor}
        left={`${props.position * 100}%`}
        top="50%"
      />
    </div>
  )
}

/**
 * Typing reports only complete colors, with or without the `#`; leaving the
 * field restores the current color.
 */
function HexField(props: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  const hex = () => {
    const rgba = parseCssColor(props.value)
    return rgba ? formatCssColor({ ...rgba, a: 1 }) : ""
  }
  // The typed text, until the color it names changes.
  const [draft, setDraft] = createSignal(hex)

  return (
    <Input
      value={draft()}
      aria-label={uiText().colorHex(props.label)}
      spellcheck={false}
      class="font-mono text-xs"
      onValueChange={(next) => {
        setDraft(next)
        const digits = HEX_COLOR_RE.exec(next.trim())?.[1]
        if (digits) props.onChange(`#${digits.toLowerCase()}`)
      }}
      onBlur={() => setDraft(hex())}
    />
  )
}

function Thumb(props: {
  color: string
  left: string
  top: string
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_oklch(0_0_0/0.5)]"
      style={{ left: props.left, top: props.top, background: props.color }}
    />
  )
}

/**
 * Pointer capture on the track element, so a drag that leaves the popup keeps
 * updating instead of stopping at the edge. Reports 0-1 on both axes.
 */
function dragTrack(onMove: (x: number, y: number) => void) {
  return (event: PointerEvent & { currentTarget: HTMLDivElement }) => {
    const element = event.currentTarget

    const update = (clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect()
      const clamp = (n: number) => Math.min(1, Math.max(0, n))
      onMove(
        clamp((clientX - rect.left) / rect.width),
        clamp((clientY - rect.top) / rect.height),
      )
    }

    element.setPointerCapture(event.pointerId)
    update(event.clientX, event.clientY)

    const move = (next: PointerEvent) => update(next.clientX, next.clientY)
    const stop = () => {
      element.removeEventListener("pointermove", move)
      element.removeEventListener("pointerup", stop)
      element.removeEventListener("pointercancel", stop)
    }
    element.addEventListener("pointermove", move)
    element.addEventListener("pointerup", stop)
    element.addEventListener("pointercancel", stop)
  }
}
