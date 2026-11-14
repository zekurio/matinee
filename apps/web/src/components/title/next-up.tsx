import type { Title } from "@matinee/contracts"

import { tr } from "@/i18n"

import { EpisodeRow } from "./episodes"
import { NextSeasonRow, offersSeason } from "./next-season"
import { useShowGaps } from "./show-gaps"

/**
 * The episode Play starts, as "Continue watching" while it's in progress
 * and "Next up" otherwise. Once every episode here is watched, the next
 * season when the server doesn't have it, with the ask for it. Nothing
 * when there's neither.
 */
export function NextUp({ title }: { title: Title }) {
  const gaps = useShowGaps(title)
  const next = title.next
  const episode = next && !next.progress?.completed ? next : null
  const season =
    !episode && gaps?.next && offersSeason(gaps.next) ? gaps.next : null
  if (!episode && !season) return null
  return (
    <section aria-labelledby="next-up-heading">
      <h2
        id="next-up-heading"
        className="mb-3 text-xl font-semibold tracking-tight"
      >
        {episode?.progress
          ? tr("title.nextUp.continue")
          : tr("title.nextUp.next")}
      </h2>
      {episode ? (
        <div className="max-w-5xl">
          <EpisodeRow item={episode} />
        </div>
      ) : (
        gaps &&
        season && (
          <NextSeasonRow
            title={title}
            showRef={gaps.ref}
            libraryId={gaps.libraryId}
            season={season}
            first={season.availability.requestId === null}
          />
        )
      )}
    </section>
  )
}
