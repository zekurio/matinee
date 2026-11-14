import type { Availability } from "@matinee/contracts"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CalendarIcon, CircleSlashIcon, ClockIcon } from "lucide-react"
import { type ReactNode, useEffect, useId, useState } from "react"

import { CardScrim } from "@/components/card-actions"
import {
  cardClass,
  CardText,
  PosterArt,
  PosterCard,
} from "@/components/media-item"
import { titleOptions } from "@/components/title/title-queries"
import { tr } from "@/i18n"
import { formatPercent } from "@/lib/format"
import { art } from "@/lib/media"

import { catalogParams, type CatalogSummary, refKey } from "./catalog-data"
import { CardActionButton } from "./poster-request"
import { useAsk } from "./use-ask"
import { cardLine, posterAction, stateWord } from "./words"

// How long the badge takes to fade out when the title arrives, before the
// card becomes a library card.
const ARRIVAL_MS = 200

/**
 * A ring that fills clockwise in the accent, for how much of a title is
 * in. Without a share yet it's a dotted ring: on its way, nothing to
 * count.
 */
export function ProgressRing({
  progress,
  className,
}: {
  progress: number | null
  className?: string
}) {
  const radius = 9
  const length = 2 * Math.PI * radius
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("text-primary -rotate-90", className)}
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        className="stroke-foreground/20"
      />
      {progress === null ? (
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="0.1 4.6"
        />
      ) : (
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - Math.min(1, progress))}
          className="transition-[stroke-dashoffset] duration-700 ease-linear motion-reduce:transition-none"
        />
      )}
    </svg>
  )
}

/**
 * The round glass mark in a catalog card's corner, where an owned title's
 * watched check sits, once a title has a state, and none before. Glass
 * means not here; the accent check means watched, and the two never meet.
 * `leaving` fills the ring and fades it out, for an arrival.
 */
export function CatalogBadge({
  availability,
  leaving = false,
  className,
}: {
  availability: Availability
  leaving?: boolean
  className?: string
}) {
  const glyph = badgeGlyph(availability, leaving)
  if (!glyph) return null
  return (
    <span
      role="img"
      aria-label={glyph.label}
      className={cn(
        "border-foreground/10 bg-background/70 grid size-6 place-items-center rounded-full border shadow-sm backdrop-blur-md [&_svg:not([class*='size-'])]:size-3.5",
        leaving &&
          "animate-out fade-out-0 zoom-out-50 fill-mode-forwards duration-200 ease-out motion-reduce:animate-none motion-reduce:opacity-0",
        className,
      )}
    >
      {glyph.icon}
    </span>
  )
}

/**
 * What a badge's tooltip says, as a line and a quieter one under it: for
 * an admin, who requested the title and what the request covers.
 */
export type BadgeTip = { text: string; detail?: string | null }

/**
 * The state as a glass pill in a corner of a larger poster, a title page's
 * or a season's: the card badge's glyph with its word beside it, and the
 * share that's in while it's on its way. A title nobody requested shows
 * none. With `tip`, it says more on hover and keyboard focus, and the
 * same words aloud.
 */
export function PosterBadge({
  availability,
  size = "default",
  tip,
  className,
}: {
  availability: Availability
  /** `lg` for a title page's poster. */
  size?: "default" | "lg"
  tip?: BadgeTip | null
  className?: string
}) {
  const tipId = useId()
  const word = stateWord(availability)
  const glyph = badgeGlyph(availability, false)
  if (!word || !glyph) return null
  const { state, progress } = availability
  const badge = (
    <span
      key={state}
      // Focusable only with something to say, for the keyboard to reach it.
      tabIndex={tip ? 0 : undefined}
      aria-describedby={tip ? tipId : undefined}
      className={cn(
        "border-foreground/10 bg-background/70 animate-in fade-in-0 inline-flex max-w-full items-center rounded-full border font-medium shadow-sm backdrop-blur-md duration-200 motion-reduce:animate-none",
        size === "lg"
          ? "h-8 gap-2 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-4"
          : "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        tip &&
          "focus-visible:outline-ring cursor-default outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid",
        className,
      )}
    >
      {state === "coming" ? (
        <ProgressRing
          progress={progress}
          className={cn("-mx-0.5", size === "lg" ? "size-5" : "size-[18px]")}
        />
      ) : (
        glyph.icon
      )}
      <span className="truncate">{word}</span>
      {state === "coming" && progress !== null && (
        <span className="font-normal tabular-nums opacity-75">
          {formatPercent(progress)}
        </span>
      )}
    </span>
  )
  if (!tip) return badge
  return (
    <>
      <Tooltip>
        <TooltipTrigger render={badge} />
        <TooltipContent
          side="bottom"
          className="max-w-64 flex-col items-start gap-0.5 leading-4 text-pretty"
        >
          <span>{tip.text}</span>
          {tip.detail && (
            <span className="text-background/75">{tip.detail}</span>
          )}
        </TooltipContent>
      </Tooltip>
      {/* The tooltip is for eyes; this reads the same words aloud. */}
      <span id={tipId} hidden>
        {tip.detail ? `${tip.text}. ${tip.detail}` : tip.text}
      </span>
    </>
  )
}

function badgeGlyph(
  availability: Availability,
  leaving: boolean,
): { icon: ReactNode; label: string } | null {
  if (leaving) {
    return {
      icon: <ProgressRing progress={1} className="size-5" />,
      label: tr("catalog.badge.here"),
    }
  }
  switch (availability.state) {
    case "none":
      // Nothing to say at rest: the request shows on hover.
      return null
    case "asked":
      return {
        icon: <ClockIcon strokeWidth={2.5} />,
        label: tr("catalog.state.asked"),
      }
    case "coming":
      return {
        icon: (
          <ProgressRing progress={availability.progress} className="size-5" />
        ),
        label:
          availability.progress === null
            ? tr("catalog.state.coming")
            : tr("catalog.state.comingPercent", {
                percent: formatPercent(availability.progress),
              }),
      }
    case "release":
      return {
        icon: <CalendarIcon strokeWidth={2.5} />,
        label: stateWord(availability) ?? "",
      }
    case "unavailable":
      return {
        icon: (
          <CircleSlashIcon
            strokeWidth={2.5}
            className="text-muted-foreground"
          />
        ),
        label: tr("catalog.state.unavailable"),
      }
    case "here":
      return null
  }
}

/**
 * A title the server doesn't have, the size of a {@link PosterCard} so
 * it sits in the same rails and grids: the poster in full colour, the
 * state in the corner and on the second line. Hovered or focused, the
 * poster dims and offers its one button, as Seerr's cards do: "Request",
 * which requests in place, a show the server's default seasons, or for a
 * title already requested, cancelling or "Notify me". Nothing shows at
 * rest. Touch screens open the title's page with a tap.
 *
 * When the title arrives, the badge fades and the card becomes the
 * library's card, on the same poster.
 */
export function CatalogCard({
  title,
  availability = title.availability,
  detail,
}: {
  title: CatalogSummary
  /** What the stream says now, in place of what the card loaded with. */
  availability?: Availability
  /** The second line in place of the year and kind, while there's no state. */
  detail?: string
}) {
  const here =
    availability.state === "here" ? availability.libraryTitleId : null
  if (here) {
    return (
      <ArrivingCard
        key={here}
        title={title}
        availability={availability}
        titleId={here}
      />
    )
  }
  return (
    <CatalogPoster title={title} availability={availability} detail={detail} />
  )
}

function CatalogPoster({
  title,
  availability,
  leaving = false,
  detail,
}: {
  title: CatalogSummary
  availability: Availability
  leaving?: boolean
  detail?: string
}) {
  const ask = useAsk()
  const name = title.name
  const acts = !leaving && posterAction(availability) !== null
  return (
    <div className="group/card relative">
      <Link
        to="/catalog/$kind/$provider/$providerId"
        params={catalogParams(title.ref)}
        title={name}
        className={cardClass}
      >
        <PosterArt
          name={name}
          toneKey={refKey(title.ref)}
          poster={art(title.poster)}
          scrim={acts}
        >
          {acts && <CardScrim />}
        </PosterArt>
        <CardText
          primary={name}
          secondary={cardLine(title, availability, detail)}
        />
      </Link>
      {/* The controls can't sit in the link, so this box lies over the
          poster to put them on it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        <CatalogBadge
          availability={availability}
          leaving={leaving}
          className="absolute top-1.5 right-1.5"
        />
        {acts && (
          <CardActionButton
            availability={availability}
            name={name}
            busy={ask.isPending}
            onRequest={() => ask.mutate({ ref: title.ref, name })}
          />
        )}
      </div>
    </div>
  )
}

/**
 * A card whose title just arrived: the ring fills and the badge fades,
 * then the library's card takes its place on the same poster, so the
 * picture doesn't move or load again. Whoever asked gets an accent dot
 * in the corner until they've watched it.
 */
function ArrivingCard({
  title,
  availability,
  titleId,
}: {
  title: CatalogSummary
  availability: Availability
  titleId: string
}) {
  const library = useQuery(titleOptions(titleId))
  const [faded, setFaded] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setFaded(true), ARRIVAL_MS)
    return () => window.clearTimeout(timer)
  }, [])
  if (!faded || !library.data) {
    return <CatalogPoster title={title} availability={availability} leaving />
  }
  return (
    <ArrivedCard
      title={title}
      titleId={titleId}
      fresh={availability.askedBySelf}
    />
  )
}

/**
 * A title that came in through a request, as the library's card on the
 * poster the request had, so the picture doesn't change. While it's
 * `fresh` for the viewer, an accent dot in the corner until they've
 * watched it.
 */
export function ArrivedCard({
  title,
  titleId,
  fresh,
}: {
  title: CatalogSummary
  titleId: string
  fresh: boolean
}) {
  const library = useQuery(titleOptions(titleId))
  const poster = art(title.poster)
  if (!library.data) {
    // The library's card needs the title; until then, the same poster.
    return (
      <Link
        to="/titles/$titleId"
        params={{ titleId }}
        title={title.name}
        className={cardClass}
      >
        <PosterArt name={title.name} toneKey={titleId} poster={poster} />
        <CardText primary={title.name} secondary={title.year ?? undefined} />
      </Link>
    )
  }
  return (
    <div className="relative">
      <PosterCard
        title={library.data}
        poster={poster ?? art(library.data.images.poster)}
      />
      {fresh && !library.data.watched && (
        <span
          role="img"
          aria-label={tr("catalog.badge.fresh")}
          className="bg-primary animate-in fade-in-0 zoom-in-50 pointer-events-none absolute top-2.5 right-2.5 size-2 rounded-full shadow-sm duration-200 motion-reduce:animate-none"
        />
      )}
    </div>
  )
}
