import type {
  MediaItem,
  Season,
  TitleSummary,
  WatchedAt,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import {
  CalendarClockIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  EyeOffIcon,
} from "lucide-react"
import { useState } from "react"

import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { invalidateViewerState, type WatchedState } from "@/lib/viewer-state"

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

/**
 * Mark one file watched or unwatched. The mutation stays pending until the
 * refetch after it lands.
 */
export function useSetWatched() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      item,
      watched,
      watchedAt,
    }: {
      item: MediaItem
      watched: boolean
      /** As in `playback.setWatched`: when, now if unset. */
      watchedAt?: WatchedAt
    }) => client.playback.setWatched({ itemId: item.id, watched, watchedAt }),
    onMutate: ({ item, watched }) =>
      patchLists(queryClient, (other) => other.id === item.id, watched),
    onError: (error, { watched }) =>
      toast.error(
        watched
          ? tr("media.markWatchedFailed")
          : tr("media.markUnwatchedFailed"),
        { description: errorMessage(error) },
      ),
    onSettled: () => invalidateViewerState(queryClient),
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
      /** As in `playback.setWatched`: when, now if unset. */
      watchedAt?: WatchedAt
    }) => client.playback.setTitleWatched(input),
    onMutate: ({ titleId, season, watched }) =>
      patchLists(
        queryClient,
        (item) =>
          item.title?.id === titleId &&
          (season === undefined || item.seasonNumber === season),
        watched,
      ),
    onError: (error, { watched }) =>
      toast.error(
        watched
          ? tr("media.markWatchedFailed")
          : tr("media.markUnwatchedFailed"),
        { description: errorMessage(error) },
      ),
    onSettled: () => invalidateViewerState(queryClient),
  })
}

/**
 * Whether the user watched the file, and a way to mark it: watched at a
 * time, or unwatched, which also clears the resume point. A change shows
 * at once.
 */
export function useItemWatched(item: MediaItem): WatchedState {
  const set = useSetWatched()
  const on = set.isPending
    ? set.variables.watched
    : (item.progress?.completed ?? false)
  return {
    on,
    mark: (watched, watchedAt) => set.mutate({ item, watched, watchedAt }),
  }
}

/**
 * As {@link useItemWatched}, for every file of a title. Unwatched clears
 * the title's resume points too.
 */
export function useTitleWatched(title: TitleSummary): WatchedState {
  const set = useSetTitleWatched()
  const on = set.isPending ? set.variables.watched : title.watched
  return {
    on,
    mark: (watched, watchedAt) =>
      set.mutate({ titleId: title.id, watched, watchedAt }),
  }
}

/**
 * As {@link useTitleWatched}, for one season of a show. Its files, once
 * loaded, change before the counts do.
 */
export function useSeasonWatched(
  title: TitleSummary,
  season: Season,
  items: MediaItem[] | undefined,
): WatchedState {
  const set = useSetTitleWatched()
  const counted = items
    ? items.every((item) => item.progress?.completed === true)
    : season.watchedCount >= season.itemCount
  return {
    on: set.isPending ? set.variables.watched : counted,
    mark: (watched, watchedAt) =>
      set.mutate({
        titleId: title.id,
        season: season.number,
        watched,
        watchedAt,
      }),
  }
}

/**
 * When the user watched it, as Trakt asks: just now, on the release date,
 * or on a date they pick in a `WatchedDateDialog`, which the menu's owner
 * renders.
 */
export function WatchedAtItems({
  onSelect,
  onPickDate,
}: {
  /** `watchedAt` as in `playback.setWatched`; unset is now. */
  onSelect: (watchedAt?: WatchedAt) => void
  /** "Other date…" was picked. */
  onPickDate: () => void
}) {
  return (
    <>
      <DropdownMenuItem onClick={() => onSelect()}>
        <ClockIcon />
        {tr("media.watchedAt.now")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onSelect("released")}>
        <CalendarIcon />
        {tr("media.watchedAt.released")}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onPickDate}>
        <CalendarClockIcon />
        {tr("media.watchedAt.other")}
      </DropdownMenuItem>
    </>
  )
}

// Round, beside Play, like the heart.
const pageButton =
  "border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11"

/**
 * The tick beside Play on a movie's, show's, or episode's page, as on its
 * card: unwatched, it asks when the user watched; watched, it marks
 * unwatched at once. The tick draws a step larger than the heart beside
 * it, whose glyph fills more of its box.
 */
export function WatchedButton({ watched }: { watched: WatchedState }) {
  const [picking, setPicking] = useState(false)
  if (watched.on) {
    return (
      <Button
        variant="secondary"
        size="icon-lg"
        aria-pressed
        aria-label={tr("media.markUnwatched")}
        title={tr("media.markUnwatched")}
        onClick={() => watched.mark(false)}
        className={cn(pageButton, "text-primary hover:text-primary")}
      >
        <CheckIcon className="size-5" strokeWidth={3} />
      </Button>
    )
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-lg"
              aria-pressed={false}
              aria-label={tr("media.markWatched")}
              title={tr("media.markWatched")}
              className={pageButton}
            />
          }
        >
          <CheckIcon className="size-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{tr("media.markWatched")}</DropdownMenuLabel>
            <WatchedAtItems
              onSelect={(watchedAt) => watched.mark(true, watchedAt)}
              onPickDate={() => setPicking(true)}
            />
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <WatchedDateDialog
        open={picking}
        onOpenChange={setPicking}
        onPick={(watchedAt) => watched.mark(true, watchedAt)}
      />
    </>
  )
}

/**
 * Mark watched and unwatched, whichever apply. Files in progress get both,
 * since unwatched also clears the resume point. Watched asks when, with
 * {@link WatchedAtItems}.
 */
export function WatchedMenuItems({
  scope,
  watched,
  started,
  onSelect,
  onPickDate,
}: {
  /** Fills in "Mark … watched". */
  scope: "as" | "season" | "all"
  /** Every file is watched. */
  watched: boolean
  /** Some file is watched or in progress. */
  started: boolean
  /** `watchedAt` as in `playback.setWatched`; unset is now. */
  onSelect: (watched: boolean, watchedAt?: WatchedAt) => void
  /** "Other date…" was picked. */
  onPickDate: () => void
}) {
  return (
    <>
      {!watched && (
        <DropdownMenuSub>
          {/* Items pad out for touch; the trigger has to be told. */}
          <DropdownMenuSubTrigger className="[@media(pointer:coarse)]:py-2.5">
            <CheckIcon />
            {tr(`media.mark.${scope}.watched`)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <WatchedAtItems
              onSelect={(watchedAt) => onSelect(true, watchedAt)}
              onPickDate={onPickDate}
            />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {(watched || started) && (
        <DropdownMenuItem onClick={() => onSelect(false)}>
          <EyeOffIcon />
          {tr(`media.mark.${scope}.unwatched`)}
        </DropdownMenuItem>
      )}
    </>
  )
}
