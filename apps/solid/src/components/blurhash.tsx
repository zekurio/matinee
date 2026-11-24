import type { ImagePlaceholder } from "@matinee/contracts"
import { isBlurhashValid } from "blurhash"
import { createEffect, createMemo } from "solid-js"

// Jellyfin decodes at 20 pixels too. Scaling the canvas up smooths the rest.
const LONG_SIDE = 20

function canvasSize(aspectRatio: number): { width: number; height: number } {
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
function drawWhenNear(canvas: HTMLCanvasElement, draw: () => void) {
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
  waiting.set(canvas, draw)
  observer.observe(canvas)
  return () => {
    observer?.unobserve(canvas)
    waiting.delete(canvas)
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
 * The `blurhash` package's `decode`, to the same pixels, written straight
 * into `image`. It works each cosine out once per column and row rather
 * than once per pixel and component, which more than halves its time.
 */
function decodeInto(image: ImageData, blurhash: string) {
  const { width, height, data } = image
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
  for (let y = 0; y < height; y++) {
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
      const pixel = (y * width + x) * 4
      data[pixel] = toSrgb(r)
      data[pixel + 1] = toSrgb(g)
      data[pixel + 2] = toSrgb(b)
      data[pixel + 3] = 255
    }
  }
}

/** How many decoded placeholders to keep, at about a kilobyte each. */
const KEPT = 600

/** Decoded placeholders, the most recently drawn last. */
const decoded = new Map<string, ImageData>()

/**
 * A placeholder's pixels. Kept, since a card in a windowed grid mounts
 * again each time it scrolls back in, and decoding its placeholder cost a
 * quarter of what scrolling did.
 */
function pixels(
  context: CanvasRenderingContext2D,
  blurhash: string,
  width: number,
  height: number,
): ImageData | undefined {
  const key = `${width}x${height}:${blurhash}`
  const kept = decoded.get(key)
  if (kept) {
    decoded.delete(key)
    decoded.set(key, kept)
    return kept
  }
  if (!isBlurhashValid(blurhash).result) return undefined
  const image = context.createImageData(width, height)
  decodeInto(image, blurhash)
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
 * An image's BlurHash, decoded small and stretched to fit. The canvas has
 * the image's shape, so `object-cover` and `object-position` crop it the
 * way they crop the image.
 */
export function Blurhash(props: {
  placeholder: ImagePlaceholder
  class?: string
}) {
  let canvas: HTMLCanvasElement | undefined
  const size = createMemo(() => canvasSize(props.placeholder.aspectRatio))
  createEffect(
    () => ({ blurhash: props.placeholder.blurhash, ...size() }),
    ({ blurhash, width, height }) => {
      const target = canvas
      if (!target) return
      return drawWhenNear(target, () => {
        const context = target.getContext("2d")
        if (!context) return
        const image = pixels(context, blurhash, width, height)
        if (image) context.putImageData(image, 0, 0)
      })
    },
  )
  return (
    <canvas
      ref={(element) => (canvas = element)}
      width={size().width}
      height={size().height}
      aria-hidden="true"
      class={props.class}
    />
  )
}
