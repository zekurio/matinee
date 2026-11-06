import type { MediaItem, Season, Title } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  EllipsisIcon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"
import { useEffect, useState } from "react"
import { z } from "zod"

import { chipClass, chipRow } from "@/components/chips"
import {
  IdentifyDialog,
  invalidateTitleData,
} from "@/components/identify-dialog"
import { Picture, Thumb, tone } from "@/components/media-item"
import { formatBytes, formatDate } from "@/lib/format"
import {
  art,
  episodeCode,
  itemLabel,
  landscapeSources,
  progressRatio,
  timeLeft,
} from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"

// Files without a season number, in the URL.
const NO_SEASON = -1

const TitleSearch = z.object({
  season: z.coerce.number().int().min(NO_SEASON).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/titles/$titleId")({
  validateSearch: TitleSearch,
  component: TitlePage,
})

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

function formatRuntime(minutes: number | null): string | null {
  if (!minutes) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`
}

function TitlePage() {
  const { titleId } = Route.useParams()
  const title = useQuery(
    orpc.titles.get.queryOptions({ input: { id: titleId } }),
  )

  useEffect(() => {
    if (title.data) document.title = `${title.data.name} · Matinee`
    return () => {
      document.title = "Matinee"
    }
  }, [title.data])

  if (title.isPending) return <TitleSkeleton />
  if (!title.data) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Couldn't load this title
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(title.error)}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          Back to Home
        </Link>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-10">
      <TitleHeader title={title.data} />
      {title.data.kind === "show" ? (
        <Episodes title={title.data} />
      ) : (
        <Files title={title.data} />
      )}
    </div>
  )
}

const bleed =
  "relative left-1/2 -mt-[calc(env(safe-area-inset-top)+1.5rem)] w-screen -translate-x-1/2 sm:-mt-24"

function TitleSkeleton() {
  return (
    <div className={bleed}>
      <Skeleton className="h-[min(56vh,520px)] w-full rounded-none" />
      <div className="mx-auto -mt-40 flex max-w-6xl gap-8 px-4 sm:px-6 lg:px-8">
        <Skeleton className="aspect-[2/3] w-32 shrink-0 rounded-lg sm:w-48 lg:w-56" />
        <div className="flex-1 pt-24">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-4 w-1/3" />
          <Skeleton className="mt-6 h-16 w-full max-w-xl" />
        </div>
      </div>
    </div>
  )
}

/**
 * The top of the page: the backdrop across the window, the poster, and the
 * title's name, facts, description, and Play.
 */
function TitleHeader({ title }: { title: Title }) {
  const backdrop = art(title.images.backdrop, "large")
  const poster = art(title.images.poster)
  const logo = art(title.images.logo, "large")
  const [logoFailed, setLogoFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)
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
        ? plural(numbered.length, "season")
        : plural(title.itemCount, "episode")
      : null,
    title.kind === "show" ? title.status : null,
  ].filter(Boolean)

  return (
    <section className={bleed} aria-labelledby="title-name">
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[min(64vh,600px)] overflow-hidden",
          tone(title.id),
        )}
      >
        {backdrop ? (
          <Picture sources={[backdrop]} eager className="object-top" />
        ) : (
          poster && (
            // No backdrop: the poster, blurred, keeps the page from going flat.
            <Picture
              sources={[poster]}
              eager
              className="scale-110 opacity-50 blur-2xl"
            />
          )
        )}
        <div className="from-background/95 via-background/50 absolute inset-0 bg-gradient-to-r to-transparent" />
        <div className="from-background via-background/70 absolute inset-0 bg-gradient-to-t via-40% to-transparent" />
      </div>

      <div className="relative mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-[max(9rem,30vh)] sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:pt-[max(12rem,32vh)] lg:px-8">
        <div
          className={cn(
            "relative grid aspect-[2/3] w-32 shrink-0 place-items-center overflow-hidden rounded-lg border p-3 text-center shadow-2xl shadow-black/60 sm:w-48 lg:w-56",
            tone(title.id),
          )}
        >
          <span
            aria-hidden
            className="text-foreground/70 line-clamp-5 text-sm font-medium text-balance"
          >
            {title.name}
          </span>
          {poster && <Picture sources={[poster]} eager />}
        </div>

        <div className="min-w-0 flex-1 sm:pb-1">
          <BackToLibrary title={title} />
          {logo && !logoFailed ? (
            <h1 id="title-name" className="mt-2">
              <span className="sr-only">{title.name}</span>
              <img
                src={logo}
                alt=""
                onError={() => setLogoFailed(true)}
                className="max-h-24 max-w-[min(100%,28rem)] object-contain object-left-bottom drop-shadow-[0_2px_12px_rgb(0_0_0/0.5)] sm:max-h-32"
              />
            </h1>
          ) : (
            <h1
              id="title-name"
              className="mt-1 text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
            >
              {title.name}
            </h1>
          )}
          {title.originalName && (
            <p className="text-muted-foreground mt-1 text-sm">
              {title.originalName}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-white/80">
            {facts.length > 0 && <span>{facts.join(" · ")}</span>}
            {title.contentRating && (
              <span className="rounded border border-white/25 px-1.5 text-xs leading-5">
                {title.contentRating}
              </span>
            )}
            {title.rating !== null && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <StarIcon
                  aria-hidden
                  className="size-3.5 fill-current text-amber-300"
                />
                <span className="sr-only">Rated</span>
                {title.rating.toFixed(1)}
              </span>
            )}
          </div>
          {title.genres.length > 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              {title.genres.slice(0, 4).join(", ")}
            </p>
          )}

          {title.overview && (
            <div className="mt-4 max-w-2xl">
              <p
                className={cn(
                  "text-sm leading-6 whitespace-pre-line text-white/85 sm:text-[15px]",
                  !expanded && "line-clamp-4 sm:line-clamp-3",
                )}
              >
                {title.overview}
              </p>
              {title.overview.length > 240 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-1 rounded text-sm font-medium outline-none focus-visible:ring-2"
                >
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2">
            <PlayButton title={title} />
            <AdminMenu title={title} />
          </div>
          <MatchNote title={title} />
        </div>
      </div>
    </section>
  )
}

function BackToLibrary({ title }: { title: Title }) {
  const library = useQuery(
    orpc.libraries.get.queryOptions({ input: { id: title.libraryId } }),
  )
  if (!library.data) return <div className="h-5" />
  return (
    <Link
      to="/libraries/$libraryId"
      params={{ libraryId: title.libraryId }}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded text-sm outline-none focus-visible:ring-2"
    >
      <ChevronLeftIcon className="size-3.5" />
      {library.data.name}
    </Link>
  )
}

/**
 * Resume what's in progress, or play the next or first file. Fills the row
 * on phones.
 */
function PlayButton({ title }: { title: Title }) {
  const next = title.next
  if (!next) return null
  const resume = next.progress && !next.progress.completed
  const detail = [
    title.kind === "show" ? episodeCode(next) : null,
    resume ? timeLeft(next) : null,
  ].filter(Boolean)
  return (
    <Link
      to="/watch/$itemId"
      params={{ itemId: next.id }}
      className={buttonVariants({
        size: "lg",
        className: "min-w-0 max-sm:h-11 max-sm:flex-1",
      })}
    >
      <PlayIcon className="fill-current" />
      {resume ? "Resume" : "Play"}
      {detail.length > 0 && (
        <span className="truncate font-normal tabular-nums opacity-70">
          {detail.join(" · ")}
        </span>
      )}
    </Link>
  )
}

function useLibraryProvider(libraryId: string) {
  const library = useQuery(
    orpc.libraries.get.queryOptions({ input: { id: libraryId } }),
  )
  const providers = useQuery(orpc.metadata.providers.queryOptions())
  const id = library.data?.metadataProvider
  return id ? (providers.data?.find((p) => p.id === id) ?? null) : null
}

/** Fix match and refresh, for admins in libraries with a provider. */
function AdminMenu({ title }: { title: Title }) {
  const { user } = Route.useRouteContext()
  const queryClient = useQueryClient()
  const provider = useLibraryProvider(title.libraryId)
  const [identifying, setIdentifying] = useState(false)
  const refresh = useMutation({
    mutationFn: () => client.titles.refresh({ id: title.id }),
    onSuccess: async () => {
      await invalidateTitleData(queryClient)
      toast.success(`Fetched ${title.name} from ${provider?.name}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  if (user.role !== "admin" || !provider || title.kind === "folder") {
    return null
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="secondary"
              size="icon-lg"
              aria-label="More actions"
              className="border-white/10 bg-white/15 backdrop-blur hover:bg-white/25 max-sm:size-11"
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className="min-w-52">
          <DropdownMenuItem onClick={() => setIdentifying(true)}>
            <SearchIcon />
            Fix match…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCwIcon />
            Refresh metadata
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IdentifyDialog
        title={title}
        providerName={provider.name}
        open={identifying}
        onOpenChange={setIdentifying}
      />
    </>
  )
}

/** Says when the provider found nothing, so a name in a folder isn't mistaken for a match. */
function MatchNote({ title }: { title: Title }) {
  const provider = useLibraryProvider(title.libraryId)
  if (!provider || title.kind === "folder" || title.providerId) return null
  return (
    <p className="text-muted-foreground mt-4 text-sm">
      {title.provider
        ? `${provider.name} had no match for “${title.path}”, so the name comes from the folder.`
        : `Waiting for ${provider.name}. The name comes from the folder for now.`}
    </p>
  )
}

function seasonKey(season: Season): number {
  return season.number ?? NO_SEASON
}

/** Season picker and the chosen season's episodes. */
function Episodes({ title }: { title: Title }) {
  const { season: wanted } = Route.useSearch()
  const navigate = Route.useNavigate()
  const fallback =
    title.seasons.find((s) => s.number === title.next?.seasonNumber) ??
    title.seasons.find((s) => s.number !== 0) ??
    title.seasons[0]
  const current = title.seasons.find((s) => seasonKey(s) === wanted) ?? fallback
  const items = useQuery({
    ...orpc.titles.items.queryOptions({
      input: {
        id: title.id,
        season: current ? current.number : undefined,
      },
    }),
    enabled: current !== undefined,
  })
  if (!current) return null

  return (
    <section aria-labelledby="episodes-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2
          id="episodes-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {title.seasons.length > 1 ? "Episodes" : current.name}
        </h2>
        {current.watchedCount > 0 && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {current.watchedCount} of {current.itemCount} watched
          </span>
        )}
      </div>
      {title.seasons.length > 1 && (
        <nav aria-label="Seasons" className={cn(chipRow, "mb-4")}>
          {title.seasons.map((season) => {
            const active = seasonKey(season) === seasonKey(current)
            return (
              <button
                key={seasonKey(season)}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() =>
                  void navigate({
                    search: { season: seasonKey(season) },
                    replace: true,
                    resetScroll: false,
                  })
                }
                className={chipClass(active)}
              >
                {season.name}
              </button>
            )
          })}
        </nav>
      )}
      {current.overview && (
        <p className="text-muted-foreground mb-4 line-clamp-3 max-w-3xl text-sm leading-6">
          {current.overview}
        </p>
      )}
      {items.isPending ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex gap-4 p-2">
              <Skeleton className="aspect-video w-36 shrink-0 rounded-md sm:w-56" />
              <div className="flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3.5 w-1/4" />
                <Skeleton className="mt-3 h-10 w-full max-sm:hidden" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ol
          className={cn(
            "-mx-2 grid",
            // Without descriptions, rows are short; two columns fill the width.
            !items.data?.some((item) => item.episode?.overview) &&
              "min-[900px]:grid-cols-2 min-[900px]:gap-x-6",
          )}
        >
          {items.data?.map((item) => (
            <EpisodeRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * One episode: its still, number and name, air date and runtime, and what
 * happens in it. The whole row plays it.
 */
function EpisodeRow({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const watched = item.progress?.completed ?? false
  const runtime = formatRuntime(
    item.episode?.runtimeMinutes ??
      (item.durationSeconds ? Math.round(item.durationSeconds / 60) : null),
  )
  const facts = [
    item.episode?.airDate
      ? formatDate(new Date(`${item.episode.airDate}T12:00:00`))
      : null,
    item.progress && !watched ? timeLeft(item) : runtime,
  ].filter(Boolean)
  const overview = item.episode?.overview
  return (
    <li>
      <Link
        to="/watch/$itemId"
        params={{ itemId: item.id }}
        className="group hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-ring grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-2 rounded-lg p-2 outline-none focus-visible:ring-2"
      >
        <Thumb
          sources={landscapeSources(item)}
          toneKey={label.showKey}
          progress={progressRatio(item)}
          watched={watched}
          compact
          className={overview ? "w-36 sm:w-56" : "w-36 sm:w-44"}
        />
        <span className="min-w-0 py-0.5">
          <span className="flex items-baseline gap-2">
            {item.episodeNumber !== null && (
              <span className="text-muted-foreground text-sm tabular-nums">
                {item.episodeNumber}
              </span>
            )}
            <span
              className={cn(
                "line-clamp-2 text-sm leading-5 sm:text-[15px]",
                label.untitled ? "font-normal" : "font-medium",
              )}
            >
              {label.title}
            </span>
          </span>
          {facts.length > 0 && (
            <span className="text-muted-foreground mt-0.5 block text-[13px] leading-5 tabular-nums">
              {facts.join(" · ")}
            </span>
          )}
          {overview && (
            <span className="text-muted-foreground mt-1.5 line-clamp-2 text-sm leading-5 max-sm:hidden">
              {overview}
            </span>
          )}
        </span>
        {overview && (
          // Phones put the description under the still, across the row.
          <span className="text-muted-foreground col-span-2 line-clamp-3 text-[13px] leading-5 sm:hidden">
            {overview}
          </span>
        )}
      </Link>
    </li>
  )
}

/** A movie's files: usually one, sometimes extras or other versions. */
function Files({ title }: { title: Title }) {
  const items = useQuery(
    orpc.titles.items.queryOptions({ input: { id: title.id } }),
  )
  if (!items.data || items.data.length === 0) return null
  return (
    <section aria-labelledby="files-heading" className="max-w-3xl">
      <h2
        id="files-heading"
        className="mb-2 text-lg font-semibold tracking-tight"
      >
        {items.data.length > 1 ? "Files" : "File"}
      </h2>
      <ul className="divide-y rounded-lg border">
        {items.data.map((item) => (
          <li key={item.id}>
            <Link
              to="/watch/$itemId"
              params={{ itemId: item.id }}
              className="hover:bg-accent/40 focus-visible:ring-ring flex items-center gap-3 px-3 py-2.5 outline-none focus-visible:ring-2"
            >
              <PlayIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px]">
                  {item.relativePath.split("/").at(-1)}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {[
                    item.container.toUpperCase(),
                    formatBytes(item.sizeBytes),
                    formatRuntime(
                      item.durationSeconds
                        ? Math.round(item.durationSeconds / 60)
                        : null,
                    ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
