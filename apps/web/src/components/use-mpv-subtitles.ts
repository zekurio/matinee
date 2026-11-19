import type { PlayerSubtitle } from "@matinee/desktop-bridge"
import { type RefObject, useEffect } from "react"
import { useShallow } from "zustand/shallow"

import {
  type PlayerState,
  selectSubtitle,
  usePlayerStore,
} from "@/stores/player"

import type { MpvMedia } from "./mpv-media"
import { type SubtitleMenu, useSubtitlePicks } from "./subtitle-picks"

// Space between lifted subtitles and the seek bar, as in the browser.
const CUE_GAP_PX = 12

/**
 * The subtitle mpv draws for the answer, once it is the one picked: a
 * stream of the file for the `player` mode, the server's file for
 * `client`. Nothing for a burned-in one, which is in the picture.
 */
export function mpvSubtitle(state: PlayerState): PlayerSubtitle | null {
  const { plan } = state
  const track = plan.subtitle
  if (!track || track.id !== selectSubtitle(state)) return null
  if (plan.subtitleMode === "player") {
    // A server from before the desktop app doesn't say which stream it
    // is, and mpv can't be told without. No subtitle then, rather than a
    // source the shell refuses.
    const { index } = track
    return index !== null && Number.isInteger(index)
      ? { kind: "stream", index }
      : null
  }
  if (plan.subtitleMode === "client" && plan.subtitleUrl !== null) {
    return { kind: "external", url: plan.subtitleUrl }
  }
  return null
}

/**
 * Seconds mpv shows the subtitles later by: the viewer's delay, and for a
 * file of them, which counts in the file's time, the start of a stream
 * that begins partway in, so its cue at that point shows at the stream's 0.
 */
export function mpvSubtitleDelay(state: PlayerState): number {
  const external = mpvSubtitle(state)?.kind === "external"
  return state.subtitleDelay / 1000 - (external ? state.source.offset : 0)
}

/**
 * Subtitles for the player when mpv plays: mpv draws them all with
 * libass, from the file or from the server, so none are fetched here.
 * Changing them keeps the source. While `lifted` is true they stay clear
 * of `controls`. Picks go to `onSelect` and `onPick`, as in the browser.
 */
export function useMpvSubtitles(
  media: MpvMedia,
  controls: RefObject<HTMLElement | null>,
  lifted: boolean,
  onSelect: (trackId: string | null | undefined) => void,
  onPick: (trackId: string | null) => void,
): SubtitleMenu {
  const { tracks, selected } = usePlayerStore(
    useShallow((state) => ({
      tracks: state.plan.subtitleTracks,
      selected: selectSubtitle(state),
    })),
  )
  const subtitle = usePlayerStore(useShallow(mpvSubtitle))
  const delay = usePlayerStore(mpvSubtitleDelay)

  // A new source takes these with it; these follow the changes after.
  useEffect(() => media.setSubtitle(subtitle), [media, subtitle])
  useEffect(() => media.setSubtitleDelay(delay), [media, delay])

  // Clear of the controls while they show, as the window changes too.
  useEffect(() => {
    const place = () => {
      const el = controls.current
      const height = window.innerHeight
      if (!lifted || !el || height <= 0) {
        media.setSubtitleInset(0)
        return
      }
      const top = el.getBoundingClientRect().top
      media.setSubtitleInset((height - top + CUE_GAP_PX) / height)
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [media, lifted])

  return useSubtitlePicks(tracks, selected, onSelect, onPick)
}
