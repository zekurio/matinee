import type { MediaItem, Title } from "@matinee/contracts"
import { Link } from "@tanstack/solid-router"
import { Play, Star } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { ActionsMenu } from "@/components/actions-menu"
import { CrewFacts, unitList } from "@/components/credits"
import { FavoriteButton } from "@/components/favorite-button"
import { PosterArt, textLink } from "@/components/media-item"
import { Picture, tone } from "@/components/picture"
import { type useTitleWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { formatRuntime, formatScore } from "@/lib/format"
import { art, frame, mediaFlags, present, timeLeft } from "@/lib/media"

import { HeaderOverview } from "./header-overview"
import { MediaInfo } from "./media-info"
import { MatchNote } from "./title-menu"

export const headingTop =
  "pt-[max(10rem,30vh)] sm:pt-[max(4rem,calc(min(46vh,420px)-150px))]"
export const headingPoster =
  "hidden w-36 shrink-0 self-start sm:block lg:w-[180px]"

export function TitleHeader(props: {
  title: Title
  watched: ReturnType<typeof useTitleWatched>
}) {
  const sources = createMemo(() =>
    present(
      art(props.title.images.backdrop, "large"),
      props.title.next ? frame(props.title.next.id, "large") : null,
    ),
  )
  const movie = () => props.title.kind === "movie" && props.title.next
  return (
    <section aria-labelledby="title-name" class="isolate">
      <div
        aria-hidden="true"
        data-title-backdrop={sources().length ? "" : undefined}
        class={[
          "absolute inset-x-0 top-0 -z-10 h-[min(46vh,420px)] overflow-hidden",
          tone(props.title.id),
        ]}
      >
        <Picture sources={sources()} eager class="object-top" />
        <div class="from-background/95 via-background/50 max-sm:from-background/70 max-sm:via-background/25 absolute inset-0 bg-linear-to-r to-transparent" />
        <div class="from-background via-background/70 absolute inset-0 bg-linear-to-t via-40% to-transparent" />
      </div>

      <div class={["flex items-end gap-4 sm:gap-6", headingTop]}>
        <div class={headingPoster}>
          <PosterArt
            name={props.title.name}
            toneKey={props.title.id}
            poster={art(props.title.images.poster)}
          />
        </div>
        <div class="min-w-0 pb-1">
          <h1
            id="title-name"
            class="max-sm:text-30px text-2xl leading-[1.1] font-semibold tracking-tight text-balance max-sm:line-clamp-3 max-sm:leading-9 max-sm:font-bold sm:text-4xl lg:text-5xl"
          >
            {props.title.name}
          </h1>
          <Show
            when={
              props.title.originalName &&
              props.title.originalName !== props.title.name
            }
          >
            <p class="text-muted-foreground mt-1 text-sm max-sm:text-base">
              {props.title.originalName}
            </p>
          </Show>
          <TitleFacts title={props.title} />
        </div>
      </div>

      <div class="mt-4 flex max-w-4xl flex-col gap-4">
        <HeaderOverview
          tagline={props.title.tagline}
          overview={props.title.overview}
        />
        <CrewFacts title={props.title} />
        <Show when={movie()}>{(item) => <MediaInfo item={item()} />}</Show>
        <div class="mt-1 flex items-center gap-2.5">
          <Show when={props.title.next}>
            {(item) => <PlayButton item={item()} />}
          </Show>
          <Show when={props.title.itemCount > 0}>
            <WatchedButton watched={props.watched} />
          </Show>
          <FavoriteButton title={props.title} />
          <ActionsMenu
            target={{
              kind: "title",
              title: props.title,
              file: props.title.next,
            }}
            look="page"
          />
        </div>
        <MatchNote title={props.title} />
      </div>
    </section>
  )
}

function TitleFacts(props: { title: Title }) {
  const facts = createMemo(() => {
    const title = props.title
    const numbered = title.seasons.filter(
      (season) => season.number !== null && season.number > 0,
    )
    const seconds = title.next?.durationSeconds
    return [
      title.year,
      title.kind === "movie"
        ? formatRuntime(
            title.runtimeMinutes ?? (seconds ? Math.round(seconds / 60) : null),
          )
        : numbered.length > 1
          ? tr("title.seasonCount", { count: numbered.length })
          : tr("title.episodeCount", { count: title.itemCount }),
      title.kind === "show" && title.status
        ? tr(`metadata.status.${title.status}`)
        : null,
    ]
      .filter(Boolean)
      .join(" · ")
  })
  const flags = createMemo(() =>
    props.title.kind === "movie" && props.title.next
      ? mediaFlags(props.title.next)
      : [],
  )
  const rating = () =>
    props.title.rating === null ? null : formatScore(props.title.rating)
  const genres = createMemo(() =>
    unitList().formatToParts(props.title.genres.slice(0, 4)),
  )
  return (
    <>
      <div class="text-foreground/80 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <Show when={facts()}>
          <span>{facts()}</span>
        </Show>
        <Show when={props.title.contentRating}>
          <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
            {props.title.contentRating}
          </span>
        </Show>
        <Show when={rating()}>
          {(score) => (
            <span class="inline-flex items-center gap-1 tabular-nums">
              <Icon
                icon={Star}
                class="size-3.5 fill-current text-amber-500 dark:text-amber-300"
              />
              <span class="sr-only">
                {tr("title.rating", { rating: score() })}
              </span>
              <span aria-hidden="true">{score()}</span>
            </span>
          )}
        </Show>
        <For each={flags()}>
          {(flag) => (
            <span class="bg-foreground/10 text-foreground/90 rounded px-1.5 text-xs leading-5 font-medium">
              {flag}
            </span>
          )}
        </For>
      </div>
      <Show when={genres().length}>
        <p class="text-muted-foreground mt-1.5 text-sm">
          <For each={genres()} keyed={false}>
            {(part) => (
              <Show when={part().type === "element"} fallback={part().value}>
                <Link
                  to="/genres/$genre"
                  params={{ genre: part().value }}
                  class={textLink}
                >
                  {part().value}
                </Link>
              </Show>
            )}
          </For>
        </p>
      </Show>
    </>
  )
}

/**
 * Resume what's in progress, with the time left, or play the next or
 * first file. Fills the row on phones.
 */
export function PlayButton(props: { item: MediaItem }) {
  const resume = () => props.item.progress && !props.item.progress.completed
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: props.item.id }}
      class={buttonVariants({
        size: "lg",
        className: "min-w-0 max-sm:flex-1 sm:min-w-40",
      })}
    >
      <Icon icon={Play} fill="currentColor" />
      {tr(resume() ? "title.resume" : "title.play")}
      <Show when={resume() && timeLeft(props.item)}>
        {(left) => (
          <span class="truncate font-normal tabular-nums opacity-70">
            {left()}
          </span>
        )}
      </Show>
    </Link>
  )
}
