import { t } from "./schema"

export const DownloadVideoPreset = t.object({
  /** The tallest the frame gets, keeping its shape. */
  height: t.number().int(),
  /** Bits per second the video aims for. */
  bitrate: t.number().int(),
})
export type DownloadVideoPreset = t.infer<typeof DownloadVideoPreset>
