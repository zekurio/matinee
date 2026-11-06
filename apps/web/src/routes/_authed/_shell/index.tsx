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
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRightIcon, FolderPlusIcon } from "lucide-react"

import { Hero, type HeroSlide } from "@/components/hero"
import { EpisodeCard, TitleCard } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { itemLabel } from "@/lib/media"
import { orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/_shell/")({
  component: Home,
})

const SHELF = 12
const HERO_SLIDES = 5

function Home() {
  const { user } = Route.useRouteContext()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const resume = useQuery(
    orpc.home.continueWatching.queryOptions({ input: { limit: 12 } }),
  )
  const nextUp = useQuery(
    orpc.home.nextUp.queryOptions({ input: { limit: 12 } }),
  )
  const first = libraries.data?.[0]
  const firstShelf = useQuery({
    ...orpc.media.shelf.queryOptions({
      input: { libraryId: first?.id ?? "", limit: SHELF },
    }),
    enabled: first !== undefined,
  })

  // Feature what the user is in the middle of, then what's next, then new
  // shows, one slide per show.
  const slides: HeroSlide[] = []
  const featured = new Set<string>()
  const add = (slide: HeroSlide) => {
    const key = slide.item.title?.id ?? itemLabel(slide.item).showKey
    if (featured.has(key) || slides.length >= HERO_SLIDES) return
    featured.add(key)
    slides.push(slide)
  }
  for (const item of resume.data?.slice(0, 2) ?? [])
    add({ item, reason: "resume" })
  for (const item of nextUp.data?.slice(0, 2) ?? [])
    add({ item, reason: "next" })
  for (const entry of firstShelf.data ?? []) {
    add({
      item: entry.item,
      reason: "new",
      count: entry.count,
      libraryName: first?.name,
    })
  }

  const loading =
    libraries.isPending ||
    resume.isPending ||
    nextUp.isPending ||
    (first !== undefined && firstShelf.isPending)

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

  return (
    <div className="flex flex-col gap-10">
      {loading ? (
        <Skeleton className="relative left-1/2 -mt-[calc(env(safe-area-inset-top)+1.5rem)] h-[min(72vh,620px)] min-h-[440px] w-screen -translate-x-1/2 rounded-none sm:-mt-24" />
      ) : slides.length > 0 ? (
        <Hero slides={slides} />
      ) : null}

      {resume.data && resume.data.length > 0 && (
        <Rail title="Continue watching">
          {resume.data.map((item) => (
            <RailItem key={item.id}>
              <EpisodeCard item={item} />
            </RailItem>
          ))}
        </Rail>
      )}

      {nextUp.data && nextUp.data.length > 0 && (
        <Rail title="Next up">
          {nextUp.data.map((item) => (
            <RailItem key={item.id}>
              <EpisodeCard item={item} />
            </RailItem>
          ))}
        </Rail>
      )}

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
  const noun =
    library.kind === "shows"
      ? "episode"
      : library.kind === "movies"
        ? "file"
        : "video"
  const action = library.scanning ? (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Spinner className="size-3.5" />
      Scanning…
    </span>
  ) : library.itemCount > 0 ? (
    <Link
      to="/libraries/$libraryId"
      params={{ libraryId: library.id }}
      search={{ sort: "recent" }}
      className={buttonVariants({
        variant: "ghost",
        size: "sm",
        className: "max-md:h-11 max-md:px-3",
      })}
    >
      View all
      <ChevronRightIcon data-icon="inline-end" />
    </Link>
  ) : null

  return (
    <Rail title={`Recently added in ${library.name}`} action={action}>
      {entries.isPending ? (
        Array.from({ length: 5 }, (_, i) => (
          <RailItem key={i}>
            <Skeleton className="aspect-video rounded-md" />
            <Skeleton className="mt-2.5 h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </RailItem>
        ))
      ) : entries.data?.length === 0 ? (
        <li className="text-muted-foreground w-full rounded-lg border border-dashed p-6 text-sm">
          No videos found in this library's folders yet.
        </li>
      ) : (
        entries.data?.map((entry) => (
          <RailItem key={entry.title.id}>
            <TitleCard entry={entry} noun={noun} />
          </RailItem>
        ))
      )}
    </Rail>
  )
}
