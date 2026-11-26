import type { MediaItem, Season, TitleSummary } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { Heart } from "lucide"
import { Show } from "solid-js"

import type { Toggle } from "@/components/card-actions"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { client, errorMessage } from "@/lib/rpc"
import { invalidateViewerState } from "@/lib/viewer-state"

export const titleActionButton =
  "border-foreground/10 bg-foreground/10 hover:bg-foreground/20 aria-expanded:bg-foreground/20 text-foreground backdrop-blur max-sm:size-11"

function favoriteFailed(error: Error) {
  toast.error(tr("media.favoriteFailed"), {
    description: errorMessage(error),
  })
}

/**
 * Mark a title as a favorite or not. The mutation stays pending until the
 * refetch after it lands.
 */
function useSetFavorite() {
  const queryClient = useQueryClient()
  return useMutation(() => ({
    mutationFn: (input: { titleId: string; favorite: boolean }) =>
      client.favorites.set(input),
    onError: favoriteFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
}

/**
 * Whether the title is a favorite, and a way to flip it. A change shows at
 * once, and stays until the refetched title says the same or the call fails.
 */
export function useTitleFavorite(
  title: () => Pick<TitleSummary, "id" | "favorite">,
): Toggle {
  const set = useSetFavorite()
  const on = () =>
    (set.isPending && !set.failureCount
      ? set.variables?.favorite
      : undefined) ?? title().favorite
  return {
    on,
    toggle: () => {
      if (!set.isPending) set.mutate({ titleId: title().id, favorite: !on() })
    },
  }
}

/**
 * As {@link useTitleFavorite}, for a file. A movie is a favorite through its
 * title, so a movie's file flips the movie.
 */
export function useItemFavorite(item: () => MediaItem): Toggle {
  const queryClient = useQueryClient()
  const movie = () => (item().title?.kind === "movie" ? item().title : null)
  const setTitle = useSetFavorite()
  const setItem = useMutation(() => ({
    mutationFn: (input: { itemId: string; favorite: boolean }) =>
      client.favorites.setItem(input),
    onError: favoriteFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const on = () => {
    const title = movie()
    if (title) {
      return (
        (setTitle.isPending ? setTitle.variables?.favorite : undefined) ??
        title.favorite
      )
    }
    return (
      (setItem.isPending ? setItem.variables?.favorite : undefined) ??
      item().favorite
    )
  }
  return {
    on,
    toggle: () => {
      const title = movie()
      if (title) setTitle.mutate({ titleId: title.id, favorite: !on() })
      else setItem.mutate({ itemId: item().id, favorite: !on() })
    },
  }
}

/**
 * As {@link useTitleFavorite}, for a season. The files without a season
 * number aren't a season to mark, so their callers pass none on.
 */
export function useSeasonFavorite(
  title: () => Pick<TitleSummary, "id">,
  season: () => Season,
): Toggle {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: {
      titleId: string
      season: number
      favorite: boolean
    }) => client.favorites.setSeason(input),
    onError: favoriteFailed,
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const on = () =>
    (set.isPending ? set.variables?.favorite : undefined) ?? season().favorite
  return {
    on,
    toggle: () => {
      const number = season().number
      if (number === null) return
      set.mutate({ titleId: title().id, season: number, favorite: !on() })
    },
  }
}

/** The heart beside Play. */
function HeartButton(props: { favorite: Toggle; class?: string }) {
  const label = () =>
    tr(props.favorite.on() ? "media.removeFavorite" : "media.addFavorite")
  return (
    <Button
      variant="secondary"
      size="icon-lg"
      aria-pressed={props.favorite.on() ? "true" : "false"}
      aria-label={label()}
      title={label()}
      onClick={() => props.favorite.toggle()}
      class={cn(titleActionButton, props.class)}
    >
      <Icon
        icon={Heart}
        class={[
          "transition-[fill,color,scale] duration-200 motion-reduce:transition-none",
          props.favorite.on()
            ? "scale-110 fill-rose-400 text-rose-400"
            : "fill-rose-400/0",
        ]}
      />
    </Button>
  )
}

/** The heart beside a title's Play. Filled while the title is a favorite. */
export function FavoriteButton(props: {
  title: Pick<TitleSummary, "id" | "favorite">
}) {
  // A prop is read lazily, so a hook called inside one would run again on
  // each read, the click's too, outside the component.
  const favorite = useTitleFavorite(() => props.title)
  return <HeartButton favorite={favorite} />
}

/** The heart beside an episode's Play. Filled while it's a favorite. */
export function ItemFavoriteButton(props: { item: MediaItem }) {
  const favorite = useItemFavorite(() => props.item)
  return <HeartButton favorite={favorite} />
}

/**
 * The heart beside a season's Play. Filled while it's a favorite. None for
 * the files without a season number.
 */
export function SeasonFavoriteButton(props: {
  title: Pick<TitleSummary, "id">
  season: Season
}) {
  const favorite = useSeasonFavorite(
    () => props.title,
    () => props.season,
  )
  return (
    <Show when={props.season.number !== null}>
      <HeartButton favorite={favorite} />
    </Show>
  )
}
