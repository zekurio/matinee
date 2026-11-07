import { setUiText } from "@matinee/ui/lib/ui-text"

import { getLocale, subscribeLocale, tr } from "@/i18n"

/** Hands `@matinee/ui` its text in the interface's language. */
function applyUiText() {
  setUiText({
    locale: getLocale(),
    close: tr("ui.close"),
    loading: tr("ui.loading"),
    notifications: tr("ui.notifications"),
    closeToast: tr("ui.closeToast"),
    pickColor: (label) => tr("ui.pickColor", { label }),
    colorArea: (label) => tr("ui.colorArea", { label }),
    colorHue: (label) => tr("ui.colorHue", { label }),
    colorHex: (label) => tr("ui.colorHex", { label }),
    previousMonth: tr("ui.previousMonth"),
    nextMonth: tr("ui.nextMonth"),
    today: (date) => tr("ui.today", { date }),
    selected: (date) => tr("ui.selected", { date }),
    lightVariant: tr("ui.lightVariant"),
    darkVariant: tr("ui.darkVariant"),
    numberedVariant: (name, number) =>
      tr("ui.numberedVariant", { name, number }),
    themeFile: {
      inFile: (file, reason) => tr("ui.themeFile.inFile", { file, reason }),
      importedTheme: tr("ui.themeFile.importedTheme"),
      tooLarge: tr("ui.themeFile.tooLarge"),
      invalidJson: tr("ui.themeFile.invalidJson"),
      notAnObject: tr("ui.themeFile.notAnObject"),
      unknownFormat: tr("ui.themeFile.unknownFormat"),
      unsupportedVersion: tr("ui.themeFile.unsupportedVersion"),
      nameLength: (max) => tr("ui.themeFile.nameLength", { max }),
      noVariants: tr("ui.themeFile.noVariants"),
      tooManyVariants: (max) => tr("ui.themeFile.tooManyVariants", { max }),
      notAList: tr("ui.themeFile.notAList"),
      variantAppearance: tr("ui.themeFile.variantAppearance"),
      colorsNotAnObject: (appearance) =>
        tr(`ui.themeFile.${appearance}NotAnObject`),
      notAColor: (value) => tr("ui.themeFile.notAColor", { value }),
      unknownColor: (key) => tr("ui.themeFile.unknownColor", { key }),
      noEditorBackground: tr("ui.themeFile.noEditorBackground"),
    },
  })
}

/**
 * Keeps the shared components' text in step with the language. Listeners
 * run before the app renders again, so the remount already reads it.
 */
export function syncUiText() {
  applyUiText()
  subscribeLocale(applyUiText)
}
