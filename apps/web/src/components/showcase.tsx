import type { FeaturedTitle } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/solid-router"
import { ChevronLeft, ChevronRight, Play } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
} from "solid-js"

import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import {
  art,
  episodeCode,
  frame,
  present,
  progressRatio,
  timeLeft,
} from "@/lib/media"
import {
  ADVANCE_MS,
  baseHeight,
  FADE_MS,
  LOGO_MAX,
  logoHeight,
  OVERVIEW_GAP,
  OVERVIEW_LEADING,
  overviewLines,
  SHOWCASE_PADDING,
  showcaseHeight,
  titleSize,
  WORDS_BOTTOM,
  wordsWidth,
} from "@/lib/showcase-layout"
import { pageVisible, reducedMotion, viewport } from "@/lib/viewport"

import { pageGutter } from "./app-shell"
import { Picture, tone } from "./picture"
import { Score } from "./title/score"

/*
 * Home's featured titles from `sm` up, the Flutter tablet's showcase
 * (`home_showcase.dart`): one tall card, inset from the page by the gutter
 * the rows start at, its title's art filling it under a shade. Low on the
 * leading side are the title's logo or its name, its facts, its genres,
 * its overview, how far the person is, and Play and Details. The title
 * changes in place, the art crossing over while Play and Details stay put.
 * It moves on every eight seconds, and not while a pointer is over it,
 * the keyboard's focus is in it, a finger is on it, with reduced motion,
 * or while the page is out of sight. Kept out of the page while another
 * one shows, it goes back to the first title, as a new one would start.
 */

/**
 * Black over the art, eased from nothing at `from` to `alpha` at `to` on a
 * smootherstep curve, flat where it starts and ends, so neither end shows
 * as a line.
 */
function shade(direction: string, from: number, to: number, alpha: number) {
  const steps = 24
  const stops: string[] = []
  if (from > 0) stops.push("rgb(0 0 0 / 0) 0%")
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const eased = t * t * t * (t * (t * 6 - 15) + 10)
    const at = (from + (to - from) * t) * 100
    stops.push(`rgb(0 0 0 / ${(alpha * eased).toFixed(3)}) ${at.toFixed(2)}%`)
  }
  if (to < 1) stops.push(`rgb(0 0 0 / ${alpha}) 100%`)
  return `linear-gradient(${direction}, ${stops.join(", ")})`
}

/** Over the card's lower seven tenths, black at 94% along the bottom. */
const BOTTOM_SHADE = shade("to bottom", 0.3, 1, 0.94)

/** In from the leading side under the words, black at 72%. */
const SIDE_SHADE = shade("to left", 0, 0.7, 0.72)

/** The card's corners: a big card takes a bigger one than a rail's. */
const CARD_RADIUS = "rounded-[20px]"

/** A small, soft shadow under words on a picture. */
const TEXT_SHADOW = "[text-shadow:0_0_24px_rgb(0_0_0/0.45)]"

/** How far a swipe must go to change the title. */
const SWIPE_DISTANCE = 40

/** A title's pictures, best first: its backdrop, an episode still, a frame. */
function artOf(slide: FeaturedTitle) {
  return present(
    art(slide.title.images.backdrop, "large"),
    art(slide.item.episode?.still, "large"),
    frame(slide.item.id, "large"),
  )
}

/** Play on dark art: white, with the dark theme's ink. */
const inverseButton =
  "border-transparent bg-white text-[#0e0e10] hover:bg-[color-mix(in_oklch,white,#0e0e10_7%)] active:bg-[color-mix(in_oklch,white,#0e0e10_14%)]"

const playClass = cn(buttonVariants({ size: "lg" }), inverseButton)

export function HomeShowcase(props: {
  slides: FeaturedTitle[]
  showing: boolean
}) {
  const count = () => props.slides.length
  const [picked, setPicked] = createSignal(0)
  // Fewer titles after a refetch leave the last one on screen.
  const index = () => Math.min(picked(), Math.max(0, count() - 1))
  /** The title fading out under the one that took its place. */
  const [leaving, setLeaving] = createSignal<number | null>(null)
  /** Titles whose art may load: those shown, and the next. */
  const [primed, setPrimed] = createSignal<ReadonlySet<number>>(new Set([0, 1]))

  const [hovered, setHovered] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [pressed, setPressed] = createSignal(false)
  const paused = createMemo(
    () =>
      hovered() ||
      focused() ||
      pressed() ||
      count() < 2 ||
      reducedMotion() ||
      !pageVisible() ||
      !props.showing,
  )

  /** Changes the title in place; the one showing stays under the fade. */
  const show = (next: number) => {
    const total = count()
    if (total < 1) return
    const target = ((next % total) + total) % total
    const from = index()
    if (target === from) return
    setLeaving(reducedMotion() ? null : from)
    setPicked(target)
    setPrimed((seen) => new Set([...seen, target, (target + 1) % total]))
  }

  createEffect(
    () => props.showing,
    (showing) => {
      if (showing) return
      setLeaving(null)
      setPicked(0)
      // Leaving the page doesn't always say so to the card.
      setHovered(false)
      setFocused(false)
      setPressed(false)
    },
    { defer: true },
  )

  // The title that left is gone once the new one has faded in over it.
  createEffect(leaving, (gone) => {
    if (gone === null) return
    const timer = window.setTimeout(() => setLeaving(null), FADE_MS)
    return () => window.clearTimeout(timer)
  })

  // Eight seconds wherever it rests, from each change, manual or not.
  createEffect(
    () => ({ at: index(), held: paused() }),
    ({ at, held }) => {
      if (held) return
      const timer = window.setTimeout(() => show(at + 1), ADVANCE_MS)
      return () => window.clearTimeout(timer)
    },
  )

  const layout = createMemo(() => {
    const window = viewport()
    const base = baseHeight(window)
    return {
      height: showcaseHeight(window),
      words: wordsWidth(window),
      logo: logoHeight(base),
      name: titleSize(base),
      overview: overviewLines(window),
    }
  })

  // A swipe toward the start shows the next title, as turning a page does.
  let swipeFrom: { x: number; y: number } | null = null
  // A swipe's click must not open the title. Time-stamped so a later
  // keyboard click isn't swallowed by a swipe that produced no click.
  let swipedAt = 0

  const current = () => props.slides[index()]

  return (
    <section
      aria-roledescription={tr("media.hero.carousel")}
      aria-label={tr("media.hero.label")}
      class={pageGutter}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusIn={(event) => {
        // A pointer's focus comes with a hover, which holds it already. A
        // keyboard's stays after the pointer leaves, so it holds it now.
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          setFocused(true)
        }
      }}
      onFocusOut={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          setFocused(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") show(index() + 1)
        else if (event.key === "ArrowLeft") show(index() - 1)
      }}
    >
      <div
        ref={(element) => {
          // Solid has no capture-phase prop; a listener of its own does it.
          element.addEventListener(
            "click",
            (event) => {
              // The click a swipe ends with must not follow its link, but a
              // later one may.
              if (performance.now() - swipedAt > 500) return
              event.preventDefault()
              event.stopPropagation()
            },
            { capture: true },
          )
        }}
        class={cn(
          CARD_RADIUS,
          "dark text-foreground relative isolate cursor-pointer overflow-hidden bg-[#141416] select-none [clip-path:inset(0_round_20px)]",
        )}
        style={{ height: `${layout().height}px` }}
        onDragStart={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          setPressed(true)
          swipeFrom = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          setPressed(false)
          const from = swipeFrom
          swipeFrom = null
          if (!from) return
          const dx = event.clientX - from.x
          const dy = event.clientY - from.y
          if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) {
            return
          }
          swipedAt = performance.now()
          show(index() + (dx < 0 ? 1 : -1))
        }}
        onPointerCancel={() => {
          setPressed(false)
          swipeFrom = null
        }}
      >
        {/*
         * The art fades out over the card's bottom corner radius, onto the
         * card's own fill under the bottom shade. Where the card's edge
         * falls between device pixels, as at 80% zoom, the art and the
         * shade each get only part of that last row, so the shade can't
         * cover the art there and the art shows as a bright line.
         */}
        <For each={props.slides} keyed={(slide) => slide.title.id}>
          {(slide, i) => (
            <div
              aria-hidden="true"
              class={[
                "absolute inset-0 [mask-image:linear-gradient(to_top,transparent,black_20px)]",
                tone(slide().title.id),
                i() === index()
                  ? "z-10 opacity-100 transition-opacity ease-out motion-reduce:transition-none"
                  : i() === leaving()
                    ? "z-0 opacity-100"
                    : "z-0 opacity-0",
              ]}
              style={{ "transition-duration": `${FADE_MS}ms` }}
            >
              <Show when={primed().has(i()) || i() === index()}>
                <Picture
                  sources={artOf(slide())}
                  eager={i() === index()}
                  class="object-top"
                />
              </Show>
            </div>
          )}
        </For>
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-20"
          style={{ "background-image": BOTTOM_SHADE }}
        />
        <div
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 z-20"
          style={{ "background-image": SIDE_SHADE }}
        />
        {/* The card's surface is the title's link. The Play button and the
            pager sit above it, so only they do their own work. */}
        <Show when={current()}>
          {(slide) => (
            <Link
              to="/titles/$titleId"
              params={{ titleId: slide().title.id }}
              aria-label={slide().title.name}
              class="focus-visible:ring-ring absolute inset-0 z-20 rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-inset"
            />
          )}
        </Show>
        <div
          class="pointer-events-none absolute z-30"
          style={{
            left: `${SHOWCASE_PADDING}px`,
            bottom: `${WORDS_BOTTOM}px`,
            width: `${layout().words}px`,
          }}
        >
          <For each={props.slides} keyed={(slide) => slide.title.id}>
            {(slide, i) => (
              // Only a title that has shown, or shows next, has words to
              // build; the rest are hidden from everyone until then.
              <Show when={primed().has(i()) || i() === index()}>
                <SlideWords
                  slide={slide()}
                  active={i() === index()}
                  leaving={i() === leaving()}
                  crossing={leaving() !== null}
                  position={tr("media.hero.position", {
                    index: i() + 1,
                    count: count(),
                  })}
                  width={layout().words}
                  logoHeight={layout().logo}
                  nameSize={layout().name}
                  overviewLines={layout().overview}
                />
              </Show>
            )}
          </For>
        </div>
        <Show when={current()}>
          {(slide) => <SlideButtons slide={slide()} />}
        </Show>
        <Show when={count() > 1}>
          {/*
           * The pager, low on the trailing side on the buttons' line, over
           * the bottom shade, which is near black there on any art.
           */}
          <div
            class="absolute z-30 flex h-10 items-center"
            style={{
              right: `${SHOWCASE_PADDING - 8}px`,
              bottom: `${SHOWCASE_PADDING}px`,
            }}
          >
            <PagerButton
              label={tr("media.hero.previous")}
              icon={ChevronLeft}
              onClick={() => show(index() - 1)}
            />
            <nav aria-label={tr("media.hero.slides")} class="flex items-center">
              <For each={props.slides} keyed={(slide) => slide.title.id}>
                {(_slide, i) => (
                  <button
                    type="button"
                    aria-label={tr("media.hero.showSlide", { index: i() + 1 })}
                    aria-current={i() === index() ? "true" : undefined}
                    onClick={() => show(i())}
                    class="group/dot grid h-8 place-items-center px-1.5 outline-none"
                  >
                    <span
                      class={[
                        "group-focus-visible/dot:ring-ring block h-1.5 rounded-full transition-[width,background-color] duration-150 group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-offset-2 group-focus-visible/dot:ring-offset-black motion-reduce:transition-none",
                        i() === index()
                          ? "bg-foreground/90 w-5"
                          : "bg-foreground/35 group-hover/dot:bg-foreground/70 w-1.5",
                      ]}
                    />
                  </button>
                )}
              </For>
            </nav>
            <PagerButton
              label={tr("media.hero.next")}
              icon={ChevronRight}
              onClick={() => show(index() + 1)}
            />
          </div>
        </Show>
        {/* The card's hairline, over the art. It fades out under the
            bottom shade, which would otherwise leave a bright line where
            the card meets the page. */}
        <div
          aria-hidden="true"
          class={cn(
            CARD_RADIUS,
            "border-foreground/10 pointer-events-none absolute inset-0 z-40 border [mask-image:linear-gradient(to_top,transparent,black_48px)]",
          )}
        />
      </div>
    </section>
  )
}

function PagerButton(props: {
  label: string
  icon: typeof ChevronLeft
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={() => props.onClick()}
      class="text-foreground/70 hover:bg-foreground/12 hover:text-foreground focus-visible:outline-ring grid size-8 place-items-center rounded-full transition-colors outline-none focus-visible:outline-2 focus-visible:outline-solid motion-reduce:transition-none"
    >
      <Icon icon={props.icon} class="size-4" />
    </button>
  )
}

/**
 * A title's words: its logo or its name, its facts and genres, its
 * overview, and how far the person is. The leaving one's are gone by
 * halfway through the fade, and the new one's come in over the second
 * half, so the two never read over each other.
 */
function SlideWords(props: {
  slide: FeaturedTitle
  active: boolean
  leaving: boolean
  /** A change is fading. */
  crossing: boolean
  position: string
  width: number
  logoHeight: number
  nameSize: number
  overviewLines: number
}) {
  const title = () => props.slide.title
  const facts = () =>
    [
      title().year === null ? null : String(title().year),
      title().kind === "show" && props.slide.count > 1
        ? tr("media.episodeCount", { count: props.slide.count })
        : null,
    ].filter((fact) => fact !== null)
  const genres = () => title().genres.slice(0, 3)
  const ratio = () => progressRatio(props.slide.item)
  const left = () => timeLeft(props.slide.item)
  const half = FADE_MS / 2
  return (
    <div
      // The WAI-ARIA carousel pattern marks each slide as a group.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-roledescription={tr("media.hero.slide")}
      aria-label={props.position}
      aria-hidden={props.active ? undefined : "true"}
      inert={!props.active}
      class={[
        "absolute inset-x-0 bottom-0 flex flex-col items-start motion-reduce:transition-none",
        props.active ? "opacity-100" : "pointer-events-none opacity-0",
        {
          "transition-opacity": props.active || props.leaving,
          // Words built for the change itself fade in from nothing too.
          "starting:opacity-0": props.active && props.crossing,
        },
      ]}
      style={{
        "transition-duration": `${half}ms`,
        "transition-delay":
          props.active && props.crossing ? `${half}ms` : "0ms",
      }}
    >
      <TitleMark
        name={title().name}
        logo={title().images.logo}
        width={Math.min(LOGO_MAX, props.width)}
        height={props.logoHeight}
        nameSize={props.nameSize}
      />
      <Show
        when={
          facts().length > 0 ||
          title().contentRating !== null ||
          title().rating !== null
        }
      >
        <div
          class={cn(
            "text-foreground/80 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-base",
            TEXT_SHADOW,
          )}
        >
          <Show when={facts().length > 0}>
            <span class="line-clamp-1">{facts().join(" · ")}</span>
          </Show>
          <Show when={title().contentRating}>
            {(rating) => (
              <span class="border-foreground/30 rounded border px-1.5 text-xs leading-5 font-medium">
                {rating()}
              </span>
            )}
          </Show>
          <Score score={title().rating} />
        </div>
      </Show>
      <Show when={genres().length > 0}>
        <p
          class={cn(
            "text-foreground/80 mt-2 w-full truncate text-sm",
            TEXT_SHADOW,
          )}
        >
          {genres().join(" · ")}
        </p>
      </Show>
      <Show when={props.overviewLines > 0 && title().overview}>
        {(overview) => (
          <p
            class="text-foreground/72 overflow-hidden text-sm text-pretty"
            style={{
              "margin-top": `${OVERVIEW_GAP}px`,
              "line-height": `${OVERVIEW_LEADING}px`,
              display: "-webkit-box",
              "-webkit-box-orient": "vertical",
              "-webkit-line-clamp": String(props.overviewLines),
            }}
          >
            {overview()}
          </p>
        )}
      </Show>
      <Show when={ratio() !== null && left()}>
        {(time) => (
          <div class="mt-4 flex w-full max-w-80 items-center gap-3">
            <span
              aria-hidden="true"
              class="bg-foreground/25 h-1 flex-1 overflow-hidden rounded-full"
            >
              <span
                class="bg-foreground block h-full rounded-full"
                style={{ width: `${Math.min(100, (ratio() ?? 0) * 100)}%` }}
              />
            </span>
            <span class="text-foreground/80 shrink-0 text-xs">
              {[episodeCode(props.slide.item), time()]
                .filter((part) => part !== null)
                .join(" · ")}
            </span>
          </div>
        )}
      </Show>
    </div>
  )
}

/**
 * The title's logo when the provider has one, else its name in large bold
 * white. Either way a screen reader hears the name, as the slide's heading.
 */
function TitleMark(props: {
  name: string
  logo: FeaturedTitle["title"]["images"]["logo"]
  width: number
  height: number
  nameSize: number
}) {
  const [failed, setFailed] = createSignal<string | null>(null)
  const logo = () => {
    const image = props.logo
    if (!image || failed() === image.id) return null
    return { id: image.id, source: art(image, "medium") }
  }
  return (
    <Show
      when={logo()}
      fallback={
        <h2
          class={cn(
            "line-clamp-2 font-bold text-balance text-white",
            TEXT_SHADOW,
          )}
          style={{
            "font-size": `${props.nameSize}px`,
            "line-height": "1.1",
            "letter-spacing": "-0.02em",
          }}
        >
          {props.name}
        </h2>
      }
    >
      {(image) => (
        <h2 class="flex items-end" style={{ height: `${props.height}px` }}>
          <span class="sr-only">{props.name}</span>
          {/* `src` last, so the browser picks from `srcset` once. */}
          <img
            alt=""
            draggable={false}
            sizes={`${LOGO_MAX}px`}
            srcset={image().source?.srcSet}
            src={image().source?.src}
            onError={() => setFailed(image().id)}
            class="max-h-full object-contain object-left-bottom drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)]"
            style={{ "max-width": `${props.width}px` }}
          />
        </h2>
      )}
    </Show>
  )
}

/**
 * Play, from where the person is, for the title showing. It stays while
 * the words and the art change behind it.
 */
function SlideButtons(props: { slide: FeaturedTitle }) {
  const resuming = () => timeLeft(props.slide.item) !== null
  return (
    <div
      class="absolute z-30 flex"
      style={{
        left: `${SHOWCASE_PADDING}px`,
        bottom: `${SHOWCASE_PADDING}px`,
      }}
    >
      <Link
        to="/watch/$itemId"
        params={{ itemId: props.slide.item.id }}
        class={playClass}
      >
        <Icon icon={Play} fill="currentColor" />
        {resuming() ? tr("title.resume") : tr("title.play")}
      </Link>
    </div>
  )
}

/**
 * The showcase's place while the featured titles load: the card as dark as
 * it'll be and as tall, with the words' places low on the leading side, so
 * light doesn't flash to dark and the page doesn't jump.
 */
export function HomeShowcaseSkeleton() {
  const height = () => showcaseHeight(viewport())
  const words = () => wordsWidth(viewport())
  return (
    <div class={pageGutter} aria-busy="true">
      <div
        class={cn(
          CARD_RADIUS,
          "dark flex flex-col justify-end bg-[#141416] p-8",
        )}
        style={{ height: `${height()}px` }}
      >
        <Skeleton
          class="bg-secondary h-10"
          style={{ width: `${Math.min(words(), 320)}px` }}
        />
        <Skeleton class="bg-secondary mt-3 h-4 w-50" />
        <Skeleton
          class="bg-secondary mt-2.5 h-3"
          style={{ width: `${Math.min(words(), 440)}px` }}
        />
        <div class="mt-6 flex">
          <Skeleton class="bg-secondary h-10 w-28 rounded-lg" />
        </div>
      </div>
    </div>
  )
}

/*
 * A phone's featured titles, the Flutter phone's `FeaturedCarousel`: a row
 * of cards that swipes one at a time, each the title's backdrop under a
 * dark shade with its genres and its name in white. A tap opens the title.
 * Each card runs from margin to margin. It moves on every five seconds,
 * and back to the first after the last; not while a finger is on it, with
 * reduced motion, or while the page is out of sight. Out of the page
 * while another one shows, the row loses its place and starts again at
 * the first.
 */

const CAROUSEL_ADVANCE_MS = 5000

/** 16:9 across the row, but no more than 40% of the window. */
function carouselHeight(window: { width: number; height: number }) {
  return Math.min(((window.width - 32) * 9) / 16, window.height * 0.4)
}

const CAROUSEL_SHADE =
  "linear-gradient(to bottom, rgb(0 0 0 / 0.1) 0%, rgb(0 0 0 / 0.3) 40%, rgb(0 0 0 / 0.6) 70%, rgb(0 0 0 / 0.8) 100%)"

export function FeaturedCarousel(props: {
  slides: FeaturedTitle[]
  showing: boolean
}) {
  let row: HTMLUListElement | undefined
  const [touching, setTouching] = createSignal(false)
  const [at, setAt] = createSignal(0)
  const count = () => props.slides.length

  onSettled(() => {
    const el = row
    if (!el) return
    const update = () => {
      const width = el.firstElementChild?.clientWidth ?? el.clientWidth
      setAt(Math.round(el.scrollLeft / Math.max(1, width + 16)))
    }
    el.addEventListener("scrollend", update)
    return () => el.removeEventListener("scrollend", update)
  })

  createEffect(
    () => ({
      from: at(),
      held:
        touching() ||
        count() < 2 ||
        reducedMotion() ||
        !pageVisible() ||
        !props.showing,
    }),
    ({ from, held }) => {
      if (held) return
      const timer = window.setTimeout(() => {
        const el = row
        const card = el?.children[(from + 1) % count()]
        if (!el || !(card instanceof HTMLElement)) return
        el.scrollTo({ left: card.offsetLeft - 16, behavior: "smooth" })
      }, CAROUSEL_ADVANCE_MS)
      return () => window.clearTimeout(timer)
    },
  )

  createEffect(
    () => props.showing,
    (showing) => {
      if (showing) return
      setAt(0)
      setTouching(false)
    },
    { defer: true },
  )

  return (
    <section aria-label={tr("media.hero.label")}>
      <ul
        ref={(element) => (row = element)}
        onTouchStart={() => setTouching(true)}
        onTouchEnd={() => setTouching(false)}
        onTouchCancel={() => setTouching(false)}
        class="flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-4 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
      >
        <For each={props.slides} keyed={(slide) => slide.title.id}>
          {(slide, i) => (
            <li
              class="w-[calc(100vw-2rem)] shrink-0 snap-start"
              aria-label={tr("media.hero.position", {
                index: i() + 1,
                count: count(),
              })}
            >
              <Link
                to="/titles/$titleId"
                params={{ titleId: slide().title.id }}
                aria-label={[
                  slide().title.name,
                  slide().title.genres.slice(0, 3).join(" · "),
                  tr("media.hero.position", {
                    index: i() + 1,
                    count: count(),
                  }),
                ]
                  .filter((part) => part.length > 0)
                  .join(", ")}
                class={cn(
                  "group/carousel-card dark text-foreground focus-visible:ring-ring relative block overflow-hidden rounded-xl outline-none focus-visible:ring-2",
                  tone(slide().title.id),
                )}
                style={{ height: `${carouselHeight(viewport())}px` }}
              >
                <Picture
                  sources={artOf(slide())}
                  eager={i() === 0}
                  class="object-top"
                />
                <span
                  aria-hidden="true"
                  class="absolute inset-0"
                  style={{ "background-image": CAROUSEL_SHADE }}
                />
                <span
                  aria-hidden="true"
                  class="bg-foreground pointer-events-none absolute inset-0 opacity-0 transition-opacity group-active/carousel-card:opacity-10 motion-reduce:transition-none"
                />
                <span class="absolute inset-x-4 bottom-4 flex flex-col gap-1">
                  <Show when={slide().title.genres.length > 0}>
                    <span class="text-13px truncate font-medium text-white/80 [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                      {slide().title.genres.slice(0, 3).join(" · ")}
                    </span>
                  </Show>
                  <span class="text-22px line-clamp-2 font-semibold tracking-tight text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
                    {slide().title.name}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  class="border-foreground/10 pointer-events-none absolute inset-0 rounded-xl border"
                />
              </Link>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}

/** The carousel's place while the featured titles load. */
export function FeaturedCarouselSkeleton() {
  return (
    <div class="px-4" aria-busy="true">
      <div
        class="dark rounded-xl bg-[#141416]"
        style={{ height: `${carouselHeight(viewport())}px` }}
      />
    </div>
  )
}
