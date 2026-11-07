import { defineMessages } from "../../catalog"

export default defineMessages("playback", {
  // Languages, which the account syncs.
  "playback.languages.title": "Languages",
  "playback.languages.description": "Synced to your account.",
  "playback.audio.title": "Audio",
  "playback.audio.description": "Falls back to the file's default.",
  "playback.audio.fileDefault": "The file's default",
  "playback.audio.original": "Original language",
  "playback.subtitles.title": "Subtitles",
  // Subtitle modes: the label in the select, and the row's description.
  "playback.subtitles.mode.default.label": "As the file says",
  "playback.subtitles.mode.default.description": "The file's default track.",
  "playback.subtitles.mode.always.label": "Always",
  "playback.subtitles.mode.always.description": "Full subtitles.",
  "playback.subtitles.mode.foreign.label": "With foreign audio",
  "playback.subtitles.mode.foreign.description":
    "Full subtitles when the audio is in another language.",
  "playback.subtitles.mode.forced.label": "Forced only",
  "playback.subtitles.mode.forced.description":
    "Signs and foreign dialogue only.",
  "playback.subtitles.mode.off.label": "Off",
  "playback.subtitles.mode.off.description":
    "Until you pick a track in the player.",
  "playback.subtitles.language": "Subtitle language",
  // {language} is the browser's language, like "English".
  "playback.subtitles.deviceLanguage": "This device's ({language})",
  "playback.subtitles.remember": "Remember my picks",
  "playback.subtitles.remember.description":
    "Subtitles you pick in the player carry over to the next video.",

  // Quality and codecs, which stay with this browser.
  "playback.device.title": "This device",
  "playback.device.description": "Saved on this browser only.",
  "playback.quality.title": "Quality",
  "playback.quality.description": "What videos start in.",
  // A quality preset: "1080p, 8 Mbps".
  "playback.quality.preset": "{height}p, {bitrate}",
  "playback.quality.original": "Original",
  "playback.videoCodec.title": "Video codec",
  "playback.videoCodec.description":
    "For transcodes. AV1 and HEVC look better but load the server more.",
  "playback.videoCodec.only":
    "The only codec this browser and the server share.",
  "playback.audioCodec.title": "Audio codec",
  "playback.audioCodec.description":
    "Stereo, for audio this browser can't play.",
  // {codec} is the codec automatic picks, like HEVC or Opus.
  "playback.codec.automatic": "Automatic ({codec})",

  // Audio passthrough.
  "playback.passthrough.title": "Audio passthrough",
  "playback.passthrough.description":
    "Formats this browser plays directly. Turn one off to have the server convert it.",
  "playback.passthrough.ac3": "Dolby Digital surround.",
  "playback.passthrough.eac3": "Dolby Digital Plus, including Atmos.",
  "playback.passthrough.flac": "Lossless. Uses far more bandwidth.",
  "playback.passthrough.alac": "Apple Lossless. Uses far more bandwidth.",
})
