import { subtitleFontsPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { type Accessor, createEffect, createMemo } from "solid-js"

import type { drawAss } from "@/lib/ass-renderer"

/**
 * Draws an ASS track over `video` with JASSUB, loaded only for this. Each
 * script, and each source it times against, gets a renderer of its own,
 * whose worker ends with it.
 */
export function useAss(
  video: () => HTMLVideoElement | undefined,
  text: Accessor<string | undefined>,
  itemId: string,
  source: Accessor<string>,
  offset: Accessor<number>,
  onError: () => void,
) {
  let active: ReturnType<typeof drawAss> | null = null
  // The latest offset, which a renderer starts with.
  let timeOffset = 0
  createEffect(offset, (value) => {
    timeOffset = value
    active?.offset(value)
  })
  const script = createMemo(() => ({ text: text(), source: source() }), {
    equals: (a, b) => a.text === b.text && a.source === b.source,
  })
  createEffect(script, ({ text }) => {
    const el = video()
    if (!el || text === undefined) return
    const abort = new AbortController()
    let stopped = false
    const start = async () => {
      const [{ drawAss }, response] = await Promise.all([
        import("@/lib/ass-renderer"),
        fetch(subtitleFontsPath(itemId), { signal: abort.signal }),
      ])
      const fonts = response.ok
        ? t.array(t.string()).parse(await response.json())
        : []
      if (stopped) return
      active = drawAss(el, text, fonts, timeOffset, () => {
        if (!stopped) onError()
      })
    }
    void start().catch(() => {
      if (!stopped) onError()
    })
    return () => {
      stopped = true
      abort.abort()
      active?.destroy()
      active = null
    }
  })
}
