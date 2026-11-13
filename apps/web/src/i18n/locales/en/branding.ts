import { defineMessages } from "../../catalog"

export default defineMessages("branding", {
  // How the server looks to everyone, under Settings → Branding
  // (administration).
  "branding.loadFailed": "Couldn't load the branding settings. {error}",
  "branding.title": "Accent color",
  "branding.presets": "Suggested accents",
  "branding.default": "Default",
  "branding.mode.light": "Light mode",
  "branding.mode.dark": "Dark mode",
  "branding.accent.light": "Light mode accent",
  "branding.accent.dark": "Dark mode accent",
  // The wall of artwork behind the login form.
  "branding.backdrop.title": "Login screen",
  "branding.backdrop.enabled": "Show artwork behind the form",
  "branding.backdrop.source":
    "Shows titles from the libraries the Everyone group opens.",
  "branding.backdrop.artwork": "Artwork",
  "branding.backdrop.artwork.mixed": "Posters and thumbs",
  "branding.backdrop.artwork.posters": "Posters",
  "branding.backdrop.artwork.thumbs": "Thumbs",
  "branding.backdrop.blur": "Blur",
  "branding.backdrop.blurValue": "{value} px",
  "branding.backdrop.fade": "Fade",
  "branding.backdrop.fadeValue": "{value} %",
  "branding.backdrop.preview": "Preview",
  "branding.backdrop.shuffle": "Shuffle",
  "branding.backdrop.previewOff": "The login screen shows no artwork.",
  "branding.backdrop.empty":
    "No artwork to show yet. The libraries the Everyone group opens have no titles with images the server has downloaded.",
})
