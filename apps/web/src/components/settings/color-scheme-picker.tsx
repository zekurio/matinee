import { THEME_MODES, type ThemeMode } from "@matinee/contracts"
import {
  setThemeMode,
  themeVariantColors,
  type ThemeState,
} from "@matinee/ui/lib/theme"
import type { ThemeColors } from "@matinee/ui/lib/theme-colors"
import { cn } from "@matinee/ui/lib/utils"
import { type KeyboardEvent, useRef } from "react"

const MODE_LABELS = new Map<ThemeMode, string>([
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
])

/**
 * System, Light, and Dark as cards, each a miniature of the app in the theme
 * that mode shows. System splits the light and dark themes down the middle.
 */
export function ColorSchemePicker({ theme }: { theme: ThemeState }) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const light = themeVariantColors(theme, theme.light)
  const dark = themeVariantColors(theme, theme.dark)

  const moveFocus = (event: KeyboardEvent, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + THEME_MODES.length) % THEME_MODES.length
    const mode = THEME_MODES[next]
    if (!mode) return
    setThemeMode(mode)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color scheme"
      className="grid grid-cols-3 gap-2 sm:gap-3"
    >
      {THEME_MODES.map((mode, index) => {
        const selected = theme.preferences.mode === mode
        return (
          <button
            key={mode}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setThemeMode(mode)}
            onKeyDown={(event) => moveFocus(event, index)}
            className={cn(
              "focus-visible:ring-ring flex min-w-0 flex-col gap-2 rounded-xl border p-1.5 pb-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2 sm:p-2 sm:text-sm",
              selected
                ? "border-accent bg-accent-soft text-foreground"
                : "text-muted-foreground hover:border-foreground/20 hover:text-foreground bg-foreground/[0.02]",
            )}
          >
            <span className="relative block">
              {mode === "system" ? (
                <>
                  {/* The miniature is symmetric, so the seam falls between
                      the third and fourth posters. Light stops just past
                      it: underneath the whole dark half, its border showed
                      through the dark edges. */}
                  <span className="block [clip-path:inset(0_calc(50%_-_1px)_0_0)]">
                    <AppMiniature colors={light} />
                  </span>
                  <span className="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
                    <AppMiniature colors={dark} />
                  </span>
                </>
              ) : (
                <AppMiniature colors={mode === "dark" ? dark : light} />
              )}
            </span>
            <span className="truncate">{MODE_LABELS.get(mode) ?? mode}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The home page in `colors`: the floating bar over the featured banner, then
 * a row of posters.
 */
function AppMiniature({ colors }: { colors: ThemeColors }) {
  const page = colors.background
  const veil = (percent: number) =>
    `color-mix(in oklab, ${page} ${percent}%, transparent)`
  const tint = `color-mix(in oklab, ${colors.text} 12%, transparent)`
  return (
    <span
      aria-hidden
      className="relative block aspect-[16/10] overflow-hidden rounded-lg border"
      style={{ background: page, borderColor: colors.border }}
    >
      {/* The banner's backdrop, veiled behind its text and faded into the
          page with the same gradients as the real one. */}
      <span
        className="absolute inset-x-0 top-0 h-[62%]"
        style={{
          background: `linear-gradient(to top, ${page}, ${veil(40)} 35%, transparent), linear-gradient(to right, ${veil(95)}, ${veil(60)}, transparent), ${colors.borderStrong}`,
        }}
      />
      <span
        className="absolute top-[5%] left-1/2 flex h-[10%] w-[42%] -translate-x-1/2 items-center justify-between rounded-full border px-[1.5%]"
        style={{ background: veil(60), borderColor: tint }}
      >
        <span
          className="aspect-square h-1/2 rounded-full"
          style={{ background: colors.accent }}
        />
        <span className="h-1/2 w-px" style={{ background: tint }} />
        <span
          className="flex h-[70%] w-[22%] items-center justify-center rounded-full"
          style={{ background: tint }}
        >
          <span
            className="h-[30%] w-1/2 rounded-full"
            style={{ background: colors.text }}
          />
        </span>
        <span
          className="h-[20%] w-[14%] rounded-full"
          style={{ background: colors.textDim }}
        />
        <span
          className="h-[20%] w-[14%] rounded-full"
          style={{ background: colors.textDim }}
        />
        <span className="h-1/2 w-px" style={{ background: tint }} />
        <span
          className="aspect-square h-[70%] rounded-full"
          style={{ background: colors.borderEmphasis }}
        />
      </span>
      <span
        className="absolute top-[21%] left-[6%] h-[2.5%] w-[12%] rounded-full"
        style={{ background: colors.textDim }}
      />
      <span
        className="absolute top-[26%] left-[6%] h-[7%] w-[30%] rounded-full"
        style={{ background: colors.text }}
      />
      <span
        className="absolute top-[36%] left-[6%] h-[2.5%] w-[22%] rounded-full"
        style={{ background: colors.textDim }}
      />
      <span className="absolute top-[42%] left-[6%] flex h-[8%] w-[26%] gap-[8%]">
        <span
          className="w-[54%] rounded-full"
          style={{ background: colors.accent }}
        />
        <span className="flex-1 rounded-full" style={{ background: tint }} />
      </span>
      <span
        className="absolute top-[59%] left-[6%] h-[2.5%] w-[14%] rounded-full"
        style={{ background: colors.textMuted }}
      />
      <span className="absolute top-[65%] right-[6%] left-[6%] grid grid-cols-6 gap-x-[3.6%]">
        {POSTER_SLOTS.map((slot) => (
          <span
            key={slot}
            className="aspect-[2/3] rounded-[2px]"
            style={{ background: colors.input }}
          />
        ))}
      </span>
    </span>
  )
}

const POSTER_SLOTS = ["a", "b", "c", "d", "e", "f"] as const
