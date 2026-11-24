import type { ComponentProps } from "@solidjs/web"
import {
  Collapsible as CollapsiblePrimitive,
  CollapsiblePanel,
  CollapsibleTrigger as CollapsibleTriggerPrimitive,
} from "@ui-sdk/solid/collapsible"

/** A panel of content that a button shows and hides. */
function Collapsible(props: ComponentProps<typeof CollapsiblePrimitive>) {
  return <CollapsiblePrimitive data-slot="collapsible" {...props} />
}

/** The button that opens and closes a collapsible panel. */
function CollapsibleTrigger(
  props: ComponentProps<typeof CollapsibleTriggerPrimitive>,
) {
  return (
    <CollapsibleTriggerPrimitive data-slot="collapsible-trigger" {...props} />
  )
}

/** The content a collapsible trigger shows and hides. */
function CollapsibleContent(props: ComponentProps<typeof CollapsiblePanel>) {
  return <CollapsiblePanel data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
