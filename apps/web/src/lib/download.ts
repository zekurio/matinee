/** Saves `text` as a file through the browser's download. */
export function downloadTextFile(
  text: string,
  filename: string,
  type = "application/json",
): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the URL after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
