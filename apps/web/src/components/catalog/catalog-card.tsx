import type { Availability } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useQuery } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import { Calendar, CircleSlash, Clock, EyeOff } from "lucide"
import {
  createMemo,
  createSignal,
  createUniqueId,
  Match,
  onSettled,
  Show,
  Switch,
} from "solid-js"

import { CardScrim, cardIconButton } from "@/components/card-actions"
import {
  cardClass,
  CardText,
  PosterArt,
  PosterCard,
} from "@/components/media-item"
import { titleOptions } from "@/components/title/title-queries"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { formatPercent } from "@/lib/format"
import { art } from "@/lib/media"

import type { TriggerProps } from "./ask-sheet"
import { catalogParams, type CatalogSummary, refKey } from "./catalog-data"
import { CardActionButton } from "./poster-request"
import { useAsk } from "./use-ask"
import { cardLine, posterAction, stateWord } from "./words"

// How long the badge takes to fade out when the title arrives, before the
// card becomes a library card.
const ARRIVAL_MS = 200

const RADIUS = 9
const LENGTH = 2 * Math.PI * RADIUS

/**
 * A ring that fills clockwise in the accent, for how much of a title is
 * in. Without a share yet it's a dotted ring: on its way, nothing to
 * count.
 */
export function ProgressRing(props: {
  progress: number | null
  class?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      class={cn("text-primary -rotate-90", props.class)}
    >
      <circle
        cx="12"
        cy="12"
        r={RADIUS}
        fill="none"
        stroke-width="2.5"
        class="stroke-foreground/20"
      />
      <Show
        when={props.progress !== null}
        fallback={
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-dasharray="0.1 4.6"
          />
        }
      >
        <circle
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray={String(LENGTH)}
          stroke-dashoffset={LENGTH * (1 - Math.min(1, props.progress ?? 0))}
          class="transition-[stroke-dashoffset] duration-700 ease-linear motion-reduce:transition-none"
        />
      </Show>
    </svg>
  )
}

type Glyph = { icon: () => JSX.Element; label: string }

function badgeGlyph(
  availability: Availability,
  leaving: boolean,
): Glyph | null {
  if (leaving) {
    return {
      icon: () => <ProgressRing progress={1} class="size-5" />,
      label: tr("catalog.badge.here"),
    }
  }
  switch (availability.state) {
    case "none":
      // Nothing to say at rest: the request shows on hover.
      return null
    case "asked":
      return {
        icon: () => <Icon icon={Clock} stroke-width={2.5} />,
        label: tr("catalog.state.asked"),
      }
    case "coming":
      return {
        icon: () => (
          <ProgressRing progress={availability.progress} class="size-5" />
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
        icon: () => <Icon icon={Calendar} stroke-width={2.5} />,
        label: stateWord(availability) ?? "",
      }
    case "unavailable":
      return {
        icon: () => (
          <Icon
            icon={CircleSlash}
            stroke-width={2.5}
            class="text-muted-foreground"
          />
        ),
        label: tr("catalog.state.unavailable"),
      }
    case "here":
      return null
  }
}

/**
 * The round glass mark in a catalog card's corner, where an owned title's
 * watched check sits, once a title has a state, and none before. Glass
 * means not here; the accent check means watched, and the two never meet.
 * `leaving` fills the ring and fades it out, for an arrival.
 */
export function CatalogBadge(props: {
  availability: Availability
  leaving?: boolean
  class?: string
}) {
  const glyph = createMemo(() =>
    badgeGlyph(props.availability, props.leaving ?? false),
  )
  return (
    <Show when={glyph()}>
      {(shown) => (
        <span
          role="img"
          aria-label={shown().label}
          class={cn(
            "border-foreground/10 bg-background/70 grid size-6 place-items-center rounded-full border shadow-sm backdrop-blur-md [&_svg:not([class*='size-'])]:size-3.5",
            props.leaving &&
              "animate-out fade-out-0 zoom-out-50 fill-mode-forwards duration-200 ease-out motion-reduce:animate-none motion-reduce:opacity-0",
            props.class,
          )}
        >
          {shown().icon()}
        </span>
      )}
    </Show>
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
export function PosterBadge(props: {
  availability: Availability
  /** `lg` for a title page's poster. */
  size?: "default" | "lg"
  tip?: BadgeTip | null
  class?: string
}) {
  const tipId = createUniqueId()
  const word = () => stateWord(props.availability)
  const glyph = createMemo(() => badgeGlyph(props.availability, false))
  const lg = () => props.size === "lg"

  const badge = (trigger?: TriggerProps) => (
    // A new state fades in on a badge of its own.
    <Show when={props.availability.state} keyed>
      {(state) => (
        <span
          {...trigger}
          // Focusable only with something to say, for the keyboard to reach it.
          tabindex={props.tip ? 0 : undefined}
          // Its words, said before Solid puts them in, for the tooltip's
          // trigger to have its name as it mounts.
          aria-label={props.tip ? glyph()?.label : undefined}
          aria-describedby={props.tip ? tipId : undefined}
          class={cn(
            "border-foreground/10 bg-background/70 animate-in fade-in-0 inline-flex max-w-full items-center rounded-full border font-medium shadow-sm backdrop-blur-md duration-200 motion-reduce:animate-none",
            lg()
              ? "text-13px h-8 gap-2 px-3 [&_svg:not([class*='size-'])]:size-4"
              : "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
            props.tip &&
              "focus-visible:outline-ring cursor-default outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid",
            props.class,
          )}
        >
          <Show when={state === "coming"} fallback={glyph()?.icon()}>
            <ProgressRing
              progress={props.availability.progress}
              class={cn("-mx-0.5", lg() ? "size-5" : "size-[18px]")}
            />
          </Show>
          <span class="truncate">{word()}</span>
          <Show
            when={state === "coming" && props.availability.progress !== null}
          >
            <span class="font-normal tabular-nums opacity-75">
              {formatPercent(props.availability.progress ?? 0)}
            </span>
          </Show>
        </span>
      )}
    </Show>
  )

  return (
    <Show when={word() && glyph()}>
      <Show when={props.tip} fallback={badge()}>
        {(tip) => (
          <>
            {/* It adds to what the trigger says, which names itself. */}
            <Tooltip type="description">
              <TooltipTrigger
                render={(trigger: TriggerProps) => badge(trigger)}
              />
              <TooltipContent
                side="bottom"
                class="max-w-64 flex-col items-start gap-0.5 leading-4 text-pretty"
              >
                <span>{tip().text}</span>
                <Show when={tip().detail}>
                  <span class="text-background/75">{tip().detail}</span>
                </Show>
              </TooltipContent>
            </Tooltip>
            {/* The tooltip is for eyes; this reads the same words aloud. */}
            <span id={tipId} hidden>
              {tip().detail
                ? tr("catalog.tip.aloud", {
                    text: tip().text,
                    detail: tip().detail ?? "",
                  })
                : tip().text}
            </span>
          </>
        )}
      </Show>
    </Show>
  )
}

/**
 * A title the server doesn't have, the size of a {@link PosterCard} so
 * it sits in the same rails and grids: the poster in full colour, the
 * state in the corner and on the second line. Hovered or focused, the
 * poster dims and offers its one button, as Seerr's cards do: "Request",
 * which requests in place, a show the server's default seasons, or
 * cancelling for a title the viewer requested. Nothing shows at rest.
 * Touch screens open the title's page with a tap.
 *
 * When the title arrives, the badge fades and the card becomes the
 * library's card, on the same poster.
 */
export function CatalogCard(props: {
  title: CatalogSummary
  /** What the stream says now, in place of what the card loaded with. */
  availability?: Availability
  /** The second line in place of the year and kind, while there's no state. */
  detail?: string
  /** "Not interested", for a title the viewer was recommended. */
  dismiss?: () => void
}) {
  const availability = () => props.availability ?? props.title.availability
  const here = createMemo(() => {
    const current = availability()
    return current.state === "here" ? current.libraryTitleId : null
  })
  return (
    <Show
      when={here()}
      keyed
      fallback={
        <CatalogPoster
          title={props.title}
          availability={availability()}
          detail={props.detail}
          dismiss={props.dismiss}
        />
      }
    >
      {(titleId) => (
        <ArrivingCard
          title={props.title}
          availability={availability()}
          titleId={titleId}
        />
      )}
    </Show>
  )
}

function CatalogPoster(props: {
  title: CatalogSummary
  availability: Availability
  leaving?: boolean
  detail?: string
  dismiss?: () => void
}) {
  const ask = useAsk()
  const acts = () => !props.leaving && posterAction(props.availability) !== null
  return (
    <div class="group/card relative">
      <Link
        to="/catalog/$kind/$provider/$providerId"
        params={catalogParams(props.title.ref)}
        title={props.title.name}
        class={cardClass}
      >
        <PosterArt
          name={props.title.name}
          toneKey={refKey(props.title.ref)}
          poster={art(props.title.poster)}
        >
          <Show when={acts() || props.dismiss}>
            <CardScrim />
          </Show>
        </PosterArt>
        <CardText
          primary={props.title.name}
          secondary={cardLine(props.title, props.availability, props.detail)}
        />
      </Link>
      {/* The controls can't sit in the link, so this box lies over the
          poster to put them on it. */}
      <div class="pointer-events-none absolute inset-x-0 top-0 aspect-[2/3]">
        <CatalogBadge
          availability={props.availability}
          leaving={props.leaving}
          class="absolute top-1.5 right-1.5"
        />
        <Show when={!props.leaving && props.dismiss}>
          {(dismiss) => (
            <Button
              variant="ghost"
              size="icon"
              aria-label={tr("discover.notInterestedNamed", {
                name: props.title.name,
              })}
              title={tr("discover.notInterested")}
              onClick={() => dismiss()()}
              class={cn(
                cardIconButton,
                "pointer-events-auto absolute top-0.5 left-0.5 opacity-0 transition-opacity group-hover/card:opacity-100 group-has-[:focus-visible]/card:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:hidden",
              )}
            >
              <Icon icon={EyeOff} class="size-5" />
            </Button>
          )}
        </Show>
        <Show when={acts()}>
          <CardActionButton
            availability={props.availability}
            name={props.title.name}
            busy={ask.isPending}
            onRequest={() =>
              ask.mutate({ ref: props.title.ref, name: props.title.name })
            }
          />
        </Show>
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
function ArrivingCard(props: {
  title: CatalogSummary
  availability: Availability
  titleId: string
}) {
  const library = useQuery(() => titleOptions(props.titleId))
  const [faded, setFaded] = createSignal(false)
  onSettled(() => {
    const timer = setTimeout(() => setFaded(true), ARRIVAL_MS)
    return () => clearTimeout(timer)
  })
  return (
    <Show
      when={faded() && library.isSuccess}
      fallback={
        <CatalogPoster
          title={props.title}
          availability={props.availability}
          leaving
        />
      }
    >
      <ArrivedCard
        title={props.title}
        titleId={props.titleId}
        fresh={props.availability.askedBySelf}
      />
    </Show>
  )
}

/**
 * A title that came in through a request, as the library's card on the
 * poster the request had, so the picture doesn't change. While it's
 * `fresh` for the viewer, an accent dot in the corner until they've
 * watched it.
 */
export function ArrivedCard(props: {
  title: CatalogSummary
  titleId: string
  fresh: boolean
}) {
  const library = useQuery(() => titleOptions(props.titleId))
  const poster = () => art(props.title.poster)
  return (
    <Switch>
      <Match when={library.isSuccess && library.data}>
        {(title) => (
          <div class="relative">
            <PosterCard
              title={title()}
              poster={poster() ?? art(title().images.poster)}
            />
            <Show when={props.fresh && !title().watched}>
              <span
                role="img"
                aria-label={tr("catalog.badge.fresh")}
                class="bg-primary animate-in fade-in-0 zoom-in-50 pointer-events-none absolute top-2.5 right-2.5 size-2 rounded-full shadow-sm duration-200 motion-reduce:animate-none"
              />
            </Show>
          </div>
        )}
      </Match>
      <Match when={true}>
        {/* The library's card needs the title; until then, the same poster. */}
        <Link
          to="/titles/$titleId"
          params={{ titleId: props.titleId }}
          title={props.title.name}
          class={cardClass}
        >
          <PosterArt
            name={props.title.name}
            toneKey={props.titleId}
            poster={poster()}
          />
          <CardText
            primary={props.title.name}
            secondary={
              props.title.year === null ? undefined : String(props.title.year)
            }
          />
        </Link>
      </Match>
    </Switch>
  )
}
