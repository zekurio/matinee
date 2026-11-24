import type {
  MediaItem,
  Season,
  ShelfEntry,
  TitleSummary,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useQueryClient } from "@tanstack/solid-query"
import {
  Link,
  type RegisteredRouter,
  useNavigate,
  useRouter,
} from "@tanstack/solid-router"
import { Check, Film, Play } from "lucide"
import {
  type ComponentProps,
  createMemo,
  type ParentProps,
  Show,
} from "solid-js"

import { seasonParams } from "@/components/title/seasons"
import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import {
  art,
  episodeCode,
  type ImageSource,
  itemLabel,
  landscapeSources,
  progressRatio,
  seasonName,
  timeLeft,
} from "@/lib/media"
import { pointerIntent } from "@/lib/pointer-intent"
import { errorMessage, orpc } from "@/lib/rpc"

import { Picture, tone } from "./picture"

/*
 * The cards Home shows, ported from the React app's `media-item.tsx`: an
 * episode or movie to go on with, and a movie or show by its poster. Their
 * corner menus, and the watched and favorite buttons on them, come with the
 * pages that need them; the watched check shows here as a mark.
 */

/** The round check on something watched, in the accent. */
export function WatchedBadge(props: { class?: string }) {
  return (
    <span
      role="img"
      aria-label={tr("media.watched")}
      class={cn(
        "bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full shadow-sm",
        props.class,
      )}
    >
      <Icon icon={Check} class="size-3" stroke-width="3" />
    </span>
  )
}

/**
 * The 16:9 slot for a file or title: the best image that loads over its
 * tone, with how far the person is along the bottom. `children` go over
 * the picture.
 */
export function Thumb(
  props: ParentProps<{
    sources: ImageSource[]
    toneKey: string
    /** Share of the file watched, 0 to 1. */
    progress?: number | null
    watched?: boolean
    class?: string
  }>,
) {
  return (
    <span
      class={cn(
        "relative grid aspect-video shrink-0 place-items-center overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-[border-color] group-hover/card:border-foreground/25 motion-reduce:transition-none",
        tone(props.toneKey),
        props.class,
      )}
    >
      <Icon icon={Film} class="text-muted-foreground/40 size-5" />
      <Picture sources={props.sources} />
      {/* What a pointer over the card washes over its art, as the Flutter
          cards do. */}
      <span
        aria-hidden="true"
        class="bg-foreground pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/card:opacity-[0.06] motion-reduce:transition-none"
      />
      {props.children}
      <Show when={props.watched}>
        <WatchedBadge class="absolute top-1.5 right-1.5" />
      </Show>
      <Show when={!props.watched && props.progress}>
        {(progress) => (
          <span
            aria-hidden="true"
            // Clear of the edges, the accent on a dark track, as the
            // Flutter app's `WatchProgressBar`.
            class="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-black/45"
          >
            <span
              class="bg-primary block h-full"
              style={{ width: `${Math.min(100, progress() * 100)}%` }}
            />
          </span>
        )}
      </Show>
    </span>
  )
}

export const cardClass =
  "group/card block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** Name and detail under a card, one line each. */
export function CardText(props: {
  primary: string
  secondary?: string | null
  class?: string
}) {
  return (
    <span class={cn("mt-2 block min-w-0", props.class)}>
      <span class="block truncate text-sm leading-5 font-medium">
        {props.primary}
      </span>
      <Show when={props.secondary}>
        <span class="text-muted-foreground text-13px block truncate leading-5">
          {props.secondary}
        </span>
      </Show>
    </span>
  )
}

/**
 * A link to a file's own page: the title's page for a movie, the episode
 * page for anything else.
 */
export function ItemLink(
  props: ParentProps<{
    item: MediaItem
    class?: string
    label?: string
    /** For a second link to the same page, such as a picture beside its name. */
    hidden?: boolean
  }>,
) {
  return (
    <Show
      when={props.item.title?.kind === "movie" && props.item.title}
      fallback={
        <Link
          to="/episodes/$itemId"
          params={{ itemId: props.item.id }}
          title={props.label}
          class={props.class}
          tabindex={props.hidden ? -1 : undefined}
          aria-hidden={props.hidden ? "true" : undefined}
        >
          {props.children}
        </Link>
      }
    >
      {(title) => (
        <Link
          to="/titles/$titleId"
          params={{ titleId: title().id }}
          title={props.label}
          class={props.class}
          tabindex={props.hidden ? -1 : undefined}
          aria-hidden={props.hidden ? "true" : undefined}
        >
          {props.children}
        </Link>
      )}
    </Show>
  )
}

// A name in a card's text that leads somewhere. The line clips it, so
// focus shows as an underline rather than a ring.
export const textLink =
  "decoration-foreground/40 underline-offset-2 outline-none hover:underline focus-visible:underline focus-visible:decoration-2"

// The play control in the middle of a card's picture: a bare icon while
// the card is hovered or focused, which gets a blurred circle and the
// accent once the pointer is on it. Touch screens leave it out: a tap
// opens the card's page, which has Play, as in the Android app.
export const playControl =
  "group/play absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white opacity-0 transition-opacity outline-none group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none [@media(pointer:coarse)]:hidden"

/** The inside of a {@link playControl}. */
export function PlayGlyph() {
  return (
    <>
      <span
        aria-hidden="true"
        // Blurred only while it shows. A backdrop filter costs a layer
        // even at no opacity, and a library has one of these per card:
        // 1,200 of them took six times as long to paint.
        class="absolute inset-0 rounded-full bg-black/30 opacity-0 transition-opacity group-hover/play:opacity-100 group-hover/play:backdrop-blur-md group-focus-visible/play:opacity-100 group-focus-visible/play:backdrop-blur-md motion-reduce:transition-none"
      />
      <Icon
        icon={Play}
        fill="currentColor"
        class="group-hover/play:text-primary group-focus-visible/play:text-primary relative size-6 translate-x-0.5 drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)] transition-colors motion-reduce:transition-none"
      />
    </>
  )
}

/** Play or Resume in the middle of a still, inside a `group/card`. */
export function ThumbPlayButton(props: {
  item: MediaItem
  /** Names the file for screen readers. */
  label: string
  class?: string
}) {
  const resume = () =>
    props.item.progress !== null && !props.item.progress.completed
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: props.item.id }}
      aria-label={
        resume()
          ? tr("media.resume", { name: props.label })
          : tr("media.play", { name: props.label })
      }
      class={cn(playControl, props.class)}
    >
      <PlayGlyph />
    </Link>
  )
}

/** How long the pointer rests on a play button before its title loads, in ms. */
const PLAY_AHEAD_MS = 50

/**
 * Play in the middle of a poster, for whatever the title's page would
 * play. The card doesn't know which file that is, so the button asks for
 * the title once the pointer reaches it, and the click usually finds it
 * loaded.
 */
function TitlePlayButton(props: { title: TitleSummary; class?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const options = () =>
    orpc.titles.get.queryOptions({ input: { id: props.title.id } })
  const prefetch = () => void queryClient.prefetchQuery(options())
  const pointed = pointerIntent(prefetch, () => PLAY_AHEAD_MS)
  const play = async () => {
    const name = props.title.name
    try {
      const { next } = await queryClient.fetchQuery(options())
      if (!next) {
        toast.error(tr("media.noFiles", { name }))
        return
      }
      await navigate({ to: "/watch/$itemId", params: { itemId: next.id } })
    } catch (cause) {
      toast.error(tr("media.playFailed", { name }), {
        description: errorMessage(cause),
      })
    }
  }
  return (
    <button
      type="button"
      aria-label={tr("media.play", { name: props.title.name })}
      onPointerEnter={pointed.enter}
      onPointerLeave={pointed.cancel}
      onFocus={prefetch}
      onClick={() => void play()}
      class={cn(playControl, props.class)}
    >
      <PlayGlyph />
    </button>
  )
}

/**
 * An episode or movie to start or resume, for "continue watching" and
 * "next up". The picture is the episode, the show leads the text, and the
 * episode follows. The picture and the episode open the episode's page,
 * the show its page, and the round button on the picture plays.
 */
export function EpisodeCard(props: { item: MediaItem }) {
  const label = () => itemLabel(props.item)
  const name = () => {
    const code = episodeCode(props.item)
    return code
      ? tr("media.showCodeTitle", {
          show: label().showName,
          code,
          title: label().title,
        })
      : label().title
  }
  return (
    <div class="group/card">
      <div class="relative">
        <ItemLink
          item={props.item}
          hidden
          class="block rounded-md outline-none"
        >
          <Thumb
            sources={landscapeSources(props.item)}
            toneKey={label().showKey}
            progress={progressRatio(props.item)}
            watched={props.item.progress?.completed ?? false}
            class="w-full"
          />
        </ItemLink>
        <ThumbPlayButton item={props.item} label={name()} />
      </div>
      <span class="mt-2 block min-w-0">
        <ShowEpisodeText item={props.item} />
      </span>
    </div>
  )
}

/**
 * The show, then the episode, or a movie's name and year. A file in
 * progress shows its time left in place of the year, or after the
 * episode, where the episode's name gives way first.
 */
function ShowEpisodeText(props: { item: MediaItem }) {
  const label = () => itemLabel(props.item)
  const code = () => episodeCode(props.item)
  const left = () =>
    props.item.progress && !props.item.progress.completed
      ? timeLeft(props.item)
      : null
  const episode = () => {
    const at = code()
    return at ? tr("media.codeTitle", { code: at, title: label().title }) : null
  }
  return (
    <>
      <span class="block truncate text-sm leading-5 font-medium">
        <Show
          when={code()}
          fallback={
            <ItemLink item={props.item} label={label().title} class={textLink}>
              {label().title}
            </ItemLink>
          }
        >
          <Show when={props.item.title} fallback={label().showName}>
            {(title) => (
              <Link
                to="/titles/$titleId"
                params={{ titleId: title().id }}
                title={label().show}
                class={textLink}
              >
                {label().showName}
              </Link>
            )}
          </Show>
        </Show>
      </span>
      <Show
        when={episode()}
        fallback={
          <span class="text-muted-foreground text-13px block truncate leading-5 tabular-nums">
            {left() ?? label().year}
          </span>
        }
      >
        {(text) => (
          <span class="text-muted-foreground text-13px flex min-w-0 leading-5">
            <ItemLink
              item={props.item}
              label={text()}
              class={cn(textLink, "hover:text-foreground truncate")}
            >
              {text()}
            </ItemLink>
            <Show when={left()}>
              {(time) => (
                <span class="shrink-0 whitespace-pre tabular-nums">
                  {` · ${time()}`}
                </span>
              )}
            </Show>
          </span>
        )}
      </Show>
    </>
  )
}

/**
 * A 2:3 poster, with the name on the title's tone until it or its
 * placeholder shows. `children` sit on top, like a badge.
 */
export function PosterArt(
  props: ParentProps<{
    name: string
    toneKey: string
    poster: ImageSource | null
  }>,
) {
  return (
    <span
      class={cn(
        "group-hover/card:border-foreground/25 relative grid aspect-[2/3] place-items-center overflow-hidden rounded-md border p-3 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition-[border-color] motion-reduce:transition-none",
        tone(props.toneKey),
      )}
    >
      {/* The poster, or its placeholder while it loads, covers this. It
          stays when there's no poster or it fails to load. */}
      <span
        aria-hidden="true"
        class="text-foreground/70 line-clamp-4 text-sm leading-5 font-medium text-balance"
      >
        {props.name}
      </span>
      <Show when={props.poster}>
        {(poster) => <Picture sources={[poster()]} />}
      </Show>
      <span
        aria-hidden="true"
        class="bg-foreground pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover/card:opacity-[0.06] motion-reduce:transition-none"
      />
      {props.children}
    </span>
  )
}

/** A page a {@link PosterCard} opens in place of the title's. */
type PosterTarget =
  | { kind: "episode"; item: MediaItem }
  | { kind: "season"; season: Season }

/** The address of the page a {@link PosterCard} opens. */
function posterHref(title: TitleSummary, to: PosterTarget | undefined) {
  const path = encodeURIComponent
  if (to?.kind === "season") {
    const { titleId, season } = seasonParams(title, to.season)
    return `/titles/${path(titleId)}/seasons/${path(season)}`
  }
  if (to?.kind === "episode") {
    const { item } = to
    return item.title?.kind === "movie"
      ? `/titles/${path(item.title.id)}`
      : `/episodes/${path(item.id)}`
  }
  return `/titles/${path(title.id)}`
}

/**
 * A plain anchor that does a card's part of TanStack's `Link`, which cost
 * a grid of cards more than the rest of each card did. A plain left click
 * goes through the router and any other is the browser's. Hover, focus or
 * a touch loads the page ahead, as the router's `intent` preloading does.
 * It never marks itself current: no card links to the page it's on.
 */
function CardLink(
  props: ParentProps<{ href: string; title?: string; class?: string }>,
) {
  const router = useRouter()
  // Both router calls go by `href`, so their type arguments say any path,
  // which lets `to` go unsaid.
  const preload = () => {
    if (router.options.defaultPreload !== "intent") return
    // One that fails leaves the page to load on the click.
    router
      .preloadRoute<string, string>({ href: props.href })
      .catch(() => undefined)
  }
  const pointed = pointerIntent(
    preload,
    () => router.options.defaultPreloadDelay ?? 0,
  )
  return (
    <a
      href={props.href}
      title={props.title}
      class={props.class}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.defaultPrevented
        ) {
          return
        }
        event.preventDefault()
        pointed.cancel()
        void router.navigate<RegisteredRouter, string>({ href: props.href })
      }}
      onMouseOver={pointed.enter}
      onMouseOut={(event) => {
        const to = event.relatedTarget
        if (!(to instanceof Node && event.currentTarget.contains(to))) {
          pointed.cancel()
        }
      }}
      onFocus={pointed.enter}
      onBlur={pointed.cancel}
      onTouchStart={() => {
        pointed.cancel()
        preload()
      }}
    >
      {props.children}
    </a>
  )
}

/**
 * A movie or show by its poster: the 2:3 poster, name, and year, or
 * `detail` in its place. A check marks it watched. On the poster, Play
 * starts `play`, or what the title's page would. `poster` and `to` swap in
 * another picture and page, like a season's.
 */
export function PosterCard(props: {
  title: TitleSummary
  detail?: string | null
  /** A tooltip for the card. */
  label?: string
  poster?: ImageSource | null
  to?: PosterTarget
  /** The file Play starts, when the card knows it. */
  play?: MediaItem
}) {
  const poster = () =>
    props.poster === undefined ? art(props.title.images.poster) : props.poster
  const name = () => props.label ?? props.title.name
  return (
    <div class="group/card relative">
      <CardLink
        href={posterHref(props.title, props.to)}
        title={props.label}
        class={cardClass}
      >
        <PosterArt
          name={props.title.name}
          toneKey={props.title.id}
          poster={poster()}
        />
        <CardText
          primary={props.title.name}
          secondary={
            props.detail ??
            (props.title.year ? String(props.title.year) : undefined)
          }
        />
      </CardLink>
      {/* The buttons can't sit in the link, so this box lies over the
          poster to put them on it. */}
      <div class="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        <Show
          when={props.play}
          fallback={
            <TitlePlayButton title={props.title} class="pointer-events-auto" />
          }
        >
          {(item) => (
            <ThumbPlayButton
              item={item()}
              label={name()}
              class="pointer-events-auto"
            />
          )}
        </Show>
        <Show when={props.title.watched}>
          <WatchedBadge class="absolute top-1.5 right-1.5" />
        </Show>
      </div>
    </div>
  )
}

/** What a shelf's entry shows as a {@link PosterCard}. */
function shelfCard(entry: ShelfEntry): ComponentProps<typeof PosterCard> {
  const { title, item, count, added } = entry
  const label = itemLabel(item)
  if (title.kind === "movie") {
    return { title, detail: label.year, label: label.show, play: item }
  }
  if (!added) {
    return {
      title,
      detail: tr("media.episodeCount", { count }),
      label: label.show,
    }
  }
  const { season } = added
  const poster = art(season?.poster ?? title.images.poster)
  if (added.count === 1) {
    const code = episodeCode(added.item)
    const name = itemLabel(added.item).title
    const detail = code ? tr("media.codeTitle", { code, title: name }) : name
    return {
      title,
      detail,
      label: `${label.show} · ${detail}`,
      poster,
      to: { kind: "episode", item: added.item },
      play: added.item,
    }
  }
  const fresh = tr("media.newEpisodes", { count: added.count })
  const detail = season ? `${seasonName(season.number)} · ${fresh}` : fresh
  return {
    title,
    detail,
    label: `${label.show} · ${detail}`,
    poster,
    to: season ? { kind: "season", season } : undefined,
  }
}

/**
 * A movie or show for "recently added", shown by its poster. A show that
 * got some files after the rest says which: one episode opens that
 * episode, and several in one season show the season's poster and open
 * its page.
 */
export function TitleCard(props: { entry: ShelfEntry }) {
  const card = createMemo(() => shelfCard(props.entry))
  return <PosterCard {...card()} />
}
