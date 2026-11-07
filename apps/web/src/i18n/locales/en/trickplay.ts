import { defineMessages, plural } from "../../catalog"

export default defineMessages("trickplay", {
  // The trickplay panel under Settings → Trickplay.
  "trickplay.loadFailed": "Couldn't load the trickplay settings. {error}",
  "trickplay.checkFields": "Check the fields.",
  "trickplay.title": "Trickplay images",
  "trickplay.description": "Thumbnails over the seek bar while scrubbing.",
  "trickplay.descriptionCount": plural({
    one: "Thumbnails over the seek bar while scrubbing. {ready} of {count} video has them.",
    other:
      "Thumbnails over the seek bar while scrubbing. {ready} of {count} videos have them.",
  }),
  "trickplay.enabled": "Make trickplay images",
  "trickplay.enabled.description": "Made when scanning and by a daily task.",
  "trickplay.interval": "Interval",
  "trickplay.interval.description": "Shorter takes more disk space.",
  "trickplay.interval.option": plural({
    one: "Every {count} second",
    other: "Every {count} seconds",
  }),
  "trickplay.width": "Width",
  "trickplay.width.description": "Wider looks sharper on big screens.",
  "trickplay.width.option": "{width} px",
  "trickplay.keyframesOnly": "Keyframes only",
  "trickplay.keyframesOnly.description":
    "Several times faster, but thumbnails can be a second or two off.",
  "trickplay.hardwareDecoding": "Hardware decoding",
  "trickplay.hardwareDecoding.description":
    "Uses {decoder} for the codecs enabled under Transcoding.",
  "trickplay.hardwareDecoding.unavailable":
    "Set up a GPU under Transcoding first.",
  "trickplay.regenerates":
    "Changing the interval, width, or keyframe setting regenerates every video's images in the background.",
})
