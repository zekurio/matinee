import type {
  Availability,
  CatalogRef,
  NextSeasonEntry,
  Title,
} from "@matinee/contracts"
import { Link } from "@tanstack/react-router"

import { CardScrim } from "@/components/card-actions"
import { CatalogBadge, PosterBadge } from "@/components/catalog/catalog-card"
import type { CatalogSeasonEntry } from "@/components/catalog/catalog-data"
import {
  CardActionButton,
  hasPosterButton,
  PosterActionButton,
  PosterShade,
} from "@/components/catalog/poster-request"
import { useAsk } from "@/components/catalog/use-ask"
import { asks, seasonDetail, stateWord } from "@/components/catalog/words"
import { PosterArt, textLink, Thumb } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art, present, seasonName } from "@/lib/media"

/** Whether there's anything to say about the season: an ask or a state. */
export function offersSeason(season: CatalogSeasonEntry): boolean {
  return season.availability.state !== "none" || asks(season.availability)
}

/** "Season 4 isn't here yet" while it can be asked for, else its state. */
export function seasonLine(season: {
  number: number
  availability: Availability
}): string {
  const label = seasonName(season.number)
  const { availability } = season
  const state =
    availability.state === "coming" && availability.progress !== null
      ? tr("catalog.state.comingPercent", {
          percent: formatPercent(availability.progress),
        })
      : stateWord(availability)
  return state
    ? tr("title.nextUp.seasonState", { season: label, state })
    : tr("title.nextUp.notHere", { season: label })
}

/**
 * Next up on a show's page once the viewer has watched every season here
 * and the next one isn't on the server: that season's poster, carrying
 * its state in the corner and the one thing to do about it along its
 * lower edge, as a catalog title's poster does, beside "Season 4 isn't
 * here yet". It catches the moment someone wants more.
 */
export function NextSeasonRow({
  title,
  showRef,
  libraryId,
  season,
  first,
}: {
  title: Title
  showRef: CatalogRef
  libraryId: string
  season: CatalogSeasonEntry
  first: boolean
}) {
  const ask = useAsk()
  const label = seasonName(season.number)
  const name = tr("title.seasonOf", { show: title.name, season: label })
  const { availability } = season
  return (
    <div className="grid max-w-5xl grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2">
      <div className="relative w-28 sm:w-36">
        <PosterArt
          name={name}
          toneKey={title.id}
          poster={art(season.poster ?? title.images.poster)}
        >
          <PosterBadge
            availability={availability}
            className="absolute top-1.5 right-1.5 max-w-[calc(100%-0.75rem)]"
          />
          {hasPosterButton(availability) && (
            <>
              <PosterShade />
              <span className="absolute inset-x-0 bottom-0 p-2">
                <PosterActionButton
                  availability={availability}
                  name={name}
                  size="sm"
                  busy={ask.isPending}
                  onRequest={() =>
                    ask.mutate({
                      ref: showRef,
                      name,
                      libraryId,
                      scope: { seasons: [season.number], future: false },
                      undo: first,
                    })
                  }
                />
              </span>
            </>
          )}
        </PosterArt>
      </div>
      <div className="flex min-w-0 flex-col gap-1 py-0.5">
        <p className="text-[15px] leading-6 font-medium sm:text-base">
          {tr("title.nextUp.notHere", { season: label })}
        </p>
        <p className="text-muted-foreground text-[13px] leading-5 tabular-nums">
          {seasonDetail(season)}
        </p>
        {season.overview && (
          <p className="text-muted-foreground mt-1 line-clamp-2 max-w-[72ch] text-sm leading-5 max-sm:hidden">
            {season.overview}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * A show in Home's Next up whose next season isn't on the server, the
 * size of an episode's card beside it: the show's backdrop, the season's
 * state in the corner, and while hovered or focused "Request" for that
 * season. A tap or a click opens the show, where Next up has the same
 * button on the season's poster.
 */
export function NextSeasonCard({
  entry,
  season,
}: {
  entry: NextSeasonEntry
  /** The season as the server streams it now. */
  season: CatalogSeasonEntry
}) {
  const ask = useAsk()
  const { title } = entry
  const { availability } = season
  const name = tr("title.seasonOf", {
    show: title.name,
    season: seasonName(season.number),
  })
  const canAsk = asks(availability)
  const sources = present(art(title.images.backdrop), art(title.images.poster))
  return (
    <div>
      <div className="group/card relative">
        <Link
          to="/titles/$titleId"
          params={{ titleId: title.id }}
          aria-label={`${title.name}, ${seasonLine(season)}`}
          className="focus-visible:ring-ring block rounded-md outline-none focus-visible:ring-2"
        >
          <Thumb
            sources={sources}
            toneKey={title.id}
            play={false}
            className="w-full"
          >
            <CardScrim />
          </Thumb>
        </Link>
        <div className="pointer-events-none absolute inset-0">
          <CatalogBadge
            availability={availability}
            className="absolute top-1.5 right-1.5"
          />
          {/* Only the season's request: following or cancelling is the
              show's, on its page. */}
          {canAsk && (
            <CardActionButton
              availability={availability}
              name={name}
              busy={ask.isPending}
              onRequest={() =>
                ask.mutate({
                  ref: entry.ref,
                  name,
                  libraryId: entry.libraryId,
                  scope: { seasons: [season.number], future: false },
                  // Undo takes back the whole request, so only a first one.
                  undo: availability.requestId === null,
                })
              }
            />
          )}
        </div>
      </div>
      <span className="mt-2 block min-w-0">
        <span className="block truncate text-sm leading-5 font-medium">
          <Link
            to="/titles/$titleId"
            params={{ titleId: title.id }}
            tabIndex={-1}
            className={textLink}
          >
            {title.name}
          </Link>
        </span>
        <span className="text-muted-foreground block truncate text-[13px] leading-5">
          {seasonLine(season)}
        </span>
      </span>
    </div>
  )
}
