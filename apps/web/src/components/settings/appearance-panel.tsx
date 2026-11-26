import type { ThemeState } from "@matinee/ui/lib/theme"

import { browserLocale, LOCALES, nativeName, tr } from "@/i18n"
import { languageName } from "@/lib/languages"
import { useThemeState } from "@/lib/theme-state"
import { AUTO_LANGUAGE, language, setLanguage } from "@/stores/language"
import { enterTvMode, tvMode, leaveTvMode } from "@/stores/tv-mode"

import { ColorSchemePicker } from "./color-scheme-picker"
import { SelectRow, SwitchRow } from "./setting-controls"
import {
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

/**
 * The interface language and the color scheme. Themes of their own come
 * later; for now there's Matinee's light and dark, with the accent the
 * server's admins pick.
 */
export function AppearancePanel() {
  const theme = useThemeState()
  return (
    <SettingsSections>
      <LanguageSection />
      <ColorSchemeSection theme={theme()} />
      <TvModeSection />
    </SettingsSections>
  )
}

const LANGUAGE_OPTIONS = [AUTO_LANGUAGE, ...LOCALES]

/**
 * "Deutsch (German)": a language by its own name, so its speakers find it
 * whatever the interface speaks now, and by the current one's.
 */
function languageLabel(option: string): string {
  if (option === AUTO_LANGUAGE) {
    return tr("appearance.language.auto", {
      language: nativeName(browserLocale()),
    })
  }
  const own = nativeName(option)
  const current = languageName(option)
  return own.toLowerCase() === current.toLowerCase()
    ? own
    : `${own} (${current})`
}

function LanguageSection() {
  return (
    <SettingsSubsection id="language" title={tr("appearance.language")}>
      <SettingRows>
        <SelectRow
          title={tr("appearance.language.title")}
          value={LOCALES.includes(language()) ? language() : AUTO_LANGUAGE}
          options={LANGUAGE_OPTIONS}
          labelOf={languageLabel}
          onChange={setLanguage}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

function ColorSchemeSection(props: { theme: ThemeState }) {
  return (
    <SettingsSubsection id="color-scheme" title={tr("appearance.colorScheme")}>
      <ColorSchemePicker theme={props.theme} />
    </SettingsSubsection>
  )
}

/**
 * TV mode: this browser opens Matinee on the TV UI, for a computer on
 * the sofa. Turning it on goes there at once; turning it off stays here,
 * and the choice holds for the next visit either way.
 */
function TvModeSection() {
  return (
    <SettingsSubsection id="tv-mode" title={tr("appearance.tvMode")}>
      <SettingRows>
        <SwitchRow
          title={tr("appearance.tvMode.title")}
          hint={tr("appearance.tvMode.hint")}
          checked={tvMode()}
          onChange={(on) => {
            if (on) enterTvMode()
            else leaveTvMode()
          }}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}
