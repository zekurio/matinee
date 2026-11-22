import type { AdminRequestItem, RequestState } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  CircleSlashIcon,
  ClockIcon,
  TriangleAlertIcon,
} from "lucide-react"
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react"

import { ProgressRing } from "@/components/catalog/catalog-card"
import { Picture } from "@/components/picture"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art } from "@/lib/media"

import { scopeLabel, titleLink } from "./request-queue"

/*
 * The one card every list of requests draws: the request's details on
 * the left and the poster, sharp, on the right, over the title's
 * backdrop. The backdrop fades into the card's own surface from the
 * top left corner down to the bottom right, so the words always sit on
 * the theme's colour, light or dark, and the picture only colours the
 * card. A request without a backdrop is the plain card.
 */

/**
 * One request, in one fixed anatomy whatever its state or page, exactly
 * as tall as its poster. From the top, one line each and the same small
 * gap between them: the year, and for a show the seasons asked for; the
 * name; on the admin's cards, who asked; the state's badge; and, only
 * when something went wrong, the problem. A row keeps its place on every
 * card, so the badges line up across a grid. The actions sit on the
 * poster's bottom edge, and the space between is the only give. `menu`
 * sits beside the name, by the poster, and holds the rest.
 */
export function RequestCard({
  item,
  size = "rail",
  state,
  who,
  problem,
  actions,
  menu,
  className,
  ...props
}: Omit<ComponentProps<"article">, "children"> & {
  item: Pick<
    AdminRequestItem,
    "title" | "backdrop" | "library" | "scope" | "availability"
  >
  /** `rail` in Discover's row; `wide` in the requests pages' grids. */
  size?: "rail" | "wide"
  /** A {@link RequestStateBadge}. */
  state: ReactNode
  /**
   * Who asked, on the admin's cards. Its row is kept even when empty, so
   * passing it at all is what makes a card the admin's.
   */
  who?: ReactNode
  /** What went wrong, up to two lines under the badge. */
  problem?: ReactNode
  actions?: ReactNode
  menu?: ReactNode
}) {
  const id = useId()
  const { title } = item
  const poster = art(title.poster)
  const backdrop = art(item.backdrop)
  const facts = [
    title.year === null ? null : String(title.year),
    scopeLabel(item.scope),
  ]
    .filter(Boolean)
    .join(" · ")
  const link = titleLink(item)
  const wide = size === "wide"
  const admin = who !== undefined

  return (
    <article
      aria-labelledby={`${id}-name`}
      {...props}
      className={cn(
        "bg-card text-foreground relative isolate flex h-full min-w-0 gap-3 overflow-hidden rounded-xl border p-3 outline-none",
        wide && "sm:gap-4 sm:p-4",
        className,
      )}
    >
      {backdrop && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <Picture sources={[backdrop]} sizes="384px" />
          <div className="from-card/50 to-card absolute inset-0 bg-linear-135 to-75%" />
        </div>
      )}
      {/* Sized as if empty, so the poster alone sets the row's height,
          and the column stretches to it. */}
      <div className="@container/card flex min-w-0 flex-1 flex-col [contain:size]">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <div className="flex w-full min-w-0 items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Facts text={facts} onPicture={backdrop !== null} />
              <Link
                {...link}
                tabIndex={wide ? -1 : undefined}
                title={title.name}
                className="focus-visible:ring-ring -mx-1 flex min-w-0 rounded-sm px-1 outline-none focus-visible:ring-2"
              >
                <span
                  id={`${id}-name`}
                  className="text-15px truncate font-bold"
                >
                  {title.name}
                </span>
              </Link>
            </div>
            {menu && <div className="-mt-1 -mr-1 shrink-0">{menu}</div>}
          </div>
          {admin && (
            <div className="flex h-6 w-full min-w-0 items-center">{who}</div>
          )}
          {state}
          {problem && <div className="flex w-full min-w-0">{problem}</div>}
        </div>
        {actions && (
          <div className="mt-auto flex w-full min-w-0 items-center gap-1.5 pt-1.5">
            {actions}
          </div>
        )}
      </div>
      <Link
        {...link}
        tabIndex={-1}
        aria-hidden
        className={cn(
          "bg-muted ring-border relative block aspect-[2/3] shrink-0 self-start overflow-hidden rounded-md shadow-md ring-1 transition-transform duration-300 hover:scale-[1.03] motion-reduce:transition-none",
          admin ? posterWidth.admin : posterWidth.own,
        )}
      >
        {poster && <Picture sources={[poster]} sizes="124px" />}
      </Link>
    </article>
  )
}

/**
 * The poster's width, which sets the card's height. The admin's cards
 * have a row more than a person's own, who asked, and their fullest
 * pairs it with a badge, a two-line problem, and two buttons. This is
 * the width that fits that with a little to spare.
 */
const posterWidth = {
  admin: "w-31",
  own: "w-20",
} as const

/**
 * The year and a show's seasons, one line. Seasons can run long; when the
 * line is cut, it opens the whole of it in a popover.
 */
function Facts({ text, onPicture }: { text: string; onPicture: boolean }) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [cut, setCut] = useState(false)
  useEffect(() => {
    if (!element) return
    const measure = () => setCut(element.scrollWidth > element.clientWidth + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  const line = (
    <span
      ref={setElement}
      className={cn(
        "block h-4 min-w-0 truncate text-xs leading-4 font-medium",
        // Over the backdrop's lightest corner, the muted colour fades
        // into it.
        onPicture ? "text-foreground/85" : "text-muted-foreground",
      )}
    >
      {text}
    </span>
  )
  if (!cut) return line
  return (
    <Popover>
      <PopoverTrigger className="focus-visible:ring-ring hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06] -mx-1 flex min-w-0 rounded-sm px-1 text-left outline-none focus-visible:ring-2">
        {line}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-80 text-sm">
        {text}
      </PopoverContent>
    </Popover>
  )
}

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

/** The grid the requests pages lay their wide cards out in. */
export const requestGrid =
  "grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] sm:gap-4"

/** The cards on their way, in the size of the card they stand in for. */
export function RequestCardSkeleton({
  size = "rail",
  admin = false,
}: {
  size?: "rail" | "wide"
  admin?: boolean
}) {
  const wide = size === "wide"
  return (
    <div
      className={cn(
        "bg-card flex gap-3 rounded-xl border p-3",
        wide && "sm:gap-4 sm:p-4",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1 [contain:size]">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-4 w-4/5" />
        {admin && <Skeleton className="h-6 w-2/5 rounded-full" />}
        <Skeleton className="h-6 w-1/3 rounded-full" />
        <Skeleton className="mt-auto h-8 w-1/2" />
      </div>
      <Skeleton
        className={cn(
          "aspect-[2/3] shrink-0 rounded-md",
          admin ? posterWidth.admin : posterWidth.own,
        )}
      />
    </div>
  )
}
