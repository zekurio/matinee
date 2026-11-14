import type { Library } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Link, useRouteContext } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"

import { AskedRail } from "@/components/asked/asked"
import {
  liveEntry,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { Hero, heroFill, heroFrame } from "@/components/hero"
import { NoLibraries } from "@/components/library/no-libraries"
import { EpisodeCard, TitleCard } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { NextSeasonCard } from "@/components/title/next-season"
import { tr } from "@/i18n"
import { homeQueries } from "@/lib/home-queries"
import { orpc } from "@/lib/rpc"

/** Home: what to watch next, then each library's latest. */
export function Home() {
  const { user } = useRouteContext({ from: "/_authed/_shell" })
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const resume = useQuery(homeQueries.resume())
  const nextUp = useQuery(homeQueries.nextUp())
  // Slower than Next up, since it asks the catalog, so the row doesn't
  // wait for it; its cards join when they come.
  const nextSeasons = useQuery(homeQueries.nextSeasons())
  const seasonsLive = useLiveAvailability(
    (nextSeasons.data ?? []).map((entry) => ({
      ref: entry.ref,
      libraryId: entry.libraryId,
    })),
  )
  const featured = useQuery(homeQueries.featured())
  const slides = featured.data ?? []

  const loading =
    libraries.isPending ||
    resume.isPending ||
    nextUp.isPending ||
    featured.isPending

  if (libraries.data?.length === 0) {
    return (
      <>
        <PageHeader
          title={tr("browse.home.welcome", {
            name: user.displayName ?? user.username,
          })}
        />
        <NoLibraries admin={user.role === "admin"} />
      </>
    )
  }

  const hasResume = (resume.data?.length ?? 0) > 0
  // Episodes and next seasons together, the show watched last first.
  const nextRow = [
    ...(nextUp.data ?? []).map((entry) => ({
      key: entry.item.id,
      at: entry.lastWatchedAt.getTime(),
      card: <EpisodeCard item={entry.item} />,
    })),
    ...(nextSeasons.data ?? []).map((entry) => {
      const live = liveEntry(seasonsLive, entry.ref)?.seasons.find(
        (season) => season.number === entry.season.number,
      )
      return {
        key: `season-${entry.title.id}`,
        at: entry.lastWatchedAt.getTime(),
        card: (
          <NextSeasonCard
            entry={entry}
            season={
              live ? { ...entry.season, availability: live } : entry.season
            }
          />
        ),
      }
    }),
  ].toSorted((a, b) => b.at - a.at)
  const hasNextUp = nextRow.length > 0
  // On desktop, the banner and the rows of what to watch next share the
  // first screen: the banner takes what the rows leave. The column ends at
  // the window's bottom (<main>'s top padding is cancelled by the banner's
  // negative margin). Its own bottom padding keeps the rows off the edge
  // and pushes the shelves below the fold. While the queries load, the page
  // assumes the banner and the rows will come and holds their places with
  // skeletons, so the banner doesn't shrink once they arrive. A phone's
  // banner has a height of its own, short enough for both rows to fit
  // under it.
  const fold =
    (featured.isPending || slides.length > 0) &&
    (resume.isPending || nextUp.isPending || hasResume || hasNextUp)

  return (
    <div className="flex flex-col gap-10 max-sm:gap-6">
      <div
        className={cn(
          "contents",
          fold &&
            "lg:flex lg:min-h-[calc(100dvh-6rem)] lg:flex-col lg:gap-8 lg:pb-12",
        )}
      >
        {loading ? (
          <Skeleton
            className={cn(heroFrame, "rounded-none", fold && heroFill)}
          />
        ) : slides.length > 0 ? (
          <Hero slides={slides} className={fold ? heroFill : undefined} />
        ) : (
          // The rows start under the status bar, where there's no banner.
          <div
            aria-hidden
            className="h-[calc(env(safe-area-inset-top)+0.5rem)] sm:hidden"
          />
        )}

        {resume.isPending ? (
          <EpisodeRailSkeleton title={tr("browse.home.continueWatching")} />
        ) : (
          hasResume && (
            <Rail title={tr("browse.home.continueWatching")}>
              {resume.data?.map((item) => (
                <RailItem key={item.id}>
                  <EpisodeCard item={item} />
                </RailItem>
              ))}
            </Rail>
          )
        )}

        {nextUp.isPending ? (
          <EpisodeRailSkeleton title={tr("browse.home.nextUp")} />
        ) : (
          hasNextUp && (
            <Rail title={tr("browse.home.nextUp")}>
              {nextRow.map((entry) => (
                <RailItem key={entry.key}>{entry.card}</RailItem>
              ))}
            </Rail>
          )
        )}
      </div>

      <AskedRail username={user.username} />

      {libraries.data?.map((library) => (
        <LibraryShelf key={library.id} library={library} />
      ))}
    </div>
  )
}

/** A row of episode cards on its way, as tall as the row it stands in for. */
function EpisodeRailSkeleton({ title }: { title: string }) {
  return (
    <Rail title={title}>
      {Array.from({ length: 6 }, (_, i) => (
        <RailItem key={i}>
          <Skeleton className="aspect-video rounded-md" />
          {/* The card's two 20px lines of text. */}
          <span className="mt-2 flex h-10 flex-col justify-center gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </span>
        </RailItem>
      ))}
    </Rail>
  )
}

function LibraryShelf({ library }: { library: Library }) {
  const entries = useQuery(homeQueries.shelf(library.id))
  const title = tr("browse.home.recentlyAdded", { library: library.name })
  const heading =
    library.itemCount > 0 ? (
      <Link
        to="/libraries/$libraryId"
        params={{ libraryId: library.id }}
        search={{ sort: "recent" }}
        className="focus-visible:ring-ring group/heading inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
      >
        <span className="truncate">{title}</span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
        />
      </Link>
    ) : undefined
  const action = library.scanning ? (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Spinner className="size-3.5" />
      {tr("browse.home.scanning")}
    </span>
  ) : undefined

  return (
    <Rail title={title} heading={heading} action={action}>
      {entries.isPending ? (
        Array.from({ length: 8 }, (_, i) => (
          <RailItem key={i} artwork="poster">
            <Skeleton className="aspect-[2/3] rounded-md" />
            <Skeleton className="mt-2.5 h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </RailItem>
        ))
      ) : entries.data?.length === 0 ? (
        <li className="text-muted-foreground w-full rounded-lg border border-dashed p-6 text-sm">
          {tr("browse.home.emptyShelf")}
        </li>
      ) : (
        entries.data?.map((entry) => (
          <RailItem key={entry.title.id} artwork="poster">
            <TitleCard entry={entry} />
          </RailItem>
        ))
      )}
    </Rail>
  )
}
