import type { ThemeAccents } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { setServerThemeAccents } from "@matinee/ui/lib/theme"
import {
  defaultThemeAccent,
  normalizeThemeColor,
  THEME_APPEARANCES,
  type ThemeAppearance,
} from "@matinee/ui/lib/theme-colors"
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { HexColorInput } from "./hex-color-input"
import {
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

/** The Matinee theme's accent for everyone on the server. Ported from alloy. */
export function ServerAppearancePanel() {
  const accents = useQuery(orpc.admin.appearance.get.queryOptions())

  return (
    <SettingsSections>
      {accents.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : accents.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("serverAppearance.loadFailed", {
            error: errorMessage(accents.error),
          })}
        </p>
      ) : (
        <AccentForm saved={accents.data} />
      )}
    </SettingsSections>
  )
}

function AccentForm({ saved }: { saved: ThemeAccents }) {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (input: ThemeAccents) => client.admin.appearance.update(input),
    onSuccess: async (next) => {
      queryClient.setQueryData(orpc.admin.appearance.get.queryKey(), next)
      await queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() })
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

  // The page previews each edit, and goes back to the saved accents on a
  // reset or when the panel closes.
  const preview = (change: Partial<ThemeAccents>) =>
    setServerThemeAccents({ ...form.state.values, ...change })
  const pickPreset = (preset: AccentPair) => {
    const next = {
      light: storedAccent("light", preset.light),
      dark: storedAccent("dark", preset.dark),
    }
    preview(next)
    form.setFieldValue("light", next.light)
    form.setFieldValue("dark", next.dark)
  }
  const restoreSaved = useEffectEvent(() => setServerThemeAccents(saved))
  // Takes the preview off the page when the panel closes.
  useEffect(() => () => restoreSaved(), [])

  const accent = (appearance: ThemeAppearance) =>
    draft[appearance] ?? defaultThemeAccent(appearance)

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection
        id="accent-color"
        title={tr("serverAppearance.title")}
        description={tr("serverAppearance.description")}
      >
        <div
          role="group"
          aria-label={tr("serverAppearance.presets")}
          className="flex flex-wrap gap-2.5"
        >
          {ACCENT_PRESETS.map((preset, index) => {
            const name =
              index === 0
                ? tr("serverAppearance.default")
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
            const label = tr(`serverAppearance.mode.${appearance}`)
            return (
              <SettingRow key={appearance} title={label} layout="split">
                {(ids) => (
                  <form.Field name={appearance}>
                    {(field) => (
                      <div className="w-full">
                        <HexColorInput
                          id={ids.controlId}
                          value={
                            field.state.value ?? defaultThemeAccent(appearance)
                          }
                          label={tr(`serverAppearance.accent.${appearance}`)}
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

      <SettingsSaveBar
        dirty={dirty}
        onReset={() => {
          form.reset()
          setServerThemeAccents(saved)
        }}
        onSave={() => form.handleSubmit()}
      />
    </form>
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
