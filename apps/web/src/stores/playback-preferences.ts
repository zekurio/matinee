import type { PlaybackPreferences } from "@matinee/contracts"

import { createPlainStore, type PlainStore, storeHook } from "./plain-store"

type PendingPlaybackState = {
  /**
   * A change to the account's playback preferences that isn't saved yet.
   * Everything reads it in place of the saved ones meanwhile.
   */
  pending: PlaybackPreferences | null
  setPending: (pending: PlaybackPreferences | null) => void
}

const store: PlainStore<PendingPlaybackState> =
  createPlainStore<PendingPlaybackState>({
    pending: null,
    setPending: (pending: PlaybackPreferences | null) =>
      store.setState({ pending }),
  })

/** See `updatePlaybackPreferences` in `lib/playback-sync.ts`. */
export const usePendingPlaybackStore = storeHook(store)
