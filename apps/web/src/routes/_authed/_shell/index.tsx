import type { Library } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRightIcon, FolderPlusIcon } from "lucide-react"

import { Hero, heroFill, heroFrame } from "@/components/hero"
import { LibraryChips } from "@/components/library-chips"
import { EpisodeCard, TitleCard } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/_shell/")({
  component: Home,
})

// The contract's cap. Twelve posters fit side by side on a wide monitor,
// which left nothing to scroll.
const SHELF = 24
const HERO_SLIDES = 6

function Home() {
  const { user } = Route.useRouteContext()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const resume = useQuery(
    orpc.home.continueWatching.queryOptions({ input: { limit: 12 } }),
  )
  const nextUp = useQuery(
    orpc.home.nextUp.queryOptions({ input: { limit: 12 } }),
  )
  // New and well-rated titles the user hasn't started, plus shows with a
  // new next episode. What the user is watching has its own rows.
  const featured = useQuery(
    orpc.home.featured.queryOptions({ input: { limit: HERO_SLIDES } }),
  )
  const slides = featured.data ?? []

  const loading =
    libraries.isPending ||
    resume.isPending ||
    nextUp.isPending ||
    featured.isPending

  if (libraries.data?.length === 0) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.displayName ?? user.username}`} />
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle>No libraries yet</EmptyTitle>
            <EmptyDescription>
              {user.role === "admin"
                ? "Add a folder of videos on this server to start watching."
                : "An admin hasn't added any libraries yet."}
            </EmptyDescription>
          </EmptyHeader>
          {user.role === "admin" && (
            <EmptyContent>
              <Link
                to="/"
                search={{ settings: "libraries" }}
                className={buttonVariants()}
              >
                Add a library
              </Link>
            </EmptyContent>
          )}
        </Empty>
      </>
    )
  }

  const hasResume = (resume.data?.length ?? 0) > 0
  const hasNextUp = (nextUp.data?.length ?? 0) > 0
  // On phones and desktop, the banner and the rows of what to watch next
  // share the first screen: the banner takes what the rows leave. The column
  // ends at the window's bottom (<main>'s top padding is cancelled by the
  // banner's negative margin). Its own bottom padding keeps the rows off the
  // edge and pushes the shelves below the fold. Phones measure the small
  // viewport, so the banner doesn't resize as the browser's toolbar hides
  // on scroll.
  const fold = !loading && slides.length > 0 && (hasResume || hasNextUp)

  return (
    <div className="flex flex-col gap-10">
      <div
        className={cn(
          "contents",
          fold && [
            "max-sm:flex max-sm:min-h-[calc(100svh-env(safe-area-inset-top)-4rem)] max-sm:flex-col max-sm:gap-5 max-sm:pb-[calc(env(safe-area-inset-bottom)+1.5rem)]",
            "lg:flex lg:min-h-[calc(100dvh-6rem)] lg:flex-col lg:pb-12 lg:gap-8",
          ],
        )}
      >
        {loading ? (
          <Skeleton className={cn(heroFrame, "rounded-none")} />
        ) : slides.length > 0 ? (
          <Hero
            slides={slides}
            top={<LibraryChips className="px-4" />}
            className={fold ? heroFill : undefined}
          />
        ) : (
          <LibraryChips className="-mx-4 px-4 sm:hidden" />
        )}

        {hasResume && (
          <Rail title="Continue watching">
            {resume.data?.map((item) => (
              <RailItem key={item.id}>
                <EpisodeCard item={item} />
              </RailItem>
            ))}
          </Rail>
        )}

        {hasNextUp && (
          <Rail title="Next up">
            {nextUp.data?.map((item) => (
              <RailItem key={item.id}>
                <EpisodeCard item={item} />
              </RailItem>
            ))}
          </Rail>
        )}
      </div>

      {libraries.data?.map((library) => (
        <LibraryShelf key={library.id} library={library} />
      ))}
    </div>
  )
}

function LibraryShelf({ library }: { library: Library }) {
  const entries = useQuery(
    orpc.media.shelf.queryOptions({
      input: { libraryId: library.id, limit: SHELF },
    }),
  )
  const title = `Recently added in ${library.name}`
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
      Scanning…
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
          Nothing here yet.
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
