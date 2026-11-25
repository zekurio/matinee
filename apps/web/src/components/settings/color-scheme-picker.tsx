import { THEME_MODES } from "@matinee/contracts"
import { setThemeMode, type ThemeState } from "@matinee/ui/lib/theme"
import type { ThemeColors } from "@matinee/ui/lib/theme-colors"
import { For, Show } from "solid-js"

import { tr } from "@/i18n"

/**
 * System, Light, and Dark as cards, each a miniature of the app in the theme
 * that mode shows. System splits the light and dark themes down the middle.
 */
export function ColorSchemePicker(props: { theme: ThemeState }) {
  const buttons: HTMLButtonElement[] = []

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
    buttons[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={tr("appearance.colorScheme")}
      class="grid grid-cols-3 gap-2 sm:gap-3"
    >
      <For each={THEME_MODES}>
        {(mode) => {
          // The modes never change, so neither does a card's place.
          const index = THEME_MODES.indexOf(mode)
          const selected = () => props.theme.preferences.mode === mode
          return (
            <button
              ref={(button) => {
                buttons[index] = button
              }}
              type="button"
              role="radio"
              aria-checked={selected() ? "true" : "false"}
              tabindex={selected() ? 0 : -1}
              onClick={() => setThemeMode(mode)}
              onKeyDown={(event) => moveFocus(event, index)}
              class={[
                "focus-visible:ring-ring flex min-w-0 flex-col gap-2 rounded-xl border p-1.5 pb-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 sm:p-2 sm:text-sm",
                selected()
                  ? "border-accent bg-accent-soft text-foreground"
                  : "text-muted-foreground hover:border-foreground/20 hover:text-foreground bg-foreground/[0.02]",
              ]}
            >
              <span class="relative block">
                <Show
                  when={mode === "system"}
                  fallback={
                    <AppMiniature
                      colors={
                        mode === "dark" ? props.theme.dark : props.theme.light
                      }
                    />
                  }
                >
                  {/* The miniature is symmetric, so the seam falls between
                      the third and fourth posters. Light stops just past
                      it: underneath the whole dark half, its border showed
                      through the dark edges. */}
                  <span class="block [clip-path:inset(0_calc(50%_-_1px)_0_0)]">
                    <AppMiniature colors={props.theme.light} />
                  </span>
                  <span class="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
                    <AppMiniature colors={props.theme.dark} />
                  </span>
                </Show>
              </span>
              <span class="truncate">
                {tr(`appearance.colorScheme.${mode}`)}
              </span>
            </button>
          )
        }}
      </For>
    </div>
  )
}

const POSTER_SLOTS = ["a", "b", "c", "d", "e", "f"] as const

/**
 * The home page in `colors`: the floating bar over the featured banner, then
 * a row of posters.
 */
function AppMiniature(props: { colors: ThemeColors }) {
  const page = () => props.colors.background
  const veil = (percent: number) =>
    `color-mix(in oklab, ${page()} ${percent}%, transparent)`
  const tint = () =>
    `color-mix(in oklab, ${props.colors.text} 12%, transparent)`
  return (
    <span
      aria-hidden="true"
      class="relative block aspect-[16/10] overflow-hidden rounded-lg border"
      style={{ background: page(), "border-color": props.colors.border }}
    >
      {/* The banner's backdrop, veiled behind its text and faded into the
          page with the same gradients as the real one. */}
      <span
        class="absolute inset-x-0 top-0 h-[62%]"
        style={{
          background: `linear-gradient(to top, ${page()}, ${veil(40)} 35%, transparent), linear-gradient(to right, ${veil(95)}, ${veil(60)}, transparent), ${props.colors.borderStrong}`,
        }}
      />
      <span
        class="absolute top-[5%] left-1/2 flex h-[10%] w-[42%] -translate-x-1/2 items-center justify-between rounded-full border px-[1.5%]"
        style={{ background: veil(60), "border-color": tint() }}
      >
        <span
          class="aspect-square h-1/2 rounded-full"
          style={{ background: props.colors.accent }}
        />
        <span class="h-1/2 w-px" style={{ background: tint() }} />
        <span
          class="flex h-[70%] w-[22%] items-center justify-center rounded-full"
          style={{ background: tint() }}
        >
          <span
            class="h-[30%] w-1/2 rounded-full"
            style={{ background: props.colors.text }}
          />
        </span>
        <span
          class="h-[20%] w-[14%] rounded-full"
          style={{ background: props.colors.textDim }}
        />
        <span
          class="h-[20%] w-[14%] rounded-full"
          style={{ background: props.colors.textDim }}
        />
        <span class="h-1/2 w-px" style={{ background: tint() }} />
        <span
          class="aspect-square h-[70%] rounded-full"
          style={{ background: props.colors.borderEmphasis }}
        />
      </span>
      <span
        class="absolute top-[21%] left-[6%] h-[2.5%] w-[12%] rounded-full"
        style={{ background: props.colors.textDim }}
      />
      <span
        class="absolute top-[26%] left-[6%] h-[7%] w-[30%] rounded-full"
        style={{ background: props.colors.text }}
      />
      <span
        class="absolute top-[36%] left-[6%] h-[2.5%] w-[22%] rounded-full"
        style={{ background: props.colors.textDim }}
      />
      <span class="absolute top-[42%] left-[6%] flex h-[8%] w-[26%] gap-[8%]">
        <span
          class="w-[54%] rounded-full"
          style={{ background: props.colors.accent }}
        />
        <span class="flex-1 rounded-full" style={{ background: tint() }} />
      </span>
      <span
        class="absolute top-[59%] left-[6%] h-[2.5%] w-[14%] rounded-full"
        style={{ background: props.colors.textMuted }}
      />
      <span class="absolute top-[65%] right-[6%] left-[6%] grid grid-cols-6 gap-x-[3.6%]">
        <For each={POSTER_SLOTS}>
          {() => (
            <span
              class="aspect-[2/3] rounded-[2px]"
              style={{ background: props.colors.input }}
            />
          )}
        </For>
      </span>
    </span>
  )
}
