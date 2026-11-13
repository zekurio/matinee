import {
  artworkPath,
  type LoginBackdrop as LoginBackdropSettings,
  type LoginBackdropTile,
} from "@matinee/contracts"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, useMemo } from "react"

import { orpc } from "@/lib/rpc"

/*
 * The wall behind the login form, after alloy's: rows of artwork that drift
 * in turns left and right, the whole wall sloped, blurred, and faded into
 * the page's background so the form stays readable. Each row is its own
 * shuffle of the tiles, so posters and thumbs fall differently in every
 * row of a mixed wall.
 */

const SLOPE_DEGREES = -12
const ROWS = 10
/** Seconds a row takes to drift one copy's width, per row. */
const DURATIONS = [96, 120, 104, 132, 100, 124, 112, 140, 108, 128] as const
/**
 * How wide one copy of a row is at least, in row heights. A row loops
 * cleanly only while a copy is wider than the stage, which is 170% of the
 * screen, about 26 row heights on a 21:9 one.
 */
const MIN_ROW_WIDTH = 30
/** Width over height of each kind. */
const ASPECT = { poster: 2 / 3, thumb: 16 / 9 } as const
/**
 * Dark text loses contrast against artwork much faster than light text
 * does against a dark wash, so a light theme shows the wall weaker.
 */
const LIGHT_STRENGTH = 0.35

/** A small seeded generator, so a row keeps its order between renders. */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(list: readonly T[], seed: number): T[] {
  const next = random(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

/** One copy of each row: its own shuffle, repeated until it's wide enough. */
function buildRows(tiles: readonly LoginBackdropTile[]): LoginBackdropTile[][] {
  return Array.from({ length: ROWS }, (_, row) => {
    const order = shuffled(tiles, row + 1)
    const copy: LoginBackdropTile[] = []
    let width = 0
    for (let i = 0; width < MIN_ROW_WIDTH; i++) {
      const tile = order[i % order.length]
      if (!tile) break
      copy.push(tile)
      width += ASPECT[tile.kind]
    }
    return copy
  })
}

function Row({
  tiles,
  duration,
  reverse,
  paused,
}: {
  tiles: LoginBackdropTile[]
  duration: number
  reverse: boolean
  paused: boolean
}) {
  // Two copies, so moving by half lands on the same picture.
  const both = [...tiles, ...tiles]
  return (
    <div className="flex h-[clamp(88px,16cqh,200px)] shrink-0">
      <div
        className="flex h-full w-max gap-3 pr-3 will-change-transform"
        style={{
          animation: `login-backdrop-drift ${duration}s linear infinite`,
          animationDirection: reverse ? "reverse" : "normal",
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {both.map((tile, index) => (
          <div
            key={index}
            className={cn(
              "bg-foreground/5 h-full shrink-0 overflow-hidden rounded-lg",
              tile.kind === "poster" ? "aspect-[2/3]" : "aspect-video",
            )}
          >
            <img
              src={artworkPath(tile.artwork.id, "small")}
              alt=""
              aria-hidden
              draggable={false}
              decoding="async"
              className="size-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The backdrop for `settings` with `tiles`, filling the nearest positioned
 * parent. Nothing while it's off or there's nothing to show.
 */
export function LoginBackdrop({
  settings,
  tiles,
}: {
  settings: LoginBackdropSettings
  tiles: readonly LoginBackdropTile[]
}) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const rows = useMemo(() => buildRows(tiles), [tiles])
  if (!settings.enabled || tiles.length === 0) return null

  const strength = 1 - settings.fade / 100
  const style = {
    "--login-backdrop-strength": strength,
    "--login-backdrop-light-strength": strength * LIGHT_STRENGTH,
    transform: `translate(-50%, -50%) rotate(${SLOPE_DEGREES}deg)`,
    filter: settings.blur > 0 ? `blur(${settings.blur}px)` : undefined,
  } satisfies CSSProperties & Record<`--${string}`, number>

  return (
    <div
      aria-hidden
      className="bg-background [container-type:size] pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute top-1/2 left-1/2 flex h-[170%] w-[170%] flex-col justify-center gap-3 opacity-(--login-backdrop-strength) [:root.light_&]:opacity-(--login-backdrop-light-strength)"
        style={style}
      >
        {rows.map((row, index) => (
          <Row
            key={index}
            tiles={row}
            duration={DURATIONS[index % DURATIONS.length] ?? DURATIONS[0]}
            reverse={index % 2 === 1}
            paused={reducedMotion}
          />
        ))}
      </div>
      <style>{`
        @keyframes login-backdrop-drift {
          from { transform: translateX(0) }
          to { transform: translateX(-50%) }
        }
      `}</style>
    </div>
  )
}

/** The backdrop the login page shows, with a fresh pick of artwork. */
export function PublicLoginBackdrop({
  settings,
}: {
  settings: LoginBackdropSettings
}) {
  const tiles = useQuery({
    ...orpc.auth.loginBackdrop.queryOptions(),
    enabled: settings.enabled,
    // One pick per visit; a new one would reshuffle the wall under the form.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  return <LoginBackdrop settings={settings} tiles={tiles.data?.tiles ?? []} />
}
