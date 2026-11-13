import type { Library } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"

import { libraryIcons } from "@/components/app-shell"
import { NoLibraries } from "@/components/library/no-libraries"
import { Picture, tone } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { art } from "@/lib/media"
import { errorMessage, orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/_shell/media")({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(orpc.libraries.list.queryOptions())
  },
  component: MediaPage,
})

/** Cards as wide as fit at 10rem or more on phones, 18rem from `sm` up. */
const libraryGrid =
  "grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-5 sm:grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] sm:gap-x-6 sm:gap-y-8"

/**
 * The Media tab on phones: every library as a card, which opens the
 * library. Wider screens have the libraries in the bar, but the page
 * works there too.
 */
function MediaPage() {
  const { user } = Route.useRouteContext()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  useDocumentTitle(tr("shell.media"))

  return (
    <div>
      <PageHeader title={tr("shell.media")} />
      {libraries.isPending ? (
        <ul className={libraryGrid}>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Skeleton className="aspect-video rounded-md" />
              <Skeleton className="mt-2.5 h-3 w-1/3" />
            </li>
          ))}
        </ul>
      ) : libraries.isError ? (
        <p className="text-muted-foreground text-sm">
          {errorMessage(libraries.error)}
        </p>
      ) : libraries.data.length === 0 ? (
        <NoLibraries admin={user.role === "admin"} />
      ) : (
        <ul className={libraryGrid}>
          {libraries.data.map((library) => (
            <li key={library.id}>
              <LibraryCard library={library} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * A library as the backdrop the server picked for it today, with its name
 * across it, as Jellyfin shows one, and how many titles it holds below.
 */
function LibraryCard({ library }: { library: Library }) {
  const backdrop = art(library.backdrop, "medium")
  const Icon = libraryIcons[library.kind]
  return (
    <Link
      to="/libraries/$libraryId"
      params={{ libraryId: library.id }}
      className="group focus-visible:ring-ring focus-visible:ring-offset-background block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <span
        className={cn(
          "relative grid aspect-video place-items-center overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-colors group-hover:border-foreground/25",
          tone(library.id),
        )}
      >
        {backdrop ? (
          <>
            <Picture
              sources={[backdrop]}
              sizes="(min-width: 640px) 24rem, 50vw"
            />
            <span aria-hidden className="absolute inset-0 bg-black/35" />
          </>
        ) : (
          <Icon className="text-muted-foreground absolute top-3 left-3 size-7" />
        )}
        {/* Big enough to read across the room, over the backdrop or the
            dark tone in its place. */}
        <span className="relative line-clamp-2 px-3 text-center text-2xl leading-tight font-bold tracking-tight text-balance break-words text-white [text-shadow:0_1px_12px_rgb(0_0_0/0.6)]">
          {library.name}
        </span>
      </span>
      <span className="text-muted-foreground mt-2 block truncate text-[13px] leading-5">
        {tr("browse.titleCount", { count: library.titleCount })}
      </span>
    </Link>
  )
}
