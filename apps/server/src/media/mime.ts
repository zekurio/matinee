const VIDEO_TYPES = new Map([
  ["mp4", "video/mp4"],
  ["m4v", "video/mp4"],
  ["mov", "video/quicktime"],
  ["webm", "video/webm"],
  ["mkv", "video/x-matroska"],
  ["avi", "video/x-msvideo"],
  ["ts", "video/mp2t"],
  ["m2ts", "video/mp2t"],
  ["mts", "video/mp2t"],
  ["mpg", "video/mpeg"],
  ["mpeg", "video/mpeg"],
  ["ogv", "video/ogg"],
  ["wmv", "video/x-ms-wmv"],
  ["flv", "video/x-flv"],
])

export function videoContainer(filename: string): string | null {
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return null
  const ext = filename.slice(dot + 1).toLowerCase()
  return VIDEO_TYPES.has(ext) ? ext : null
}

export function mimeType(container: string): string {
  return VIDEO_TYPES.get(container) ?? "application/octet-stream"
}
