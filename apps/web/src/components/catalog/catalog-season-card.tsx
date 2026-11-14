import type { Artwork, CatalogRef } from "@matinee/contracts"

import { CardScrim } from "@/components/card-actions"
import { CardText, PosterArt } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art, seasonName } from "@/lib/media"

import { CatalogBadge } from "./catalog-card"
import { type CatalogSeasonEntry, refKey } from "./catalog-data"
import { CardActionButton } from "./poster-request"
import { useAsk } from "./use-ask"
import { posterAction, seasonDetail, stateWord } from "./words"

/**
 * A season of a show the server lacks, by its poster, with its own state
 * in the corner and on the second line. Hovered or focused, it offers
 * "Request" for that season alone, as a catalog card does; with no page
 * of its own to open, a touch screen shows that button all the time.
 */
export function CatalogSeasonCard({
  show,
  season,
  libraryId,
  first,
}: {
  /** The show, as the catalog knows it or as the library does. */
  show: { ref: CatalogRef; name: string; poster: Artwork | null }
  season: CatalogSeasonEntry
  libraryId?: string
  /** Nothing of the show is asked for yet. */
  first: boolean
}) {
  const ask = useAsk()
  const { availability } = season
  const label = seasonName(season.number)
  const name = tr("title.seasonOf", { show: show.name, season: label })
  const line =
    availability.state === "coming" && availability.progress !== null
      ? tr("catalog.state.comingPercent", {
          percent: formatPercent(availability.progress),
        })
      : (stateWord(availability) ?? seasonDetail(season))
  // A season's own button only requests: cancelling or following is the
  // whole show's, on its poster.
  const requests = posterAction(availability) === "request"
  return (
    <div className="group/card relative">
      <PosterArt
        name={name}
        toneKey={`${refKey(show.ref)}:${season.number}`}
        poster={art(season.poster ?? show.poster)}
        scrim={requests}
      >
        {requests && <CardScrim />}
        <CatalogBadge
          availability={availability}
          className="absolute top-1.5 right-1.5"
        />
        {requests && (
          <CardActionButton
            touch
            availability={availability}
            name={name}
            busy={ask.isPending}
            onRequest={() =>
              // Undo takes the whole request back, so it's only offered
              // for a first one, not for a season added to it.
              ask.mutate({
                ref: show.ref,
                name,
                libraryId,
                scope: { seasons: [season.number], future: false },
                undo: first,
              })
            }
          />
        )}
      </PosterArt>
      <CardText primary={label} secondary={line} />
    </div>
  )
}
