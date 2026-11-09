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
