import { type Availability, CatalogRef, type Trailer } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  QueryObserver,
  type QueryObserverResult,
  useQueryClient,
} from "@tanstack/solid-query"
import { getRouteApi, Link, useNavigate } from "@tanstack/solid-router"
import { Clapperboard, Star } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  from,
  Show,
} from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { CastRail, CrewFacts, unitList } from "@/components/credits"
import { PosterArt } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { ItemTopBar } from "@/components/phone-nav"
import { Picture, tone } from "@/components/picture"
import { Rail, RailItem } from "@/components/rail"
import {
  AdminAnswer,
  requestedTip,
  useWaitingRequest,
} from "@/components/requests/admin-answer"
import { HeaderOverview } from "@/components/title/header-overview"
import { headingPoster, headingTop } from "@/components/title/title-header"
import { TitleSkeleton } from "@/components/title/title-page"
import { titleOptions } from "@/components/title/title-queries"
import { getLocale, perLocale, tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { art, present } from "@/lib/media"
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

declare module "@tanstack/solid-router" {
  interface HistoryState {
    /** The title page took over from its catalog page as the title arrived. */
    arrived?: boolean
  }
}

const route = getRouteApi("/_authed/_shell/catalog/$kind/$provider/$providerId")

const ratings = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

/**
 * A title's details, read through its observer so a change of library
 * keeps the page up while the new answer loads. An accessor for the
 * latest result.
 */
function useDetails(
  ref: () => CatalogRef | null,
  library: () => string | undefined,
) {
  const queryClient = useQueryClient()
  return createMemo(() => {
    const options = detailsOptions(ref(), library())
    return from<QueryObserverResult<CatalogDetail>>((next) => {
      const observer = new QueryObserver(queryClient, options)
      const unsubscribe = observer.subscribe(next)
      next(observer.getCurrentResult())
      return unsubscribe
    })
  })
}

/**
 * A title the server doesn't have, on a page built like a library title's
 * so it reads as the same page without Play: the backdrop, the poster,
 * the name and facts, and the ask where Play would be. A show lists its
 * seasons, each with its own state. When the title arrives, the page
 * hands over to the library title's page in place.
 */
export function CatalogTitlePage() {
  const params = route.useParams()
  const search = route.useSearch()
  const ref = createMemo(
    () => {
      const parsed = CatalogRef.safeParse(params())
      return parsed.success ? parsed.data : null
    },
    {
      equals: (before, after) =>
        before === after ||
        (before !== null && after !== null && sameRef(before, after)),
    },
  )
  const details = useDetails(ref, () => search().library)
  // Picking another library keeps the page up while its answer loads,
  // but another title's page never stands in for this one.
  const detail = createMemo<CatalogDetail | undefined>((previous) => {
    const current = details()?.data
    if (current) return current
    const asked = ref()
    return previous && asked && sameRef(previous.ref, asked)
      ? previous
      : undefined
  })
  useDocumentTitle(() => detail()?.name)
  // Keyed by the address, not the answer: another library's provider
  // answers with its own reference for the same title.
  const key = () => {
    const asked = ref()
    const shown = detail()
    if (!shown) return null
    return asked ? refKey(asked) : refKey(shown.ref)
  }
  return (
    <div class={[pageGutter, "relative sm:-mt-16"]}>
      <ItemTopBar />
      <Show
        when={key()}
        keyed
        fallback={
          <Show
            when={!(ref() && (details()?.isPending ?? true))}
            fallback={<TitleSkeleton />}
          >
            <CatalogLoadError
              message={
                details()?.error
                  ? errorMessage(details()?.error)
                  : tr("catalog.page.badLink")
              }
            />
          </Show>
        }
      >
        {(_key: string) => (
          <Show when={detail()}>
            {(shown) => (
              <CatalogDetailPage detail={shown()} library={search().library} />
            )}
          </Show>
        )}
      </Show>
    </div>
  )
}

function CatalogLoadError(props: { message: string }) {
  return (
    <div class="pt-40 pb-24 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">
        {tr("title.loadError")}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">{props.message}</p>
      <Link
        to="/"
        class={buttonVariants({ variant: "secondary", className: "mt-6" })}
      >
        {tr("title.backHome")}
      </Link>
    </div>
  )
}

function CatalogDetailPage(props: {
  detail: CatalogDetail
  /** The library the viewer picked, which the page reads in. */
  library: string | undefined
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const destination = () =>
    props.detail.destinations.find((entry) => entry.selected)
  const related = useRelated(
    () => props.detail.ref,
    () => props.library,
  )
  // One stream for the page: the title, then the related titles too
  // once their rows have loaded.
  const stream = useLiveAvailability(() => [
    { ref: props.detail.ref, libraryId: destination()?.id },
    ...related.followed(),
  ])
  const live = createMemo(() => liveEntry(stream(), props.detail.ref))
  const availability = () => live()?.availability ?? props.detail.availability
  // Numbered seasons in order, then the specials, in the rail and the
  // chooser alike.
  const seasons = createMemo(() =>
    liveSeasons(props.detail.seasons, live()).toSorted(
      (a, b) => (a.number || Infinity) - (b.number || Infinity),
    ),
  )
  // For an admin, someone's request that waits for them: Add and Decline
  // lead the row, and who requested it is in the badge's tooltip.
  const waiting = useWaitingRequest(availability)
  const tip = () => {
    const answer = waiting()
    return answer ? requestedTip(answer.item) : null
  }

  // Once the title is in a library the viewer can see, this page becomes
  // that title's page. Its data loads first, so the page swaps without a
  // skeleton, and the scroll stays where it is.
  const arrived = createMemo(() => {
    const current = availability()
    return current.state === "here" ? current.libraryTitleId : null
  })
  createEffect(arrived, (titleId) => {
    if (!titleId) return
    let current = true
    void queryClient.prefetchQuery(titleOptions(titleId)).finally(() => {
      if (!current) return
      void navigate({
        to: "/titles/$titleId",
        params: { titleId },
        replace: true,
        resetScroll: false,
        state: { arrived: true },
      })
    })
    return () => {
      current = false
    }
  })

  const toneKey = () => refKey(props.detail.ref)
  // As a library title's page has them, without what only a file tells.
  const facts = () => {
    const numbered = seasons().filter((season) => season.number > 0)
    return [
      props.detail.year === null ? null : String(props.detail.year),
      props.detail.ref.kind === "show" && numbered.length > 0
        ? tr("title.seasonCount", { count: numbered.length })
        : null,
    ]
      .filter(Boolean)
      .join(" · ")
  }
  const backdrop = createMemo(() =>
    present(art(props.detail.backdrop, "large")),
  )
  const rating = () =>
    props.detail.rating === null ? null : ratings().format(props.detail.rating)

  return (
    <div class="flex flex-col gap-6 sm:gap-8">
      <section aria-labelledby="title-name" class="isolate">
        <div
          aria-hidden="true"
          data-title-backdrop={backdrop().length ? "" : undefined}
          class={[
            "absolute inset-x-0 top-0 -z-10 h-[min(46vh,420px)] overflow-hidden",
            tone(toneKey()),
          ]}
        >
          <Picture sources={backdrop()} eager class="object-top" />
          <div class="from-background/95 via-background/50 max-sm:from-background/70 max-sm:via-background/25 absolute inset-0 bg-linear-to-r to-transparent" />
          <div class="from-background via-background/70 absolute inset-0 bg-linear-to-t via-40% to-transparent" />
        </div>

        <div class={["flex items-end gap-4 sm:gap-6", headingTop]}>
          {/* The state in the poster's corner; what to do about it is in
              the row of buttons. */}
          {/* Unlike a library title's, shown on phones too, for its state. */}
          <div class={cn(headingPoster, "relative max-sm:block max-sm:w-28")}>
            <PosterArt
              name={props.detail.name}
              toneKey={toneKey()}
              poster={art(props.detail.poster)}
            />
            <PosterBadge
              availability={availability()}
              size="lg"
              tip={tip()}
              class="absolute top-2 right-2 max-w-[calc(100%-1rem)] sm:top-2.5 sm:right-2.5"
            />
          </div>
          <div class="min-w-0 pb-1">
            <h1
              id="title-name"
              class="max-sm:text-30px text-2xl leading-[1.1] font-semibold tracking-tight text-balance max-sm:line-clamp-3 max-sm:leading-9 max-sm:font-bold sm:text-4xl lg:text-5xl"
            >
              {props.detail.name}
            </h1>
            <div class="text-foreground/80 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <Show when={facts()}>
                <span>{facts()}</span>
              </Show>
              <Show when={props.detail.contentRating}>
                <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                  {props.detail.contentRating}
                </span>
              </Show>
              <Show when={rating()}>
                {(score) => (
                  <span class="inline-flex items-center gap-1 tabular-nums">
                    <Icon
                      icon={Star}
                      class="size-3.5 fill-current text-amber-500 dark:text-amber-300"
                    />
                    <span class="sr-only">
                      {tr("title.rating", { rating: score() })}
                    </span>
                    <span aria-hidden="true">{score()}</span>
                  </span>
                )}
              </Show>
            </div>
            {/* Plain text: genre pages list the library's titles. */}
            <Show when={props.detail.genres.length > 0}>
              <p class="text-muted-foreground mt-1.5 text-sm">
                {unitList().format(props.detail.genres.slice(0, 4))}
              </p>
            </Show>
            <Show when={props.detail.stale}>
              <p class="text-muted-foreground mt-2 text-sm">
                {tr("catalog.page.stale")}
              </p>
            </Show>
          </div>
        </div>

        <div class="mt-4 flex max-w-4xl flex-col gap-4">
          <HeaderOverview tagline={null} overview={props.detail.overview} />
          <CrewFacts title={props.detail} />
          {/* As a library title's row: the main action, then Trailer. For
              an admin with a request to answer, Add and Decline take the
              action's place. Any may be missing; with none, no row. */}
          <div class="mt-1 flex items-center gap-2 empty:hidden">
            <Show
              when={waiting() && !waiting()?.answered && waiting()}
              fallback={
                <RequestControl
                  detail={props.detail}
                  availability={availability()}
                  seasons={seasons()}
                  libraryId={destination()?.id}
                />
              }
            >
              {(answer) => <AdminAnswer item={answer().item} look="page" />}
            </Show>
            <TrailerButton trailers={props.detail.trailers} />
          </div>
        </div>
      </section>
      <Show when={props.detail.ref.kind === "show" && seasons().length > 0}>
        <Rail title={tr("title.seasons")}>
          <For each={seasons()} keyed={(season) => String(season.number)}>
            {(season) => (
              <RailItem artwork="poster">
                <CatalogSeasonCard
                  show={props.detail}
                  season={season()}
                  libraryId={destination()?.id}
                  first={asks(availability())}
                />
              </RailItem>
            )}
          </For>
        </Rail>
      </Show>
      <CastRail credits={props.detail.credits} />
      <RelatedRails related={related} live={stream()} />
    </div>
  )
}

/**
 * The title's one action, leading the row of buttons as Play leads a
 * library title's, with Trailer after it: "Request", "Cancel request",
 * or a dimmed Request with why in its tooltip. A show's request opens the
 * request dialog for its seasons. Nothing while there's nothing to do.
 */
function RequestControl(props: {
  detail: CatalogDetail
  availability: Availability
  seasons: CatalogSeasonEntry[]
  libraryId?: string
}) {
  const ask = useAsk()
  const [dialog, setDialog] = createSignal(false)
  const show = () => props.detail.ref.kind === "show"
  // A show asked for already, with seasons still to request, offers them.
  const more = () =>
    show() &&
    posterAction(props.availability) === null &&
    props.seasons.some((season) => asks(season.availability))
  const request = () => {
    if (show()) setDialog(true)
    else
      ask.mutate({
        ref: props.detail.ref,
        name: props.detail.name,
        libraryId: props.libraryId,
      })
  }
  return (
    <Show when={more() || hasPosterButton(props.availability)}>
      <PosterActionButton
        availability={props.availability}
        action={more() ? "request" : undefined}
        label={more() ? tr("ask.more") : undefined}
        name={props.detail.name}
        busy={ask.isPending}
        look="page"
        onRequest={request}
      />
      <Show when={show()}>
        <RequestDialog
          open={dialog()}
          onOpenChange={setDialog}
          titleRef={props.detail.ref}
          name={props.detail.name}
          seasons={props.seasons}
          first={asks(props.availability)}
          libraryId={props.libraryId}
        />
      </Show>
    </Show>
  )
}

function baseLanguage(tag: string): string {
  return tag.split("-")[0]?.toLowerCase() ?? tag
}

/**
 * The title's first trailer in the interface's language, else the
 * server's first, on YouTube in a new tab. Just the icon on phones, where
 * the request takes the row.
 */
function TrailerButton(props: { trailers: Trailer[] }) {
  const trailer = () => {
    const language = baseLanguage(getLocale())
    return (
      props.trailers.find(
        (entry) => entry.language && baseLanguage(entry.language) === language,
      ) ?? props.trailers[0]
    )
  }
  return (
    <Show when={trailer()}>
      {(shown) => (
        <a
          href={shown().url}
          target="_blank"
          rel="noopener noreferrer"
          title={tr("title.trailerHint")}
          class={buttonVariants({
            variant: "secondary",
            size: "lg",
            className:
              "border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11 max-sm:rounded-full max-sm:px-0",
          })}
        >
          <Icon icon={Clapperboard} class="max-sm:size-5" />
          <span class="max-sm:sr-only">{tr("title.trailer")}</span>
        </a>
      )}
    </Show>
  )
}
