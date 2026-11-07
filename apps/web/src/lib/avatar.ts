/** Twice the 256px the server keeps, so its own crop has room to work. */
const SIZE = 512

/**
 * Crop a picture to a centred square, scaled to at most 512px, before upload.
 * The browser decodes it, so any format it reads works (HEIC on Safari, GIF,
 * AVIF), and turns it upright by its EXIF orientation, which ffmpeg ignores.
 * Gives WebP, or PNG where the browser can't encode WebP.
 */
export async function prepareAvatar(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  } catch {
    throw new Error("Couldn't read that image. Try another file.")
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const size = Math.min(side, SIZE)
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Your browser can't resize images.")
    context.imageSmoothingQuality = "high"
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    )
    if (!blob) throw new Error("Couldn't prepare that image.")
    const extension = blob.type === "image/webp" ? "webp" : "png"
    return new File([blob], `avatar.${extension}`, { type: blob.type })
  } finally {
    bitmap.close()
  }
}
