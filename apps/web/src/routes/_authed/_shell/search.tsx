import type { Facet } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { cn } from "@matinee/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { SearchIcon, SearchXIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { creditLabel, PersonCard } from "@/components/credits"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { PosterCard, posterGrid } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import {
  type SearchHit,
  type SearchSection,
  searchSections,
} from "@/components/search/search-sections"
import { usePhone } from "@/components/sheet-menu"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"
import { reloadOnEnter } from "@/lib/route-loading"
import { orpc } from "@/lib/rpc"
import { useSearchSpotlightStore } from "@/stores/search-spotlight"

const SearchParams = t.object({
  q: t.string().trim().min(1).optional().catch(undefined),
})

// What the server sends of each kind. Past it, the page says to narrow
// the search down.
const LIMIT = 60

// The pause in typing on a phone before the search goes out.
const DEBOUNCE_MS = 250

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
 * come here from the spotlight; on phones it's the search tab, with the
 * field at its top. The query lives in the URL, so Back from a title
 * brings the results back.
 */
function SearchPage() {
  const { q } = Route.useSearch()
  const phone = usePhone()
  useDocumentTitle(
    q ? tr("search.page.documentTitle", { query: q }) : tr("search.title"),
  )
  const openSpotlight = useSearchSpotlightStore((state) => state.setOpen)
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const results = useQuery({
    ...searchOptions(q ?? ""),
    enabled: q !== undefined,
    placeholderData: keepPreviousData,
  })

  if (q === undefined) {
    // The field's placeholder already says what search finds.
    if (phone) return <PhoneSearchBar query={q} />
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle className="text-base font-semibold">
            {tr("search.title")}
          </EmptyTitle>
          <EmptyDescription>{tr("search.page.intro")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => openSpotlight(true)}>
            <SearchIcon />
            {tr("search.title")}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const sections = results.data
    ? searchSections(results.data, libraries.data ?? [])
    : []
  const capped =
    results.data !== undefined &&
    [
      results.data.titles,
      results.data.users,
      results.data.people,
      results.data.genres,
      results.data.studios,
    ].some((list) => list.length === LIMIT)

  return (
    <div>
      {phone && <PhoneSearchBar query={q} />}
      <h1 className="mb-6 text-[26px] leading-8 font-semibold tracking-tight text-balance break-words max-sm:sr-only md:text-[32px] md:leading-10">
        {tr("search.page.heading", { query: q })}
      </h1>
      {results.isPending ? (
        <PosterGridSkeleton />
      ) : results.isError ? (
        <p className="text-muted-foreground text-sm">{tr("search.failed")}</p>
      ) : sections.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {tr("search.page.noMatch", { query: q })}
            </EmptyTitle>
            <EmptyDescription>{tr("search.page.noMatchHint")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <Section key={section.key} section={section} />
          ))}
          {capped && (
            <p className="text-muted-foreground text-sm">
              {tr("search.page.capped", { limit: LIMIT })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Columns for round portraits, a little denser than posters. */
const personGrid =
  "grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-5 sm:gap-x-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"

function Section({ section }: { section: SearchSection }) {
  const id = `results-${section.key}`
  const count = tr(`search.count.${section.kind}`, {
    count: section.hits.length,
  })
  const layout =
    section.kind === "movies" || section.kind === "shows"
      ? posterGrid
      : section.kind === "cast"
        ? personGrid
        : "flex flex-wrap gap-2"
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
      >
        {section.label}
        <span className="text-muted-foreground text-sm font-normal">
          {count}
        </span>
      </h2>
      <ul className={layout}>
        {section.hits.map((hit) => (
          <li key={hit.id}>
            <HitCard hit={hit} />
          </li>
        ))}
      </ul>
    </section>
  )
}

const chipLink =
  "focus-visible:ring-ring border-foreground/10 hover:border-foreground/25 flex items-center gap-2.5 rounded-full border outline-none focus-visible:ring-2"

/**
 * A result as a card: a poster for a title, a portrait for cast and crew,
 * and a chip for the rest.
 */
function HitCard({ hit }: { hit: SearchHit }) {
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
          className={cn(chipLink, "h-10 px-4")}
        >
          <FacetText facet={hit.facet} />
        </Link>
      )
    case "studio":
      return (
        <Link
          to="/studios/$studio"
          params={{ studio: hit.facet.name }}
          className={cn(chipLink, "h-10 px-4")}
        >
          <FacetText facet={hit.facet} />
        </Link>
      )
    case "user": {
      const { user } = hit
      return (
        <Link
          to="/profiles/$username"
          params={{ username: user.username }}
          className={cn(chipLink, "py-1.5 pr-4 pl-1.5")}
        >
          <UserAvatar user={user} className="size-8 text-xs" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">
              {user.displayName ?? user.username}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              @{user.username}
            </span>
          </span>
        </Link>
      )
    }
  }
}

function FacetText({ facet }: { facet: Facet }) {
  return (
    <>
      <span className="truncate text-sm font-medium">{facet.name}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatCount(facet.titleCount)}
      </span>
    </>
  )
}

/**
 * The search tab's top on phones: its name, then the field, which takes the
 * keyboard when the tab opens empty. What's typed goes in the URL once
 * typing pauses, and the results follow it.
 */
function PhoneSearchBar({ query }: { query: string | undefined }) {
  const navigate = Route.useNavigate()
  const [text, setText] = useState(query ?? "")
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // Opening the tab empty is for typing; Back to results is for reading.
  const [typing] = useState(query === undefined)
  useEffect(() => {
    if (typing) input.current?.focus()
  }, [typing])

  const search = (next: string) => {
    const trimmed = next.trim()
    void navigate({
      search: { q: trimmed === "" ? undefined : trimmed },
      replace: true,
      resetScroll: false,
    })
  }
  const update = (next: string) => {
    setText(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => search(next), DEBOUNCE_MS)
  }

  return (
    <div className="bg-background sticky top-0 z-20 -mx-4 mb-4 px-4 pt-[env(safe-area-inset-top)] pb-3">
      <p className="flex h-16 items-center text-xl leading-7 font-semibold tracking-tight">
        {tr("search.title")}
      </p>
      <search>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            window.clearTimeout(timer.current)
            search(text)
            input.current?.blur()
          }}
          className="border-foreground/10 bg-foreground/5 flex h-12 items-center rounded-full border"
        >
          <SearchIcon
            aria-hidden
            className="text-muted-foreground mx-3.5 size-5 shrink-0"
          />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            aria-label={tr("search.field")}
            placeholder={tr("search.field")}
            value={text}
            onChange={(event) => update(event.currentTarget.value)}
            // 16px keeps iOS from zooming in on focus.
            className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text ? (
            <button
              type="button"
              aria-label={tr("search.clear")}
              onClick={() => {
                update("")
                input.current?.focus()
              }}
              className="focus-visible:ring-ring text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            >
              <XIcon className="size-[18px]" />
            </button>
          ) : (
            <span aria-hidden className="w-3 shrink-0" />
          )}
        </form>
      </search>
    </div>
  )
}
