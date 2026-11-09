import { defineMessages } from "../../catalog"

export default defineMessages("player", {
  // The watch page around the player, and what it shows when nothing plays.
  "player.unsupported": "This browser can't play this file",
  "player.unsupportedDetail":
    "This browser doesn't support {container} files or their codecs, and the server couldn't transcode it. Check the server log.",
  "player.unsupportedDetailUnknown":
    "This browser doesn't support this file or its codecs, and the server couldn't transcode it. Check the server log.",
  "player.loadFailed": "Couldn't load this title",
  "player.backHome": "Back to Home",

  // The control bar and the overlay. The letter in parentheses is the key
  // that does the same.
  "player.back": "Back",
  "player.skipBack": "Back {seconds} seconds (j)",
  "player.skipForward": "Forward {seconds} seconds (l)",
  "player.play": "Play",
  "player.pause": "Pause",
  "player.playKey": "Play (k)",
  "player.pauseKey": "Pause (k)",
  "player.muteKey": "Mute (m)",
  "player.unmuteKey": "Unmute (m)",
  "player.volume": "Volume",
  "player.fullscreenKey": "Full screen (f)",
  "player.exitFullscreenKey": "Exit full screen (f)",
  "player.seek": "Seek",
  // What a screen reader says for the seek bar, like "1:02 of 45:10".
  "player.seekValue": "{time} of {duration}",
  "player.showLength": "Show length",
  "player.showTimeLeft": "Show time left",
  "player.endsAt": "Ends at {time}",

  // The card at the end of an episode that offers the next one.
  "player.upNext": "Up next",
  // On its Play button while it counts down, like "Playing in 7".
  "player.upNext.in": "Playing in {seconds}",
  "player.upNext.cancel": "Cancel",

  // Notes over the picture after a key press.
  "player.flash.muted": "Muted",
  "player.flash.skip": "{seconds} s",
  // After G or H, like "Subtitles +0.3 s".
  "player.flash.subtitleDelay": "Subtitles {delay}",
  "player.flash.subtitlesBurnedIn": "Burned-in subtitles can't move",

  // The audio, subtitle, and settings menus.
  "player.menu.audio": "Audio",
  "player.menu.subtitles": "Subtitles",
  "player.menu.settings": "Settings",
  // A menu button's tooltip with its key, like "Subtitles (c)".
  "player.menu.withKey": "{label} ({key})",
  "player.menu.none": "None",
  // A track's name, when the file gives it no language or only a title.
  "player.track.unnamed": "Track {number}",
  "player.track.unknownLanguage": "Unknown language",
  "player.track.withTitle": "{language} ({title})",
  "player.audio.noTracks": "This file has no audio tracks",
  "player.audio.loading": "Loading tracks…",
  "player.subtitles.off": "Off",
  "player.subtitles.noTracks": "This file has no subtitles",
  "player.subtitles.loading": "Loading subtitles…",
  "player.subtitles.forced": "Forced",
  "player.subtitles.burnedIn": "Burned in",
  // The subtitles menu's timing control. {seconds} is a signed number,
  // like +0.3.
  "player.subtitles.delay": "Offset",
  "player.subtitles.delayValue": "{seconds} s",
  "player.subtitles.earlier": "Show subtitles earlier (g)",
  "player.subtitles.later": "Show subtitles later (h)",
  "player.subtitles.delayReset": "Reset",
  "player.subtitles.delayResetDetail": "Back to the file's timing",
  "player.quality": "Quality",
  "player.quality.original": "Original",
  "player.speed": "Speed",
  "player.speed.normal": "Normal",
  "player.speed.rate": "{rate}×",
  "player.bitrate.mbps": "{value} Mbps",
  "player.bitrate.kbps": "{value} kbps",
  // How the file reaches the browser, in Jellyfin's terms.
  "player.via.directPlay": "Direct play",
  "player.via.directStream": "Direct stream",
  "player.via.directStreamBurnIn": "Direct stream, subtitles burned in",
  "player.via.transcode": "Transcoding to {resolution}, {bitrate}",
  "player.via.transcodeBurnIn":
    "Transcoding to {resolution}, {bitrate}, subtitles burned in",

  // Toasts about what the server converts. {from} and {to} are codecs,
  // like HEVC and H.264, and {quality} a resolution, like 1080p.
  "player.notice.standIn": "Switched to {format} audio",
  "player.notice.standInDetail":
    "This browser can't play the {format} track. Pick it in the audio menu to transcode it.",
  "player.notice.video": "Transcoding {from} to {to} {quality}",
  "player.notice.videoTo": "Transcoding to {to} {quality}",
  "player.notice.audio": "{from} audio to {to}",
  "player.notice.audioTitle": "Transcoding {from} audio to {to}",
  // The codec audio converts to, when it goes down to two channels.
  "player.notice.stereo": "{codec} stereo",
  "player.notice.burnIn": "Burning in subtitles",
  "player.notice.burnInVideo": "Transcoding {from} to {to} {quality}.",
  "player.notice.burnInVideoTo": "Transcoding to {to} {quality}.",
  "player.notice.burnInVideoAudio":
    "Transcoding {from} to {to} {quality} and {audioFrom} audio to {audioTo}.",
  "player.notice.burnInVideoToAudio":
    "Transcoding to {to} {quality} and {audioFrom} audio to {audioTo}.",

  // Toasts when something fails.
  "player.error.burnIn": "Couldn't burn in those subtitles",
  "player.error.burnInDetail":
    "Subtitles are off. Pick another track or try again.",
  "player.error.lost": "Lost the video",
  "player.error.lostDetail": "The server stopped sending it.",
  "player.error.retry": "Retry",
  "player.error.revert": "Couldn't play that",
  "player.error.revertToFile": "Back to the original file and audio.",
  "player.error.revertToQuality": "Back to the original quality and audio.",
  "player.error.subtitles": "Couldn't load subtitles",
  "player.error.subtitlesDetail": "Pick another track or turn them off.",
  "player.error.savePreferences": "Couldn't save your playback preferences",
})
