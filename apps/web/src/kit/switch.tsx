import { cn } from "@matinee/ui/lib/utils"
import type { ComponentProps } from "@solidjs/web"
import { Switch as SwitchPrimitive, SwitchThumb } from "@ui-sdk/solid/switch"
import { omit } from "solid-js"

/** A setting that takes effect as soon as it is turned on or off. */
function Switch(
  props: ComponentProps<typeof SwitchPrimitive> & {
    size?: "sm" | "default"
  },
) {
  return (
    <SwitchPrimitive
      data-slot="switch"
      data-size={props.size ?? "default"}
      class={cn(
        // The after: box widens the hit area past the visible track.
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors after:absolute after:-inset-x-3 after:-inset-y-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-checked:bg-primary data-unchecked:bg-input-hover data-disabled:cursor-not-allowed data-disabled:opacity-50 motion-reduce:transition-none",
        props.class,
      )}
      {...omit(props, "class", "size", "children")}
    >
      <SwitchThumb
        data-slot="switch-thumb"
        class="data-checked:bg-primary-foreground data-unchecked:bg-foreground pointer-events-none block rounded-full ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[17px] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=default]/switch:data-unchecked:translate-x-px group-data-[size=sm]/switch:data-unchecked:translate-x-0 motion-reduce:transition-none"
      />
    </SwitchPrimitive>
  )
}

export { Switch }
