import { uiText } from "@matinee/ui/lib/ui-text"
import { cn } from "@matinee/ui/lib/utils"
import { Loader2 } from "lucide"

import { Icon } from "@/kit/icon"

/** A spinning loader that tells assistive technology the page is busy. */
function Spinner(props: { class?: string; "aria-label"?: string }) {
  return (
    <Icon
      icon={Loader2}
      data-slot="spinner"
      role="status"
      aria-label={props["aria-label"] ?? uiText().loading}
      class={cn("size-4 animate-spin", props.class)}
    />
  )
}

export { Spinner }
