/*
 * The words only a Samsung TV needs, which the Android app has none for.
 * Their keys start with `tizen_`. Everything else comes from Android's
 * strings; see scripts/strings.mjs.
 */

export const OWN_STRINGS = {
  en: {
    tizen_this_tv: "This TV",
    tizen_about_engine: "Web engine",
    tizen_about_player: "Player",
    tizen_about_model: "Model",
    tizen_about_system: "System",
    tizen_player_tv: "Samsung's own",
    tizen_player_browser: "The browser's",
    tizen_settings_fill: "Fill the screen",
    tizen_settings_fill_description:
      "Stretches a picture that isn't the screen's shape, instead of bars beside it.",
  },
  de: {
    tizen_this_tv: "Dieser Fernseher",
    tizen_about_engine: "Web-Engine",
    tizen_about_player: "Player",
    tizen_about_model: "Modell",
    tizen_about_system: "System",
    tizen_player_tv: "Der von Samsung",
    tizen_player_browser: "Der des Browsers",
    tizen_settings_fill: "Bildschirm füllen",
    tizen_settings_fill_description:
      "Streckt ein Bild, das nicht die Form des Bildschirms hat, statt Balken daneben zu zeigen.",
  },
} as const

export const OWN_PLURALS = {
  en: {},
  de: {},
} as const
