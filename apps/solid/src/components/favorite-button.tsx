import type { TitleSummary } from "@matinee/contracts"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { Heart } from "lucide"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { client, errorMessage } from "@/lib/rpc"
import { invalidateViewerState } from "@/lib/viewer-state"

export const titleActionButton =
  "border-foreground/10 bg-foreground/10 hover:bg-foreground/20 aria-expanded:bg-foreground/20 text-foreground backdrop-blur max-sm:size-11"

export function FavoriteButton(props: {
  title: Pick<TitleSummary, "id" | "favorite">
}) {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: { titleId: string; favorite: boolean }) =>
      client.favorites.set(input),
    onError: (error) =>
      toast.error(tr("media.favoriteFailed"), {
        description: errorMessage(error),
      }),
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const on = () =>
    (set.isPending && !set.failureCount
      ? set.variables?.favorite
      : undefined) ?? props.title.favorite
  const label = () => tr(on() ? "media.removeFavorite" : "media.addFavorite")

  return (
    <Button
      variant="secondary"
      size="icon-lg"
      aria-pressed={on() ? "true" : "false"}
      aria-label={label()}
      title={label()}
      onClick={() => {
        if (!set.isPending)
          set.mutate({ titleId: props.title.id, favorite: !on() })
      }}
      class={titleActionButton}
    >
      <Icon
        icon={Heart}
        class={[
          "transition-[fill,color,scale] duration-200 motion-reduce:transition-none",
          on() ? "scale-110 fill-rose-400 text-rose-400" : "fill-rose-400/0",
        ]}
      />
    </Button>
  )
}
