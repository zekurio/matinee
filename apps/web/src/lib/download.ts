import { type MediaItem, mediaStreamPath } from "@matinee/contracts"

/** Saves what `url` answers as a file through the browser's download. */
export function downloadUrl(url: string, filename: string): void {
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
}

/** Saves the file as it is, under its name in the library. */
export function downloadOriginal(item: MediaItem): void {
  const name = item.relativePath.split("/").at(-1) ?? item.relativePath
  downloadUrl(mediaStreamPath(item.id), name || "video")
}

/**
 * Saves each file as it is, one every half second: browsers drop some of
 * many downloads that start at once. The rest still start if the dialog
 * that asked closes, but not if the page does.
 */
export function downloadOriginals(items: readonly MediaItem[]): void {
  items.forEach((item, index) => {
    window.setTimeout(() => downloadOriginal(item), index * 500)
  })
}
