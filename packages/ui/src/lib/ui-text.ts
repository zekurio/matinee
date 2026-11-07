/*
 * Text the shared components show on their own, like the close button's
 * label. The package can't reach the app's catalog, so the app hands its
 * translations over with `setUiText` whenever the language changes.
 * Components read `uiText()` while rendering.
 */

/** Why a theme file didn't import. */
export type ThemeFileText = {
  /** A file's reason, with the file's name in front. */
  readonly inFile: (file: string, reason: string) => string
  /** The name of a theme whose file had none. */
  readonly importedTheme: string
  readonly tooLarge: string
  readonly invalidJson: string
  readonly notAnObject: string
  readonly unknownFormat: string
  readonly unsupportedVersion: string
  readonly nameLength: (max: number) => string
  readonly noVariants: string
  readonly tooManyVariants: (max: number) => string
  readonly notAList: string
  readonly variantAppearance: string
  readonly colorsNotAnObject: (appearance: "light" | "dark") => string
  readonly notAColor: (value: string) => string
  readonly unknownColor: (key: string) => string
  readonly noEditorBackground: string
}

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
  /** Custom theme variants without a name: "Light", "Dark", "Light 2". */
  readonly lightVariant: string
  readonly darkVariant: string
  readonly numberedVariant: (name: string, number: number) => string
  readonly themeFile: ThemeFileText
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
  lightVariant: "Light",
  darkVariant: "Dark",
  numberedVariant: (name, number) => `${name} ${number}`,
  themeFile: {
    inFile: (file, reason) => `${file}: ${reason}`,
    importedTheme: "Imported theme",
    tooLarge: "Theme files can be at most 256 KB.",
    invalidJson: "This isn't valid JSON.",
    notAnObject: "Expected a theme object.",
    unknownFormat: "Expected a Matinee or VS Code theme.",
    unsupportedVersion: "Unsupported theme file version.",
    nameLength: (max) => `A theme needs a name of 1 to ${max} characters.`,
    noVariants: "A theme needs light or dark colors.",
    tooManyVariants: (max) => `A theme can have at most ${max} variants.`,
    notAList: "Expected a list of variants.",
    variantAppearance: 'A variant\'s appearance must be "light" or "dark".',
    colorsNotAnObject: (appearance) =>
      `Expected ${appearance} colors to be an object.`,
    notAColor: (value) => `"${value}" isn't a color.`,
    unknownColor: (key) => `Unknown theme color "${key}".`,
    noEditorBackground: "This VS Code theme doesn't set an editor background.",
  },
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
