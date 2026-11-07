import type { ImagePlaceholder } from "@matinee/contracts"
import { decode, isBlurhashValid } from "blurhash"
import { useCallback } from "react"

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

/**
 * An image's BlurHash, decoded small and stretched to fit. The canvas has
 * the image's shape, so `object-cover` and `object-position` crop it the
 * way they crop the image.
 */
export function Blurhash({
  placeholder,
  className,
}: {
  placeholder: ImagePlaceholder
  className?: string
}) {
  const { blurhash, aspectRatio } = placeholder
  const { width, height } = canvasSize(aspectRatio)
  const draw = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const context = canvas?.getContext("2d")
      if (!context || !isBlurhashValid(blurhash).result) return
      const image = context.createImageData(width, height)
      image.data.set(decode(blurhash, width, height))
      context.putImageData(image, 0, 0)
    },
    [blurhash, width, height],
  )
  return (
    <canvas
      ref={draw}
      width={width}
      height={height}
      aria-hidden
      className={className}
    />
  )
}
