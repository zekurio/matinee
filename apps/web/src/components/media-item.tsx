import {
  mediaThumbnailPath,
  type MediaItem,
  type ShelfEntry,
  type TitleSummary,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { CheckIcon, FilmIcon, PlayIcon } from "lucide-react"
import { type ReactNode, useState } from "react"

import { formatBytes, formatShortDate } from "@/lib/format"
import {
  art,
  episodeCode,
  itemLabel,
  landscapeSources,
  progressRatio,
  streamSummary,
  timeLeft,
} from "@/lib/media"

import { ItemMenu } from "./watched-menu"

// Neutral steps far enough apart that neighbouring shows look different.
const TONES = [
  "bg-gradient-to-br from-[#26262a] to-[#1a1a1d]",
  "bg-gradient-to-tr from-[#2b2b2f] to-[#1e1e21]",
  "bg-gradient-to-b from-[#303035] to-[#1c1c1f]",
  "bg-gradient-to-bl from-[#2d2d32] to-[#202023]",
]

export function tone(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TONES[Math.abs(hash) % TONES.length] ?? TONES[0]!
}

/**
 * The first of `sources` that loads, faded in over whatever sits beneath
 * it. Nothing while loading or when every source fails.
 */
export function Picture({
  sources,
  className,
  eager = false,
}: {
  sources: string[]
  className?: string
  eager?: boolean
}) {
  const key = sources.join("|")
  const [state, setState] = useState({ key, index: 0, ready: false })
  // New sources start over, without an effect and a flash of the old image.
  const current = state.key === key ? state : { key, index: 0, ready: false }
  const src = sources[current.index]
  if (!src) return null
  return (
    <img
      key={src}
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onLoad={() => setState({ ...current, ready: true })}
      onError={() =>
        setState({ ...current, index: current.index + 1, ready: false })
      }
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-300 motion-reduce:transition-none",
        current.ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  )
}

/** The round check on a watched file. */
export function WatchedBadge({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Watched"
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full bg-black/70 text-white",
        className,
      )}
    >
      <CheckIcon className="size-3" />
    </span>
  )
}

/**
 * The 16:9 slot for a file or title: the best image that loads over a
 * neutral gradient, with an optional logo, episode pill, progress bar, and
 * a play button on hover.
 */
export function Thumb({
  sources,
  toneKey,
  logo,
  pill,
  progress,
  watched,
  compact = false,
  play = true,
  className,
}: {
  sources: string[]
  toneKey: string
  /** The title's logo, laid over the bottom of the image. */
  logo?: string | null
  pill?: ReactNode
  /** Share of the file watched, 0 to 1. */
  progress?: number | null
  watched?: boolean
  compact?: boolean
  play?: boolean
  className?: string
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
      {logo && (
        <>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent"
          />
          <img
            src={logo}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute bottom-[9%] left-[6%] max-h-[32%] max-w-[55%] object-contain object-left-bottom drop-shadow-[0_1px_8px_rgb(0_0_0/0.5)]"
          />
        </>
      )}
      {pill && (
        <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] leading-4 font-medium text-zinc-100 tabular-nums">
          {pill}
        </span>
      )}
      {watched && <WatchedBadge className="absolute top-1.5 right-1.5" />}
      {progress != null && progress > 0 && !watched && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 bg-white/25"
        >
          <span
            className="block h-full bg-white"
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
        className="group hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-ring flex items-center gap-4 rounded-lg p-2 pr-12 outline-none focus-visible:ring-2 [@media(pointer:coarse)]:pr-14"
      >
        <Thumb
          sources={[mediaThumbnailPath(item.id)]}
          toneKey={label.showKey}
          progress={progressRatio(item)}
          watched={watched}
          compact
          className="w-24 sm:w-28"
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

const cardClass =
  "group focus-visible:ring-ring focus-visible:ring-offset-background block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"

/** Name and detail under a card, one line each. */
function CardText({
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

/**
 * A title's page. Folders in an `other` library open the folder view, or
 * play straight away when the "folder" is a lone file.
 */
export function TitleLink({
  title,
  item,
  className,
  label,
  children,
}: {
  title: TitleSummary
  /** The title's first file. */
  item: MediaItem
  className?: string
  label?: string
  children: ReactNode
}) {
  if (title.kind === "folder") {
    const slash = item.relativePath.indexOf("/")
    if (slash < 0) {
      return (
        <Link
          to="/watch/$itemId"
          params={{ itemId: item.id }}
          title={label}
          className={className}
        >
          {children}
        </Link>
      )
    }
    return (
      <Link
        to="/libraries/$libraryId"
        params={{ libraryId: title.libraryId }}
        search={{ show: item.relativePath.slice(0, slash) }}
        title={label}
        className={className}
      >
        {children}
      </Link>
    )
  }
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
 * An episode or movie to start or resume, for "continue watching" and
 * "next up". The picture is the episode, the show leads the text, and the
 * episode follows. The "⋯" beside the text marks it watched.
 */
export function EpisodeCard({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const code = episodeCode(item)
  const resume = item.progress && !item.progress.completed
  const name = code ? `${label.showName}, ${code}: ${label.title}` : label.title
  return (
    <div className="group/item relative">
      <Link
        to="/watch/$itemId"
        params={{ itemId: item.id }}
        title={name}
        className={cardClass}
      >
        <Thumb
          sources={landscapeSources(item)}
          toneKey={label.showKey}
          progress={progressRatio(item)}
          watched={item.progress?.completed}
          className="group-hover:border-foreground/25 w-full"
        />
        <CardText
          primary={code ? label.showName : label.title}
          secondary={
            code
              ? `${code}: ${label.title}`
              : ((resume ? timeLeft(item) : label.year) ?? undefined)
          }
          className="pr-9 [@media(pointer:coarse)]:pr-11"
        />
      </Link>
      {/* Beside the first line of text. A top margin in percent follows the
          card's width, so 56.25% clears the 16:9 picture. */}
      <ItemMenu
        item={item}
        label={name}
        className="absolute top-0 right-0 mt-[calc(56.25%+2px)] [@media(pointer:coarse)]:mt-[56.25%]"
      />
    </div>
  )
}

/**
 * A movie, show, or folder for "recently added": its backdrop with the logo
 * over it, falling back to a frame from its first file.
 */
export function TitleCard({
  entry,
  noun,
}: {
  entry: ShelfEntry
  /** What the files are: "episode", "video". */
  noun: string
}) {
  const { title, item, count, addedAt } = entry
  const label = itemLabel(item)
  const backdrop = art(title.images.backdrop)
  const sources = [...(backdrop ? [backdrop] : []), mediaThumbnailPath(item.id)]
  const detail =
    title.kind === "movie"
      ? label.year
      : `${count} ${noun}${count === 1 ? "" : "s"} · added ${formatShortDate(addedAt)}`
  return (
    <TitleLink
      title={title}
      item={item}
      label={label.show}
      className={cardClass}
    >
      <Thumb
        sources={sources}
        toneKey={label.showKey}
        logo={art(title.images.logo)}
        play={false}
        watched={title.kind === "movie" && item.progress?.completed}
        className="group-hover:border-foreground/25 w-full"
      />
      <CardText primary={title.name} secondary={detail ?? undefined} />
    </TitleLink>
  )
}

/** A movie or show in a library grid: the 2:3 poster, name, and year. */
export function PosterCard({ title }: { title: TitleSummary }) {
  const poster = art(title.images.poster)
  return (
    <Link
      to="/titles/$titleId"
      params={{ titleId: title.id }}
      className={cardClass}
    >
      <span
        className={cn(
          "group-hover:border-foreground/25 relative grid aspect-[2/3] place-items-center overflow-hidden rounded-md border p-3 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
          tone(title.id),
        )}
      >
        {/* Shows until the poster loads, and stays if there is none. */}
        <span
          aria-hidden
          className="text-foreground/70 line-clamp-4 text-sm leading-5 font-medium text-balance"
        >
          {title.name}
        </span>
        {poster && <Picture sources={[poster]} />}
      </span>
      <CardText
        primary={title.name}
        secondary={title.year ? String(title.year) : undefined}
      />
    </Link>
  )
}
