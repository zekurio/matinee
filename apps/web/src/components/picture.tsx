import { cn } from "@matinee/ui/lib/utils"
import { useState } from "react"

import type { ImageSource } from "@/lib/media"

import { Blurhash } from "./blurhash"

// Neutral steps far enough apart that neighbouring shows look different.
const TONES = [
  "bg-gradient-to-br from-[#26262a] to-[#1a1a1d]",
  "bg-gradient-to-tr from-[#2b2b2f] to-[#1e1e21]",
  "bg-gradient-to-b from-[#303035] to-[#1c1c1f]",
  "bg-gradient-to-bl from-[#2d2d32] to-[#202023]",
]

export function tone(key: string): string {
  let hash = 0
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return TONES[Math.abs(hash) % TONES.length] ?? TONES[0]!
}

/**
 * The first of `sources` that loads, faded in over its blurred placeholder
 * while it loads, or over whatever sits beneath it when it has none.
 * Nothing when every source fails. The image is opaque over the
 * placeholder, so dim a picture from a wrapper, not through `className`.
 */
export function Picture(props: PictureProps) {
  // New sources start over, without an effect and a flash of the old image.
  return (
    <PictureSources
      key={props.sources.map((source) => source.src).join("|")}
      {...props}
    />
  )
}

type PictureProps = {
  sources: ImageSource[]
  className?: string
  eager?: boolean
  /**
   * How wide the image shows, for picking from the sources' sizes. Lazy
   * images measure themselves where browsers can; eager ones fill the
   * window unless told otherwise.
   */
  sizes?: string
}

function PictureSources({
  sources,
  className,
  eager = false,
  sizes,
}: PictureProps) {
  const [current, setState] = useState({ index: 0, ready: false })
  const source = sources[current.index]
  if (!source) return null
  const fill = "absolute inset-0 size-full object-cover"
  return (
    <>
      {source.placeholder && (
        <Blurhash
          placeholder={source.placeholder}
          className={cn(fill, className)}
        />
      )}
      <img
        key={source.src}
        src={source.src}
        srcSet={source.srcSet}
        // A browser without `auto` reads the next entry, which picks the
        // size cards had before there was a choice.
        sizes={
          source.srcSet
            ? (sizes ?? (eager ? "100vw" : "auto, 300px"))
            : undefined
        }
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setState({ ...current, ready: true })}
        onError={() =>
          setState({ ...current, index: current.index + 1, ready: false })
        }
        className={cn(
          fill,
          "transition-opacity duration-300 motion-reduce:transition-none",
          current.ready ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  )
}
