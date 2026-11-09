import { t } from "./schema"

/**
 * A blurred stand-in for an image, for clients to show while it loads, as
 * Jellyfin does.
 */
export const ImagePlaceholder = t.object({
  /** The image as a BlurHash, see https://blurha.sh. */
  blurhash: t.string(),
  /** Width over height, so the stand-in crops the way the image does. */
  aspectRatio: t.number().positive(),
})
export type ImagePlaceholder = t.infer<typeof ImagePlaceholder>

/** An image from a metadata provider. Load it through `artworkPath()`. */
export const Artwork = t.object({
  id: t.string(),
  /** Null until the server has downloaded and read the image. */
  placeholder: ImagePlaceholder.nullable(),
})
export type Artwork = t.infer<typeof Artwork>
