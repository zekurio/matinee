import { defineMessages, plural } from "../../catalog"

export default defineMessages("trickplay", {
  // The trickplay panel under Settings → Trickplay.
  "trickplay.loadFailed": "Couldn't load the trickplay settings. {error}",
  "trickplay.checkFields": "Check the fields.",
  "trickplay.title": "Trickplay images",
  "trickplay.descriptionCount": plural({
    one: "Thumbnails over the seek bar while scrubbing. {ready} of {count} video has them.",
    other:
      "Thumbnails over the seek bar while scrubbing. {ready} of {count} videos have them.",
  }),
  "trickplay.enabled": "Make trickplay images",
  "trickplay.interval": "Interval",
  "trickplay.interval.option": plural({
    one: "Every {count} second",
    other: "Every {count} seconds",
  }),
  "trickplay.width": "Width",
  "trickplay.width.option": "{width} px",
  "trickplay.keyframesOnly": "Keyframes only",
  "trickplay.hardwareDecoding": "Hardware decoding",
  "trickplay.hardwareDecoding.unavailable":
    "Set up a GPU under Transcoding first.",
  "trickplay.regenerates":
    "Changing the interval, width, or keyframe setting regenerates every video's images in the background.",
})
