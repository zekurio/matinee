import { defineMessages, plural } from "../../catalog"

export default defineMessages("playback", {
  // Languages, which the account syncs.
  "playback.languages.title": "Languages",
  "playback.audio.title": "Audio",
  "playback.audio.fileDefault": "The file's default",
  "playback.audio.original": "Original language",
  "playback.subtitles.title": "Subtitles",
  // Subtitle modes: the label in the select, and the row's description.
  "playback.subtitles.mode.default.label": "As the file says",
  "playback.subtitles.mode.always.label": "Always",
  "playback.subtitles.mode.foreign.label": "With foreign audio",
  "playback.subtitles.mode.forced.label": "Forced only",
  "playback.subtitles.mode.off.label": "Off",
  "playback.subtitles.language": "Subtitle language",
  // {language} is the browser's language, like "English".
  "playback.subtitles.deviceLanguage": "This device's ({language})",
  // Whether a track picked in the player plays again; see the footer.
  "playback.audio.remember": "Remember audio picks",
  "playback.subtitles.remember": "Remember subtitle picks",

  // How far the player's skip buttons and keys go, which the account syncs.
  "playback.skip.title": "Skipping",
  "playback.skip.back": "Skip back",
  "playback.skip.forward": "Skip forward",
  "playback.skip.seconds": plural({
    one: "{count} second",
    other: "{count} seconds",
  }),

  // Quality and codecs, which stay with this browser.
  "playback.device.title": "This device",
  "playback.quality.title": "Quality",
  // A quality preset: "1080p, 8 Mbps".
  "playback.quality.preset": "{height}p, {bitrate}",
  "playback.quality.original": "Original",
  // {rate} like 8 Mbps.
  "playback.quality.limit":
    "The server limits streaming to {rate} for this account.",
  "playback.videoCodec.title": "Video codec",
  "playback.audioCodec.title": "Audio codec",
  // {codec} is the codec automatic picks, like HEVC or Opus.
  "playback.codec.automatic": "Automatic ({codec})",
  "playback.autoplay.title": "Play the next episode",

  // Audio passthrough.
  "playback.passthrough.title": "Audio passthrough",
})
