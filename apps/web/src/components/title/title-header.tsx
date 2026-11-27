import type { MediaItem, Title } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { Link } from "@tanstack/solid-router"
import { Play } from "lucide"
import { createMemo, For, Show } from "solid-js"

import { ActionsMenu } from "@/components/actions-menu"
import { FavoriteButton } from "@/components/favorite-button"
import { PosterArt } from "@/components/media-item"
import { Picture, tone } from "@/components/picture"
import { type useTitleWatched, WatchedButton } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { formatRuntime } from "@/lib/format"
import {
  art,
  frame,
  type ImageSource,
  mediaFlags,
  present,
  timeLeft,
} from "@/lib/media"

import { HeaderOverview } from "./header-overview"
import { MediaInfo } from "./media-info"
import { Score } from "./score"
import { releasedOn, TitleDetails } from "./title-details"
import { MatchNote } from "./title-menu"

export const headingTop =
  "pt-[max(10rem,30vh)] sm:pt-[max(4rem,calc(min(46vh,420px)-150px))]"
export const headingPoster =
  "hidden w-36 shrink-0 self-start sm:block lg:w-[180px]"
/**
 * A library title's poster, larger than the catalog's, beside everything
 * else on the page as Jellyfin has it. Its column starts lower, so the
 * name sits at the foot of the backdrop.
 */
export const titlePoster =
  "hidden w-44 shrink-0 self-start sm:block lg:w-60 xl:w-72"
/** An episode's still in the poster's place, wider and as high up. */
export const titleStill =
  "hidden w-56 shrink-0 self-start sm:block md:w-72 lg:w-96 xl:w-[28rem]"
export const titleColumnTop = "sm:pt-24 lg:pt-28"
/**
 * A library title's backdrop: 16:9 on phones, so the details start
 * nearer the top, and the name just inside its foot.
 */
export const titleBackdrop =
  "aspect-video sm:aspect-auto sm:h-[min(46vh,420px)]"
export const titleTop =
  "pt-[calc(56.25vw-2rem)] sm:pt-[max(4rem,calc(min(46vh,420px)-150px))]"

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
    <DetailHero
      labelledBy="title-name"
      toneKey={props.title.id}
      backdrop={sources()}
      artClass={titlePoster}
      art={
        <PosterArt
          name={props.title.name}
          toneKey={props.title.id}
          poster={art(props.title.images.poster)}
        />
      }
    >
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
      <div class={heroActions}>
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
      <div class={heroBody}>
        <Show when={movie()}>{(item) => <MediaInfo item={item()} />}</Show>
        <OverviewAndDetails
          tagline={props.title.tagline}
          overview={props.title.overview}
          details={
            <TitleDetails
              genres={props.title.genres}
              studios={props.title.studios}
              credits={props.title.credits}
              dates={releasedOn(props.title.releaseDate)}
            />
          }
        />
        <MatchNote title={props.title} />
      </div>
    </DetailHero>
  )
}

/** The buttons under a hero's facts. */
export const heroActions = "mt-5 flex items-center gap-2.5"
/** What follows them: the file, the overview, and the details. */
export const heroBody = "mt-6 flex max-w-6xl flex-col gap-5"

/**
 * The top of a library page as Jellyfin lays it out, shared by a title,
 * a season, and an episode: the backdrop across the window, and from `sm`
 * up the art beside the name, facts, and actions, with the rest under
 * them. Phones leave the art out, as the backdrop shows above.
 */
export function DetailHero(props: {
  /** The id of the page's heading. */
  labelledBy: string
  toneKey: string
  backdrop: ImageSource[]
  /** What shows when there's no backdrop, or none loads. */
  backdropFallback?: JSX.Element
  /** The poster or the still, in a column `artClass` sizes. */
  art: JSX.Element
  artClass: string
  children: JSX.Element
}) {
  return (
    <section aria-labelledby={props.labelledBy} class="isolate">
      <div
        aria-hidden="true"
        data-title-backdrop={props.backdrop.length ? "" : undefined}
        class={[
          "absolute inset-x-0 top-0 -z-10 overflow-hidden",
          titleBackdrop,
          tone(props.toneKey),
        ]}
      >
        <Picture
          sources={props.backdrop}
          eager
          class="object-top"
          fallback={props.backdropFallback}
        />
        <div class="from-background/95 via-background/50 max-sm:from-background/70 max-sm:via-background/25 absolute inset-0 bg-linear-to-r to-transparent" />
        <div class="from-background via-background/70 absolute inset-0 bg-linear-to-t via-40% to-transparent" />
      </div>

      <div class={["flex gap-6 lg:gap-10", titleTop]}>
        <div class={props.artClass}>{props.art}</div>
        <div class={["min-w-0 flex-1", titleColumnTop]}>{props.children}</div>
      </div>
    </section>
  )
}

/**
 * The overview, and the table of details beside it once there's room,
 * under it until then.
 */
export function OverviewAndDetails(props: {
  tagline: string | null
  overview: string | null
  details: JSX.Element
}) {
  return (
    <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-10">
      <div class="min-w-0 xl:flex-1">
        <HeaderOverview
          tagline={props.tagline}
          overview={props.overview}
          lines={6}
        />
      </div>
      <div class="xl:w-80 xl:shrink-0 2xl:w-96">{props.details}</div>
    </div>
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
  return (
    <div class="text-foreground/80 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
      <Show when={facts()}>
        <span>{facts()}</span>
      </Show>
      <Show when={props.title.contentRating}>
        <span class="border-foreground/25 rounded border px-1.5 text-xs leading-5">
          {props.title.contentRating}
        </span>
      </Show>
      <Score score={props.title.rating} />
      <For each={flags()}>
        {(flag) => (
          <span class="bg-foreground/10 text-foreground/90 rounded px-1.5 text-xs leading-5 font-medium">
            {flag}
          </span>
        )}
      </For>
    </div>
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
          <span class="truncate font-normal opacity-70">{left()}</span>
        )}
      </Show>
    </Link>
  )
}
