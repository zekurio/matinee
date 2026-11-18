import type { SubtitleTrack } from "@matinee/contracts"

import { usePlayerStoreApi } from "@/stores/player"

/** What the subtitle menu and the C key work with, whoever draws them. */
export type SubtitleMenu = {
  tracks: SubtitleTrack[]
  /** The track in the menu, or null for off. */
  selected: string | null
  /** Show a track, or none for null, as the viewer's pick. */
  select: (trackId: string | null) => void
  /** Off if a track shows; otherwise the last pick or the best guess. */
  toggle: () => void
}

/**
 * The viewer's subtitle picks. A pick goes to `onSelect`, which asks the
 * server again, and to `onPick`, which remembers it; `undefined` asks the
 * server for its best guess.
 */
export function useSubtitlePicks(
  tracks: SubtitleTrack[],
  selected: string | null,
  onSelect: (trackId: string | null | undefined) => void,
  onPick: (trackId: string | null) => void,
): SubtitleMenu {
  const store = usePlayerStoreApi()

  const select = (trackId: string | null) => {
    onSelect(trackId)
    onPick(trackId)
  }

  const toggle = () => {
    if (selected !== null) {
      select(null)
      return
    }
    const { pickedSubtitle } = store.getState()
    const again = tracks.find((track) => track.id === pickedSubtitle)
    if (again) select(again.id)
    else onSelect(undefined)
  }

  return { tracks, selected, select, toggle }
}
