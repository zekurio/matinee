import type { MediaItem } from "@matinee/contracts"
import { Show } from "solid-js"

import { ActionsMenu } from "@/components/actions-menu"
import { CardActions, CardScrim } from "@/components/card-actions"
import { useItemFavorite } from "@/components/favorite-button"
import {
  ItemLink,
  textLink,
  Thumb,
  ThumbPlayButton,
} from "@/components/media-item"
import { sectionTitle } from "@/components/rail"
import { useItemWatched } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { formatDate, formatRuntime } from "@/lib/format"
import {
  episodeCode,
  itemLabel,
  landscapeSources,
  progressRatio,
  timeLeft,
} from "@/lib/media"

import { MediaInfoLine } from "./media-info"

export function NextUp(props: { item: MediaItem }) {
  const label = () => itemLabel(props.item)
  const code = () => episodeCode(props.item)
  const name = () => {
    const at = code()
    return at
      ? tr("title.episodes.codedName", { code: at, name: label().title })
      : label().title
  }
  const watched = useItemWatched(() => props.item)
  const favorite = useItemFavorite(() => props.item)
  const facts = () => {
    const { episode, durationSeconds, progress } = props.item
    const runtime = formatRuntime(
      episode?.runtimeMinutes ??
        (durationSeconds ? Math.round(durationSeconds / 60) : null),
    )
    return [
      episode?.airDate
        ? formatDate(new Date(`${episode.airDate}T12:00:00`))
        : null,
      progress ? (timeLeft(props.item) ?? runtime) : runtime,
    ]
      .filter(Boolean)
      .join(" · ")
  }

  return (
    <section aria-labelledby="next-up-heading">
      <h2 id="next-up-heading" class={[sectionTitle, "mb-3"]}>
        {tr(
          props.item.progress ? "title.nextUp.continue" : "title.nextUp.next",
        )}
      </h2>
      <div class="grid max-w-4xl grid-cols-[min(12rem,54%)_minmax(0,1fr)] items-start gap-x-4 gap-y-2 sm:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div class="group/card relative">
          <ItemLink item={props.item} hidden class="block rounded-md">
            <Thumb
              sources={landscapeSources(props.item, "large")}
              toneKey={label().showKey}
              progress={watched.on() ? null : progressRatio(props.item)}
              class="w-full"
            >
              <CardScrim />
            </Thumb>
          </ItemLink>
          <ThumbPlayButton item={props.item} label={name()} />
          <CardActions
            name={name()}
            watched={watched}
            favorite={favorite}
            menu={
              <ActionsMenu
                target={{ kind: "item", item: props.item, name: name() }}
                look="card"
              />
            }
            touch
            class="absolute right-1 bottom-1.5 [@media(pointer:coarse)]:bottom-3"
          />
        </div>
        <div class="min-w-0 py-0.5">
          <p class="flex items-baseline gap-2">
            <Show when={code()}>
              <span class="text-muted-foreground shrink-0 text-sm">
                {code()}
              </span>
            </Show>
            <ItemLink
              item={props.item}
              label={label().title}
              class={`${textLink} sm:text-15px line-clamp-2 text-sm font-medium`}
            >
              {label().title}
            </ItemLink>
          </p>
          <Show when={facts()}>
            <p class="text-muted-foreground text-13px mt-1">{facts()}</p>
          </Show>
          <MediaInfoLine item={props.item} />
          <Show when={props.item.episode?.overview}>
            <p class="text-muted-foreground mt-2 line-clamp-3 text-sm max-sm:hidden">
              {props.item.episode?.overview}
            </p>
          </Show>
        </div>
        <Show when={props.item.episode?.overview}>
          <p class="text-muted-foreground text-13px col-span-2 line-clamp-3 sm:hidden">
            {props.item.episode?.overview}
          </p>
        </Show>
      </div>
    </section>
  )
}
