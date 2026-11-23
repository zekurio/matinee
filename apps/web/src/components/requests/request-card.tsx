import type { AdminRequestItem, RequestState } from "@matinee/contracts"
import { badgeVariants } from "@matinee/ui/components/badge"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDownIcon,
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
 * The one card every list of requests draws, laid out as Seerr's: the
 * request's details on the left and the poster, sharp, on the right,
 * over the title's backdrop. The backdrop fades into the card's own
 * surface from the top left corner down to the bottom right, so the
 * words always sit on the theme's colour, light or dark, and the
 * picture only colours the card. A request without a backdrop is the
 * plain card.
 */

/**
 * One request, in one fixed anatomy whatever its state or page, exactly
 * as tall as its poster. From the top: the year, and for a show the
 * seasons asked for; the name, whole, on up to two lines; on the
 * admin's cards, who asked; and "Status" with the state's badge, which
 * opens what went wrong when something did. The actions sit on the
 * poster's bottom edge, and the space between is the only give. `menu`
 * sits beside the name, by the poster, and holds the rest.
 */
export function RequestCard({
  item,
  size = "rail",
  state,
  who,
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
        "bg-card text-foreground relative isolate flex h-full min-w-0 gap-4 overflow-hidden rounded-xl border p-4 outline-none",
        className,
      )}
    >
      {backdrop && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <Picture sources={[backdrop]} sizes="424px" />
          <div className="from-card/50 to-card absolute inset-0 bg-linear-135 to-75%" />
        </div>
      )}
      {/* Sized as if empty, so the poster alone sets the row's height,
          and the column stretches to it. */}
      <div className="@container/card flex min-w-0 flex-1 flex-col [contain:size]">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <div className="flex w-full min-w-0 items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <Facts text={facts} onPicture={backdrop !== null} />
              <Link
                {...link}
                tabIndex={wide ? -1 : undefined}
                title={title.name}
                className="focus-visible:ring-ring -mx-1 flex min-w-0 rounded-sm px-1 underline-offset-2 outline-none hover:underline focus-visible:ring-2"
              >
                <span
                  id={`${id}-name`}
                  className="line-clamp-2 min-w-0 text-base font-bold break-words"
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
          {/* Both words trimmed to their capitals, so they and the badge's
              mark center on one line, whatever the zoom rounds. */}
          <div className="text-13px flex h-6 w-full min-w-0 items-center gap-2">
            <span className="text-foreground/85 shrink-0 font-semibold [text-box:trim-both_cap_alphabetic]">
              {tr("requests.statusLabel")}
            </span>
            {state}
          </div>
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
        className="bg-muted ring-border relative block aspect-[2/3] w-28 shrink-0 self-start overflow-hidden rounded-md shadow-md ring-1 transition-transform duration-300 hover:scale-[1.03] motion-reduce:transition-none"
      >
        {poster && <Picture sources={[poster]} sizes="112px" />}
      </Link>
    </article>
  )
}

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
 * Each state's mark and colour, filled as Seerr's are: waiting in the
 * warning colour, on its way in the accent, here in green, and declined
 * or needing attention in red.
 */
function stateLook(state: RequestState, progress: number | null) {
  switch (state) {
    case "waiting":
      return {
        icon: <ClockIcon strokeWidth={2.5} />,
        label: tr("requests.state.waiting"),
        className: "border-warning bg-warning/80",
      }
    case "needsAttention":
      return {
        icon: <TriangleAlertIcon strokeWidth={2.5} />,
        label: tr("requests.state.needsAttention"),
        className: "border-destructive bg-destructive/80",
      }
    case "onTheWay":
      return {
        icon: <ProgressRing progress={progress} className="text-current" />,
        label:
          progress === null
            ? tr("requests.state.onTheWay")
            : tr("requests.state.onTheWayPercent", {
                percent: formatPercent(progress),
              }),
        className: "border-primary bg-primary/80",
      }
    case "here":
      return {
        icon: <CheckIcon strokeWidth={3} />,
        label: tr("requests.state.here"),
        className: "border-success bg-success/80",
      }
    case "declined":
      return {
        icon: <CircleSlashIcon strokeWidth={2.5} />,
        label: tr("requests.state.declined"),
        className: "border-destructive bg-destructive/80",
      }
  }
}

/**
 * Where a request stands, as the server says: one filled pill with a
 * mark and a word, and how far along it is while it's on its way. With
 * `detail`, what went wrong or why it was declined, the pill is a button
 * with a chevron that opens it.
 */
export function RequestStateBadge({
  state,
  progress = null,
  detail,
}: {
  state: RequestState
  progress?: number | null
  detail?: ReactNode
}) {
  const look = stateLook(state, progress)
  const className = cn(
    badgeVariants(),
    "h-5 max-w-full min-w-0 gap-1 border px-2 font-semibold text-white",
    look.className,
  )
  const content = (
    <>
      {look.icon}
      {/* Clipped rather than hidden, with room for a "g" to hang below
          the trimmed box. */}
      <span className="min-w-0 overflow-clip text-ellipsis whitespace-nowrap [overflow-clip-margin:3px] [text-box:trim-both_cap_alphabetic]">
        {look.label}
      </span>
    </>
  )
  if (!detail) return <span className={className}>{content}</span>
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          className,
          "focus-visible:ring-ring cursor-pointer outline-none hover:brightness-110 focus-visible:ring-2 data-popup-open:brightness-110",
        )}
      >
        {content}
        <ChevronDownIcon aria-hidden strokeWidth={2.5} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-(--available-width) gap-0 p-0"
      >
        <PopoverHeader>
          <PopoverTitle className="truncate">{look.label}</PopoverTitle>
        </PopoverHeader>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 py-2.5 text-sm break-words">
          {detail}
        </div>
      </PopoverContent>
    </Popover>
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
export function RequestCardSkeleton({ admin = false }: { admin?: boolean }) {
  return (
    <div className="bg-card flex gap-4 rounded-xl border p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 [contain:size]">
        <Skeleton className="h-3 w-1/4" />
        <Skeleton className="h-5 w-4/5" />
        {admin && <Skeleton className="h-6 w-2/5 rounded-full" />}
        <Skeleton className="h-5 w-1/2 rounded-full" />
        <Skeleton className="mt-auto h-8 w-1/2" />
      </div>
      <Skeleton className="aspect-[2/3] w-28 shrink-0 rounded-md" />
    </div>
  )
}
