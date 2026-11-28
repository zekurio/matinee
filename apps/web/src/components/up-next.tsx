import { Play } from "lucide"
import { createEffect, createSignal, Show } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { usePlayerStore, usePlayerStoreApi } from "@/stores/player"
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
export function UpNextCard(props: { upNext: UpNext }) {
  const ended = usePlayerStore((state) => state.ended)
  const reached = usePlayerStore(
    (state) => props.upNext.at !== null && state.time >= props.upNext.at,
  )
  // Each showing starts a fresh countdown.
  return (
    <Show when={ended() || reached()}>
      <Countdown upNext={props.upNext} />
    </Show>
  )
}

function Countdown(props: { upNext: UpNext }) {
  const ended = usePlayerStore((state) => state.ended)
  const remaining = usePlayerStore((state) =>
    Math.max(0, Math.ceil(state.duration - state.time)),
  )
  // Offered before the end, so the end itself starts the next one.
  const early = !usePlayerStoreApi().getState().ended
  const [cancelled, setCancelled] = createSignal(
    !usePlayerPreferencesStore.getState().autoplayNext,
  )
  const [hidden, setHidden] = createSignal(false)
  const [left, setLeft] = createSignal(COUNTDOWN_S)

  // A second's timer at a time, so cancelling stops the next tick.
  createEffect(
    () => ({
      stopped: cancelled() || !ended(),
      seconds: left(),
      play: props.upNext.play,
    }),
    ({ stopped, seconds, play }) => {
      if (stopped) return
      if (early) {
        play()
        return
      }
      const timer = window.setTimeout(() => {
        if (seconds <= 1) play()
        else setLeft(seconds - 1)
      }, 1000)
      return () => window.clearTimeout(timer)
    },
  )

  // Hidden while the credits roll, it comes back once the video ends.
  return (
    <Show when={!hidden() || ended()}>
      <section
        aria-label={tr("player.upNext")}
        class="w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-black/85 p-4 text-white shadow-lg ring-1 ring-white/10"
      >
        <p class="text-sm text-white/70">{tr("player.upNext")}</p>
        <p class="mt-1 line-clamp-2 font-semibold">{props.upNext.name}</p>
        <div class="mt-3 flex gap-2">
          <Button onClick={() => props.upNext.play()}>
            <Icon icon={Play} class="fill-current" />
            {cancelled()
              ? tr("player.play")
              : tr("player.upNext.in", {
                  seconds: ended() ? left() : remaining(),
                })}
          </Button>
          <Show
            when={!ended()}
            fallback={
              <Show when={!cancelled()}>
                <Button variant="secondary" onClick={() => setCancelled(true)}>
                  {tr("player.upNext.cancel")}
                </Button>
              </Show>
            }
          >
            <Button
              variant="secondary"
              onClick={() => {
                setCancelled(true)
                setHidden(true)
              }}
            >
              {tr("player.upNext.hide")}
            </Button>
          </Show>
        </div>
      </section>
    </Show>
  )
}
