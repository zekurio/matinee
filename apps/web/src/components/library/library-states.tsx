import type { Library } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
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
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderOpenIcon, SearchXIcon } from "lucide-react"
import { type ReactNode, useEffect, useEffectEvent, useRef } from "react"

import { posterGrid } from "@/components/media-item"
import { tr } from "@/i18n"
import { client, orpc } from "@/lib/rpc"

/** What the server is doing to the library, if anything. */
export function libraryStatus(library: Library | undefined): ReactNode {
  const busy = library?.scanning
    ? tr("library.scanning")
    : library?.refreshing
      ? tr("library.fetchingMetadata")
      : null
  if (!busy) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner className="size-3.5" /> {busy}
    </span>
  )
}

const isBusy = (library: Library) => library.scanning || library.refreshing

/**
 * The library, polled while a scan or metadata fetch runs so new titles
 * show up. The poll that sees the work end refreshes the lists it changed:
 * the files once the scan is done, the titles once the metadata is in.
 */
export function useLibrary(libraryId: string) {
  const queryClient = useQueryClient()
  const options = orpc.libraries.get.queryOptions({ input: { id: libraryId } })
  return useQuery({
    ...options,
    queryFn: async ({ signal }) => {
      const before = queryClient.getQueryData(options.queryKey)
      const library = await client.libraries.get({ id: libraryId }, { signal })
      const scanDone = before?.scanning === true && !library.scanning
      const workDone =
        before !== undefined && isBusy(before) && !isBusy(library)
      if (scanDone || workDone) {
        void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
        void queryClient.invalidateQueries({
          queryKey: orpc.libraries.list.key(),
        })
      }
      if (workDone) {
        void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
      }
      return library
    },
    refetchInterval: (q) =>
      q.state.data && isBusy(q.state.data) ? 2000 : false,
  })
}

export function PosterGridSkeleton() {
  return (
    <ul className={posterGrid}>
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-[2/3] rounded-md" />
          <Skeleton className="mt-2.5 h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Nothing to list: nothing matches the search or filters, given `clear`
 * to take them off, or there are no videos at all.
 */
export function EmptyList({
  title,
  scanning,
  clear,
}: {
  title: string
  scanning: boolean
  clear?: { label: string; onClick: () => void }
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
          {clear ? <SearchXIcon /> : <FolderOpenIcon />}
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        {!clear && (
          <EmptyDescription>
            {scanning ? tr("library.scanRunning") : tr("library.noVideosHint")}
          </EmptyDescription>
        )}
      </EmptyHeader>
      {clear && (
        <EmptyContent>
          <Button variant="outline" onClick={clear.onClick}>
            {clear.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

/**
 * The end of a paged list. It loads the next page by itself once it comes
 * within a screen or so of the viewport, so the list keeps growing as you
 * scroll and a part-filled last row is gone before you reach it. The button
 * stays as the way to retry after a failed page, when it stops loading by
 * itself.
 */
export function ShowMore({
  fetching,
  failed = false,
  onClick,
  className,
}: {
  fetching: boolean
  /** The last page failed; wait for a click rather than retry in a loop. */
  failed?: boolean
  onClick: () => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const load = useEffectEvent(onClick)

  // Made again after every fetch: a new observer reports at once, so a page
  // that still leaves this on screen pulls the next one in.
  useEffect(() => {
    const node = ref.current
    if (!node || fetching || failed) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load()
      },
      { rootMargin: "0px 0px 150% 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [fetching, failed])

  return (
    <div ref={ref} className={cn("flex justify-center", className)}>
      <Button variant="outline" disabled={fetching} onClick={onClick}>
        {fetching && <Spinner />}
        {tr("library.showMore")}
      </Button>
    </div>
  )
}
