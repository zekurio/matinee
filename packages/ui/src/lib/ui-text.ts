/*
 * Text the shared components show on their own, like the close button's
 * label. The package can't reach the app's catalog, so the app hands its
 * translations over with `setUiText` whenever the language changes.
 * Components read `uiText()` while rendering.
 */

export type UiText = {
  /** The BCP 47 tag for dates and numbers, like `en` or `de`. */
  readonly locale: string
  readonly close: string
  readonly loading: string
  /** The toaster's landmark, and each toast's close button. */
  readonly notifications: string
  readonly closeToast: string
  /** The color picker's swatch button, for the color it edits. */
  readonly pickColor: (label: string) => string
  readonly colorArea: (label: string) => string
  readonly colorHue: (label: string) => string
  readonly colorHex: (label: string) => string
  readonly previousMonth: string
  readonly nextMonth: string
  /** A calendar day, given its date written out. */
  readonly today: (date: string) => string
  readonly selected: (date: string) => string
}

let current: UiText = {
  locale: "en",
  close: "Close",
  loading: "Loading",
  notifications: "Notifications",
  closeToast: "Close toast",
  pickColor: (label) => `Pick a color for ${label}`,
  colorArea: (label) => `${label} saturation and brightness`,
  colorHue: (label) => `${label} hue`,
  colorHex: (label) => `${label} hex value`,
  previousMonth: "Go to the previous month",
  nextMonth: "Go to the next month",
  today: (date) => `Today, ${date}`,
  selected: (date) => `${date}, selected`,
}

const listeners = new Set<() => void>()

export function uiText(): UiText {
  return current
}

export function setUiText(text: UiText) {
  current = text
  for (const listener of listeners) listener()
}

/** For state that keeps text, like the theme list's variant names. */
export function subscribeUiText(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
