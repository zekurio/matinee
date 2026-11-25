import type {
  MediaItem,
  Season,
  TitleSummary,
  WatchedAt,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/solid-query"
import { Calendar, CalendarClock, CalendarOff, Check, Clock } from "lucide"
import { createSignal, Show } from "solid-js"

import type { WatchedState } from "@/components/card-actions"
import { titleActionButton } from "@/components/favorite-button"
import { WatchedDateDialog } from "@/components/watched-date-dialog"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { invalidateViewerState } from "@/lib/viewer-state"

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
  const keys = [orpc.titles.items.key(), orpc.home.key()]
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

/** Says a mark didn't go through. */
function markFailed(error: Error, input: { watched: boolean }) {
  toast.error(
    tr(input.watched ? "media.markWatchedFailed" : "media.markUnwatchedFailed"),
    { description: errorMessage(error) },
  )
}

export function useTitleWatched(
  title: () => Pick<TitleSummary, "id" | "watched">,
) {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: {
      titleId: string
      watched: boolean
      watchedAt?: WatchedAt
    }) => client.playback.setTitleWatched(input),
    onError: markFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const pending = () =>
    set.isPending && !set.failureCount ? set.variables?.watched : undefined
  return {
    pending,
    on: () => pending() ?? title().watched,
    mark: (watched: boolean, watchedAt?: WatchedAt) => {
      if (!set.isPending)
        set.mutate({ titleId: title().id, watched, watchedAt })
    },
  }
}

/**
 * Whether the user watched the file, and a way to mark it: watched at a
 * time, or unwatched, which also clears the resume point. A change shows
 * at once.
 */
export function useItemWatched(item: () => MediaItem): WatchedState {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: {
      item: MediaItem
      watched: boolean
      /** As in `playback.setWatched`: when, now if unset. */
      watchedAt?: WatchedAt
    }) =>
      client.playback.setWatched({
        itemId: input.item.id,
        watched: input.watched,
        watchedAt: input.watchedAt,
      }),
    onMutate: (input) =>
      patchLists(
        queryClient,
        (other) => other.id === input.item.id,
        input.watched,
      ),
    onError: markFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
  return {
    on: () =>
      (set.isPending ? set.variables?.watched : undefined) ??
      item().progress?.completed ??
      false,
    mark: (watched, watchedAt) =>
      set.mutate({ item: item(), watched, watchedAt }),
  }
}

/**
 * As {@link useTitleWatched}, for one season of a show. Its files, once
 * loaded, change before the counts do.
 */
export function useSeasonWatched(
  title: () => Pick<TitleSummary, "id">,
  season: () => Season,
  items: () => MediaItem[] | undefined,
): WatchedState {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: {
      titleId: string
      /** As in `titles.items`: null is the files without a season. */
      season: number | null
      watched: boolean
      watchedAt?: WatchedAt
    }) => client.playback.setTitleWatched(input),
    onMutate: (input) =>
      patchLists(
        queryClient,
        (item) =>
          item.title?.id === input.titleId &&
          item.seasonNumber === input.season,
        input.watched,
      ),
    onError: markFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const counted = () => {
    const files = items()
    return files
      ? files.every((item) => item.progress?.completed === true)
      : season().watchedCount >= season().itemCount
  }
  return {
    on: () => (set.isPending ? set.variables?.watched : undefined) ?? counted(),
    mark: (watched, watchedAt) =>
      set.mutate({
        titleId: title().id,
        season: season().number,
        watched,
        watchedAt,
      }),
  }
}

/**
 * When the user watched it, as Trakt asks: just now, on the release date,
 * on a date they pick in a `WatchedDateDialog`, which the menu's owner
 * renders, or some time they don't remember, which counts in no chart.
 */
export function WatchedAtItems(props: {
  /** `watchedAt` as in `playback.setWatched`; unset is now. */
  onSelect: (watchedAt?: WatchedAt) => void
  /** "Other date" was picked. */
  onPickDate: () => void
}) {
  return (
    <>
      <DropdownMenuItem onSelect={() => props.onSelect()}>
        <Icon icon={Clock} />
        {tr("media.watchedAt.now")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onSelect("released")}>
        <Icon icon={Calendar} />
        {tr("media.watchedAt.released")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onPickDate()}>
        <Icon icon={CalendarClock} />
        {tr("media.watchedAt.other")}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => props.onSelect("unknown")}>
        <Icon icon={CalendarOff} />
        {tr("media.watchedAt.unknown")}
      </DropdownMenuItem>
    </>
  )
}

/**
 * The tick beside Play on a movie's, show's, season's, or episode's page:
 * unwatched, it asks when the user watched; watched, it marks unwatched at
 * once.
 */
export function WatchedButton(props: { watched: WatchedState }) {
  // Null until "Other date" is first picked: the date dialog costs a
  // popup's setup on every page open, so it mounts when first needed.
  const [picking, setPicking] = createSignal<boolean | null>(null)
  return (
    <>
      <Show
        when={props.watched.on()}
        fallback={
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-pressed="false"
              aria-label={tr("media.markWatched")}
              title={tr("media.markWatched")}
              class={cn(
                buttonVariants({ variant: "secondary", size: "icon-lg" }),
                titleActionButton,
              )}
            >
              <Icon icon={Check} class="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={6} class="min-w-44">
              <DropdownMenuGroup aria-label={tr("media.markWatched")}>
                <WatchedAtItems
                  onSelect={(watchedAt) => props.watched.mark(true, watchedAt)}
                  onPickDate={() => setPicking(true)}
                />
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <Button
          variant="secondary"
          size="icon-lg"
          aria-pressed="true"
          aria-label={tr("media.markUnwatched")}
          title={tr("media.markUnwatched")}
          onClick={() => props.watched.mark(false)}
          class={cn(titleActionButton, "text-primary")}
        >
          <Icon icon={Check} class="size-5" />
        </Button>
      </Show>
      <Show when={picking() !== null}>
        <WatchedDateDialog
          open={picking() ?? false}
          onOpenChange={setPicking}
          onPick={(watchedAt) => props.watched.mark(true, watchedAt)}
        />
      </Show>
    </>
  )
}
