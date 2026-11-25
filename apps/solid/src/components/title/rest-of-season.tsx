import type { Title } from "@matinee/contracts"
import { Show } from "solid-js"

import { PosterBadge } from "@/components/catalog/catalog-card"
import type { CatalogSeasonEntry } from "@/components/catalog/catalog-data"
import { PosterActionButton } from "@/components/catalog/poster-request"
import { useAsk } from "@/components/catalog/use-ask"
import { CardText } from "@/components/media-item"
import {
  AdminAnswer,
  requestedTip,
  useWaitingRequest,
} from "@/components/requests/admin-answer"
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
 * until it's requested. For an admin with a request for it to answer,
 * Add and Decline, and the badge says who requested it.
 */
export function RestOfSeasonCard(props: {
  title: Title
  gaps: ShowGaps
  season: CatalogSeasonEntry
}) {
  const ask = useAsk()
  const waiting = useWaitingRequest(() => props.season.availability)
  const more = () =>
    props.season.availability.episodesAired -
    props.season.availability.episodesHere
  const tip = () => {
    const request = waiting()
    return request ? requestedTip(request.item) : null
  }
  const name = () =>
    tr("title.rest.name", {
      name: tr("title.seasonOf", {
        show: props.title.name,
        season: seasonName(props.season.number),
      }),
    })
  return (
    <div>
      <div class={frame}>
        <span class="flex max-w-full flex-col items-center gap-2 px-3">
          <PosterBadge availability={props.season.availability} tip={tip()} />
          <Show
            when={!waiting()?.answered && waiting()}
            fallback={
              <PosterActionButton
                availability={props.season.availability}
                name={name()}
                size="sm"
                label={tr("title.rest.ask")}
                busy={ask.isPending}
                look="plain"
                class="w-auto"
                onRequest={() =>
                  ask.mutate({
                    ref: props.gaps.ref,
                    name: name(),
                    libraryId: props.gaps.libraryId,
                    scope: { seasons: [props.season.number] },
                    undo: props.gaps.first,
                  })
                }
              />
            }
          >
            {(request) => (
              <AdminAnswer
                item={request().item}
                look="plain"
                class="max-w-full"
              />
            )}
          </Show>
        </span>
      </div>
      <CardText primary={tr("title.rest.more", { count: more() })} />
    </div>
  )
}
