import { createStore } from "zustand/vanilla"

type MemberAction = "owner" | "kick"

type MemberMenuState = {
  open: boolean
  /** The last question, kept while its dialog closes. */
  shown: MemberAction
  ask: (action: MemberAction) => void
  close: () => void
}

/** A party member's confirmation. Each row makes its own. */
export function createMemberMenuStore() {
  return createStore<MemberMenuState>()((set) => ({
    open: false,
    shown: "kick",
    ask: (shown) => set({ shown, open: true }),
    close: () => set({ open: false }),
  }))
}
