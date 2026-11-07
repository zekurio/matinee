import { t } from "./schema"
import { HardwareAcceleration } from "./transcoding"

/*
 * Trickplay: the thumbnails the seek bar shows while someone scrubs, laid
 * out in tiles as Jellyfin makes them.
 */

/**
 * A file's trickplay images. Thumbnail `n` shows the video at
 * `n * intervalSeconds`. The thumbnails fill tiles of `columns` by `rows`,
 * left to right and then top to bottom, so thumbnail `n` sits in tile
 * `floor(n / (columns * rows))`. Load a tile from `trickplayTilePath()`.
 */
export const Trickplay = t.object({
  /** Names this set of images in the tile URLs. New images get a new key. */
  key: t.string(),
  /** One thumbnail's width in pixels. */
  width: t.number().int().positive(),
  height: t.number().int().positive(),
  /** Thumbnails across a tile. */
  columns: t.number().int().positive(),
  /** Thumbnails down a tile. */
  rows: t.number().int().positive(),
  /**
   * Thumbnails in all. Every tile is `columns` by `rows` thumbnails big;
   * the last one is black after its final thumbnail.
   */
  count: t.number().int().positive(),
  intervalSeconds: t.number().positive(),
})
export type Trickplay = t.infer<typeof Trickplay>

/**
 * Whether a file has trickplay images. `pending` means the server is
 * making them, or will once it gets to the file. `unavailable` means it
 * won't: the file has no video, ffmpeg couldn't read it, or an admin
 * turned trickplay off before the images were made.
 */
export const TrickplayStatus = t.union([
  t.object({ status: t.literal("ready"), images: Trickplay }),
  t.object({ status: t.literal("pending") }),
  t.object({ status: t.literal("unavailable") }),
])
export type TrickplayStatus = t.infer<typeof TrickplayStatus>

/** Seconds between thumbnails that admins can pick. */
export const TRICKPLAY_INTERVALS = [2, 5, 10, 15, 30] as const
export const TrickplayInterval = t.enum(TRICKPLAY_INTERVALS)
export type TrickplayInterval = t.infer<typeof TrickplayInterval>

/** Thumbnail widths in pixels that admins can pick. */
export const TRICKPLAY_WIDTHS = [240, 320, 480] as const
export const TrickplayWidth = t.enum(TRICKPLAY_WIDTHS)
export type TrickplayWidth = t.infer<typeof TrickplayWidth>

export const TrickplaySettings = t.object({
  /**
   * Make images for files that have none. Scans queue their new files and
   * the Make trickplay images task the rest. Off, the images made already
   * still show.
   */
  enabled: t.boolean(),
  intervalSeconds: TrickplayInterval,
  width: TrickplayWidth,
  /**
   * Decode only the keyframes. Several times faster, but a thumbnail
   * shows the keyframe nearest its time, usually a second or two off.
   */
  keyframesOnly: t.boolean(),
  /**
   * Decode on the GPU set up for transcoding, for the codecs it decodes
   * there. Saves the most CPU when every frame is decoded.
   */
  hardwareDecoding: t.boolean(),
})
export type TrickplaySettings = t.infer<typeof TrickplaySettings>

export const AdminTrickplaySettings = t.object({
  settings: TrickplaySettings,
  /**
   * The transcoding GPU that hardware decoding would use. Null when none
   * is set up or its device didn't open.
   */
  hardwareAcceleration: HardwareAcceleration.nullable(),
  /** Files with a video stream, as ffprobe read them. */
  videos: t.number().int().min(0),
  /** Of those, the ones with images of the file as it is, at these settings. */
  ready: t.number().int().min(0),
})
export type AdminTrickplaySettings = t.infer<typeof AdminTrickplaySettings>
