import type {
  Artwork,
  MediaItem,
  Title,
  TitleSummary,
} from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { PlayIcon, StarIcon } from "lucide-react"

import { ActionsMenu } from "@/components/actions-menu"
import { pageBleed, pageColumn } from "@/components/app-shell"
import { CrewFacts, listNodes, unitList } from "@/components/credits"
import { FavoriteButton } from "@/components/favorite-button"
import { Picture, textLink, tone } from "@/components/media-item"
import { MediaInfo } from "@/components/title/media-info"
import { useTitleWatched, WatchedButton } from "@/components/watched-menu"
import { perLocale, tr } from "@/i18n"
import { formatRuntime } from "@/lib/format"
import {
  art,
  episodeCode,
  type ImageSource,
  mediaFlags,
  timeLeft,
} from "@/lib/media"

import { HeaderOverview } from "./header-overview"
import { MatchNote } from "./title-menu"

// A rating out of ten, with one decimal: "7.5".
const ratings = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

/**
 * The top of the page: the backdrop across the window, the poster, and the
 * title's name, facts, description, and Play.
 */
/** The tick beside Play, for every file of the title. */
function TitleWatchedButton({ title }: { title: Title }) {
  return <WatchedButton watched={useTitleWatched(title)} />
}

export function TitleHeader({ title }: { title: Title }) {
  const runtime =
    title.kind === "movie"
      ? formatRuntime(
          title.runtimeMinutes ??
            (title.next?.durationSeconds
              ? Math.round(title.next.durationSeconds / 60)
              : null),
        )
      : null
  const numbered = title.seasons.filter(
    (s) => s.number !== null && s.number > 0,
  )
  const facts = [
    title.year ? String(title.year) : null,
    runtime,
    title.kind === "show"
      ? numbered.length > 1
        ? tr("title.seasonCount", { count: numbered.length })
        : tr("title.episodeCount", { count: title.itemCount })
      : null,
    title.kind === "show" ? title.status : null,
  ].filter(Boolean)
  // A show's episodes can differ, so only a movie's file speaks for the title.
  const flags =
    title.kind === "movie" && title.next ? mediaFlags(title.next) : []

  return (
    <section className={pageBleed} aria-labelledby="title-name">
      <HeaderBackdrop title={title} />

      {/* Phones leave the poster out, for the name to have the width, and
          start lower, for more of the backdrop. Seasons keep theirs. */}
      <div className={cn(headerColumn, "max-sm:pt-[max(10rem,30vh)]")}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch sm:gap-8">
          <HeaderPoster
            name={title.name}
            toneKey={title.id}
            poster={art(title.images.poster)}
            className="max-sm:hidden"
          />

          {/* As tall as the poster, so the name lines up with its top and
              the buttons with its bottom. Phones stack its two parts. */}
          <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
            <div className="min-w-0">
              <TitleName title={title} />

              <div className="text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                {facts.length > 0 && <span>{facts.join(" · ")}</span>}
                {title.contentRating && (
                  <span className="border-foreground/25 rounded border px-1.5 text-xs leading-5">
                    {title.contentRating}
                  </span>
                )}
                {title.rating !== null && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <StarIcon
                      aria-hidden
                      className="size-3.5 fill-current text-amber-300"
                    />
                    <span className="sr-only">
                      {tr("title.rating", {
                        rating: ratings().format(title.rating),
                      })}
                    </span>
                    <span aria-hidden>{ratings().format(title.rating)}</span>
                  </span>
                )}
                {flags.map((flag) => (
                  <span
                    key={flag}
                    className="bg-foreground/10 text-foreground/90 rounded px-1.5 text-xs leading-5 font-medium"
                  >
                    {flag}
                  </span>
                ))}
              </div>
              {title.genres.length > 0 && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {listNodes(
                    unitList(),
                    title.genres.slice(0, 4).map((genre) => (
                      <Link
                        key={genre}
                        to="/genres/$genre"
                        params={{ genre }}
                        className={cn(textLink, "hover:text-foreground")}
                      >
                        {genre}
                      </Link>
                    )),
                  )}
                </p>
              )}
            </div>

            <div className="col-span-2 min-w-0 sm:flex sm:flex-1 sm:flex-col">
              <HeaderOverview
                name={title.name}
                tagline={title.tagline}
                overview={title.overview}
                className="sm:mt-4"
              />
              <CrewFacts title={title} className="mt-4" />
              {/* A movie's file. A show's differ by episode. */}
              {title.kind === "movie" && title.next && (
                <MediaInfo item={title.next} className="mt-4" />
              )}

              <div className="pt-6 sm:mt-auto">
                <div className="flex items-center gap-2">
                  <PlayButton item={title.next} code={title.kind === "show"} />
                  {title.itemCount > 0 && <TitleWatchedButton title={title} />}
                  <FavoriteButton title={title} />
                  <ActionsMenu
                    target={{ kind: "title", title, file: title.next }}
                    look="page"
                  />
                </div>
                <MatchNote title={title} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * The title's backdrop across the top of the window, fading into the
 * page. Without one, its poster, blurred, keeps the page from going flat.
 */
export function HeaderBackdrop({
  title,
  poster = title.images.poster,
}: {
  title: TitleSummary
  /** Blurred in when the title has no backdrop. */
  poster?: Artwork | null
}) {
  const backdrop = art(title.images.backdrop, "large")
  const blurred = art(poster)
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-x-0 top-0 h-[min(46vh,420px)] overflow-hidden sm:h-[min(54vh,520px)]",
        tone(title.id),
      )}
    >
      {backdrop ? (
        <Picture sources={[backdrop]} eager className="object-top" />
      ) : (
        blurred && (
          <div className="absolute inset-0 opacity-50">
            <Picture sources={[blurred]} eager className="scale-110 blur-2xl" />
          </div>
        )
      )}
      <div className="from-background/95 via-background/50 absolute inset-0 bg-gradient-to-r to-transparent" />
      <div className="from-background via-background/70 absolute inset-0 bg-gradient-to-t via-40% to-transparent" />
    </div>
  )
}

// High enough that two rows (seasons, cast) make the first screen too.
export const headerColumn = cn(
  pageColumn,
  "relative pt-[max(7rem,20vh)] sm:pt-[max(8rem,14vh)]",
)

// A season's: on phones, a small poster beside the name and facts, and the
// rest under both, full width. From `sm` up: the poster beside it all.
export const headerRow =
  "grid grid-cols-[6rem_minmax(0,1fr)] items-end gap-x-4 gap-y-5 sm:flex sm:items-stretch sm:gap-8"

/**
 * The poster beside a header's details, always 2:3. It sets the header's
 * height; the details fit beside it. Shows the name until the poster
 * loads, or when there's none.
 */
export function HeaderPoster({
  name,
  toneKey,
  poster,
  className,
}: {
  name: string
  toneKey: string
  poster: ImageSource | null
  className?: string
}) {
  return (
    <div
      className={cn(
        "relative grid aspect-[2/3] w-24 shrink-0 place-items-center overflow-hidden rounded-lg border p-2 text-center shadow-2xl shadow-black/60 sm:w-48 sm:self-start sm:p-3 lg:w-56 2xl:w-64",
        tone(toneKey),
        className,
      )}
    >
      <span
        aria-hidden
        className="text-foreground/70 line-clamp-5 text-xs font-medium text-balance sm:text-sm"
      >
        {name}
      </span>
      {poster && (
        <Picture
          sources={[poster]}
          eager
          sizes="(min-width: 1536px) 256px, (min-width: 1024px) 224px, (min-width: 640px) 192px, 96px"
        />
      )}
    </div>
  )
}

/**
 * The name and the original name. Text rather than the logo: a tall logo
 * pushed everything around.
 */
function TitleName({ title }: { title: Title }) {
  return (
    <>
      <h1
        id="title-name"
        className="-mt-1 text-2xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
      >
        {title.name}
      </h1>
      {title.originalName && (
        <p className="text-muted-foreground mt-1 text-sm">
          {title.originalName}
        </p>
      )}
    </>
  )
}

/**
 * Resume what's in progress, or play the next or first file. `code` adds
 * the episode's number. Fills the row on phones.
 */
export function PlayButton({
  item,
  code,
}: {
  item: MediaItem | null | undefined
  code: boolean
}) {
  if (!item) return null
  const resume = item.progress && !item.progress.completed
  const detail = [
    code ? episodeCode(item) : null,
    resume ? timeLeft(item) : null,
  ].filter(Boolean)
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: item.id }}
      className={buttonVariants({
        size: "lg",
        className: "min-w-0 max-sm:h-11 max-sm:flex-1",
      })}
    >
      <PlayIcon className="fill-current" />
      {resume ? tr("title.resume") : tr("title.play")}
      {detail.length > 0 && (
        <span className="truncate font-normal tabular-nums opacity-70">
          {detail.join(" · ")}
        </span>
      )}
    </Link>
  )
}
