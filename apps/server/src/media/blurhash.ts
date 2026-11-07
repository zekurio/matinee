import type { ImagePlaceholder } from "@matinee/contracts"
import { encode } from "blurhash"

import { env } from "../env"
import { runBytes } from "./process"

// The image is read at most this big. BlurHash keeps a handful of
// components, so more pixels only cost time.
const SAMPLE_SIZE = 64
// About this many components in all, as Jellyfin aims for.
const COMPONENTS = 16

const HEADER_END = "ENDHDR\n"

/** Width, height, and RGBA pixels of a PAM image as ffmpeg writes it. */
function parsePam(bytes: Buffer) {
  const end = bytes.indexOf(HEADER_END)
  if (end < 0) throw new Error("ffmpeg's output has no PAM header")
  const fields = new Map<string, string>()
  for (const line of bytes.subarray(0, end).toString("latin1").split("\n")) {
    const [name, value] = line.trim().split(/\s+/)
    if (name && value) fields.set(name, value)
  }
  const width = Number(fields.get("WIDTH"))
  const height = Number(fields.get("HEIGHT"))
  const data = bytes.subarray(end + HEADER_END.length)
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    fields.get("DEPTH") !== "4" ||
    fields.get("MAXVAL") !== "255" ||
    data.byteLength !== width * height * 4
  ) {
    throw new Error("ffmpeg's output isn't an RGBA image")
  }
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    ),
  }
}

function components(value: number): number {
  return Math.min(9, Math.max(1, Math.round(value)))
}

/**
 * A BlurHash of the image at `path`, scaled by ffmpeg to fit 64 pixels.
 * The components split the image into tiles as near square as its shape
 * allows: 3 by 5 for a poster, 5 by 3 for a backdrop.
 */
export async function readPlaceholder(path: string): Promise<ImagePlaceholder> {
  const bytes = await runBytes(env.MATINEE_FFMPEG_PATH, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    `scale=${SAMPLE_SIZE}:${SAMPLE_SIZE}:force_original_aspect_ratio=decrease:flags=area`,
    "-f",
    "image2pipe",
    "-c:v",
    "pam",
    "-pix_fmt",
    "rgba",
    "pipe:1",
  ])
  const { width, height, pixels } = parsePam(bytes)
  const aspectRatio = width / height
  const x = Math.sqrt(COMPONENTS * aspectRatio)
  return {
    blurhash: encode(
      pixels,
      width,
      height,
      components(x),
      components(x / aspectRatio),
    ),
    aspectRatio: Math.round(aspectRatio * 1000) / 1000,
  }
}
