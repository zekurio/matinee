import type { MediaItem, Season, Title } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { ActionsMenu } from "@/components/actions-menu"
import { CardActions, CardScrim } from "@/components/card-actions"
import { useItemFavorite } from "@/components/favorite-button"
import {
  EpisodeCard,
  ItemLink,
  StreamLine,
  textLink,
  Thumb,
  ThumbPlayButton,
  UnwatchBadge,
} from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
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
import { errorMessage, orpc } from "@/lib/rpc"

import { seasonNext } from "./seasons"

/** A season's episodes on the show's own page, for a show with one season. */
export function ShowEpisodes({
  title,
  season,
}: {
  title: Title
  season: Season
}) {
  const items = useQuery(
    orpc.titles.items.queryOptions({
      input: { id: title.id, season: season.number },
    }),
  )
  return (
    <SeasonEpisodes
      title={title}
      items={items.data}
      error={items.isError ? errorMessage(items.error) : null}
    />
  )
}

/**
 * A season's episodes as a row of stills, or skeletons while they load. A
 * still or a name opens the episode's page, and the round button on the
 * still plays it.
 */
export function SeasonEpisodes({
  title,
  items,
  error,
}: {
  title: Title
  items: MediaItem[] | undefined
  /** Why they didn't load. */
  error: string | null
}) {
  if (error !== null) {
    return (
      <section aria-labelledby="episodes-heading">
        <h2
          id="episodes-heading"
          className="mb-3 text-xl font-semibold tracking-tight"
        >
          {tr("title.episodes")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {tr("title.episodes.error", { error })}
        </p>
      </section>
    )
  }
  if (items === undefined) {
    return (
      <Rail title={tr("title.episodes")}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <RailItem key={i}>
            <Skeleton className="aspect-video rounded-md" />
            <Skeleton className="mt-2.5 h-3.5 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/3" />
          </RailItem>
        ))}
      </Rail>
    )
  }
  return <EpisodesRail items={items} start={seasonNext(title, items)} />
}

/** The loaded row, which starts on `start`. */
function EpisodesRail({
  items,
  start,
}: {
  items: MediaItem[]
  start: MediaItem | undefined
}) {
  // Kept from the first render: marking an episode watched moves Play on,
  // and the row shouldn't scroll away under the pointer.
  const [startIndex] = useState(() =>
    Math.max(
      0,
      items.findIndex((item) => item.id === start?.id),
    ),
  )
  return (
    <Rail title={tr("title.episodes")} startIndex={startIndex}>
      {items.map((item) => (
        <RailItem key={item.id}>
          <EpisodeCard item={item} showName={false} />
        </RailItem>
      ))}
    </Rail>
  )
}

/**
 * The episode up next on a show's page: a big still, its number and name,
 * air date and runtime, and what happens in it. The still and the name
 * open the episode's page, and the round button on the still plays it.
 * The icons in the still's corner mark it watched or a favorite.
 */
export function EpisodeRow({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const code = episodeCode(item)
  const name = code
    ? tr("title.episodes.codedName", { code, name: label.title })
    : label.title
  const watched = useItemWatched(item)
  const favorite = useItemFavorite(item)
  const runtime = formatRuntime(
    item.episode?.runtimeMinutes ??
      (item.durationSeconds ? Math.round(item.durationSeconds / 60) : null),
  )
  const facts = [
    item.episode?.airDate
      ? formatDate(new Date(`${item.episode.airDate}T12:00:00`))
      : null,
    item.progress && !watched.on ? timeLeft(item) : runtime,
  ].filter(Boolean)
  const overview = item.episode?.overview
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2">
      <div className="group/thumb group/card relative w-48 sm:w-64 lg:w-72">
        <ItemLink item={item} hidden className="block rounded-md">
          <Thumb
            sources={landscapeSources(item, "large")}
            toneKey={label.showKey}
            progress={progressRatio(item)}
            watched={watched.on}
            badge={false}
            play={false}
            className="group-hover/thumb:border-foreground/25 w-full"
          >
            <CardScrim />
          </Thumb>
        </ItemLink>
        <UnwatchBadge
          name={name}
          watched={watched}
          touch
          className="absolute top-1.5 right-1.5"
        />
        <ThumbPlayButton item={item} label={name} />
        {/* The progress bar fades while these show. Touch screens show both. */}
        <CardActions
          name={name}
          watched={watched}
          favorite={favorite}
          menu={
            <ActionsMenu target={{ kind: "item", item, name }} look="card" />
          }
          touch
          className="absolute right-1 bottom-1.5 [@media(pointer:coarse)]:bottom-3"
        />
      </div>
      <div className="min-w-0 py-0.5">
        <p className="flex items-baseline gap-2">
          {code && (
            <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
              {code}
            </span>
          )}
          <ItemLink
            item={item}
            label={label.title}
            className={cn(
              textLink,
              "line-clamp-2 text-sm leading-5 sm:text-[15px]",
              label.untitled ? "font-normal" : "font-medium",
            )}
          >
            {label.title}
          </ItemLink>
        </p>
        {facts.length > 0 && (
          <p className="text-muted-foreground mt-0.5 text-[13px] leading-5 tabular-nums">
            {facts.join(" · ")}
          </p>
        )}
        <StreamLine item={item} />
        {overview && (
          <p className="text-muted-foreground mt-1.5 line-clamp-3 max-w-[72ch] text-sm leading-5 max-sm:hidden">
            {overview}
          </p>
        )}
      </div>
      {overview && (
        // Phones put the description under the still, across the row.
        <p className="text-muted-foreground col-span-2 line-clamp-3 text-[13px] leading-5 sm:hidden">
          {overview}
        </p>
      )}
    </div>
  )
}
