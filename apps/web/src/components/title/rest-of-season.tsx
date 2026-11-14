import type { Title } from "@matinee/contracts"

import { PosterBadge } from "@/components/catalog/catalog-card"
import type { CatalogSeasonEntry } from "@/components/catalog/catalog-data"
import { PosterActionButton } from "@/components/catalog/poster-request"
import { useAsk } from "@/components/catalog/use-ask"
import { CardText } from "@/components/media-item"
import { tr } from "@/i18n"
import { seasonName } from "@/lib/media"

import type { ShowGaps } from "./show-gaps"

// The empty frame where the missing episodes' stills would be.
const frame =
  "border-foreground/20 bg-foreground/[0.03] grid aspect-video w-full place-items-center rounded-md border border-dashed"

/**
 * The end of a season's episodes when only some of them are here: how
 * many more there are, in a frame the size of an episode's still so it
 * reads as the gap it is, holding what a poster would: the state once
 * there is one, and the one thing to do about it, "Request the rest"
 * until it's requested.
 */
export function RestOfSeasonCard({
  title,
  gaps,
  season,
}: {
  title: Title
  gaps: ShowGaps
  season: CatalogSeasonEntry
}) {
  const ask = useAsk()
  const { availability } = season
  const more = availability.episodesAired - availability.episodesHere
  const name = tr("title.rest.name", {
    name: tr("title.seasonOf", {
      show: title.name,
      season: seasonName(season.number),
    }),
  })
  return (
    <div>
      <div className={frame}>
        <span className="flex max-w-full flex-col items-center gap-2 px-3">
          <PosterBadge availability={availability} />
          <PosterActionButton
            availability={availability}
            name={name}
            size="sm"
            label={tr("title.rest.ask")}
            busy={ask.isPending}
            look="plain"
            className="w-auto"
            onRequest={() =>
              ask.mutate({
                ref: gaps.ref,
                name,
                libraryId: gaps.libraryId,
                scope: { seasons: [season.number], future: false },
                undo: gaps.first,
              })
            }
          />
        </span>
      </div>
      <CardText primary={tr("title.rest.more", { count: more })} />
    </div>
  )
}
