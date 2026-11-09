import { Button } from "@matinee/ui/components/button"
import { PlayIcon } from "lucide-react"
import { useEffect, useEffectEvent, useState } from "react"

import { tr } from "@/i18n"
import { usePlayerStore } from "@/stores/player"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

/** How long the next episode waits before it starts on its own. */
const COUNTDOWN_S = 10

/** The episode after the one playing, as the player offers it. */
export type UpNext = {
  /** "S1, E2 · The Title", or the title alone. */
  name: string
  play: () => void
}

/**
 * The next episode, once the video plays to its end: it starts after a
 * short countdown, or waits for Play when the settings turned that off.
 * Gone again when the video starts over or moves back.
 */
export function UpNextCard({ upNext }: { upNext: UpNext }) {
  const ended = usePlayerStore((state) => state.ended)
  // Each end starts a fresh countdown.
  return ended ? <Countdown upNext={upNext} /> : null
}

function Countdown({ upNext }: { upNext: UpNext }) {
  const autoplay = usePlayerPreferencesStore((state) => state.autoplayNext)
  const [left, setLeft] = useState(COUNTDOWN_S)
  const [cancelled, setCancelled] = useState(!autoplay)
  const play = useEffectEvent(upNext.play)

  // A second's timer at a time, so cancelling stops the next tick.
  useEffect(() => {
    if (cancelled) return
    const timer = window.setTimeout(() => {
      if (left <= 1) play()
      else setLeft(left - 1)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [cancelled, left])

  return (
    <section
      aria-label={tr("player.upNext")}
      className="absolute right-3 bottom-28 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-black/80 p-4 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md sm:right-5 sm:bottom-32"
    >
      <p className="text-sm text-white/70">{tr("player.upNext")}</p>
      <p className="mt-1 line-clamp-2 font-semibold">{upNext.name}</p>
      <div className="mt-3 flex gap-2">
        <Button onClick={upNext.play}>
          <PlayIcon className="fill-current" />
          {cancelled
            ? tr("player.play")
            : tr("player.upNext.in", { seconds: left })}
        </Button>
        {!cancelled && (
          <Button variant="secondary" onClick={() => setCancelled(true)}>
            {tr("player.upNext.cancel")}
          </Button>
        )}
      </div>
    </section>
  )
}
