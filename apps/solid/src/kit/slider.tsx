import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import {
  Slider as SliderPrimitive,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
} from "@ui-sdk/solid/slider"
import { createMemo, omit, Repeat } from "solid-js"

/**
 * A value or range picked by dragging a thumb or with the arrow keys.
 * `thumbLabel` names each thumb; `thumbValueText` only reaches a single-thumb
 * slider, since ui-sdk formats a range with one format function.
 */
function Slider(
  props: ComponentProps<typeof SliderPrimitive> & {
    /** Each thumb's name for screen readers, by its index. */
    thumbLabel?: (index: number) => string
    /** What a screen reader says a thumb is at, in place of the number. */
    thumbValueText?: (value: number, index: number) => string
  },
) {
  const values = createMemo(() => {
    const value = props.value ?? props.defaultValue
    return Array.isArray(value) ? value : [props.min ?? 0, props.max ?? 100]
  })
  const format = () => {
    const valueText = props.thumbValueText
    if (props.format || values().length !== 1 || !valueText) return props.format
    return (value: number) => valueText(value, 0)
  }

  return (
    <SliderPrimitive
      data-slot="slider"
      class={cn(
        "data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full",
        props.class,
      )}
      defaultValue={props.defaultValue}
      value={props.value}
      min={props.min ?? 0}
      max={props.max ?? 100}
      format={format()}
      {...omit(
        props,
        "class",
        "defaultValue",
        "value",
        "min",
        "max",
        "format",
        "thumbLabel",
        "thumbValueText",
        "children",
      )}
    >
      <SliderControl class="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col">
        <SliderTrack
          data-slot="slider-track"
          class="bg-muted relative grow overflow-hidden rounded-full select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
        >
          <SliderIndicator
            data-slot="slider-range"
            class="bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          />
        </SliderTrack>
        <Repeat count={values().length}>
          {(index) => (
            <SliderThumb
              data-slot="slider-thumb"
              index={index}
              aria-label={props.thumbLabel?.(index)}
              class="border-ring ring-ring/50 relative block size-3 shrink-0 rounded-full border bg-white transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 active:ring-3 has-[:focus-visible]:ring-3 data-disabled:pointer-events-none data-disabled:opacity-50 [@media(pointer:coarse)]:size-5"
            />
          )}
        </Repeat>
      </SliderControl>
    </SliderPrimitive>
  )
}

export { Slider }
