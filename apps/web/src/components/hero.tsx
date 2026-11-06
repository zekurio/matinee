import { mediaThumbnailPath, type MediaItem } from "@matinee/contracts"
import { buttonVariants } from "@matinee/ui/components/button"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  InfoIcon,
  ListIcon,
  PlayIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  art,
  episodeCode,
  itemLabel,
  progressRatio,
  timeLeft,
} from "@/lib/media"

import { Picture, tone } from "./media-item"

export type HeroSlide = {
  item: MediaItem
  /** Why it's featured, shown above the title. */
  reason: "resume" | "next" | "new"
  /** Files in the show, for new shows. */
  count?: number
  libraryName?: string
}

const ADVANCE_MS = 8000

// Phones split the row between the buttons.
const heroButton = "max-sm:h-11 max-sm:flex-1"
const heroSecondary =
  "border-white/10 bg-white/15 text-white backdrop-blur hover:bg-white/25"

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const onChange = () => setReduced(query.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function reasonText(slide: HeroSlide): string {
  if (slide.reason === "resume") return "Continue watching"
  if (slide.reason === "next") return "Next up"
  return slide.libraryName ? `New in ${slide.libraryName}` : "Recently added"
}

function Backdrop({ slide, active }: { slide: HeroSlide; active: boolean }) {
  const { item } = slide
  const label = itemLabel(item)
  // The show's art first; a still or frame only when it has none.
  const sources = [
    art(item.title?.images.backdrop, "large"),
    art(item.episode?.still, "large"),
    mediaThumbnailPath(item.id, "large"),
  ].filter((src): src is string => src !== null)
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none",
        active ? "opacity-100" : "opacity-0",
        tone(label.showKey),
      )}
    >
      <Picture sources={sources} eager={active} className="object-top" />
    </div>
  )
}

/**
 * The banner at the top of Home: a frame from the featured file behind its
 * title, with the action that fits (resume, play next, or start a new
 * show). Advances on its own unless the user hovers, focuses, or prefers
 * reduced motion.
 */
export function Hero({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const root = useRef<HTMLElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const count = slides.length
  const current = slides[Math.min(index, count - 1)]

  // Each slide change restarts the timer, so a manual change gets a full
  // interval too.
  useEffect(() => {
    if (paused || reducedMotion || count < 2) return
    const timer = window.setTimeout(
      () => setIndex((index + 1) % count),
      ADVANCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [index, paused, reducedMotion, count])

  // Hovering or focusing anywhere in the banner holds the current slide.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const hold = () => setPaused(true)
    const release = () => setPaused(false)
    const blur = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (!(next instanceof Node && el.contains(next))) setPaused(false)
    }
    el.addEventListener("mouseenter", hold)
    el.addEventListener("mouseleave", release)
    el.addEventListener("focusin", hold)
    el.addEventListener("focusout", blur)
    return () => {
      el.removeEventListener("mouseenter", hold)
      el.removeEventListener("mouseleave", release)
      el.removeEventListener("focusin", hold)
      el.removeEventListener("focusout", blur)
    }
  }, [])

  if (!current) return null
  const go = (next: number) => setIndex((next + count) % count)

  return (
    <section
      ref={root}
      aria-roledescription="carousel"
      aria-label="Featured"
      // Full bleed: break out of the page container to the window edges and
      // up under the floating bar.
      className="relative left-1/2 -mt-[calc(env(safe-area-inset-top)+1.5rem)] h-[min(72vh,620px)] min-h-[440px] w-screen -translate-x-1/2 overflow-hidden sm:-mt-24"
    >
      {slides.map((slide, i) => (
        <Backdrop key={slide.item.id} slide={slide} active={i === index} />
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

      {slides.map((slide, i) => (
        <SlideContent
          key={slide.item.id}
          slide={slide}
          active={i === index}
          position={`${i + 1} of ${count}`}
        />
      ))}

      {count > 1 && (
        <div className="absolute inset-x-0 bottom-6 sm:bottom-10">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-1.5" aria-label="Slides">
              {slides.map((slide, i) => (
                <button
                  key={slide.item.id}
                  type="button"
                  aria-label={`Show slide ${i + 1}`}
                  aria-current={i === index ? "true" : undefined}
                  onClick={() => go(i)}
                  className="focus-visible:ring-ring grid h-6 place-items-center rounded-full px-0.5 outline-none focus-visible:ring-2"
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full transition-all motion-reduce:transition-none",
                      i === index ? "w-5 bg-white" : "w-1.5 bg-white/40",
                    )}
                  />
                </button>
              ))}
            </nav>
            <div className="flex gap-1 max-sm:hidden">
              <button
                type="button"
                aria-label="Previous slide"
                onClick={() => go(index - 1)}
                className="focus-visible:ring-ring grid size-9 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur outline-none hover:bg-black/50 focus-visible:ring-2"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Next slide"
                onClick={() => go(index + 1)}
                className="focus-visible:ring-ring grid size-9 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur outline-none hover:bg-black/50 focus-visible:ring-2"
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
function TitleMark({ item }: { item: MediaItem }) {
  const label = itemLabel(item)
  const name = label.code ? label.showName : label.title
  const logo = art(item.title?.images.logo, "large")
  const [logoFailed, setLogoFailed] = useState(false)
  if (logo && !logoFailed) {
    return (
      <h2 className="mt-3">
        <span className="sr-only">{name}</span>
        <img
          src={logo}
          alt=""
          onError={() => setLogoFailed(true)}
          className="max-h-24 max-w-[min(80vw,26rem)] object-contain object-left-bottom drop-shadow-[0_2px_12px_rgb(0_0_0/0.5)] sm:max-h-32"
        />
      </h2>
    )
  }
  return (
    <h2 className="mt-2 line-clamp-2 max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight text-balance text-white sm:text-5xl lg:text-6xl">
      {name}
    </h2>
  )
}

function SlideContent({
  slide,
  active,
  position,
}: {
  slide: HeroSlide
  active: boolean
  position: string
}) {
  const { item } = slide
  const label = itemLabel(item)
  const code = episodeCode(item)
  const ratio = progressRatio(item)
  const left = timeLeft(item)
  const meta =
    slide.reason === "new" && slide.count && slide.count > 1
      ? [label.year, `${slide.count} episodes`]
      : [label.year, code ? `${code}: ${label.title}` : null]
  // New titles introduce themselves; episodes say what happens in them.
  const overview =
    slide.reason === "new"
      ? item.title?.overview
      : (item.episode?.overview ?? item.title?.overview)
  return (
    <div
      // The WAI-ARIA carousel pattern marks each slide as a group.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-roledescription="slide"
      aria-label={position}
      aria-hidden={!active}
      inert={!active}
      className={cn(
        "absolute inset-x-0 bottom-20 transition-opacity duration-500 motion-reduce:transition-none sm:bottom-24",
        active ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-white/80">{reasonText(slide)}</p>
        <TitleMark item={item} />
        <p className="mt-3 line-clamp-1 max-w-xl text-sm text-white/80 sm:text-base">
          {meta.filter(Boolean).join(" · ")}
        </p>
        {overview && (
          <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-6 text-white/70 max-sm:hidden">
            {overview}
          </p>
        )}
        {slide.reason === "resume" && ratio !== null && (
          <div className="mt-4 flex max-w-xs items-center gap-3">
            <span
              aria-hidden
              className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
            >
              <span
                className="block h-full rounded-full bg-white"
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </span>
            <span className="text-xs text-white/80 tabular-nums">{left}</span>
          </div>
        )}
        <div className="mt-6 flex gap-2">
          <Link
            to="/watch/$itemId"
            params={{ itemId: item.id }}
            className={buttonVariants({ size: "lg", className: heroButton })}
          >
            <PlayIcon className="fill-current" />
            {slide.reason === "resume" ? "Resume" : "Play"}
          </Link>
          {item.title && item.title.kind !== "folder" ? (
            <Link
              to="/titles/$titleId"
              params={{ titleId: item.title.id }}
              className={buttonVariants({
                size: "lg",
                variant: "secondary",
                className: cn(heroButton, heroSecondary),
              })}
            >
              {item.title.kind === "show" ? <ListIcon /> : <InfoIcon />}
              {item.title.kind === "show" ? "Episodes" : "Details"}
            </Link>
          ) : (
            label.code && (
              <Link
                to="/libraries/$libraryId"
                params={{ libraryId: item.libraryId }}
                search={{ show: label.showKey }}
                className={buttonVariants({
                  size: "lg",
                  variant: "secondary",
                  className: cn(heroButton, heroSecondary),
                })}
              >
                <ListIcon />
                Episodes
              </Link>
            )
          )}
        </div>
      </div>
    </div>
  )
}
