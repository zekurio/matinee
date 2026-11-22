import type { AdminRequestItem, Availability } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { CheckIcon, ClockIcon } from "lucide-react"
import type { ReactNode } from "react"

import { badgeGlyph } from "@/components/catalog/catalog-card"
import { Picture, tone } from "@/components/picture"
import { scopeLabel, titleLink } from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import { formatSpan } from "@/lib/format"
import { art } from "@/lib/media"

/*
 * The card both of Discover's request rows share, drawn as Seerr draws its
 * request cards: the poster, sharp, beside the request's details, over the
 * same poster blurred and darkened, so the card takes its colors from the
 * title. The picture is dark whatever the theme, so the card is a forced
 * `.dark` subtree: the theme's own tokens resolve dark inside it, and its
 * text, badges, and buttons read the same in both.
 */

// The poster's width, 2:3, and the card's own height follows its text.
const POSTER = "w-24 sm:w-26"

/**
 * One request: the year and kind, the name, and what a show's request
 * covers, all opening the title; then `state`, `who` and `actions`,
 * which each row fills with its own.
 */
export function RequestCard({
  item,
  state,
  who,
  actions,
}: {
  item: Pick<AdminRequestItem, "title" | "library" | "scope" | "availability">
  /** A `StateBadge`, and whatever belongs with it. */
  state: ReactNode
  who: ReactNode
  actions: ReactNode
}) {
  const { title } = item
  const poster = art(title.poster)
  const facts = [
    title.year === null ? null : String(title.year),
    tr(`requests.kind.${title.ref.kind}`),
  ]
    .filter(Boolean)
    .join(" · ")
  const scope = scopeLabel(item.scope)
  const link = titleLink(item)

  return (
    <article
      className={cn(
        "dark text-foreground relative isolate flex h-full min-w-0 gap-3 overflow-hidden rounded-xl border p-3",
        tone(title.ref.providerId),
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
          POSTER,
        )}
      >
        {poster && <Picture sources={[poster]} sizes="104px" />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Link
          {...link}
          className="focus-visible:ring-ring -m-1 flex min-w-0 flex-col rounded-sm p-1 outline-none focus-visible:ring-2"
        >
          <span className="text-muted-foreground truncate text-xs leading-4">
            {facts}
          </span>
          <span className="line-clamp-2 text-base leading-5 font-semibold text-balance">
            {title.name}
          </span>
          {scope && (
            <span className="text-muted-foreground mt-0.5 truncate text-xs leading-4">
              {scope}
            </span>
          )}
        </Link>
        <div className="flex min-w-0 flex-col items-start gap-1">{state}</div>
        {who}
        <div className="mt-auto flex min-w-0 flex-col pt-1">{actions}</div>
      </div>
    </article>
  )
}

/** A state's pill over the card's picture: a mark and a word. */
export function StateBadge({
  icon,
  children,
}: {
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <Badge variant="secondary" className="h-6 max-w-full gap-1.5 px-2.5">
      {icon}
      <span className="truncate">{children}</span>
    </Badge>
  )
}

/** A request nobody has answered yet, on either row. */
export function WaitingBadge() {
  return (
    <StateBadge icon={<ClockIcon strokeWidth={2.5} />}>
      {tr("discover.request.waiting")}
    </StateBadge>
  )
}

/**
 * Where the request stands, in the server's words: requested, on its way
 * with how far along it is and how long it has left, when it's out,
 * declined, or here. Nothing for a title nobody asked for.
 */
export function RequestState({ availability }: { availability: Availability }) {
  if (availability.state === "here") {
    return (
      <StateBadge icon={<CheckIcon strokeWidth={2.5} />}>
        {tr("catalog.badge.here")}
      </StateBadge>
    )
  }
  if (availability.state === "asked") return <WaitingBadge />
  const glyph = badgeGlyph(availability, false)
  if (!glyph) return null
  const { etaSeconds } = availability
  return (
    <>
      <StateBadge icon={glyph.icon}>{glyph.label}</StateBadge>
      {availability.state === "coming" && etaSeconds !== null && (
        <span className="text-muted-foreground text-13px leading-5">
          {tr("requests.progress.left", { time: formatSpan(etaSeconds) })}
        </span>
      )}
    </>
  )
}

/** The cards on their way, in the size of the card they stand in for. */
export function RequestCardSkeleton() {
  return (
    <div className="bg-card flex h-[11.5rem] gap-3 rounded-xl border p-3">
      <Skeleton className={cn("aspect-[2/3] shrink-0 rounded-md", POSTER)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="mt-1 h-6 w-3/5 rounded-full" />
        <Skeleton className="mt-auto h-8 w-full" />
      </div>
    </div>
  )
}
