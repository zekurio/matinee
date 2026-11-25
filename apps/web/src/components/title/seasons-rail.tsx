import type { Season, Title } from "@matinee/contracts"
import { For, Show } from "solid-js"

import {
  CardText,
  cardClass,
  PosterArt,
  WatchedBadge,
} from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { seasonKey } from "@/components/title/seasons"
import { tr } from "@/i18n"
import { art, seasonName } from "@/lib/media"

export function SeasonsRail(props: {
  title: Title
  selected: Season
  onSelect: (season: Season) => void
}) {
  return (
    <Rail title={tr("title.seasons")}>
      <For each={props.title.seasons} keyed={seasonKey}>
        {(season) => (
          <RailItem artwork="poster">
            <button
              type="button"
              class={[cardClass, "w-full text-left"]}
              aria-pressed={
                season().number === props.selected.number ? "true" : "false"
              }
              aria-label={seasonName(season().number)}
              aria-controls="title-episodes"
              onClick={() => props.onSelect(season())}
            >
              <span
                class={[
                  "relative block rounded-md",
                  {
                    "ring-primary ring-offset-background ring-2 ring-offset-2":
                      season().number === props.selected.number,
                  },
                ]}
              >
                <PosterArt
                  name={tr("title.seasonOf", {
                    show: props.title.name,
                    season: seasonName(season().number),
                  })}
                  toneKey={props.title.id}
                  poster={art(season().poster ?? props.title.images.poster)}
                />
                <Show
                  when={season().itemCount - season().watchedCount}
                  fallback={<WatchedBadge class="absolute top-1.5 right-1.5" />}
                >
                  {(left) => (
                    <span
                      role="img"
                      aria-label={tr("title.seasons.left", { count: left() })}
                      class="bg-primary text-primary-foreground text-11px absolute top-1.5 right-1.5 grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-semibold tabular-nums"
                    >
                      {left()}
                    </span>
                  )}
                </Show>
              </span>
              <CardText
                primary={seasonName(season().number)}
                secondary={tr("title.episodeCount", {
                  count: season().itemCount,
                })}
              />
            </button>
          </RailItem>
        )}
      </For>
    </Rail>
  )
}
