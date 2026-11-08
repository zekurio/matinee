import type { MediaItem, TitleSummary } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { DropdownMenuItem } from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { HeartIcon } from "lucide-react"

import { tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { invalidateViewerState, type Toggle } from "@/lib/viewer-state"

/**
 * Mark a title as a favorite or not. The title page shows the change before
 * the server answers, and goes back if the call fails. The mutation stays
 * pending until the refetch after it lands.
 */
export function useSetFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { titleId: string; favorite: boolean }) =>
      client.favorites.set(input),
    onMutate: async ({ titleId, favorite }) => {
      const queryKey = orpc.titles.get.queryKey({ input: { id: titleId } })
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey)
      if (previous)
        queryClient.setQueryData(queryKey, { ...previous, favorite })
      return { queryKey, previous }
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous)
      }
      toast.error(tr("media.favoriteFailed"), {
        description: errorMessage(error),
      })
    },
    onSettled: () => invalidateViewerState(queryClient),
  })
}

/**
 * Mark a file, such as an episode, as a favorite or not. The mutation stays
 * pending until the refetch after it lands.
 */
export function useSetItemFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { itemId: string; favorite: boolean }) =>
      client.favorites.setItem(input),
    onError: (error) =>
      toast.error(tr("media.favoriteFailed"), {
        description: errorMessage(error),
      }),
    onSettled: () => invalidateViewerState(queryClient),
  })
}

/**
 * Whether the title is a favorite, and a way to flip it. A change shows at
 * once, and stays until the refetched title says the same or the call fails.
 */
export function useTitleFavorite(
  title: Pick<TitleSummary, "id" | "favorite">,
): Toggle {
  const set = useSetFavorite()
  const on = set.isPending ? set.variables.favorite : title.favorite
  return {
    on,
    toggle: () => set.mutate({ titleId: title.id, favorite: !on }),
  }
}

/**
 * As {@link useTitleFavorite}, for a file. A movie is a favorite through its
 * title, so a movie's file flips the movie.
 */
export function useItemFavorite(item: MediaItem): Toggle {
  const setTitle = useSetFavorite()
  const setItem = useSetItemFavorite()
  const movie = item.title?.kind === "movie" ? item.title : null
  if (movie) {
    const on = setTitle.isPending ? setTitle.variables.favorite : movie.favorite
    return {
      on,
      toggle: () => setTitle.mutate({ titleId: movie.id, favorite: !on }),
    }
  }
  const on = setItem.isPending ? setItem.variables.favorite : item.favorite
  return {
    on,
    toggle: () => setItem.mutate({ itemId: item.id, favorite: !on }),
  }
}

/**
 * A heart, filled while `on`. The fill is always rose, clear while off:
 * `fill-current` would fill at once with the color the stroke is still
 * fading from, so the heart flashed white before turning red.
 */
export function FavoriteHeart({
  on,
  className,
}: {
  on: boolean
  className?: string
}) {
  return (
    <HeartIcon
      className={cn(
        "fill-rose-400/0 transition-[fill,color,scale] duration-200 motion-reduce:transition-none",
        on && "scale-110 fill-rose-400 text-rose-400",
        className,
      )}
    />
  )
}

/** "Add to favorites" or "Remove from favorites", for a dropdown menu. */
export function FavoriteMenuItem({ favorite }: { favorite: Toggle }) {
  return (
    <DropdownMenuItem onClick={favorite.toggle}>
      <FavoriteHeart on={favorite.on} />
      {favorite.on ? tr("media.removeFavorite") : tr("media.addFavorite")}
    </DropdownMenuItem>
  )
}

/** The heart beside Play. */
function HeartButton({
  on,
  toggle,
  className,
}: Toggle & { className?: string }) {
  return (
    <Button
      variant="secondary"
      size="icon-lg"
      aria-pressed={on}
      aria-label={on ? tr("media.removeFavorite") : tr("media.addFavorite")}
      title={on ? tr("media.removeFavorite") : tr("media.addFavorite")}
      onClick={toggle}
      className={cn(
        "border-foreground/10 bg-foreground/15 hover:bg-foreground/25 backdrop-blur max-sm:size-11",
        className,
      )}
    >
      <FavoriteHeart on={on} />
    </Button>
  )
}

/** The heart beside a title's Play. Filled while the title is a favorite. */
export function FavoriteButton({
  title,
  className,
}: {
  title: Pick<TitleSummary, "id" | "favorite">
  className?: string
}) {
  return <HeartButton {...useTitleFavorite(title)} className={className} />
}

/** The heart beside an episode's Play. Filled while it's a favorite. */
export function ItemFavoriteButton({
  item,
  className,
}: {
  item: MediaItem
  className?: string
}) {
  return <HeartButton {...useItemFavorite(item)} className={className} />
}
