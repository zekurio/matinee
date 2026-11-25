import type { MediaSegment } from "@matinee/contracts"
import { SkipForward } from "lucide"
import { createMemo, createSignal, onSettled, Show } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import {
  selectHidden,
  selectNow,
  usePlayerStore,
  usePlayerStoreApi,
} from "@/stores/player"

/** How long the button stays up by itself when the controls are hidden. */
const SHOWN_MS = 8000
/** The last second of a segment has nothing left worth skipping. */
const END_S = 1

function skipLabel(kind: MediaSegment["kind"]): string {
  switch (kind) {
    case "intro":
      return tr("player.skip.intro")
    case "recap":
      return tr("player.skip.recap")
    case "credits":
      return tr("player.skip.credits")
    case "preview":
      return tr("player.skip.preview")
  }
}

function segmentKey(segment: MediaSegment): string {
  return `${segment.kind}:${segment.start}`
}

/**
 * Skip intro, and the like for the other segments the server found,
 * while the video is in one. As in Jellyfin, it shows for a few seconds
 * when the segment starts, and with the controls after that. Once
 * skipped, a segment's button stays away until the viewer seeks.
 */
export function SkipSegment(props: {
  segments: readonly MediaSegment[]
  onSkip: (to: number) => void
}) {
  const { setSkipped } = usePlayerStoreApi().getState()
  const now = usePlayerStore(selectNow)
  const skipped = usePlayerStore((state) =>
    state.skipped ? segmentKey(state.skipped) : null,
  )
  // Worked out on each time update; the button changes only with the segment.
  const segment = createMemo(() => {
    const at = now()
    const left = skipped()
    return (
      props.segments.find(
        (entry) =>
          at >= entry.start &&
          at < entry.end - END_S &&
          segmentKey(entry) !== left,
      ) ?? null
    )
  })
  // Keyed, so a new segment shows for a while by itself again.
  return (
    <Show when={segment()} keyed>
      {(current) => (
        <SkipButton
          segment={current}
          onSkip={() => {
            props.onSkip(current.end)
            setSkipped(current)
          }}
        />
      )}
    </Show>
  )
}

function SkipButton(props: { segment: MediaSegment; onSkip: () => void }) {
  const controlsHidden = usePlayerStore(selectHidden)
  const [fresh, setFresh] = createSignal(true)
  onSettled(() => {
    const timer = window.setTimeout(() => setFresh(false), SHOWN_MS)
    return () => window.clearTimeout(timer)
  })
  return (
    <Show when={fresh() || !controlsHidden()}>
      <Button
        size="lg"
        variant="secondary"
        class="bg-black/70 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md hover:bg-black/85"
        onClick={() => props.onSkip()}
      >
        {skipLabel(props.segment.kind)}
        <Icon icon={SkipForward} data-icon="inline-end" class="fill-current" />
      </Button>
    </Show>
  )
}
