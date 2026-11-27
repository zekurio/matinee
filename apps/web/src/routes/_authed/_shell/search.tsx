import type { Facet } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { createFileRoute, Link } from "@tanstack/solid-router"
import { ArrowLeft, Search, SearchX, X } from "lucide"
import { createMemo, For, Match, onSettled, Show, Switch } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { catalogSearchOptions } from "@/components/catalog/catalog-data"
import { askable, NotHereSection } from "@/components/catalog/catalog-search"
import { creditLabel, PersonCard } from "@/components/credits"
import {
  posterGrid,
  PosterGridSkeleton,
} from "@/components/library/library-states"
import { PosterCard } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { CoverTabs, useBack } from "@/components/phone-nav"
import {
  type SearchHit,
  type SearchSection,
  searchSections,
} from "@/components/search/search-sections"
import { usePhone } from "@/components/sheet-menu"
import { UserAvatar } from "@/components/user-avatar"
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
import { formatCount } from "@/lib/format"
import { reloadOnEnter } from "@/lib/route-loading"
import { orpc } from "@/lib/rpc"
import { useUrlText } from "@/lib/use-url-text"
import { focusSearch } from "@/stores/search"

const SearchParams = t.object({
  q: t.string().trim().min(1).optional().catch(undefined),
})

// What the server sends of each kind. Past it, the page says to narrow
// the search down.
const LIMIT = 60

/** The results for a query, shared by the page and its loader. */
function searchOptions(query: string) {
  return orpc.search.query.queryOptions({ input: { query, limit: LIMIT } })
}

export const Route = createFileRoute("/_authed/_shell/search")({
  validateSearch: SearchParams,
  loaderDeps: ({ search }) => ({ q: search.q }),
  // Starts the search while the page's code loads, not once it renders.
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, deps: { q } }) => {
    if (q !== undefined) void queryClient.prefetchQuery(searchOptions(q))
  },
  component: SearchPage,
})

/**
 * Every result for a search, a section per kind and library. Wider screens
 * come here from the bar's field; on phones it's where the search button
 * leads, with the field at its top and Discover under it until something's
 * typed. The query lives in the URL, so Back from a title brings the
 * results back.
 */
function SearchPage() {
  const search = Route.useSearch()
  const phone = usePhone()
  useDocumentTitle(() => {
    const q = search().q
    return q
      ? tr("search.page.documentTitle", { query: q })
      : tr("search.title")
  })
  return (
    <div class={[pageGutter, "sm:pt-8"]}>
      <Show
        when={search().q !== undefined || phone()}
        fallback={
          <Empty class="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
                <Icon icon={Search} />
              </EmptyMedia>
              <EmptyTitle class="text-base font-semibold">
                {tr("search.title")}
              </EmptyTitle>
              <EmptyDescription>{tr("search.page.intro")}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => focusSearch()}>
                <Icon icon={Search} />
                {tr("search.title")}
              </Button>
            </EmptyContent>
          </Empty>
        }
      >
        {/* The field keeps its place, and what's typed, between the page's
            two faces. */}
        <Show when={phone()}>
          <PhoneSearchBar query={search().q} />
        </Show>
        <Show
          when={search().q}
          fallback={
            // The field's placeholder already says what search finds.
            <p class="text-muted-foreground flex min-h-[calc(100dvh-6rem)] items-center justify-center px-8 text-center text-sm">
              {tr("search.page.emptyHint")}
            </p>
          }
        >
          {(q) => <SearchResults query={q()} />}
        </Show>
      </Show>
    </div>
  )
}

/** Every result for `q`: the library's sections, then the catalog's. */
function SearchResults(props: { query: string }) {
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const results = useQuery(() => ({
    ...searchOptions(props.query),
    placeholderData: keepPreviousData,
  }))
  // Titles no library here has, on their own, so the library's results
  // never wait for the catalog.
  const catalog = useQuery(() => catalogSearchOptions(props.query))

  const sections = createMemo(() =>
    results.isSuccess
      ? searchSections(results.data, libraries.isSuccess ? libraries.data : [])
      : [],
  )
  const capped = () =>
    results.isSuccess &&
    [
      results.data.titles,
      results.data.users,
      results.data.people,
      results.data.genres,
      results.data.studios,
    ].some((list) => list.length === LIMIT)
  const nothing = () =>
    sections().length === 0 &&
    !(
      catalog.isPending ||
      askable(catalog.isSuccess ? catalog.data.items : undefined).length > 0
    )

  return (
    <>
      <h1 class="text-26px md:text-32px mb-6 leading-8 font-semibold tracking-tight text-balance break-words max-sm:sr-only md:leading-10">
        {tr("search.page.heading", { query: props.query })}
      </h1>
      <Switch>
        <Match when={results.isPending}>
          <PosterGridSkeleton />
        </Match>
        <Match when={results.isError}>
          <p class="text-muted-foreground text-sm">{tr("search.failed")}</p>
        </Match>
        <Match when={nothing()}>
          <Empty class="py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
                <Icon icon={SearchX} />
              </EmptyMedia>
              <EmptyTitle class="text-base font-semibold">
                {tr("search.page.noMatch", { query: props.query })}
              </EmptyTitle>
              <EmptyDescription>
                {tr("search.page.noMatchHint")}
              </EmptyDescription>
            </EmptyHeader>
            <Show when={catalog.isError}>
              <EmptyContent class="text-muted-foreground text-sm">
                {tr("catalog.search.failed")}
              </EmptyContent>
            </Show>
          </Empty>
        </Match>
        <Match when={true}>
          <div class="flex flex-col gap-10">
            <For each={sections()} keyed={(section) => section.key}>
              {(section) => <Section section={section()} />}
            </For>
            <NotHereSection results={catalog} first={sections().length === 0} />
            <Show when={capped()}>
              <p class="text-muted-foreground text-sm">
                {tr("search.page.capped", { limit: LIMIT })}
              </p>
            </Show>
          </div>
        </Match>
      </Switch>
    </>
  )
}

/** Columns for round portraits, a little denser than posters. */
const personGrid =
  "grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5 sm:gap-x-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"

function Section(props: { section: SearchSection }) {
  const id = () => `results-${props.section.key}`
  const layout = () =>
    props.section.kind === "movies" || props.section.kind === "shows"
      ? posterGrid
      : props.section.kind === "cast"
        ? personGrid
        : "flex flex-wrap gap-2"
  return (
    <section aria-labelledby={id()}>
      <h2
        id={id()}
        class="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
      >
        {props.section.label}
        <span class="text-muted-foreground text-sm font-normal">
          {tr(`search.count.${props.section.kind}`, {
            count: props.section.hits.length,
          })}
        </span>
      </h2>
      <ul class={layout()}>
        <For each={props.section.hits} keyed={(hit) => hit.id}>
          {(hit) => (
            <li>
              <HitCard hit={hit()} />
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

const chipLink =
  "focus-visible:ring-ring border-foreground/10 hover:border-foreground/25 flex items-center gap-2.5 rounded-full border outline-none focus-visible:ring-2"

/**
 * A result as a card: a poster for a title, a portrait for cast and crew,
 * and a chip for the rest. New results for the same hit draw it again.
 */
function HitCard(props: { hit: SearchHit }) {
  return (
    <Show when={props.hit} keyed>
      {(hit) => hitCard(hit)}
    </Show>
  )
}

function hitCard(hit: SearchHit): JSX.Element {
  switch (hit.kind) {
    case "title":
      return <PosterCard title={hit.title} />
    case "person":
      return (
        <PersonCard
          name={hit.person.name}
          photo={hit.person.photo}
          detail={creditLabel(hit.person.kind)}
        />
      )
    case "genre":
      return (
        <Link
          to="/genres/$genre"
          params={{ genre: hit.facet.name }}
          class={cn(chipLink, "h-10 px-4")}
        >
          <FacetText facet={hit.facet} />
        </Link>
      )
    case "studio":
      return (
        <Link
          to="/studios/$studio"
          params={{ studio: hit.facet.name }}
          class={cn(chipLink, "h-10 px-4")}
        >
          <FacetText facet={hit.facet} />
        </Link>
      )
    case "user":
      return (
        <Link
          to="/profiles/$username"
          params={{ username: hit.user.username }}
          class={cn(chipLink, "py-1.5 pr-4 pl-1.5")}
        >
          <UserAvatar user={hit.user} class="size-8 text-xs" />
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium">
              {hit.user.displayName ?? hit.user.username}
            </span>
            <span class="text-muted-foreground truncate text-xs">
              @{hit.user.username}
            </span>
          </span>
        </Link>
      )
  }
}

function FacetText(props: { facet: Facet }) {
  return (
    <>
      <span class="truncate text-sm font-medium">{props.facet.name}</span>
      <span class="text-muted-foreground text-xs">
        {formatCount(props.facet.titleCount)}
      </span>
    </>
  )
}

/**
 * The search page's top on phones: one pill, the Flutter app's `SearchPill`
 * expanded, with Back in the magnifier's place. What's typed goes in the
 * URL once typing pauses, and the results follow it.
 */
function PhoneSearchBar(props: { query: string | undefined }) {
  const navigate = Route.useNavigate()
  const back = useBack()
  const [text, update, flush] = useUrlText(
    () => props.query,
    (next) => {
      void navigate({
        search: { q: next },
        replace: true,
        resetScroll: false,
      })
    },
  )
  let input: HTMLInputElement | undefined
  // Opening search empty is for typing; its results are for reading.
  onSettled(() => {
    if (props.query === undefined) input?.focus()
  })

  // The search button in the shell's band opens this page, so it takes
  // the band's place with Back, as any page opened from a tab does.
  return (
    <div class="bg-background sticky top-0 z-20 -mx-4 pt-[env(safe-area-inset-top)]">
      <CoverTabs />
      <div class="mx-auto flex h-16 w-full max-w-[720px] items-center px-3">
        <search class="w-full">
          {/* This is URL navigation as you type; Submit only flushes its debounce. */}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              flush()
              input?.blur()
            }}
            class="border-foreground/[0.12] bg-foreground/[0.06] flex h-10 w-full items-center gap-0.5 rounded-full border"
          >
            <button
              type="button"
              aria-label={tr("shell.back")}
              onClick={back}
              class="focus-visible:ring-ring text-foreground active:bg-foreground/10 grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            >
              <Icon icon={ArrowLeft} class="size-5" />
            </button>
            <input
              ref={(element) => (input = element)}
              type="search"
              enterkeyhint="search"
              autocomplete="off"
              spellcheck={false}
              aria-label={tr("search.field")}
              placeholder={tr("search.field")}
              value={text()}
              onInput={(event) => update(event.currentTarget.value)}
              // 16px keeps iOS from zooming in on focus.
              class="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            <Show
              when={text()}
              fallback={<span aria-hidden="true" class="w-3 shrink-0" />}
            >
              <button
                type="button"
                aria-label={tr("search.clear")}
                onClick={() => {
                  update("")
                  input?.focus()
                }}
                class="focus-visible:ring-ring text-foreground active:bg-foreground/10 grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
              >
                <Icon icon={X} class="size-5" />
              </button>
            </Show>
          </form>
        </search>
      </div>
    </div>
  )
}
