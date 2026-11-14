import { Button } from "@matinee/ui/components/button"
import { PlayIcon } from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { tr } from "@/i18n"
import { usePlayerStore } from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

/** How long the next episode waits after the end before it starts on its own. */
const COUNTDOWN_S = 10

/** The episode after the one playing, as the player offers it. */
export type UpNext = {
  /** "S1, E2 · The Title", or the title alone. */
  name: string
  /**
   * Seconds into the file to offer it at, where the credits start, as
   * `playback.start` answered. Null offers it once the video ends.
   */
  at: number | null
  play: () => void
}

/**
 * The next episode, once the credits start or the video plays to its
 * end. Offered before the end, it counts down to the end and starts
 * there; offered at the end, it starts after a short countdown. Either
 * waits for Play when the settings turned that off. Gone again when the
 * video moves back before it.
 */
export function UpNextCard({ upNext }: { upNext: UpNext }) {
  const ended = usePlayerStore((state) => state.ended)
  const reached = usePlayerStore(
    (state) => upNext.at !== null && state.time >= upNext.at,
  )
  // Each showing starts a fresh countdown.
  return ended || reached ? <Countdown upNext={upNext} /> : null
}

function Countdown({ upNext }: { upNext: UpNext }) {
  const ended = usePlayerStore((state) => state.ended)
  const remaining = usePlayerStore((state) =>
    Math.max(0, Math.ceil(state.duration - state.time)),
  )
  const autoplay = usePlayerPreferencesStore((state) => state.autoplayNext)
  // Offered before the end, so the end itself starts the next one.
  const [early] = useState(!ended)
  const [cancelled, setCancelled] = useState(!autoplay)
  const [hidden, setHidden] = useState(false)
  const [left, setLeft] = useState(COUNTDOWN_S)
  const play = useEffectEvent(upNext.play)

  // A second's timer at a time, so cancelling stops the next tick.
  useEffect(() => {
    if (cancelled || !ended) return
    if (early) {
      play()
      return
    }
    const timer = window.setTimeout(() => {
      if (left <= 1) play()
      else setLeft(left - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cancelled, ended, early, left])

  // Hidden while the credits roll, it comes back once the video ends.
  if (hidden && !ended) return null
  return (
    <section
      aria-label={tr("player.upNext")}
      className="w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-black/80 p-4 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
    >
      <p className="text-sm text-white/70">{tr("player.upNext")}</p>
      <p className="mt-1 line-clamp-2 font-semibold">{upNext.name}</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={upNext.play}>
          <PlayIcon className="fill-current" />
          {cancelled
            ? tr("player.play")
            : tr("player.upNext.in", { seconds: ended ? left : remaining })}
        </Button>
        {!ended ? (
          <Button
            variant="secondary"
            onClick={() => {
              setCancelled(true)
              setHidden(true)
            }}
          >
            {tr("player.upNext.hide")}
          </Button>
        ) : (
          !cancelled && (
            <Button variant="secondary" onClick={() => setCancelled(true)}>
              {tr("player.upNext.cancel")}
            </Button>
          )
        )}
      </div>
    </section>
  )
}
