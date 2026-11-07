import type { PlaybackPreferences } from "@matinee/contracts"
import { create } from "zustand"

type PendingPlaybackState = {
  /**
   * A change to the account's playback preferences that isn't saved yet.
   * Everything reads it in place of the saved ones meanwhile.
   */
  pending: PlaybackPreferences | null
  setPending: (pending: PlaybackPreferences | null) => void
}

/** See `updatePlaybackPreferences` in `lib/playback-sync.ts`. */
export const usePendingPlaybackStore = create<PendingPlaybackState>()(
  (set) => ({
    pending: null,
    setPending: (pending) => set({ pending }),
  }),
)
