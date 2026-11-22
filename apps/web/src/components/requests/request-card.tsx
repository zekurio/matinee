import type { AdminRequestItem, RequestState } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  CircleSlashIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ComponentProps, type ReactNode, useId } from "react"

import { ProgressRing } from "@/components/catalog/catalog-card"
import { Picture, tone } from "@/components/picture"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art } from "@/lib/media"

import { scopeLabel, titleLink } from "./request-queue"

/*
 * The one card every list of requests draws, as Seerr draws its request
 * cards: the poster, sharp, beside the request's details, over the same
 * poster blurred and darkened, so the card takes its colors from the
 * title. Discover's row and the requests pages share it; the pages give
 * it more room. The picture is dark whatever the theme, so the card is a
 * forced `.dark` subtree: the theme's own tokens resolve dark inside it,
 * and its text, badges, and buttons read the same in both.
 */

/**
 * One request, exactly as tall as its poster: the poster dictates the
 * card's height, so every card in a grid or a row lines up, and nothing
 * in the text beside it can make one taller. What doesn't fit is cut
 * with an ellipsis, and each line that can be cut is readable in full a
 * step away. Top to bottom: the year, kind and seasons, and the name,
 * both opening the title; the state's badge and its one detail line;
 * then who asked and the actions, on the poster's bottom edge. `menu`
 * sits beside the name.
 */
export function RequestCard({
  item,
  size = "rail",
  state,
  line,
  who,
  whoUp,
  actions,
  menu,
  className,
  ...props
}: Omit<ComponentProps<"article">, "children"> & {
  item: Pick<AdminRequestItem, "title" | "library" | "scope" | "availability">
  /** `rail` in Discover's row; `wide` in the requests pages' grids. */
  size?: "rail" | "wide"
  /** A {@link RequestStateBadge}. */
  state: ReactNode
  /** The state's one detail line under the badge. */
  line?: ReactNode
  /** Who asked and when, in the last row beside the actions. */
  who?: ReactNode
  /**
   * Who asked, small, for the end of the detail line when the card is
   * too narrow for `who` beside the actions, which then take the row.
   */
  whoUp?: ReactNode
  actions?: ReactNode
  menu?: ReactNode
}) {
  const id = useId()
  const { title } = item
  const poster = art(title.poster)
  const facts = [
    title.year === null ? null : String(title.year),
    tr(`requests.kind.${title.ref.kind}`),
    scopeLabel(item.scope),
  ]
    .filter(Boolean)
    .join(" · ")
  const link = titleLink(item)
  const wide = size === "wide"
  const up = whoUp && actions ? whoUp : null
  const last = who || actions

  return (
    <article
      aria-labelledby={`${id}-name`}
      {...props}
      className={cn(
        "dark text-foreground relative isolate flex h-full min-w-0 gap-3 overflow-hidden rounded-xl border p-3 outline-none",
        wide && "sm:gap-4 sm:p-4",
        tone(title.ref.providerId),
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 scale-150 blur-2xl">
          {poster && <Picture sources={[poster]} sizes="96px" />}
        </div>
        <div className="bg-background/65 absolute inset-0" />
      </div>
      <Link
        {...link}
        tabIndex={-1}
        aria-hidden
        className={cn(
          "bg-muted relative block aspect-[2/3] shrink-0 self-start overflow-hidden rounded-md shadow-lg ring-1 shadow-black/40 ring-white/10",
          posterWidth[size],
        )}
      >
        {poster && <Picture sources={[poster]} sizes="112px" />}
      </Link>
      {/* Sized as if empty, so the poster alone sets the row's height,
          and the column stretches to it. */}
      <div className="@container/card flex min-w-0 flex-1 flex-col justify-between gap-1.5 [contain:size]">
        <div className="flex min-w-0 items-start gap-2">
          <Link
            {...link}
            tabIndex={wide ? -1 : undefined}
            // The full name and facts, where either is cut.
            title={`${title.name}\n${facts}`}
            className="focus-visible:ring-ring -m-1 flex min-w-0 flex-1 flex-col rounded-sm p-1 outline-none focus-visible:ring-2"
          >
            <span className="text-muted-foreground truncate text-xs leading-4">
              {facts}
            </span>
            <span
              id={`${id}-name`}
              className="text-15px truncate font-semibold"
            >
              {title.name}
            </span>
          </Link>
          {menu && <div className="-mt-1 -mr-1 shrink-0">{menu}</div>}
        </div>
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          {state}
          {(line || up) && (
            <div className="flex w-full min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1">{line}</div>
              {up && (
                <div className="shrink-0 @min-[24rem]/card:hidden">{up}</div>
              )}
            </div>
          )}
        </div>
        {last && (
          <div className="flex min-w-0 items-center gap-2">
            {who && (
              <div
                className={cn(
                  "flex min-w-0 flex-1",
                  up && "hidden @min-[24rem]/card:flex",
                )}
              >
                {who}
              </div>
            )}
            {actions && (
              <div
                className={cn(
                  "ml-auto flex max-w-full min-w-0 shrink-0 items-center justify-end gap-1.5",
                  // Alone in the row, they may take all of it.
                  up && "flex-1 @min-[24rem]/card:flex-none",
                )}
              >
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/** The poster's width, which sets each size's height. */
const posterWidth = {
  rail: "w-24 sm:w-26",
  wide: "w-24 sm:w-28",
} as const

/**
 * Each state's mark and colour. What needs whoever runs the queue stands
 * out for them, waiting in the accent and needs attention in the warning
 * colour, and reads plain on an asker's own card; what's on its way
 * reads plain, and what's finished quiet, an outline.
 */
function stateLook(
  state: RequestState,
  urgent: boolean,
  progress: number | null,
) {
  switch (state) {
    case "waiting":
      return {
        icon: <ClockIcon strokeWidth={2.5} />,
        label: tr("requests.state.waiting"),
        className: urgent
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground",
      }
    case "needsAttention":
      return {
        icon: <TriangleAlertIcon strokeWidth={2.5} />,
        label: tr("requests.state.needsAttention"),
        className: urgent
          ? "bg-warning text-background"
          : "bg-secondary text-secondary-foreground",
      }
    case "onTheWay":
      return {
        icon: <ProgressRing progress={progress} className="size-5" />,
        label:
          progress === null
            ? tr("requests.state.onTheWay")
            : tr("requests.state.onTheWayPercent", {
                percent: formatPercent(progress),
              }),
        className: "bg-secondary text-secondary-foreground",
      }
    case "here":
      return {
        icon: <CheckIcon strokeWidth={2.5} className="text-success" />,
        label: tr("requests.state.here"),
        className: "border-foreground/15 text-foreground/80 bg-transparent",
      }
    case "declined":
      return {
        icon: <CircleSlashIcon strokeWidth={2.5} />,
        label: tr("requests.state.declined"),
        className: "border-foreground/15 text-muted-foreground bg-transparent",
      }
  }
}

/**
 * Where a request stands, as the server says: one pill with a mark and
 * a word, and how far along it is while it's on its way. `urgent` for
 * whoever runs the queue, for whom a waiting request is theirs to answer.
 */
export function RequestStateBadge({
  state,
  progress = null,
  urgent = false,
}: {
  state: RequestState
  progress?: number | null
  urgent?: boolean
}) {
  const look = stateLook(state, urgent, progress)
  return (
    <Badge className={cn("h-6 max-w-full gap-1.5 px-2.5", look.className)}>
      {look.icon}
      <span className="truncate">{look.label}</span>
    </Badge>
  )
}

/** How far along an admin's or a person's request is, for its badge. */
export function requestProgress(
  item: Pick<AdminRequestItem, "state" | "season" | "availability">,
): number | null {
  if (item.state !== "onTheWay") return null
  return (item.season ?? item.availability).progress
}

/**
 * The grid the requests pages lay their wide cards out in: wide enough
 * that who asked fits beside a card's actions.
 */
export const requestGrid =
  "grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,34rem),1fr))] sm:gap-4"

/** The cards on their way, in the size of the card they stand in for. */
export function RequestCardSkeleton({
  size = "rail",
}: {
  size?: "rail" | "wide"
}) {
  const wide = size === "wide"
  return (
    <div
      className={cn(
        "bg-card flex gap-3 rounded-xl border p-3",
        wide && "sm:gap-4 sm:p-4",
      )}
    >
      <Skeleton
        className={cn("aspect-[2/3] shrink-0 rounded-md", posterWidth[size])}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-between [contain:size]">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-6 w-2/5 rounded-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  )
}
