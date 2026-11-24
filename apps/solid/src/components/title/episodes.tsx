import type { MediaItem, Season, Title } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import {
  type ComponentProps,
  createMemo,
  Errored,
  For,
  Loading,
  Repeat,
  Show,
} from "solid-js"

import {
  ItemLink,
  textLink,
  Thumb,
  ThumbPlayButton,
  WatchedBadge,
} from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import {
  episodeCode,
  itemLabel,
  landscapeSources,
  progressRatio,
  seasonName,
  timeLeft,
} from "@/lib/media"
import { errorMessage } from "@/lib/rpc"

import { seasonItemsOptions } from "./title-queries"

export function ShowEpisodes(props: {
  title: Title
  season: Season
  watched: boolean | undefined
}) {
  const season = createMemo(() => ({ number: props.season.number }), {
    equals: (a, b) => a.number === b.number,
  })
  const heading = () =>
    props.title.seasons.length > 1
      ? seasonName(props.season.number)
      : tr("title.episodes")
  return (
    <div id="title-episodes">
      <Show when={season()} keyed>
        {(season) => (
          <Errored fallback={episodesQueryError}>
            <Loading
              fallback={
                <EpisodesSkeleton
                  heading={heading()}
                  count={props.season.itemCount}
                />
              }
            >
              <EpisodeList
                titleId={props.title.id}
                season={season.number}
                heading={heading()}
                watched={props.watched}
              />
            </Loading>
          </Errored>
        )}
      </Show>
    </div>
  )
}

function EpisodeList(props: {
  titleId: string
  season: number | null
  heading: string
  watched: boolean | undefined
}) {
  const titleId = createMemo(() => props.titleId)
  const items = useQuery(() => seasonItemsOptions(titleId(), props.season))
  return (
    <Rail title={props.heading}>
      <For each={items.data} keyed={(item) => item.id}>
        {(item) => (
          <RailItem>
            <SeasonEpisode item={item()} watched={props.watched} />
          </RailItem>
        )}
      </For>
    </Rail>
  )
}

/** The show's own episode cards can give its name's space to the episode. */
function SeasonEpisode(props: {
  item: MediaItem
  watched: boolean | undefined
}) {
  const label = () => itemLabel(props.item)
  const detail = () =>
    [
      episodeCode(props.item),
      props.watched === undefined ? timeLeft(props.item) : null,
    ]
      .filter(Boolean)
      .join(" · ")
  return (
    <div class="group/card">
      <div class="relative">
        <ItemLink item={props.item} hidden class="block rounded-md">
          <Thumb
            sources={landscapeSources(props.item)}
            toneKey={label().showKey}
            progress={
              props.watched === undefined ? progressRatio(props.item) : null
            }
            class="w-full"
          />
        </ItemLink>
        <Show when={props.watched ?? props.item.progress?.completed}>
          <WatchedBadge class="pointer-events-none absolute top-1.5 right-1.5" />
        </Show>
        <ThumbPlayButton item={props.item} label={label().title} />
      </div>
      <ItemLink
        item={props.item}
        class={`${textLink} mt-2 block truncate text-sm leading-5 font-medium`}
        label={label().title}
      >
        {label().title}
      </ItemLink>
      <Show when={detail()}>
        <span class="text-muted-foreground text-13px block truncate leading-5">
          {detail()}
        </span>
      </Show>
    </div>
  )
}

function EpisodesSkeleton(props: { heading: string; count: number }) {
  return (
    <Rail title={props.heading}>
      <Repeat count={Math.min(props.count, 6)}>
        {() => (
          <RailItem>
            <Skeleton class="aspect-video" />
            <Skeleton class="mt-2 h-5 w-2/3" />
            <Skeleton class="mt-1 h-4 w-1/3" />
          </RailItem>
        )}
      </Repeat>
    </Rail>
  )
}

const episodesQueryError: ComponentProps<typeof Errored>["fallback"] = (
  cause,
) => {
  return (
    <section>
      <h2 class="mb-3 text-xl font-semibold tracking-tight">
        {tr("title.episodes")}
      </h2>
      <p class="text-muted-foreground text-sm">
        {tr("title.episodes.error", { error: errorMessage(cause()) })}
      </p>
    </section>
  )
}
