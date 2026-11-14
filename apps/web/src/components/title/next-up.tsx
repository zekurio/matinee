import type { Title } from "@matinee/contracts"

import { tr } from "@/i18n"

import { EpisodeRow } from "./episodes"

/**
 * The episode Play starts, as "Continue watching" while it's in progress
 * and "Next up" otherwise. Nothing once every episode is watched.
 */
export function NextUp({ title }: { title: Title }) {
  const next = title.next
  if (!next || next.progress?.completed) return null
  return (
    <section aria-labelledby="next-up-heading">
      <h2
        id="next-up-heading"
        className="mb-3 text-xl font-semibold tracking-tight"
      >
        {next.progress ? tr("title.nextUp.continue") : tr("title.nextUp.next")}
      </h2>
      <div className="max-w-5xl">
        <EpisodeRow item={next} />
      </div>
    </section>
  )
}
