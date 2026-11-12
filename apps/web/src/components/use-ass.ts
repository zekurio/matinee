import { subtitleFontsPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { type RefObject, useEffect, useEffectEvent, useRef } from "react"

import type { drawAss } from "@/lib/ass-renderer"

export function useAss(
  video: RefObject<HTMLVideoElement | null>,
  text: string | undefined,
  itemId: string,
  source: string,
  offset: number,
  onError: () => void,
) {
  const failed = useEffectEvent(onError)
  const timeOffset = useEffectEvent(() => offset)
  const active = useRef<ReturnType<typeof drawAss> | null>(null)
  useEffect(() => {
    const el = video.current
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
      if (!stopped)
        active.current = drawAss(el, text, fonts, timeOffset(), () => {
          if (!stopped) failed()
        })
    }
    void start().catch(() => {
      if (!stopped) failed()
    })
    return () => {
      stopped = true
      abort.abort()
      active.current?.destroy()
      active.current = null
    }
  }, [text, itemId, source])
  useEffect(() => {
    active.current?.offset(offset)
  }, [offset])
}
