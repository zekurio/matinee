import type { JSX } from "@solidjs/web"
import {
  SelectItem as SelectOption,
  SelectItemIndicator,
  SelectItemText,
} from "@ui-sdk/solid/select"
import { Check } from "lucide"

import { Icon } from "@/kit/icon"

/**
 * The kit's `SelectItem` for content beyond a plain label, such as a muted
 * note after it. ui-sdk's item text renders a string child as it is and
 * anything else only from a function, so this hands it one; `label` is
 * what the trigger shows and typeahead finds.
 */
export function RichSelectItem(props: {
  value: string
  label: string
  disabled?: boolean
  children: JSX.Element
}) {
  return (
    <SelectOption
      value={props.value}
      label={props.label}
      disabled={props.disabled}
      class="data-highlighted:bg-foreground/10 relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:font-medium [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [@media(pointer:coarse)]:py-2.5"
    >
      <SelectItemText class="flex min-w-0 flex-1 flex-col whitespace-nowrap">
        {() => props.children}
      </SelectItemText>
      <SelectItemIndicator class="pointer-events-none absolute top-2 right-2 flex size-4 items-center justify-center not-data-selected:hidden [@media(pointer:coarse)]:top-3">
        <Icon icon={Check} stroke-width={2.5} />
      </SelectItemIndicator>
    </SelectOption>
  )
}
