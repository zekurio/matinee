import { useEffect, useRef, useState } from "react"

// The pause in typing before the text goes into the URL.
const DELAY_MS = 250

/**
 * A search field's text, mirrored into a URL search param after a pause, so
 * Back from the player restores it. `value` is the param; `write` puts the
 * trimmed text there, or undefined for none.
 */
export function useUrlText(
  value: string | undefined,
  write: (next: string | undefined) => void,
) {
  const [draft, setDraft] = useState({
    text: value ?? "",
    /** The param the text was last in step with. */
    value,
    /** Typed since the text last went into the URL. */
    typing: false,
  })
  if (draft.value !== value) {
    // Keep the text through our own writes and while typing; any other
    // change to the URL, like a link to the bare page, replaces it.
    const ours = draft.typing || (draft.text.trim() || undefined) === value
    setDraft({ ...draft, text: ours ? draft.text : (value ?? ""), value })
  }

  const timer = useRef(0)
  // A write still waiting when the page closes would navigate back to it.
  useEffect(() => {
    const pending = timer
    return () => window.clearTimeout(pending.current)
  }, [])

  const setText = (text: string) => {
    setDraft((prev) => ({ ...prev, text, typing: true }))
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setDraft((prev) => ({ ...prev, typing: false }))
      const next = text.trim() || undefined
      if (next !== value) write(next)
    }, DELAY_MS)
  }

  const flush = () => {
    window.clearTimeout(timer.current)
    setDraft((prev) => ({ ...prev, typing: false }))
    const next = draft.text.trim() || undefined
    if (next !== value) write(next)
  }

  return [draft.text, setText, flush] as const
}
