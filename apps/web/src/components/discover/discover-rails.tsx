import type {
  CatalogRef,
  DiscoverRow as DiscoverRowSchema,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import type { JSX } from "@solidjs/web"
import {
  type QueryObserverResult,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query"
import { Link, useRouteContext } from "@tanstack/solid-router"
import { ChevronRight, CloudOff, Compass, RefreshCw } from "lucide"
import { createMemo, For, Match, Repeat, Show, Switch } from "solid-js"

import {
  type LiveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { useDismissedStore } from "@/stores/recommendations"
import { useSendHeldOnLeave } from "@/stores/request-actions"

import { BrowseCard, type BrowseEntry, cardDetail } from "./browse-card"
import {
  RAIL_CARDS,
  type Rail as RailInfo,
  railKey,
  railLink,
  railName,
  railRowOptions,
  railsOptions,
} from "./discover-data"
import { useFollowedQueries } from "./followed-queries"
import { RailFailed } from "./rail-failed"
import { DiscoverRequests, railHeadingLink } from "./requests-rail"

type Page = QueryObserverResult<t.infer<typeof DiscoverRowSchema>>

const stack = "flex flex-col gap-10 max-sm:gap-6"

/**
 * Discover's rows, in the order the server sends them, each loading on
 * its own so a slow or failed one holds up nothing else. On its own page
 * from `sm` up, and under the field on a phone's search tab.
 */
export function DiscoverRails() {
  useSendHeldOnLeave()
  const rails = useQuery(() => railsOptions())
  const list = createMemo(() =>
    rails.isSuccess && rails.data.enabled ? rails.data.rails : [],
  )
  const followed = useFollowedQueries(() => list().map(railRowOptions))
  const pages = (): Page[] => followed() ?? []
  const settled = () =>
    followed() !== undefined && pages().every((page) => !page.isPending)
  const live = useLiveAvailability(() =>
    settled() ? followedTitles(pages().map((page) => page.data)) : [],
  )
  // A row whose titles are all here already has nothing to show.
  const shown = createMemo(() =>
    list().flatMap((rail, index) => {
      const page = pages()[index]
      if (!page || (page.isSuccess && page.data.items.length === 0)) return []
      return [{ rail, page }]
    }),
  )
  // One row that failed says so in its place. Several say it once, at the
  // top, rather than as a stack of empty boxes.
  const failed = createMemo(() =>
    shown().filter(({ page }) => page.isError && !page.isFetching),
  )
  const rows = () =>
    failed().length > 1
      ? shown().filter((row) => !failed().includes(row))
      : shown()
  const allFailed = () =>
    list().length > 0 &&
    pages().length === list().length &&
    pages().every((page) => page.isError)
  // The requests come from their own stream or list, so they stay when the
  // catalog's rows are down or empty.
  const requests = () => (
    <Show when={rails.isSuccess && rails.data.requests}>
      {(which) => <DiscoverRequests which={which()} />}
    </Show>
  )

  return (
    <Switch>
      <Match when={rails.isPending || (rails.isError && rails.isFetching)}>
        <RailsSkeleton />
      </Match>
      <Match when={rails.isError}>
        <Failed onRetry={() => void rails.refetch()} />
      </Match>
      <Match when={rails.isSuccess && !rails.data.enabled}>
        <DiscoverOff />
      </Match>
      <Match when={allFailed()}>
        <div class={stack}>
          {requests()}
          <Show
            when={!pages().some((page) => page.isFetching)}
            fallback={<RailsSkeleton />}
          >
            <Failed
              onRetry={() => {
                for (const page of pages()) void page.refetch()
              }}
            />
          </Show>
        </div>
      </Match>
      <Match when={followed() !== undefined && shown().length === 0}>
        <div class={stack}>
          {requests()}
          <Nothing />
        </div>
      </Match>
      <Match when>
        <div class={stack}>
          {requests()}
          <Show when={pages().some((page) => page.data?.stale)}>
            <RailsNote>{tr("discover.stale")}</RailsNote>
          </Show>
          <Show when={failed().length > 1}>
            <RailsNote
              retry={() => {
                for (const { page } of failed()) void page.refetch()
              }}
            >
              {tr("discover.railsFailed", { count: failed().length })}
            </RailsNote>
          </Show>
          <For each={rows()} keyed={(row) => railKey(row.rail)}>
            {(row) => (
              <DiscoverRow rail={row().rail} page={row().page} live={live()} />
            )}
          </For>
        </div>
      </Match>
    </Switch>
  )
}

/**
 * The titles the rows show, once, for the stream of what changes: a
 * card on two rows is one title, and the rows stay under the stream's
 * hundred. Library cards play, so only the rest are followed.
 */
function followedTitles(
  pages: ({ items: BrowseEntry[] } | undefined)[],
): { ref: CatalogRef }[] {
  const seen = new Map<string, { ref: CatalogRef }>()
  for (const page of pages) {
    for (const item of page?.items.slice(0, RAIL_CARDS) ?? []) {
      if (!item.title) seen.set(refKey(item.ref), { ref: item.ref })
    }
  }
  return [...seen.values()]
}

/**
 * A row's heading, which leads to all of it: browsing with the row's
 * filters and sort. A row with no browse behind it has its name alone.
 */
export function RailHeading(props: { rail: RailInfo }) {
  const link = createMemo(() => railLink(props.rail))
  return (
    <Show when={link()} fallback={railName(props.rail)}>
      {(to) => (
        <Link to={to().to} search={to().search} class={railHeadingLink}>
          <span class="truncate">{railName(props.rail)}</span>
          <Icon
            icon={ChevronRight}
            class="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
          />
        </Link>
      )}
    </Show>
  )
}

function DiscoverRow(props: {
  rail: RailInfo
  page: Page
  live: LiveEntry[] | undefined
}) {
  const dismiss = useRailDismiss(() => props.rail)
  const cards = createMemo(() =>
    props.page.isSuccess
      ? props.page.data.items
          .filter((item) => !dismiss.hidden().has(refKey(item.ref)))
          .slice(0, RAIL_CARDS)
      : [],
  )
  const detail = () => (props.page.isSuccess ? props.page.data.detail : null)
  return (
    <Rail
      title={railName(props.rail)}
      heading={<RailHeading rail={props.rail} />}
    >
      <Switch>
        <Match
          when={
            props.page.isPending ||
            (props.page.isError && props.page.isFetching)
          }
        >
          <PosterSkeletons />
        </Match>
        <Match when={props.page.isError}>
          <RailFailed onRetry={() => void props.page.refetch()} />
        </Match>
        <Match when>
          <For each={cards()} keyed={(item) => refKey(item.ref)}>
            {(item) => (
              <RailItem artwork="poster">
                <BrowseCard
                  item={item()}
                  live={props.live}
                  // Without a date or a score to say, the year and the
                  // kind, since a row can hold both.
                  detail={detail() ? cardDetail(detail(), item()) : undefined}
                  dismiss={dismiss.of(item())}
                />
              </RailItem>
            )}
          </For>
        </Match>
      </Switch>
    </Rail>
  )
}

/**
 * "Not interested" for the cards of a recommendation row, and the titles
 * already hidden from it. Other rows offer none.
 */
export function useRailDismiss(rail: () => Pick<RailInfo, "id">) {
  const queryClient = useQueryClient()
  const store = useDismissedStore((state) => state)
  const recommended = () =>
    rail().id === "forYou" || rail().id === "becauseWatched"
  const none: ReadonlySet<string> = new Set()
  return {
    hidden: () => (recommended() ? store().hidden : none),
    of: (item: BrowseEntry) =>
      recommended()
        ? () => store().dismiss(queryClient, item.ref, item.name)
        : undefined,
  }
}

/** A row's cards on their way, the size of the cards they stand in for. */
export function PosterSkeletons() {
  return (
    <Repeat count={8}>
      {() => (
        <RailItem artwork="poster">
          <Skeleton class="aspect-[2/3] rounded-md" />
          <Skeleton class="mt-2.5 h-3.5 w-3/4" />
          <Skeleton class="mt-2 h-3 w-1/3" />
        </RailItem>
      )}
    </Repeat>
  )
}

/** Rows on their way, before the page knows which ones it gets. */
function RailsSkeleton() {
  return (
    <div aria-hidden="true" class={stack}>
      <For each={[44, 36, 40]}>
        {(width) => (
          <div>
            {/* The heading's 28px line. */}
            <div class="mb-3 flex h-9 items-center">
              <Skeleton class="h-5" style={{ width: `${width / 4}rem` }} />
            </div>
            <ul class="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:gap-4 sm:px-0">
              <PosterSkeletons />
            </ul>
          </div>
        )}
      </For>
    </div>
  )
}

/**
 * Something about the page's rows, said once above them rather than on
 * every row: that they're old, or that some didn't load.
 */
export function RailsNote(props: {
  retry?: () => void
  children: JSX.Element
}) {
  return (
    <div class="text-muted-foreground -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm max-sm:-mb-1">
      <p class="flex items-center gap-2">
        <Icon icon={CloudOff} class="size-4 shrink-0" />
        {props.children}
      </p>
      <Show when={props.retry}>
        {(retry) => (
          <Button variant="outline" size="sm" onClick={() => retry()()}>
            <Icon icon={RefreshCw} />
            {tr("discover.retry")}
          </Button>
        )}
      </Show>
    </div>
  )
}

export function DiscoverEmpty(props: {
  icon: JSX.Element
  title: string
  description: string
  children?: JSX.Element
}) {
  return (
    <Empty class="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
          {props.icon}
        </EmptyMedia>
        <EmptyTitle class="text-base font-semibold">{props.title}</EmptyTitle>
        <EmptyDescription>{props.description}</EmptyDescription>
      </EmptyHeader>
      <Show when={props.children}>
        <EmptyContent>{props.children}</EmptyContent>
      </Show>
    </Empty>
  )
}

/** Nothing came back: the catalog is down and nothing was kept. */
function Failed(props: { onRetry: () => void }) {
  return (
    <DiscoverEmpty
      icon={<Icon icon={CloudOff} />}
      title={tr("discover.failed")}
      description={tr("discover.failedHint")}
    >
      <Button variant="outline" onClick={() => props.onRetry()}>
        <Icon icon={RefreshCw} />
        {tr("discover.retry")}
      </Button>
    </DiscoverEmpty>
  )
}

/** Every row came back without a title this viewer lacks. */
function Nothing() {
  return (
    <DiscoverEmpty
      icon={<Icon icon={Compass} />}
      title={tr("discover.empty")}
      description={tr("discover.emptyHint")}
    />
  )
}

/** Opened from an old link on a server without Discover. */
export function DiscoverOff() {
  const context = useRouteContext({ from: "/_authed/_shell" })
  return (
    <DiscoverEmpty
      icon={<Icon icon={Compass} />}
      title={tr("discover.off")}
      description={
        context().user.role === "admin"
          ? tr("discover.offAdmin")
          : tr("discover.offHint")
      }
    />
  )
}
