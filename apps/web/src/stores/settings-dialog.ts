import { createSignal } from "solid-js"

/**
 * Where the open panel's save bar renders: a slot on the panel's bottom
 * edge, outside the scrolling content. Undefined while no section is open.
 * There is one dialog, so one slot.
 */
const [saveBarSlot, setSlot] = createSignal<HTMLElement | undefined>(
  undefined,
  // Set from the slot's ref, which runs while the dialog renders.
  { ownedWrite: true },
)

/** The slot's ref callback, and what clears it when the slot goes. */
export function setSaveBarSlot(node: HTMLElement | undefined) {
  setSlot(node)
}

export { saveBarSlot }
