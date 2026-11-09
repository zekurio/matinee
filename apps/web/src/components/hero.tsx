import type { FeaturedTitle, MediaItem } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  PlayIcon,
  StarIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/shallow"

import { perLocale, tr } from "@/i18n"
import {
  art,
  episodeCode,
  frame,
  itemLabel,
  present,
  progressRatio,
  timeLeft,
} from "@/lib/media"
import { createHeroStore } from "@/stores/browse-hero"

import { pageColumn } from "./app-shell"
import { Blurhash } from "./blurhash"
import { Picture, tone } from "./media-item"

const ADVANCE_MS = 8000

const ratings = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)

/**
 * The banner's box, shared with Home's loading skeleton. A phone on its
 * side (short and from `sm` up) gets exactly the screen. Full bleed, like
 * `pageBleed`: it breaks out of the page column to the window edges and up
 * under the phone header or the floating bar. Negative margins rather than
 * a -50% translate: the translate lands on a half pixel at odd window
 * widths, and the zooming backdrop then shows past the shading at the edge.
 */
export const heroFrame =
  "relative mx-[calc(50%-50vw)] -mt-[calc(env(safe-area-inset-top)+4rem)] h-[min(86vh,880px)] min-h-[500px] w-screen sm:-mt-24 sm:max-lg:[@media(max-height:540px)]:h-svh sm:max-lg:[@media(max-height:540px)]:min-h-0"

/**
 * On phones and desktop, lets the banner take whatever height its flex
 * column leaves, so the rows under it fit in the first screen. Phones keep
 * room for the header and the library chips over its top, and the slide
 * under them.
 */
export const heroFill =
  "max-sm:h-auto max-sm:min-h-[calc(env(safe-area-inset-top)+20rem)] max-sm:flex-1 lg:h-auto lg:min-h-[360px] lg:flex-1"

// Phones split the row between the buttons.
const heroButton = "max-sm:h-11 max-sm:flex-1"
const heroSecondary =
  "border-foreground/10 bg-foreground/15 text-foreground backdrop-blur hover:bg-foreground/25"

function Backdrop({
  slide,
  active,
  primed,
}: {
  slide: FeaturedTitle
  active: boolean
  /** Load the art: the slide showed, or comes next. */
  primed: boolean
}) {
  const { item } = slide
  const label = itemLabel(item)
  // The show's art first; a still or frame only when it has none.
  const sources = present(
    art(item.title?.images.backdrop, "large"),
    art(item.episode?.still, "large"),
    frame(item.id, "large"),
  )
  const ambient = sources[0]?.placeholder
  return (
    <div
      aria-hidden
      className={cn(
        // Short of the bottom edge by a pixel, and clipped there through the
        // push-in: a banner of fractional height antialiases that edge, and
        // the art showed through the fade there as a thin line.
        "absolute inset-x-0 top-0 bottom-px overflow-hidden transition-opacity duration-700 motion-reduce:transition-none",
        active ? "opacity-100" : "opacity-0",
        tone(label.showKey),
      )}
    >
      {/* Phones: the art starts under the header row, which would cover
          the top of it, faces and all, and fades in from the art's own
          colors blurred behind the header. */}
      {ambient && (
        <Blurhash
          placeholder={ambient}
          className="absolute inset-0 size-full object-cover opacity-70 sm:hidden"
        />
      )}
      <div className="absolute inset-x-0 top-0 bottom-0 max-sm:top-[calc(env(safe-area-inset-top)+3.5rem)] max-sm:[mask-image:linear-gradient(to_bottom,transparent,black_3rem)]">
        {/* A slow push-in while the slide shows. The reset waits until the
            fade-out ends, so it never jumps on screen. */}
        <div
          className={cn(
            "absolute inset-0 transition-transform motion-reduce:transition-none",
            active
              ? "motion-safe:scale-[1.06] motion-safe:duration-[10000ms] motion-safe:ease-out"
              : "scale-100 delay-700 duration-0",
          )}
        >
          {primed && (
            <Picture sources={sources} eager={active} className="object-top" />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * The banner at the top of Home: new and well-rated titles over their art,
 * with Play starting where the user is in each. Advances on its own unless
 * the user hovers, focuses, or prefers reduced motion.
 */
export function Hero({
  slides,
  top,
  className,
}: {
  slides: FeaturedTitle[]
  /** Shown over the top of the banner on phones, like the library chips. */
  top?: ReactNode
  className?: string
}) {
  const [store] = useState(createHeroStore)
  const { index: picked, held } = useStore(
    store,
    useShallow((state) => ({ index: state.index, held: state.held })),
  )
  const { show, hold, release } = store.getState()
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const count = slides.length
  // Fewer slides after a refetch leave the last one on screen.
  const index = Math.min(picked, count - 1)
  const current = slides[index]

  // Slides load their art once they show, and the next one halfway through
  // the current one, so the first screen loads one backdrop, not all.
  const [primed, setPrimed] = useState<ReadonlySet<number>>(
    () => new Set([index]),
  )
  if (!primed.has(index)) setPrimed(new Set(primed).add(index))
  useEffect(() => {
    if (count < 2) return
    const next = (index + 1) % count
    const timer = window.setTimeout(
      () => setPrimed((loaded) => new Set(loaded).add(next)),
      ADVANCE_MS / 2,
    )
    return () => window.clearTimeout(timer)
  }, [index, count])

  // Each slide change restarts the timer, so a manual change gets a full
  // interval too.
  useEffect(() => {
    if (held || reducedMotion || count < 2) return
    const timer = window.setTimeout(() => show(index + 1, count), ADVANCE_MS)
    return () => window.clearTimeout(timer)
  }, [index, held, reducedMotion, count, show])

  if (!current) return null
  const go = (next: number) => show(next, count)

  return (
    <section
      aria-roledescription={tr("media.hero.carousel")}
      aria-label={tr("media.hero.label")}
      // Hovering or focusing anywhere in the banner holds the current slide.
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          release()
        }
      }}
      className={cn(heroFrame, "overflow-hidden", className)}
    >
      {slides.map((slide, i) => (
        <Backdrop
          key={slide.title.id}
          slide={slide}
          active={i === index}
          primed={primed.has(i)}
        />
      ))}
      {/* Darken where the text sits and fade into the page below. */}
      <div
        aria-hidden
        className="from-background/95 via-background/60 absolute inset-0 bg-gradient-to-r to-transparent"
      />
      <div
        aria-hidden
        className="from-background via-background/40 absolute inset-0 bg-gradient-to-t via-35% to-transparent"
      />
      {top && (
        // Under the phone header, where a page's content starts.
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+4rem)] z-10 sm:hidden">
          {top}
        </div>
      )}

      {slides.map((slide, i) => (
        <SlideContent
          key={slide.title.id}
          slide={slide}
          active={i === index}
          primed={primed.has(i)}
          position={tr("media.hero.position", { index: i + 1, count })}
        />
      ))}
      <HeroButtons slide={current} />

      {count > 1 && (
        // Phones center the dots under the buttons; desktop sets them level
        // with the buttons. The full-width strip lets clicks through so it
        // doesn't cover them; only the controls take pointer events.
        <div className="pointer-events-none absolute inset-x-0 bottom-3 sm:bottom-12 lg:bottom-[34px] sm:max-lg:[@media(max-height:540px)]:bottom-3">
          <div
            className={cn(
              pageColumn,
              "flex items-center justify-center gap-3 *:pointer-events-auto sm:justify-end",
            )}
          >
            <nav
              className="flex items-center gap-1.5 [@media(pointer:coarse)]:gap-0"
              aria-label={tr("media.hero.slides")}
            >
              {slides.map((slide, i) => (
                <button
                  key={slide.title.id}
                  type="button"
                  aria-label={tr("media.hero.showSlide", { index: i + 1 })}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => go(i)}
                  // The ring goes round the dot, not the wider tap target.
                  className="group/dot grid h-6 place-items-center px-0.5 outline-none [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:px-1.5"
                >
                  <span
                    className={cn(
                      "group-focus-visible/dot:ring-ring group-focus-visible/dot:ring-offset-background block h-1.5 rounded-full transition-all group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-offset-2 motion-reduce:transition-none",
                      i === index
                        ? "w-5 bg-foreground"
                        : "w-1.5 bg-foreground/40",
                    )}
                  />
                </button>
              ))}
            </nav>
            <div className="flex gap-1 max-sm:hidden">
              <button
                type="button"
                aria-label={tr("media.hero.previous")}
                onClick={() => go(index - 1)}
                className="focus-visible:ring-ring text-foreground/75 hover:text-foreground grid size-9 place-items-center rounded-full drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)] transition-colors outline-none focus-visible:ring-2 [&_svg]:size-5"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                aria-label={tr("media.hero.next")}
                onClick={() => go(index + 1)}
                className="focus-visible:ring-ring text-foreground/75 hover:text-foreground grid size-9 place-items-center rounded-full drop-shadow-[0_1px_4px_rgb(0_0_0/0.5)] transition-colors outline-none focus-visible:ring-2 [&_svg]:size-5"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * The title as its logo when the provider has one, else as text. The text
 * stays for screen readers either way.
 */
function TitleMark({ item, primed }: { item: MediaItem; primed: boolean }) {
  const label = itemLabel(item)
  const name = label.code ? label.showName : label.title
  // Transparent, so no placeholder: it would show as a smudge.
  // Unprimed, the slide is hidden, so the name stands in without loading.
  const logo = primed ? art(item.title?.images.logo, "large") : null
  const [logoFailed, setLogoFailed] = useState(false)
  if (logo && !logoFailed) {
    return (
      <h2>
        <span className="sr-only">{name}</span>
        <img
          src={logo.src}
          srcSet={logo.srcSet}
          sizes="(min-width: 640px) 32rem, 80vw"
          alt=""
          onError={() => setLogoFailed(true)}
          className="max-h-[clamp(3.5rem,9svh,6rem)] max-w-[min(80vw,32rem)] object-contain object-left-bottom drop-shadow-[0_2px_12px_rgb(0_0_0/0.5)] sm:max-h-[clamp(3.5rem,16vh,9rem)] lg:max-h-[clamp(6rem,14vh,11rem)]"
        />
      </h2>
    )
  }
  return (
    // Scales with the window's height from `sm` up: on desktop the banner
    // shares the first screen with the rows below it, and a phone on its
    // side has little height to give.
    <h2 className="text-foreground line-clamp-2 max-w-2xl text-4xl leading-[1.05] font-bold tracking-tight text-balance [text-shadow:0_2px_24px_rgb(0_0_0/0.45)] sm:text-[clamp(2.25rem,7vh,3rem)] lg:text-[clamp(3rem,5.5vh,4.5rem)]">
      {name}
    </h2>
  )
}

function SlideContent({
  slide,
  active,
  primed,
  position,
}: {
  slide: FeaturedTitle
  active: boolean
  /** Load the logo, like the backdrop. */
  primed: boolean
  position: string
}) {
  const { item, title } = slide
  const label = itemLabel(item)
  const code = episodeCode(item)
  const ratio = progressRatio(item)
  const left = timeLeft(item)
  // The file Play starts is part way through.
  const resuming = left !== null && ratio !== null
  const facts = [
    label.year,
    title.kind === "show" && slide.count > 1
      ? tr("media.episodeCount", { count: slide.count })
      : null,
  ].filter(Boolean)
  const genres = title.genres.slice(0, 3)
  return (
    <div
      // The WAI-ARIA carousel pattern marks each slide as a group.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-roledescription={tr("media.hero.slide")}
      aria-label={position}
      aria-hidden={!active}
      inert={!active}
      className={cn(
        // Above the buttons, which stay while the slides change: their
        // place, plus their height and the gap over them.
        "absolute inset-x-0 bottom-[108px] transition-opacity duration-500 motion-reduce:transition-none sm:bottom-[176px] lg:bottom-24 sm:max-lg:[@media(max-height:540px)]:bottom-[104px]",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className={pageColumn}>
        <TitleMark item={item} primed={primed} />
        <div className="text-foreground/80 mt-3 flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:text-base">
          {facts.length > 0 && (
            <span className="line-clamp-1">{facts.join(" · ")}</span>
          )}
          {title.contentRating && (
            <span className="border-foreground/30 rounded border px-1.5 text-xs leading-5 font-medium">
              {title.contentRating}
            </span>
          )}
          {title.rating !== null && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <StarIcon
                aria-hidden
                className="size-3.5 fill-current text-amber-300"
              />
              <span className="sr-only">{tr("media.hero.rated")}</span>
              {ratings().format(title.rating)}
            </span>
          )}
        </div>
        {genres.length > 0 && (
          // Short phones give the banner too little room for them.
          <ul
            aria-label={tr("media.hero.genres")}
            className="mt-3 flex flex-wrap gap-1.5 sm:max-lg:[@media(max-height:540px)]:hidden max-sm:[@media(max-height:860px)]:hidden"
          >
            {genres.map((genre) => (
              <li key={genre}>
                <Link
                  to="/genres/$genre"
                  params={{ genre }}
                  className="border-foreground/15 bg-background/30 text-foreground/85 hover:border-foreground/35 hover:text-foreground focus-visible:ring-ring block rounded-full border px-2.5 py-0.5 text-xs backdrop-blur-sm outline-none focus-visible:ring-2"
                >
                  {genre}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {title.overview && (
          // Short windows give the banner too little room for it.
          <p className="text-foreground/70 mt-2 line-clamp-3 max-w-xl text-sm leading-6 max-sm:hidden sm:max-lg:[@media(max-height:700px)]:hidden lg:[@media(max-height:880px)]:hidden">
            {title.overview}
          </p>
        )}
        {resuming && (
          <div className="mt-4 flex max-w-xs items-center gap-3">
            <span
              aria-hidden
              className="bg-foreground/25 h-1 flex-1 overflow-hidden rounded-full"
            >
              <span
                className="bg-foreground block h-full rounded-full"
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </span>
            <span className="text-foreground/80 text-xs tabular-nums">
              {code ? `${code} · ${left}` : left}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Play and the title's page, for the slide showing. One row that stays in
 * place while the slides fade under and over it, and reads the same for
 * every slide so nothing in it changes: Play picks up where the person is,
 * which the slide's progress bar shows, and a show's page holds its
 * episodes.
 */
function HeroButtons({ slide }: { slide: FeaturedTitle }) {
  const { item, title } = slide
  return (
    <div className="absolute inset-x-0 bottom-12 sm:bottom-28 lg:bottom-8 sm:max-lg:[@media(max-height:540px)]:bottom-12">
      <div className={cn(pageColumn, "flex gap-2")}>
        <Link
          to="/watch/$itemId"
          params={{ itemId: item.id }}
          className={buttonVariants({ size: "lg", className: heroButton })}
        >
          <PlayIcon className="fill-current" />
          {tr("media.hero.play")}
        </Link>
        <Link
          to="/titles/$titleId"
          params={{ titleId: title.id }}
          className={buttonVariants({
            size: "lg",
            variant: "secondary",
            className: cn(heroButton, heroSecondary),
          })}
        >
          <InfoIcon />
          {tr("media.hero.details")}
        </Link>
      </div>
    </div>
  )
}
