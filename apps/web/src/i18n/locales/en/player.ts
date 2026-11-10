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
  "player.subtitles.off": "Off",
  "player.subtitles.noTracks": "This file has no subtitles",
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

  // The playback stats over the picture, like Jellyfin's playback info.
  "player.stats.toggle": "Playback stats",
  "player.stats.close": "Close playback stats",
  "player.stats.method": "Method",
  "player.stats.method.direct": "Direct play",
  "player.stats.method.remux": "Direct stream",
  "player.stats.method.encode": "Transcode",
  "player.stats.reason": "Reason",
  // {container} is a file format, like MKV.
  "player.stats.reason.container": "This browser can't play {container} files",
  // {codec} is a video codec, like HEVC.
  "player.stats.reason.video": "This browser can't play {codec}",
  "player.stats.reason.directFailed": "Direct play failed",
  "player.stats.reason.remuxFailed": "Direct stream failed",
  // {format} is an audio format, like TrueHD Atmos.
  "player.stats.reason.audioCodec": "This browser can't play {format} audio",
  "player.stats.reason.audioTrack": "Not the file's default audio track",
  // {quality} is a resolution, like 720p.
  "player.stats.reason.quality": "{quality} picked",
  "player.stats.reason.burnIn": "Subtitles burned in",
  "player.stats.delivery": "Delivery",
  "player.stats.delivery.direct": "Original file",
  "player.stats.delivery.stream": "MP4 stream",
  "player.stats.delivery.hls": "HLS",
  "player.stats.bitrate": "Stream bitrate",
  "player.stats.buffer": "Buffered",
  "player.stats.seconds": "{seconds} s",
  "player.stats.video": "Video",
  "player.stats.videoBitrate": "Video bitrate",
  "player.stats.range": "Dynamic range",
  // {profile} is like 8.1.
  "player.stats.dolbyVision": "Dolby Vision profile {profile}",
  // {from} is the file's dynamic range, like HDR10.
  "player.stats.toneMapped": "{from} → SDR",
  "player.stats.toneMappedBy": "{from} → SDR, tone mapped by {mapper}",
  "player.stats.color": "Color",
  "player.stats.bitDepth": "{depth}-bit",
  "player.stats.output": "Video output",
  // How the server decodes the file for a transcode. {device} is like
  // Quick Sync.
  "player.stats.decoder": "Decoder",
  "player.stats.decoder.hardware": "Hardware",
  "player.stats.decoder.hardwareOn": "Hardware ({device})",
  "player.stats.decoder.software": "Software (CPU)",
  "player.stats.encoder": "Encoder",
  // The browser's decoded picture, and its size drawn, in device pixels.
  "player.stats.decoded": "Stream resolution",
  "player.stats.display": "Display size",
  "player.stats.frameRate": "Measured frame rate",
  "player.stats.fps": "{fps} fps",
  "player.stats.dropped": "Dropped frames",
  "player.stats.droppedValue": "{dropped} of {total} ({share})",
  "player.stats.audio": "Audio",
  "player.stats.audioOutput": "Audio output",
  "player.stats.unchanged": "Unchanged",
  "player.stats.container": "Container",
  "player.stats.size": "Size",
  "player.stats.overallBitrate": "Overall bitrate",

  // Toasts about what the server converts. {from} is a codec, like HEVC,
  // and {quality} a resolution, like 1080p.
  "player.notice.standIn": "Switched to {format} audio",
  "player.notice.standInDetail":
    "This browser can't play the track that would play. Pick it in the audio menu to transcode it.",
  "player.notice.video": "Transcoding {from} video to {quality}",
  "player.notice.videoTo": "Transcoding the video to {quality}",
  "player.notice.audio": "{from} audio to {to}",
  "player.notice.audioTitle": "Transcoding {from} audio to {to}",
  // The codec audio converts to, when it goes down to two channels.
  "player.notice.stereo": "{codec} stereo",
  "player.notice.burnIn": "Burning in subtitles",
  // While a subtitle track is still on its way.
  "player.notice.subtitles": "Preparing subtitles",
  "player.notice.burnInVideo": "Transcoding {from} video to {quality}.",
  "player.notice.burnInVideoTo": "Transcoding the video to {quality}.",
  "player.notice.burnInVideoAudio":
    "Transcoding {from} video to {quality} and {audioFrom} audio to {audioTo}.",
  "player.notice.burnInVideoToAudio":
    "Transcoding the video to {quality} and {audioFrom} audio to {audioTo}.",

  // Toasts when something fails.
  "player.error.burnIn": "Couldn't burn in those subtitles",
  "player.error.burnInDetail":
    "Subtitles are off. Pick another track or try again.",
  "player.error.lost": "Lost the video",
  "player.error.lostDetail": "The server stopped sending it.",
  "player.error.retry": "Retry",
  "player.error.revert": "Couldn't play that",
  "player.error.revertToQuality": "Back to the original quality.",
  "player.error.subtitles": "Couldn't load subtitles",
  "player.error.subtitlesDetail": "Pick another track or turn them off.",
  "player.error.savePreferences": "Couldn't save your playback preferences",
})
