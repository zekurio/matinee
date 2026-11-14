import { type Availability, CatalogRef } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { StarIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { pageBleed } from "@/components/app-shell"
import { CastRail, CrewFacts } from "@/components/credits"
import { useDocumentTitle } from "@/components/page-header"
import { ItemTopBar } from "@/components/phone-nav"
import { Rail, RailItem } from "@/components/rail"
import { AdminRequestStrip } from "@/components/requests/approve-strip"
import { HeaderOverview } from "@/components/title/header-overview"
import {
  HeaderBackdrop,
  headerColumn,
  HeaderPoster,
  ratings,
  TrailerButton,
} from "@/components/title/title-header"
import { TitleSkeleton } from "@/components/title/title-page"
import { titleOptions } from "@/components/title/title-queries"
import { tr } from "@/i18n"
import { art } from "@/lib/media"
import { errorMessage } from "@/lib/rpc"

import { PosterBadge } from "./catalog-card"
import {
  type CatalogDetail,
  type CatalogSeasonEntry,
  detailsOptions,
  liveEntry,
  liveSeasons,
  refKey,
  sameRef,
  useLiveAvailability,
} from "./catalog-data"
import { CatalogSeasonCard } from "./catalog-season-card"
import { hasPosterButton, PosterActionButton } from "./poster-request"
import { RelatedRails, useRelated } from "./related-rails"
import { RequestDialog } from "./request-dialog"
import { useAsk } from "./use-ask"
import { asks, posterAction } from "./words"

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** The title page took over from its catalog page as the title arrived. */
    arrived?: boolean
  }
}

const route = getRouteApi("/_authed/_shell/catalog/$kind/$provider/$providerId")

/**
 * A title the server doesn't have, on a page built like a library title's
 * so it reads as the same page without Play: the backdrop, the poster,
 * the name and facts, and the ask where Play would be. A show lists its
 * seasons, each with its own state. When the title arrives, the page
 * hands over to the library title's page in place.
 */
export function CatalogTitlePage() {
  const params = route.useParams()
  const { library } = route.useSearch()
  const parsed = CatalogRef.safeParse(params)
  const ref = parsed.success ? parsed.data : null
  // Picking another library keeps the page up while its answer loads,
  // but another title's page never stands in for this one.
  const details = useQuery({
    ...detailsOptions(ref, library),
    placeholderData: (previous) =>
      previous && ref && sameRef(previous.ref, ref) ? previous : undefined,
  })
  useDocumentTitle(details.data?.name)

  if (ref && details.isPending) {
    return (
      <>
        <ItemTopBar />
        <TitleSkeleton />
      </>
    )
  }
  if (!details.data) {
    return (
      <div className="py-24 text-center">
        <ItemTopBar />
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr("title.loadError")}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {details.error
            ? errorMessage(details.error)
            : tr("catalog.page.badLink")}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          {tr("title.backHome")}
        </Link>
      </div>
    )
  }
  return (
    // Keyed by the address, not the answer: another library's provider
    // answers with its own reference for the same title.
    <CatalogDetailPage
      key={ref ? refKey(ref) : refKey(details.data.ref)}
      detail={details.data}
      library={library}
    />
  )
}

function CatalogDetailPage({
  detail,
  library,
}: {
  detail: CatalogDetail
  /** The library the viewer picked, which the page reads in. */
  library: string | undefined
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const destination = detail.destinations.find((entry) => entry.selected)
  const related = useRelated(detail.ref, library)
  // One stream for the page: the title, then the related titles too
  // once their rows have loaded.
  const stream = useLiveAvailability([
    { ref: detail.ref, libraryId: destination?.id },
    ...related.followed,
  ])
  const live = liveEntry(stream, detail.ref)
  const availability = live?.availability ?? detail.availability
  // Numbered seasons in order, then the specials, in the rail and the
  // chooser alike.
  const seasons = liveSeasons(detail.seasons, live).toSorted(
    (a, b) => (a.number || Infinity) - (b.number || Infinity),
  )

  // Once the title is in a library the viewer can see, this page becomes
  // that title's page. Its data loads first, so the page swaps without a
  // skeleton, and the scroll stays where it is.
  const arrived =
    availability.state === "here" ? availability.libraryTitleId : null
  useEffect(() => {
    if (!arrived) return
    let current = true
    void queryClient.prefetchQuery(titleOptions(arrived)).finally(() => {
      if (!current) return
      void navigate({
        to: "/titles/$titleId",
        params: { titleId: arrived },
        replace: true,
        resetScroll: false,
        state: { arrived: true },
      })
    })
    return () => {
      current = false
    }
  }, [arrived, navigate, queryClient])

  const onLibrary = (id: string) =>
    void navigate({
      to: ".",
      search: { library: id },
      replace: true,
      resetScroll: false,
    })

  const toneKey = refKey(detail.ref)
  const numbered = seasons.filter((season) => season.number > 0)
  // As a library title's page has them, without what only a file tells.
  const facts = [
    detail.year === null ? null : String(detail.year),
    detail.ref.kind === "show" && numbered.length > 0
      ? tr("title.seasonCount", { count: numbered.length })
      : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <ItemTopBar />
      <section className={pageBleed} aria-labelledby="title-name">
        <HeaderBackdrop
          title={{
            id: toneKey,
            images: { backdrop: detail.backdrop, poster: detail.poster },
          }}
        />
        <div className={cn(headerColumn, "max-sm:pt-[max(10rem,30vh)]")}>
          {/* The details are as tall as the poster, 2:3 at its width, so
              their buttons line up with its lower edge. */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
            {/* The state in the poster's corner; what to do about it is
                in the row of buttons. */}
            <HeaderPoster
              name={detail.name}
              toneKey={toneKey}
              poster={art(detail.poster)}
              className="max-sm:w-40"
            >
              <PosterBadge
                availability={availability}
                size="lg"
                className="absolute top-2 right-2 max-w-[calc(100%-1rem)] sm:top-2.5 sm:right-2.5"
              />
            </HeaderPoster>
            <div className="contents sm:flex sm:min-h-72 sm:min-w-0 sm:flex-1 sm:flex-col lg:min-h-84 2xl:min-h-96">
              <div className="min-w-0">
                <h1
                  id="title-name"
                  className="-mt-1 text-2xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
                >
                  {detail.name}
                </h1>
                <div className="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  {facts.length > 0 && <span>{facts.join(" · ")}</span>}
                  {detail.contentRating && (
                    <span className="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                      {detail.contentRating}
                    </span>
                  )}
                  {detail.rating !== null && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <StarIcon
                        aria-hidden
                        className="size-3.5 fill-current text-amber-300"
                      />
                      <span className="sr-only">
                        {tr("title.rating", {
                          rating: ratings().format(detail.rating),
                        })}
                      </span>
                      <span aria-hidden>{ratings().format(detail.rating)}</span>
                    </span>
                  )}
                </div>
                {/* Plain text: genre pages list the library's titles. */}
                {detail.genres.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-sm">
                    {detail.genres.slice(0, 4).join(", ")}
                  </p>
                )}
                {detail.stale && (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {tr("catalog.page.stale")}
                  </p>
                )}
              </div>
              <div className="col-span-2 min-w-0 sm:flex sm:flex-1 sm:flex-col">
                <HeaderOverview
                  name={detail.name}
                  overview={detail.overview}
                  className="sm:mt-4"
                />
                <CrewFacts title={detail} className="mt-4" />
                {/* The admin's approval sits just above the buttons. */}
                <div className="sm:mt-auto">
                  <AdminRequestStrip requestId={availability.requestId} />
                  {/* As a library title's row: the main action, then
                      Trailer. Either may be missing; with neither, no row. */}
                  <div className="flex items-center gap-2 pt-6 empty:hidden">
                    <RequestControl
                      detail={detail}
                      availability={availability}
                      seasons={seasons}
                      libraryId={destination?.id}
                      onLibrary={onLibrary}
                    />
                    <TrailerButton trailers={detail.trailers} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {detail.ref.kind === "show" && seasons.length > 0 && (
        <Rail title={tr("title.seasons")}>
          {seasons.map((season) => (
            <RailItem key={season.number} artwork="poster">
              <CatalogSeasonCard
                show={detail}
                season={season}
                libraryId={destination?.id}
                first={asks(availability)}
              />
            </RailItem>
          ))}
        </Rail>
      )}
      <CastRail credits={detail.credits} />
      <RelatedRails related={related} live={stream} />
    </div>
  )
}

/**
 * The title's one action, leading the row of buttons as Play leads a
 * library title's, with Trailer after it: "Request", "Cancel request",
 * "Notify me" or "Stop notifying", or a dimmed Request with why in its
 * tooltip. A show's request, and a film's that could go to more than one
 * library, open the request dialog for that decision. Null while there's
 * nothing to do.
 */
function RequestControl({
  detail,
  availability,
  seasons,
  libraryId,
  onLibrary,
}: {
  detail: CatalogDetail
  availability: Availability
  seasons: CatalogSeasonEntry[]
  libraryId?: string
  onLibrary: (id: string) => void
}) {
  const ask = useAsk()
  const [dialog, setDialog] = useState(false)
  const { ref, name } = detail
  const show = ref.kind === "show"
  const first = asks(availability)
  // A show asked for already, with seasons still to request, offers them.
  const more =
    show &&
    posterAction(availability) === null &&
    seasons.some((season) => asks(season.availability))
  const decides = show || (first && detail.destinations.length > 1)
  const request = () => {
    if (decides || more) setDialog(true)
    else ask.mutate({ ref, name, libraryId })
  }
  if (!more && !hasPosterButton(availability)) return null
  return (
    <>
      <PosterActionButton
        availability={availability}
        action={more ? "request" : undefined}
        label={more ? tr("ask.more") : undefined}
        name={name}
        busy={ask.isPending}
        look="page"
        onRequest={request}
      />
      {(show || detail.destinations.length > 1) && (
        <RequestDialog
          open={dialog}
          onOpenChange={setDialog}
          titleRef={ref}
          name={name}
          seasons={seasons}
          first={first}
          defaultFuture={detail.defaultScope?.future ?? false}
          libraryId={libraryId}
          destinations={detail.destinations}
          onLibrary={onLibrary}
        />
      )}
    </>
  )
}
