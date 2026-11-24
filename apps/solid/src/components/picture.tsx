import { cn } from "@matinee/ui/lib/utils"
import { createMemo, createSignal, onSettled, Show } from "solid-js"

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
  return TONES[Math.abs(hash) % TONES.length] ?? TONES[0] ?? ""
}

// Images this page has shown already. One that mounts again, like a
// poster when its card or page becomes another, shows at once rather than
// fading in a second time.
const shown = new Set<string>()

type PictureProps = {
  sources: ImageSource[]
  class?: string
  eager?: boolean
  /**
   * How wide the image shows, for picking from the sources' sizes. Lazy
   * images measure themselves where browsers can; eager ones fill the
   * window unless told otherwise.
   */
  sizes?: string
}

/**
 * The first of `sources` that loads, faded in over its blurred placeholder
 * while it loads, or over whatever sits beneath it when it has none.
 * Nothing when every source fails. The image is opaque over the
 * placeholder, so dim a picture from a wrapper, not through `class`.
 */
export function Picture(props: PictureProps) {
  // New sources start over, with no flash of the old image.
  const key = createMemo(() =>
    props.sources.map((source) => source.src).join("|"),
  )
  return (
    <Show when={key()} keyed>
      {(_key) => <PictureSources {...props} />}
    </Show>
  )
}

function PictureSources(props: PictureProps) {
  const [index, setIndex] = createSignal(0)
  const source = () => props.sources[index()]
  // Shown at once when this page showed it before; follows the source as
  // a failed one gives way to the next.
  const [ready, setReady] = createSignal(() => {
    const src = source()?.src
    return src !== undefined && shown.has(src)
  })
  // An image this page has shown is still in the browser's memory and
  // draws at once, so it mounts without the placeholder under it.
  const seen = createMemo(() => shown.has(source()?.src ?? ""))
  const fill = "absolute inset-0 size-full object-cover"
  let image: HTMLImageElement | undefined
  // A lazy image with `sizes="auto"` picks a file again when it leaves the
  // page, at the window's width, and fetches the largest one for nothing. A
  // windowed grid takes a row of them out with every row it scrolls by.
  onSettled(() => () => {
    queueMicrotask(() => {
      if (!image || image.isConnected) return
      image.removeAttribute("srcset")
      image.removeAttribute("src")
    })
  })
  return (
    <Show when={source()}>
      {(current) => (
        <>
          <Show when={!seen() && current().placeholder}>
            {(placeholder) => (
              <Blurhash
                placeholder={placeholder()}
                class={cn(fill, props.class)}
              />
            )}
          </Show>
          {/* `src` goes last. Solid sets attributes in this order, and an
              image starts loading the moment it has a `src`: before
              `loading="lazy"` that's every image on the page at once, and
              before `srcset` it's the wrong file. */}
          <img
            ref={(element) => (image = element)}
            alt=""
            loading={props.eager ? "eager" : "lazy"}
            decoding="async"
            draggable={false}
            // A browser without `auto` reads the next entry, which picks
            // the size cards had before there was a choice.
            sizes={
              current().srcSet
                ? (props.sizes ?? (props.eager ? "100vw" : "auto, 300px"))
                : undefined
            }
            srcset={current().srcSet}
            src={current().src}
            onLoad={() => {
              shown.add(current().src)
              setReady(true)
            }}
            onError={() => setIndex((at) => at + 1)}
            class={cn(
              fill,
              "transition-opacity duration-300 motion-reduce:transition-none",
              ready() ? "opacity-100" : "opacity-0",
              props.class,
            )}
          />
        </>
      )}
    </Show>
  )
}
