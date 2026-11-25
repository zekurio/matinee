import type { Artwork, CatalogRef } from "@matinee/contracts"
import { Show } from "solid-js"

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
export function CatalogSeasonCard(props: {
  /** The show, as the catalog knows it or as the library does. */
  show: { ref: CatalogRef; name: string; poster: Artwork | null }
  season: CatalogSeasonEntry
  libraryId?: string
  /** Nothing of the show is asked for yet. */
  first: boolean
}) {
  const ask = useAsk()
  const availability = () => props.season.availability
  const label = () => seasonName(props.season.number)
  const name = () =>
    tr("title.seasonOf", { show: props.show.name, season: label() })
  const line = () => {
    const current = availability()
    return current.state === "coming" && current.progress !== null
      ? tr("catalog.state.comingPercent", {
          percent: formatPercent(current.progress),
        })
      : (stateWord(current) ?? seasonDetail(props.season))
  }
  // A season's own button only requests: cancelling is the whole show's,
  // on its poster.
  const requests = () => posterAction(availability()) === "request"
  return (
    <div class="group/card relative">
      <PosterArt
        name={name()}
        toneKey={`${refKey(props.show.ref)}:${props.season.number}`}
        poster={art(props.season.poster ?? props.show.poster)}
      >
        <Show when={requests()}>
          <CardScrim />
        </Show>
        <CatalogBadge
          availability={availability()}
          class="absolute top-1.5 right-1.5"
        />
        <Show when={requests()}>
          <CardActionButton
            touch
            availability={availability()}
            name={name()}
            requestName={tr("ask.askNamed", { name: label() })}
            busy={ask.isPending}
            onRequest={() =>
              // Undo takes the whole request back, so it's only offered
              // for a first one, not for a season added to it.
              ask.mutate({
                ref: props.show.ref,
                name: name(),
                libraryId: props.libraryId,
                scope: { seasons: [props.season.number] },
                undo: props.first,
              })
            }
          />
        </Show>
      </PosterArt>
      <CardText primary={label()} secondary={line()} />
    </div>
  )
}
