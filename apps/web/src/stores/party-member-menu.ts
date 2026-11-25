import { createSignal } from "solid-js"

type MemberAction = "owner" | "kick"

/** A party member's confirmation. Each row makes its own. */
export function createMemberMenuStore() {
  const [open, setOpen] = createSignal(false)
  // The last question, kept while its dialog closes.
  const [shown, setShown] = createSignal<MemberAction>("kick")
  return {
    open,
    shown,
    ask: (action: MemberAction) => {
      setShown(action)
      setOpen(true)
    },
    close: () => setOpen(false),
  }
}
