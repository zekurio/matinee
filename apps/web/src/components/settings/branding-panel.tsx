import {
  type Branding,
  LOGIN_BACKDROP_ARTWORK,
  LOGIN_BACKDROP_MAX_BLUR,
  type LoginBackdrop as LoginBackdropSettings,
  type ThemeAccents,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Slider } from "@matinee/ui/components/slider"
import { Spinner } from "@matinee/ui/components/spinner"
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
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ShuffleIcon } from "lucide-react"
import { useEffect } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { AuthScreen } from "../auth-screen"
import { LoginBackdrop } from "../login-backdrop"
import { SignInForm } from "../sign-in-form"
import { HexColorInput } from "./hex-color-input"
import { SelectField, SwitchField } from "./setting-controls"
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
 * the login screen. Ported from alloy.
 */
export function BrandingPanel() {
  const saved = useQuery(orpc.admin.branding.get.queryOptions())

  return (
    <SettingsSections>
      {saved.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : saved.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("branding.loadFailed", { error: errorMessage(saved.error) })}
        </p>
      ) : (
        <BrandingForm saved={saved.data} />
      )}
    </SettingsSections>
  )
}

function BrandingForm({ saved }: { saved: Branding }) {
  const queryClient = useQueryClient()
  const save = useMutation({
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
  })
  const form = useAppForm({
    // The form follows a refetch until the first edit.
    defaultValues: saved,
    onSubmit: async ({ value, formApi }) => {
      formApi.reset(await save.mutateAsync(value))
    },
  })
  const draft = useSelector(form.store, (state) => state.values)
  const dirty = useSelector(form.store, (state) => !state.isDefaultValue)

  // The page previews each accent edit, and goes back to the saved accents
  // on a reset or when the panel closes.
  const preview = (change: Partial<ThemeAccents>) =>
    previewServerAccents({ ...form.state.values.themeAccents, ...change })
  const pickPreset = (preset: AccentPair) => {
    const next = {
      light: storedAccent("light", preset.light),
      dark: storedAccent("dark", preset.dark),
    }
    preview(next)
    form.setFieldValue("themeAccents.light", next.light)
    form.setFieldValue("themeAccents.dark", next.dark)
  }
  // Takes the preview off the page when the panel closes.
  useEffect(() => endAccentPreview, [])

  const accent = (appearance: ThemeAppearance) =>
    draft.themeAccents[appearance] ?? defaultThemeAccent(appearance)

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="accent-color" title={tr("branding.title")}>
        <div
          role="group"
          aria-label={tr("branding.presets")}
          className="flex flex-wrap gap-2.5"
        >
          {ACCENT_PRESETS.map((preset, index) => {
            const name =
              index === 0
                ? tr("branding.default")
                : `${preset.light} / ${preset.dark}`
            const selected = THEME_APPEARANCES.every(
              (appearance) => accent(appearance) === preset[appearance],
            )
            return (
              <button
                key={preset.dark}
                type="button"
                aria-label={name}
                title={name}
                aria-pressed={selected}
                onClick={() => pickPreset(preset)}
                className={cn(
                  "ring-offset-background focus-visible:outline-ring size-8 rounded-full ring-offset-2 outline-offset-4 transition-shadow focus-visible:outline-2",
                  selected
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
          })}
        </div>
        <SettingRows>
          {THEME_APPEARANCES.map((appearance) => {
            const label = tr(`branding.mode.${appearance}`)
            return (
              <SettingRow key={appearance} title={label} layout="split">
                {(ids) => (
                  <form.Field name={`themeAccents.${appearance}`}>
                    {(field) => (
                      <div className="w-full">
                        <HexColorInput
                          id={ids.controlId}
                          value={
                            field.state.value ?? defaultThemeAccent(appearance)
                          }
                          label={tr(`branding.accent.${appearance}`)}
                          commit={normalizeThemeColor}
                          onChange={(color) => {
                            const stored = storedAccent(appearance, color)
                            preview({ [appearance]: stored })
                            field.handleChange(stored)
                          }}
                        />
                      </div>
                    )}
                  </form.Field>
                )}
              </SettingRow>
            )
          })}
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="login-screen"
        title={tr("branding.backdrop.title")}
      >
        <SettingRows>
          <form.AppField name="loginBackdrop.enabled">
            {() => <SwitchField title={tr("branding.backdrop.enabled")} />}
          </form.AppField>
          <form.AppField name="loginBackdrop.artwork">
            {() => (
              <SelectField
                title={tr("branding.backdrop.artwork")}
                options={LOGIN_BACKDROP_ARTWORK}
                labelOf={(value) => tr(`branding.backdrop.artwork.${value}`)}
                disabled={!draft.loginBackdrop.enabled}
              />
            )}
          </form.AppField>
          <form.Field name="loginBackdrop.blur">
            {(field) => (
              <SliderRow
                title={tr("branding.backdrop.blur")}
                value={field.state.value}
                max={LOGIN_BACKDROP_MAX_BLUR}
                label={(value) => tr("branding.backdrop.blurValue", { value })}
                disabled={!draft.loginBackdrop.enabled}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="loginBackdrop.fade">
            {(field) => (
              <SliderRow
                title={tr("branding.backdrop.fade")}
                value={field.state.value}
                max={100}
                label={(value) => tr("branding.backdrop.fadeValue", { value })}
                disabled={!draft.loginBackdrop.enabled}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </SettingRows>
        <SettingNote>{tr("branding.backdrop.source")}</SettingNote>
        <LoginPreview settings={draft.loginBackdrop} />
      </SettingsSubsection>

      <SettingsSaveBar
        dirty={dirty}
        onReset={() => {
          form.reset()
          endAccentPreview()
        }}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}

function SliderRow({
  title,
  value,
  max,
  label,
  disabled,
  onChange,
}: {
  title: string
  value: number
  max: number
  label: (value: number) => string
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <SettingRow title={title} layout="split">
      {(ids) => (
        <div className="flex w-full items-center gap-3">
          <Slider
            id={ids.controlId}
            aria-labelledby={ids.labelId}
            value={[value]}
            min={0}
            max={max}
            step={1}
            disabled={disabled}
            onValueChange={(next) => onChange([next].flat()[0] ?? value)}
            className="flex-1"
          />
          <span className="text-muted-foreground w-12 shrink-0 text-right text-xs tabular-nums">
            {label(value)}
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
function LoginPreview({ settings }: { settings: LoginBackdropSettings }) {
  const config = useQuery(orpc.auth.config.queryOptions())
  const tiles = useQuery({
    ...orpc.admin.branding.preview.queryOptions({
      input: { artwork: settings.artwork },
    }),
    enabled: settings.enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const empty =
    settings.enabled && tiles.isSuccess && tiles.data.tiles.length === 0

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {tr("branding.backdrop.preview")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!settings.enabled || tiles.isFetching}
          onClick={() => void tiles.refetch()}
        >
          {tiles.isFetching ? <Spinner /> : <ShuffleIcon />}
          {tr("branding.backdrop.shuffle")}
        </Button>
      </div>
      {/* The real form, inert, so a click in the preview signs nobody in. */}
      <div
        inert
        className="bg-background h-[440px] overflow-hidden rounded-xl border select-none"
      >
        {config.data && (
          <AuthScreen
            contained
            title={tr("auth.signIn.title")}
            backdrop={
              <LoginBackdrop
                settings={settings}
                tiles={tiles.data?.tiles ?? []}
              />
            }
          >
            <SignInForm config={config.data} target="/" />
          </AuthScreen>
        )}
      </div>
      {(empty || !settings.enabled) && (
        <SettingNote>
          {empty
            ? tr("branding.backdrop.empty")
            : tr("branding.backdrop.previewOff")}
        </SettingNote>
      )}
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
