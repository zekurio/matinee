import { Star } from "lucide"
import { Show } from "solid-js"

import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { formatScore } from "@/lib/format"

/**
 * A community score out of 10, as a star and the number, which a screen
 * reader hears as "Rated 7.8". Nothing for no score. The number takes the
 * size and color of the text around it; `small` is the star for a card's
 * 13px line.
 */
export function Score(props: {
  score: number | null
  small?: boolean
  class?: string
}) {
  const text = () => (props.score === null ? null : formatScore(props.score))
  return (
    <Show when={text()}>
      {(score) => (
        <span class={["inline-flex items-center gap-1", props.class]}>
          <Icon
            icon={Star}
            class={[
              "fill-current text-amber-500 dark:text-amber-300",
              props.small ? "size-3" : "size-3.5",
            ]}
          />
          <span class="sr-only">{tr("title.rating", { rating: score() })}</span>
          <span aria-hidden="true">{score()}</span>
        </span>
      )}
    </Show>
  )
}
