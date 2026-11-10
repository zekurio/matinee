import type {
  MediaItem,
  Season,
  ShelfEntry,
  TitleSummary,
} from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { cn } from "@matinee/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { CheckIcon, FilmIcon, PlayIcon } from "lucide-react"
import type { ReactNode } from "react"

import { tr } from "@/i18n"
import { formatBytes, formatRuntime } from "@/lib/format"
import {
  art,
  episodeCode,
  frame,
  type ImageSource,
  itemLabel,
  landscapeSources,
  progressRatio,
  streamSummary,
  timeLeft,
  seasonName,
} from "@/lib/media"
import { errorMessage, orpc } from "@/lib/rpc"
import type { WatchedState } from "@/lib/viewer-state"

import { ActionsMenu, ItemMenu } from "./actions-menu"
import { CardActions, CardScrim } from "./card-actions"
import { useItemFavorite, useTitleFavorite } from "./favorite-button"
import { Picture, tone } from "./picture"
import { seasonParams } from "./title/seasons"
import { useItemWatched, useTitleWatched } from "./watched-menu"

// Many components take these from here.
export { Picture, tone }

/**
 * The round check on something watched, in the accent like the count of
 * episodes left on a season.
 */
export function WatchedBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label={tr("media.watched")}
      className={cn(
        "bg-primary text-primary-foreground grid size-5 shrink-0 place-items-center rounded-full shadow-sm",
        className,
      )}
    >
      <CheckIcon className="size-3" strokeWidth={3} />
    </span>
  )
}

/**
 * The watched badge as a button that marks it unwatched again, for a card
 * whose picture is a link, so it sits beside the link rather than in it.
 * Without `touch`, touch screens, where a tap opens the card, get the
 * badge alone and the tap goes through to the card.
 */
export function UnwatchBadge({
  name,
  watched,
  touch = false,
  className,
}: {
  /** Names the movie, show, or episode for screen readers. */
  name: string
  watched: WatchedState
  touch?: boolean
  className?: string
}) {
  if (!watched.on) return null
  return (
    <button
      type="button"
      aria-label={tr("media.markNamedUnwatched", { name })}
      title={tr("media.markUnwatched")}
      onClick={() => watched.mark(false)}
      className={cn(
        "focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2",
        !touch && "[@media(pointer:coarse)]:pointer-events-none",
        className,
      )}
    >
      <WatchedBadge />
    </button>
  )
}

/**
 * The 16:9 slot for a file or title: the best image that loads over a
 * neutral gradient, with an optional episode pill, progress bar, and a
 * play button on hover. Turn `play` off when a real play link sits on top.
 * `children` go over the picture, under the pill and badges.
 */
export function Thumb({
  sources,
  toneKey,
  pill,
  progress,
  watched,
  badge = true,
  play = true,
  compact = false,
  className,
  children,
}: {
  sources: ImageSource[]
  toneKey: string
  pill?: ReactNode
  /** Share of the file watched, 0 to 1. */
  progress?: number | null
  watched?: boolean
  /** Draw the watched badge. Off when an `UnwatchBadge` goes over it. */
  badge?: boolean
  play?: boolean
  compact?: boolean
  className?: string
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        "relative grid aspect-video shrink-0 place-items-center overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
        tone(toneKey),
        className,
      )}
    >
      <FilmIcon className="text-muted-foreground/40 size-5" />
      <Picture sources={sources} />
      {children}
      {pill && (
        <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-4 font-medium text-zinc-100 tabular-nums">
          {pill}
        </span>
      )}
      {watched && badge && (
        <WatchedBadge className="absolute top-1.5 right-1.5" />
      )}
      {progress != null && progress > 0 && !watched && (
        <span
          aria-hidden
          // Floats clear of the edges, the accent on a dark track: flush
          // white ran into a light page. In a `group/card` it gives way to
          // the `CardActions` whenever they show.
          className={cn(
            "absolute h-1 overflow-hidden rounded-full bg-black/45 transition-opacity group-hover/card:opacity-0 group-has-[:focus-visible]/card:opacity-0 group-has-[[aria-expanded=true]]/card:opacity-0 motion-reduce:transition-none",
            compact ? "inset-x-1.5 bottom-1.5" : "inset-x-2 bottom-2",
          )}
        >
          <span
            className="bg-primary block h-full"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </span>
      )}
      {play && (
        <span
          className={cn(
            "bg-foreground text-background absolute grid place-items-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
            compact ? "size-8" : "size-9",
          )}
        >
          <PlayIcon
            className={cn(
              "translate-x-px fill-current",
              compact ? "size-3.5" : "size-4",
            )}
          />
        </span>
      )}
    </span>
  )
}

/**
 * The file's resolution, codec, audio, and subtitles in one quiet line,
 * once the server has probed it.
 */
export function StreamLine({ item }: { item: MediaItem }) {
  const summary = streamSummary(item)
  if (!summary) return null
  return (
    <span className="text-muted-foreground/70 block truncate text-xs leading-5">
      {summary}
    </span>
  )
}

/**
 * One file in a folder list, under its folder header. The whole row starts
 * playback; the "⋯" at its end marks it watched.
 */
export function MediaRow({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const watched = item.progress?.completed ?? false
  return (
    <li className="group/item relative">
      <Link
        to="/watch/$itemId"
        params={{ itemId: item.id }}
        className="group hover:bg-foreground/[0.06] focus-visible:bg-foreground/[0.06] focus-visible:ring-ring flex items-center gap-4 rounded-lg p-2 pr-12 outline-none focus-visible:ring-2 [@media(pointer:coarse)]:pr-14"
      >
        <Thumb
          sources={[frame(item.id)]}
          toneKey={label.showKey}
          progress={progressRatio(item)}
          watched={watched}
          compact
          className="w-28 sm:w-36"
        />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "line-clamp-2 text-sm leading-5 sm:line-clamp-1",
              label.untitled ? "font-normal" : "font-medium",
            )}
          >
            {label.title}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-[13px] leading-5 tabular-nums">
            {[
              label.untitled ? null : label.shortCode,
              item.progress && !watched
                ? timeLeft(item)
                : formatBytes(item.sizeBytes),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <StreamLine item={item} />
        </span>
      </Link>
      <ItemMenu
        item={item}
        label={label.title}
        className="absolute top-1/2 right-2 -translate-y-1/2"
      />
    </li>
  )
}

export const cardClass =
  "group focus-visible:ring-ring focus-visible:ring-offset-background block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"

/** Name and detail under a card, one line each. */
export function CardText({
  primary,
  secondary,
  className,
}: {
  primary: string
  secondary?: ReactNode
  className?: string
}) {
  return (
    <span className={cn("mt-2 block min-w-0", className)}>
      <span className="block truncate text-sm leading-5 font-medium">
        {primary}
      </span>
      {secondary && (
        <span className="text-muted-foreground block truncate text-[13px] leading-5">
          {secondary}
        </span>
      )}
    </span>
  )
}

/** A link to a title's page. */
function TitleLink({
  title,
  className,
  label,
  children,
}: {
  title: TitleSummary
  className?: string
  label?: string
  children: ReactNode
}) {
  return (
    <Link
      to="/titles/$titleId"
      params={{ titleId: title.id }}
      title={label}
      className={className}
    >
      {children}
    </Link>
  )
}

/**
 * A link to a file's own page: the title's page for a movie, the episode
 * page for anything else.
 */
export function ItemLink({
  item,
  className,
  label,
  hidden = false,
  children,
}: {
  item: MediaItem
  className?: string
  label?: string
  /** For a second link to the same page, such as a picture beside its name. */
  hidden?: boolean
  children: ReactNode
}) {
  const props = {
    title: label,
    className,
    tabIndex: hidden ? -1 : undefined,
    "aria-hidden": hidden || undefined,
  }
  if (item.title?.kind === "movie") {
    return (
      <Link
        to="/titles/$titleId"
        params={{ titleId: item.title.id }}
        {...props}
      >
        {children}
      </Link>
    )
  }
  return (
    <Link to="/episodes/$itemId" params={{ itemId: item.id }} {...props}>
      {children}
    </Link>
  )
}

// A name in a card's text that leads somewhere. The line clips it, so focus
// shows as an underline rather than a ring.
export const textLink =
  "decoration-foreground/40 underline-offset-2 outline-none hover:underline focus-visible:underline focus-visible:decoration-2"

// The play control in the middle of a card's picture, as Jellyfin has it:
// a bare icon while the card is hovered or focused, which gets a blurred
// circle and the accent once the pointer is on it.
const playControl =
  "group/play focus-visible:ring-ring absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white opacity-0 transition-opacity outline-none group-has-[:focus-visible]/card:opacity-100 group-hover/card:opacity-100 group-has-[[aria-expanded=true]]/card:opacity-100 focus-visible:ring-2 motion-reduce:transition-none"

/**
 * The inside of a {@link playControl}. Touch screens have no hover, so
 * where the control shows there, the circle stays.
 */
function PlayGlyph() {
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-black/30 opacity-0 backdrop-blur-md transition-opacity group-hover/play:opacity-100 group-focus-visible/play:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100"
      />
      <PlayIcon
        aria-hidden
        className="group-hover/play:text-primary group-focus-visible/play:text-primary relative size-6 translate-x-0.5 fill-current drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)] transition-colors motion-reduce:transition-none"
      />
    </>
  )
}

/**
 * Play or Resume in the middle of a still, inside a `group/card`. Pointers
 * that hover see it on hover; touch screens always do.
 */
export function ThumbPlayButton({
  item,
  label,
}: {
  item: MediaItem
  /** Names the file for screen readers. */
  label: string
}) {
  const resume = item.progress && !item.progress.completed
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: item.id }}
      aria-label={
        resume
          ? tr("media.resume", { name: label })
          : tr("media.play", { name: label })
      }
      className={cn(playControl, "[@media(pointer:coarse)]:opacity-100")}
    >
      <PlayGlyph />
    </Link>
  )
}

/**
 * Play in the middle of a poster, for whatever the title's page would
 * play. The card doesn't know which file that is, so the button asks for
 * the title once the pointer reaches it, and the click usually finds it
 * loaded.
 */
function TitlePlayButton({
  title,
  className,
}: {
  title: TitleSummary
  className?: string
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const options = orpc.titles.get.queryOptions({ input: { id: title.id } })
  const prefetch = () => void queryClient.prefetchQuery(options)
  const play = async () => {
    try {
      const { next } = await queryClient.fetchQuery(options)
      if (!next) {
        toast.error(tr("media.noFiles", { name: title.name }))
        return
      }
      await navigate({ to: "/watch/$itemId", params: { itemId: next.id } })
    } catch (cause) {
      toast.error(tr("media.playFailed", { name: title.name }), {
        description: errorMessage(cause),
      })
    }
  }
  return (
    <button
      type="button"
      aria-label={tr("media.play", { name: title.name })}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      onClick={() => void play()}
      className={cn(playControl, className)}
    >
      <PlayGlyph />
    </button>
  )
}

/**
 * An episode or movie to start or resume, for "continue watching" and
 * "next up". The picture is the episode, the show leads the text, and the
 * episode follows. The picture and the episode open the episode's page, the
 * show its page, and the round button on the picture plays. The icons in
 * the picture's corner mark it watched or a favorite.
 *
 * Without `showName`, as in a season's row, the episode leads the text and
 * its number and length follow.
 */
export function EpisodeCard({
  item,
  showName = true,
}: {
  item: MediaItem
  showName?: boolean
}) {
  const label = itemLabel(item)
  const code = episodeCode(item)
  const name = code
    ? tr("media.showCodeTitle", {
        show: label.showName,
        code,
        title: label.title,
      })
    : label.title
  const watched = useItemWatched(item)
  const favorite = useItemFavorite(item)
  return (
    <div>
      <div className="group/thumb group/card relative">
        <ItemLink item={item} hidden className="block rounded-md">
          <Thumb
            sources={landscapeSources(item)}
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
      <span className="mt-2 block min-w-0">
        {showName ? (
          <ShowEpisodeText item={item} />
        ) : (
          <EpisodeText item={item} />
        )}
      </span>
    </div>
  )
}

/**
 * The show, then the episode, or a movie's name and year. A file in
 * progress shows its time left in place of the year, or after the episode,
 * where the episode's name gives way first.
 */
function ShowEpisodeText({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const code = episodeCode(item)
  const left = item.progress && !item.progress.completed ? timeLeft(item) : null
  const episode = code
    ? tr("media.codeTitle", { code, title: label.title })
    : null
  return (
    <>
      <span className="block truncate text-sm leading-5 font-medium">
        {code && item.title ? (
          <TitleLink title={item.title} label={label.show} className={textLink}>
            {label.showName}
          </TitleLink>
        ) : code ? (
          label.showName
        ) : (
          <ItemLink item={item} label={label.title} className={textLink}>
            {label.title}
          </ItemLink>
        )}
      </span>
      {episode ? (
        <span className="text-muted-foreground flex min-w-0 text-[13px] leading-5">
          <ItemLink
            item={item}
            label={episode}
            className={cn(textLink, "hover:text-foreground truncate")}
          >
            {episode}
          </ItemLink>
          {left && (
            <span className="shrink-0 whitespace-pre tabular-nums">
              {` · ${left}`}
            </span>
          )}
        </span>
      ) : (
        <span className="text-muted-foreground block truncate text-[13px] leading-5 tabular-nums">
          {left ?? label.year}
        </span>
      )}
    </>
  )
}

/** The episode's name, then "Episode 4 · 24m" or the time left. */
function EpisodeText({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const resume = item.progress && !item.progress.completed
  const number =
    item.episodeNumber === null
      ? null
      : item.seasonNumber === 0
        ? tr("media.special", { number: String(item.episodeNumber) })
        : tr("media.episode", { number: String(item.episodeNumber) })
  const detail = [
    number,
    resume
      ? timeLeft(item)
      : formatRuntime(
          item.episode?.runtimeMinutes ??
            (item.durationSeconds
              ? Math.round(item.durationSeconds / 60)
              : null),
        ),
  ].filter(Boolean)
  return (
    <>
      <span
        className={cn(
          "block truncate text-sm leading-5",
          label.untitled ? "font-normal" : "font-medium",
        )}
      >
        <ItemLink item={item} label={label.title} className={textLink}>
          {label.title}
        </ItemLink>
      </span>
      {detail.length > 0 && (
        <span className="text-muted-foreground block truncate text-[13px] leading-5 tabular-nums">
          {detail.join(" · ")}
        </span>
      )}
    </>
  )
}

/**
 * A movie or show for "recently added", shown by its poster. A show that
 * got some files after the rest says which: one episode opens that
 * episode, and several in one season show the season's poster and open
 * its page. The watched and favorite icons stay the show's.
 */
export function TitleCard({ entry }: { entry: ShelfEntry }) {
  const { title, item, count, added } = entry
  const label = itemLabel(item)
  if (title.kind === "movie") {
    return (
      <PosterCard
        title={title}
        detail={label.year}
        label={label.show}
        play={item}
      />
    )
  }
  if (!added) {
    return (
      <PosterCard
        title={title}
        detail={tr("media.episodeCount", { count })}
        label={label.show}
      />
    )
  }
  const { season } = added
  const poster = art(season?.poster ?? title.images.poster)
  if (added.count === 1) {
    const code = episodeCode(added.item)
    const name = itemLabel(added.item).title
    const detail = code ? tr("media.codeTitle", { code, title: name }) : name
    return (
      <PosterCard
        title={title}
        detail={detail}
        label={`${label.show} · ${detail}`}
        poster={poster}
        to={{ kind: "episode", item: added.item }}
        play={added.item}
      />
    )
  }
  const fresh = tr("media.newEpisodes", { count: added.count })
  const detail = season ? `${seasonName(season.number)} · ${fresh}` : fresh
  return (
    <PosterCard
      title={title}
      detail={detail}
      label={`${label.show} · ${detail}`}
      poster={poster}
      to={season ? { kind: "season", season } : undefined}
    />
  )
}

/**
 * A 2:3 poster, with the name on the title's tone until it or its
 * placeholder shows. `children` sit on top, like a badge.
 */
export function PosterArt({
  name,
  toneKey,
  poster,
  children,
}: {
  name: string
  toneKey: string
  poster: ImageSource | null
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        "group-hover:border-foreground/25 group-hover/card:border-foreground/25 relative grid aspect-[2/3] place-items-center overflow-hidden rounded-md border p-3 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
        tone(toneKey),
      )}
    >
      {/* The poster, or its placeholder while it loads, covers this. It
          stays when there's no poster or it fails to load. */}
      <span
        aria-hidden
        className="text-foreground/70 line-clamp-4 text-sm leading-5 font-medium text-balance"
      >
        {name}
      </span>
      {poster && <Picture sources={[poster]} />}
      {children}
    </span>
  )
}

/**
 * Columns for a grid of {@link PosterCard}s: two on phones, then as many
 * as fit at 11rem or more each.
 */
export const posterGrid =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"

/** A page a {@link PosterCard} opens in place of the title's. */
type PosterTarget =
  | { kind: "episode"; item: MediaItem }
  | { kind: "season"; season: Season }

/** The link around a {@link PosterCard}'s poster and text. */
function PosterLink({
  title,
  to,
  label,
  children,
}: {
  title: TitleSummary
  to?: PosterTarget
  label?: string
  children: ReactNode
}) {
  if (to?.kind === "episode") {
    return (
      <ItemLink item={to.item} label={label} className={cardClass}>
        {children}
      </ItemLink>
    )
  }
  if (to?.kind === "season") {
    return (
      <Link
        to="/titles/$titleId/seasons/$season"
        params={seasonParams(title, to.season)}
        title={label}
        className={cardClass}
      >
        {children}
      </Link>
    )
  }
  return (
    <TitleLink title={title} label={label} className={cardClass}>
      {children}
    </TitleLink>
  )
}

/**
 * A movie or show in a grid: the 2:3 poster, name, and year, or `detail`
 * in its place. A check marks it watched. On the poster, Play starts
 * `play`, or what the title's page would, and icons mark it watched or a
 * favorite. `poster` and `to` swap in another picture and page, like a
 * season's.
 */
export function PosterCard({
  title,
  detail,
  label,
  poster = art(title.images.poster),
  to,
  play,
}: {
  title: TitleSummary
  detail?: string | null
  /** A tooltip for the card. */
  label?: string
  poster?: ImageSource | null
  to?: PosterTarget
  /** The file Play starts, when the card knows it. */
  play?: MediaItem
}) {
  const watched = useTitleWatched(title)
  const favorite = useTitleFavorite(title)
  // Touch screens open the card with a tap, so they get no buttons on it.
  const playClass = "pointer-events-auto [@media(pointer:coarse)]:hidden"
  return (
    <div className="group/card relative">
      <PosterLink title={title} to={to} label={label}>
        <PosterArt name={title.name} toneKey={title.id} poster={poster}>
          <CardScrim />
        </PosterArt>
        <CardText
          primary={title.name}
          secondary={detail ?? (title.year ? String(title.year) : undefined)}
        />
      </PosterLink>
      {/* The buttons can't sit in the link, so this box lies over the
          poster to put them on it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        {play ? (
          <Link
            to="/watch/$itemId"
            params={{ itemId: play.id }}
            aria-label={
              play.progress && !play.progress.completed
                ? tr("media.resume", { name: label ?? title.name })
                : tr("media.play", { name: label ?? title.name })
            }
            className={cn(playControl, playClass)}
          >
            <PlayGlyph />
          </Link>
        ) : (
          <TitlePlayButton title={title} className={playClass} />
        )}
        <UnwatchBadge
          name={title.name}
          watched={watched}
          className="pointer-events-auto absolute top-1.5 right-1.5"
        />
        <CardActions
          name={title.name}
          watched={watched}
          favorite={favorite}
          menu={
            <ActionsMenu
              target={{ kind: "title", title, file: play }}
              look="card"
            />
          }
          className="pointer-events-auto absolute right-1 bottom-1"
        />
      </div>
    </div>
  )
}
