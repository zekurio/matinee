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
import { SearchIcon, SearchXIcon } from "lucide-react"

import { creditLabel, PersonCard } from "@/components/credits"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { PosterCard, posterGrid } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import {
  type SearchHit,
  type SearchSection,
  searchSections,
} from "@/components/search/search-sections"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"
import { orpc } from "@/lib/rpc"
import { useSearchSpotlightStore } from "@/stores/search-spotlight"

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
  loader: ({ context: { queryClient }, deps: { q } }) => {
    if (q !== undefined) void queryClient.prefetchQuery(searchOptions(q))
  },
  component: SearchPage,
})

/**
 * Every result for a search from the spotlight, a section per kind and
 * library. The query lives in the URL, so Back from a title brings the
 * results back.
 */
function SearchPage() {
  const { q } = Route.useSearch()
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
      <h1 className="mb-6 text-[26px] leading-8 font-semibold tracking-tight text-balance break-words md:text-[32px] md:leading-10">
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
