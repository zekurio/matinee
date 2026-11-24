import type { ImagePlaceholder } from "@matinee/contracts"
import { isBlurhashValid } from "blurhash"
import { createEffect, createMemo } from "solid-js"

// Jellyfin decodes at 20 pixels too. Scaling the image up smooths the rest.
const LONG_SIDE = 20

function imageSize(aspectRatio: number): { width: number; height: number } {
  return aspectRatio >= 1
    ? {
        width: LONG_SIDE,
        height: Math.max(1, Math.round(LONG_SIDE / aspectRatio)),
      }
    : {
        width: Math.max(1, Math.round(LONG_SIDE * aspectRatio)),
        height: LONG_SIDE,
      }
}

/** Placeholders waiting to come near the screen, with what draws each. */
const waiting = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null

/**
 * Draws a placeholder once it comes within half a screen of view, also
 * inside a row that scrolls sideways. A page of cards decoded every one at
 * once, most of them out of sight. Returns what stops watching it.
 */
function drawWhenNear(element: Element, draw: () => void) {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer?.unobserve(entry.target)
        waiting.get(entry.target)?.()
        waiting.delete(entry.target)
      }
    },
    { rootMargin: "50%", scrollMargin: "50%" },
  )
  waiting.set(element, draw)
  observer.observe(element)
  return () => {
    observer?.unobserve(element)
    waiting.delete(element)
  }
}

const DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

function base83(text: string, from: number, to: number): number {
  let value = 0
  for (let at = from; at < to; at++) {
    value = value * 83 + DIGITS.indexOf(text.charAt(at))
  }
  return value
}

function toLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function toSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return v <= 0.0031308
    ? Math.trunc(v * 12.92 * 255 + 0.5)
    : Math.trunc((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5)
}

function signedSquare(value: number): number {
  return Math.sign(value) * value * value
}

/**
 * The `blurhash` package's `decode`, to the same pixels, written as a
 * 24-bit BMP's rows into `bytes` from `offset`, bottom row first. It works
 * each cosine out once per column and row rather than once per pixel and
 * component, which more than halves its time.
 */
function decodeInto(
  bytes: Uint8Array,
  offset: number,
  blurhash: string,
  width: number,
  height: number,
) {
  const size = base83(blurhash, 0, 1)
  const numY = Math.floor(size / 9) + 1
  const numX = (size % 9) + 1
  const maximum = (base83(blurhash, 1, 2) + 1) / 166
  const colors = new Float64Array(numX * numY * 3)
  const dc = base83(blurhash, 2, 6)
  colors[0] = toLinear(dc >> 16)
  colors[1] = toLinear((dc >> 8) & 255)
  colors[2] = toLinear(dc & 255)
  for (let at = 1; at < numX * numY; at++) {
    const ac = base83(blurhash, 4 + at * 2, 6 + at * 2)
    colors[at * 3] = signedSquare((Math.floor(ac / 361) - 9) / 9) * maximum
    colors[at * 3 + 1] =
      signedSquare(((Math.floor(ac / 19) % 19) - 9) / 9) * maximum
    colors[at * 3 + 2] = signedSquare(((ac % 19) - 9) / 9) * maximum
  }
  const cosX = new Float64Array(width * numX)
  for (let x = 0; x < width; x++) {
    for (let i = 0; i < numX; i++) {
      cosX[x * numX + i] = Math.cos((Math.PI * x * i) / width)
    }
  }
  const cosY = new Float64Array(height * numY)
  for (let y = 0; y < height; y++) {
    for (let j = 0; j < numY; j++) {
      cosY[y * numY + j] = Math.cos((Math.PI * y * j) / height)
    }
  }
  const stride = rowBytes(width)
  for (let y = 0; y < height; y++) {
    const row = offset + (height - 1 - y) * stride
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = (cosX[x * numX + i] ?? 0) * (cosY[y * numY + j] ?? 0)
          const color = (i + j * numX) * 3
          r += (colors[color] ?? 0) * basis
          g += (colors[color + 1] ?? 0) * basis
          b += (colors[color + 2] ?? 0) * basis
        }
      }
      const pixel = row + x * 3
      bytes[pixel] = toSrgb(b)
      bytes[pixel + 1] = toSrgb(g)
      bytes[pixel + 2] = toSrgb(r)
    }
  }
}

/** A BMP row of `width` pixels, padded to four bytes. */
function rowBytes(width: number): number {
  return Math.ceil((width * 3) / 4) * 4
}

const HEADER = 54

/** An uncompressed 24-bit BMP of the placeholder, as a `data:` address. */
function bitmap(blurhash: string, width: number, height: number): string {
  const pixels = rowBytes(width) * height
  const bytes = new Uint8Array(HEADER + pixels)
  const header = new DataView(bytes.buffer)
  header.setUint16(0, 0x4d42, true)
  header.setUint32(2, bytes.length, true)
  header.setUint32(10, HEADER, true)
  header.setUint32(14, 40, true)
  header.setInt32(18, width, true)
  header.setInt32(22, height, true)
  header.setUint16(26, 1, true)
  header.setUint16(28, 24, true)
  header.setUint32(34, pixels, true)
  decodeInto(bytes, HEADER, blurhash, width, height)
  let text = ""
  for (const byte of bytes) text += String.fromCharCode(byte)
  return `data:image/bmp;base64,${btoa(text)}`
}

/** How many decoded placeholders to keep, at about three kilobytes each. */
const KEPT = 600

/** Decoded placeholders, the most recently drawn last. */
const decoded = new Map<string, string>()

/**
 * A placeholder's image. Kept, since a card in a windowed grid mounts
 * again each time it scrolls back in, and decoding its placeholder cost a
 * quarter of what scrolling did.
 */
function placeholderImage(
  blurhash: string,
  width: number,
  height: number,
): string | undefined {
  const key = `${width}x${height}:${blurhash}`
  const kept = decoded.get(key)
  if (kept) {
    decoded.delete(key)
    decoded.set(key, kept)
    return kept
  }
  if (!isBlurhashValid(blurhash).result) return undefined
  const image = bitmap(blurhash, width, height)
  decoded.set(key, image)
  if (decoded.size > KEPT) {
    for (const oldest of decoded.keys()) {
      decoded.delete(oldest)
      break
    }
  }
  return image
}

/**
 * An image's BlurHash, decoded small and stretched to fit. The image has
 * the original's shape, so `object-cover` and `object-position` crop it
 * the way they crop the original.
 *
 * It's an image rather than a canvas: Chrome gives every canvas a layer of
 * its own, and everything drawn over one a layer too, which a grid of
 * cards paid for in every frame it scrolled.
 */
export function Blurhash(props: {
  placeholder: ImagePlaceholder
  class?: string
}) {
  let element: HTMLImageElement | undefined
  const size = createMemo(() => imageSize(props.placeholder.aspectRatio))
  createEffect(
    () => ({ blurhash: props.placeholder.blurhash, ...size() }),
    ({ blurhash, width, height }) => {
      const target = element
      if (!target) return
      return drawWhenNear(target, () => {
        const image = placeholderImage(blurhash, width, height)
        if (image) target.src = image
      })
    },
  )
  return (
    <img
      ref={(image) => (element = image)}
      alt=""
      aria-hidden="true"
      draggable={false}
      class={props.class}
    />
  )
}
