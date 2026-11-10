import { defineMessages, plural } from "../../catalog"

export default defineMessages("downloads", {
  // download-dialog.tsx and download-form.tsx: saving a file to watch
  // offline. {name} is the movie or episode.
  "downloads.menuItem": "Download",
  "downloads.title": "Download {name}",
  "downloads.description": "Download the original or a custom version.",
  "downloads.version": "Version",
  "downloads.original": "Original",
  // {format} is the container, like MKV, and {size} the file's size.
  "downloads.original.description": "{format} · {size}",
  "downloads.custom": "Custom",
  "downloads.custom.description": "Choose size, tracks, and subtitles.",
  "downloads.custom.unavailable":
    "The server hasn't read this file's tracks yet.",

  "downloads.video": "Video",
  // {codec} like HEVC, {resolution} like 1080p.
  "downloads.video.keep": "Original, {codec} {resolution}",
  // {bitrate} like 6 Mbps.
  "downloads.video.preset": "{resolution}, {bitrate}",
  "downloads.container": "Format",
  "downloads.codec": "Codec",
  "downloads.keepHdr": "Keep HDR",

  "downloads.audio": "Audio tracks",
  "downloads.audio.loading": "Loading audio tracks…",
  // {format} like TrueHD Atmos.
  "downloads.audio.keep": "Keep {format}",
  // {codec} like AAC, {layout} like Stereo or 5.1.
  "downloads.audio.convert": "{codec} {layout}",
  // {track} is the track's name, for screen readers.
  "downloads.audio.include": "Include {track}",
  "downloads.audio.format": "Format of {track}",
  "downloads.audio.none": "Pick at least one audio track.",
  // In place of a track's format, when the format can't take it at all.
  "downloads.audio.unavailable": "Not available",

  "downloads.burnIn": "Burn in subtitles",
  "downloads.burnIn.none": "None",
  // A custom version: subtitles that go in the file.
  "downloads.subtitles.inFile": "Subtitles",
  // {track} is the track's name, for screen readers.
  "downloads.subtitles.include": "Include {track}",
  "downloads.subtitles": "Subtitle files",
  "downloads.subtitles.description":
    "Files next to the video, not in it. Save the ones you want.",
  // {track} is the track's name, for screen readers.
  "downloads.subtitles.save": "Save {track}",

  "downloads.estimate": "About {size}",
  "downloads.estimating": "Working out the size…",
  "downloads.toneMapped": "HDR is converted to SDR.",
  "downloads.cancel": "Cancel",
  "downloads.submit": "Download",
  "downloads.started": "Download started",
  "downloads.started.description":
    "It's converted as it downloads, so this can take a while.",
  "downloads.startFailed": "Couldn't start the download",

  // The same dialog for every file of a show or season. {name} is the
  // show or season.
  "downloads.all.description":
    "Saves each original file, with every track. For a version made for this device, download an episode on its own.",
  "downloads.all.files": plural({
    one: "{count} file",
    other: "{count} files",
  }),
  "downloads.all.browser":
    "Your browser may ask whether this site can download several files.",
  "downloads.all.loadFailed": "Couldn't list the files. {error}",
  "downloads.all.empty": "There are no files to download.",
  "downloads.all.started": plural({
    one: "Downloading {count} file",
    other: "Downloading {count} files",
  }),
  "downloads.all.started.description":
    "Keep this page open until your browser has started them all.",
})
