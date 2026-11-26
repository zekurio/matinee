/*
 * The words only the TV UI needs, which the Flutter app has none for.
 * Their keys start with `tizen_`. Everything else comes from the Flutter
 * app's ARB files; see scripts/strings.mjs.
 */

export const OWN_STRINGS = {
  en: {
    tizen_this_tv: "This TV",
    tizen_signin_description:
      "Scan the QR code with your phone's camera, or in the Matinee app under Settings › Account.",
    tizen_signin_enter: "Or go to {0} and enter",
    tizen_about_engine: "Web engine",
    tizen_about_player: "Player",
    tizen_about_model: "Model",
    tizen_about_system: "System",
    tizen_player_tv: "Samsung's own",
    tizen_player_browser: "The browser's",
    tizen_settings_fill: "Fill the screen",
    tizen_settings_fill_description:
      "Stretches a picture that isn't the screen's shape, instead of bars beside it.",
    tizen_settings_fullscreen: "Fullscreen",
    tizen_settings_fullscreen_exit: "Exit fullscreen",
    tizen_settings_tv_mode_description:
      "This browser opens Matinee in the TV layout. Turn it off for the desktop app.",
  },
  de: {
    tizen_this_tv: "Dieser Fernseher",
    tizen_signin_description:
      "Scanne den QR-Code mit der Kamera deines Handys oder in der Matinee-App unter Einstellungen › Konto.",
    tizen_signin_enter: "Oder öffne {0} und gib ein",
    tizen_about_engine: "Web-Engine",
    tizen_about_player: "Player",
    tizen_about_model: "Modell",
    tizen_about_system: "System",
    tizen_player_tv: "Der von Samsung",
    tizen_player_browser: "Der des Browsers",
    tizen_settings_fill: "Bildschirm füllen",
    tizen_settings_fill_description:
      "Streckt ein Bild, das nicht die Form des Bildschirms hat, statt Balken daneben zu zeigen.",
    tizen_settings_fullscreen: "Vollbild",
    tizen_settings_fullscreen_exit: "Vollbild beenden",
    tizen_settings_tv_mode_description:
      "Dieser Browser öffnet Matinee in der TV-Ansicht. Ausschalten für die Desktop-App.",
  },
} as const

export const OWN_PLURALS = {
  en: {},
  de: {},
} as const
