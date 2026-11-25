import {
  type Branding,
  LOGIN_BACKDROP_ARTWORK,
  LOGIN_BACKDROP_MAX_BLUR,
  type LoginBackdrop as LoginBackdropSettings,
  type ThemeAccents,
} from "@matinee/contracts"
import {
  endAccentPreview,
  previewServerAccents,
  setServerThemeAccents,
} from "@matinee/ui/lib/theme"
import {
  defaultThemeAccent,
  normalizeThemeColor,
  THEME_APPEARANCES,
  type ThemeAppearance,
} from "@matinee/ui/lib/theme-colors"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Shuffle } from "lucide"
import { For, Match, onSettled, Show, Switch } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { LoginBackdrop } from "@/components/login-backdrop"
import { SignInForm } from "@/components/sign-in-form"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Slider } from "@/kit/slider"
import { Spinner } from "@/kit/spinner"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { HexColorInput } from "./hex-color-input"
import { fetching } from "./query-state"
import { SelectRow, SwitchRow } from "./setting-controls"
import { createDraftForm } from "./settings-draft"
import {
  SettingNote,
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

interface AccentPair {
  light: string
  dark: string
}

/**
 * Starting points, Matinee's own first: one hue each, in a shade per
 * appearance. Any color works; contrast is fixed up per theme.
 */
const ACCENT_PRESETS: readonly AccentPair[] = [
  { light: defaultThemeAccent("light"), dark: defaultThemeAccent("dark") },
  { light: "#0369a1", dark: "#38bdf8" },
  { light: "#0f766e", dark: "#2dd4bf" },
  { light: "#13793a", dark: "#4ade80" },
  { light: "#975c06", dark: "#facc15" },
  { light: "#bb3e0b", dark: "#fb923c" },
  { light: "#be123c", dark: "#f43f5e" },
  { light: "#be185d", dark: "#ec4899" },
]

/**
 * How the server looks to everyone on it: the Matinee theme's accent and
 * the login screen.
 */
export function BrandingPanel() {
  const saved = useQuery(() => orpc.admin.branding.get.queryOptions())

  return (
    <SettingsSections>
      <Switch>
        <Match when={saved.isPending}>
          <Skeleton class="h-96 rounded-xl" />
        </Match>
        <Match when={saved.isError}>
          <p class="text-muted-foreground text-sm">
            {tr("branding.loadFailed", { error: errorMessage(saved.error) })}
          </p>
        </Match>
        <Match when={saved.isSuccess && saved.data}>
          {(branding) => <BrandingForm saved={branding()} />}
        </Match>
      </Switch>
    </SettingsSections>
  )
}

function BrandingForm(props: { saved: Branding }) {
  const queryClient = useQueryClient()
  const save = useMutation(() => ({
    mutationFn: (input: Branding) => client.admin.branding.update(input),
    onSuccess: async (next) => {
      // The saved accents show at once, without waiting for the config.
      setServerThemeAccents(next.themeAccents)
      endAccentPreview()
      queryClient.setQueryData(orpc.admin.branding.get.queryKey(), next)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() }),
        queryClient.invalidateQueries({
          queryKey: orpc.auth.loginBackdrop.key(),
        }),
      ])
    },
  }))
  // The form follows a refetch until the first edit.
  const form = createDraftForm<Branding>({
    initial: () => props.saved,
    onSubmit: async (value) => {
      await save.mutate(value)
      form.reset()
    },
  })
  const draft = () => form.values()
  const backdrop = () => draft().loginBackdrop
  const setBackdrop = (change: Partial<LoginBackdropSettings>) =>
    form.set("loginBackdrop", { ...backdrop(), ...change })

  // The page previews each accent edit, and goes back to the saved accents
  // on a reset or when the panel closes.
  const setAccents = (change: Partial<ThemeAccents>) => {
    const next = { ...draft().themeAccents, ...change }
    previewServerAccents(next)
    form.set("themeAccents", next)
  }
  const pickPreset = (preset: AccentPair) =>
    setAccents({
      light: storedAccent("light", preset.light),
      dark: storedAccent("dark", preset.dark),
    })
  // Takes the preview off the page when the panel closes.
  onSettled(() => () => endAccentPreview())

  const accent = (appearance: ThemeAppearance) =>
    draft().themeAccents[appearance] ?? defaultThemeAccent(appearance)

  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="accent-color" title={tr("branding.title")}>
        <div
          role="group"
          aria-label={tr("branding.presets")}
          class="flex flex-wrap gap-2.5"
        >
          <For each={ACCENT_PRESETS}>
            {(preset, index) => {
              const name = () =>
                index() === 0
                  ? tr("branding.default")
                  : `${preset.light} / ${preset.dark}`
              const selected = () =>
                THEME_APPEARANCES.every(
                  (appearance) => accent(appearance) === preset[appearance],
                )
              return (
                <button
                  type="button"
                  aria-label={name()}
                  title={name()}
                  aria-pressed={selected() ? "true" : "false"}
                  onClick={() => pickPreset(preset)}
                  class={cn(
                    "ring-offset-background focus-visible:outline-ring size-8 rounded-full ring-offset-2 outline-offset-4 transition-shadow focus-visible:outline-2",
                    selected()
                      ? "ring-foreground ring-2"
                      : "hover:ring-foreground/30 hover:ring-2",
                  )}
                  style={{
                    // A hard stop on a diagonal stair-steps; a pixel of blend
                    // smooths it.
                    background: `linear-gradient(135deg, ${preset.light} calc(50% - 0.5px), ${preset.dark} calc(50% + 0.5px))`,
                  }}
                />
              )
            }}
          </For>
        </div>
        <SettingRows>
          <For each={THEME_APPEARANCES}>
            {(appearance) => (
              <SettingRow
                title={tr(`branding.mode.${appearance}`)}
                layout="split"
              >
                {(ids) => (
                  <div class="w-full">
                    <HexColorInput
                      id={ids.controlId}
                      value={accent(appearance)}
                      label={tr(`branding.accent.${appearance}`)}
                      commit={normalizeThemeColor}
                      onChange={(color) =>
                        setAccents({
                          [appearance]: storedAccent(appearance, color),
                        })
                      }
                    />
                  </div>
                )}
              </SettingRow>
            )}
          </For>
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="login-screen"
        title={tr("branding.backdrop.title")}
      >
        <SettingRows>
          <SwitchRow
            title={tr("branding.backdrop.enabled")}
            checked={backdrop().enabled}
            onChange={(enabled) => setBackdrop({ enabled })}
          />
          <SelectRow
            title={tr("branding.backdrop.artwork")}
            options={LOGIN_BACKDROP_ARTWORK}
            labelOf={(value) => tr(`branding.backdrop.artwork.${value}`)}
            disabled={!backdrop().enabled}
            value={backdrop().artwork}
            onChange={(artwork) => setBackdrop({ artwork })}
          />
          <SliderRow
            title={tr("branding.backdrop.blur")}
            value={backdrop().blur}
            max={LOGIN_BACKDROP_MAX_BLUR}
            label={(value) => tr("branding.backdrop.blurValue", { value })}
            disabled={!backdrop().enabled}
            onChange={(blur) => setBackdrop({ blur })}
          />
          <SliderRow
            title={tr("branding.backdrop.fade")}
            value={backdrop().fade}
            max={100}
            label={(value) => tr("branding.backdrop.fadeValue", { value })}
            disabled={!backdrop().enabled}
            onChange={(fade) => setBackdrop({ fade })}
          />
        </SettingRows>
        <SettingNote>{tr("branding.backdrop.source")}</SettingNote>
        <LoginPreview settings={backdrop()} />
      </SettingsSubsection>

      <SettingsSaveBar
        dirty={form.dirty()}
        onReset={() => {
          form.reset()
          endAccentPreview()
        }}
        onSave={() => form.submit()}
      />
    </form>
  )
}

function SliderRow(props: {
  title: string
  value: number
  max: number
  label: (value: number) => string
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <SettingRow title={props.title} layout="split">
      {(ids) => (
        <div class="flex w-full items-center gap-3">
          <Slider
            id={ids.controlId}
            aria-labelledby={ids.labelId}
            value={[props.value]}
            min={0}
            max={props.max}
            step={1}
            disabled={props.disabled}
            onValueChange={(next) =>
              props.onChange(
                (Array.isArray(next) ? next[0] : next) ?? props.value,
              )
            }
            class="flex-1"
          />
          <span class="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
            {props.label(props.value)}
          </span>
        </div>
      )}
    </SettingRow>
  )
}

/**
 * The login screen as people will see it with the draft settings: the
 * real form over the backdrop, which shuffles on request.
 */
function LoginPreview(props: { settings: LoginBackdropSettings }) {
  const config = useQuery(() => orpc.auth.config.queryOptions())
  const tiles = useQuery(() => ({
    ...orpc.admin.branding.preview.queryOptions({
      input: { artwork: props.settings.artwork },
    }),
    enabled: props.settings.enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  }))
  const shown = () => (tiles.isSuccess ? tiles.data.tiles : [])
  const empty = () =>
    props.settings.enabled && tiles.isSuccess && tiles.data.tiles.length === 0

  return (
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center justify-between gap-3">
        <span class="text-muted-foreground text-xs">
          {tr("branding.backdrop.preview")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!props.settings.enabled || fetching(tiles)}
          onClick={() => void tiles.refetch()}
        >
          <Show when={fetching(tiles)} fallback={<Icon icon={Shuffle} />}>
            <Spinner />
          </Show>
          {tr("branding.backdrop.shuffle")}
        </Button>
      </div>
      {/* The real form, inert, so a click in the preview signs nobody in. */}
      <div
        inert
        class="bg-background h-[440px] overflow-hidden rounded-xl border select-none"
      >
        <Show when={config.isSuccess && config.data}>
          {(current) => (
            <AuthScreen
              contained
              title={tr("auth.signIn.title")}
              backdrop={
                <LoginBackdrop settings={props.settings} tiles={shown()} />
              }
            >
              <SignInForm config={current()} target="/" />
            </AuthScreen>
          )}
        </Show>
      </div>
      <Show when={empty() || !props.settings.enabled}>
        <SettingNote>
          {empty()
            ? tr("branding.backdrop.empty")
            : tr("branding.backdrop.previewOff")}
        </SettingNote>
      </Show>
    </div>
  )
}

/** Matinee's own accent is stored as none, so the server keeps following it. */
function storedAccent(
  appearance: ThemeAppearance,
  color: string,
): string | null {
  const hex = normalizeThemeColor(color)
  return !hex || hex === defaultThemeAccent(appearance) ? null : hex
}
