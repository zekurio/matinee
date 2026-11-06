import type { MediaItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { cn } from "@matinee/ui/lib/utils"
import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { CheckIcon, EllipsisIcon, EyeOffIcon } from "lucide-react"

import { client, errorMessage, orpc } from "@/lib/rpc"

type MediaPage = { items: MediaItem[]; total: number }

/** The item as it looks once marked. */
function withWatched(item: MediaItem, watched: boolean): MediaItem {
  if (!watched) return { ...item, progress: null }
  return {
    ...item,
    progress: {
      positionSeconds:
        item.progress?.positionSeconds ?? item.durationSeconds ?? 0,
      completed: true,
      updatedAt: new Date(),
    },
  }
}

/**
 * Show a change in the cached file lists before the server answers. The
 * refetch after it puts the real state back if the call fails.
 */
async function patchLists(
  queryClient: QueryClient,
  match: (item: MediaItem) => boolean,
  watched: boolean,
) {
  const keys = [orpc.titles.items.key(), orpc.media.key(), orpc.home.key()]
  // A refetch already on its way would land on top of the patch.
  await Promise.all(
    keys.map((queryKey) => queryClient.cancelQueries({ queryKey })),
  )
  const patch = (items: MediaItem[]) =>
    items.map((item) => (match(item) ? withWatched(item, watched) : item))
  queryClient.setQueriesData<MediaItem[]>(
    { queryKey: orpc.titles.items.key() },
    (old) => old && patch(old),
  )
  queryClient.setQueriesData<InfiniteData<MediaPage>>(
    { queryKey: orpc.media.list.key({ type: "infinite" }) },
    (old) =>
      old && {
        ...old,
        pages: old.pages.map((page) => ({ ...page, items: patch(page.items) })),
      },
  )
  // Either way the file is no longer in progress. Next up only holds files
  // nobody started, so a watched one leaves it too.
  queryClient.setQueriesData<MediaItem[]>(
    { queryKey: orpc.home.continueWatching.key() },
    (old) => old?.filter((item) => !match(item)),
  )
  if (watched) {
    queryClient.setQueriesData<MediaItem[]>(
      { queryKey: orpc.home.nextUp.key() },
      (old) => old?.filter((item) => !match(item)),
    )
  }
}

/** Refetch what shows watch state: home's rows, file lists, and titles. */
function invalidateWatchState(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.home.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.media.key() }),
    queryClient.invalidateQueries({ queryKey: orpc.titles.key() }),
  ])
}

/** Mark one file watched or unwatched. */
function useSetWatched() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ item, watched }: { item: MediaItem; watched: boolean }) =>
      client.playback.setWatched({ itemId: item.id, watched }),
    onMutate: ({ item, watched }) =>
      patchLists(queryClient, (other) => other.id === item.id, watched),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => invalidateWatchState(queryClient),
  })
}

/** Mark a title's files watched or unwatched, or one season's. */
export function useSetTitleWatched() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      titleId: string
      /** As in `titles.items`: null is the files without a season. */
      season?: number | null
      watched: boolean
    }) => client.playback.setTitleWatched(input),
    onMutate: ({ titleId, season, watched }) =>
      patchLists(
        queryClient,
        (item) =>
          item.title?.id === titleId &&
          (season === undefined || item.seasonNumber === season),
        watched,
      ),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => invalidateWatchState(queryClient),
  })
}

/**
 * Mark watched and unwatched, whichever apply. Files in progress get both,
 * since unwatched also clears the resume point.
 */
export function WatchedMenuItems({
  scope,
  watched,
  started,
  onSelect,
}: {
  /** Fills in "Mark … watched". */
  scope: "as" | "season" | "all"
  /** Every file is watched. */
  watched: boolean
  /** Some file is watched or in progress. */
  started: boolean
  onSelect: (watched: boolean) => void
}) {
  return (
    <>
      {!watched && (
        <DropdownMenuItem onClick={() => onSelect(true)}>
          <CheckIcon />
          Mark {scope} watched
        </DropdownMenuItem>
      )}
      {(watched || started) && (
        <DropdownMenuItem onClick={() => onSelect(false)}>
          <EyeOffIcon />
          Mark {scope} unwatched
        </DropdownMenuItem>
      )}
    </>
  )
}

/**
 * The "⋯" button on a file's row or card. Pointers that hover see it on
 * hover and focus, inside a `group/item`; touch screens always do.
 */
export function ItemMenu({
  item,
  label,
  onMark,
  className,
}: {
  item: MediaItem
  /** Names the file for screen readers. */
  label: string
  /** Runs before the change is sent. */
  onMark?: () => void
  className?: string
}) {
  const setWatched = useSetWatched()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`More actions for ${label}`}
            className={cn(
              "text-muted-foreground opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 aria-expanded:opacity-100 [@media(pointer:coarse)]:size-11 [@media(pointer:coarse)]:opacity-100",
              className,
            )}
          />
        }
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
        <WatchedMenuItems
          scope="as"
          watched={item.progress?.completed ?? false}
          started={item.progress !== null}
          onSelect={(watched) => {
            onMark?.()
            setWatched.mutate({ item, watched })
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
