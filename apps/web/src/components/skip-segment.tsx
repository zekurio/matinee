import type { MediaSegment } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { SkipForwardIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { tr } from "@/i18n"
import { selectHidden, selectNow, usePlayerStore } from "@/stores/player"

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
export function SkipSegment({
  segments,
  onSkip,
}: {
  segments: readonly MediaSegment[]
  onSkip: (to: number) => void
}) {
  const segment = usePlayerStore((state) => {
    const now = selectNow(state)
    const skipped = state.skipped ? segmentKey(state.skipped) : null
    return (
      segments.find(
        (segment) =>
          now >= segment.start &&
          now < segment.end - END_S &&
          segmentKey(segment) !== skipped,
      ) ?? null
    )
  })
  const setSkipped = usePlayerStore((state) => state.setSkipped)
  if (!segment) return null
  // A new segment shows for a while by itself again.
  return (
    <SkipButton
      key={segmentKey(segment)}
      segment={segment}
      onSkip={() => {
        onSkip(segment.end)
        setSkipped(segment)
      }}
    />
  )
}

function SkipButton({
  segment,
  onSkip,
}: {
  segment: MediaSegment
  onSkip: () => void
}) {
  const controlsHidden = usePlayerStore(selectHidden)
  const [fresh, setFresh] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setFresh(false), SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [])
  if (!fresh && controlsHidden) return null
  return (
    <Button
      size="lg"
      variant="secondary"
      className="bg-black/70 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-md hover:bg-black/85"
      onClick={onSkip}
    >
      {skipLabel(segment.kind)}
      <SkipForwardIcon data-icon="inline-end" className="fill-current" />
    </Button>
  )
}
