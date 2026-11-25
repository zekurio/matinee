import { createEffect, createSignal, onSettled } from "solid-js"

// The pause in typing before the text goes into the URL.
const DELAY_MS = 250

/**
 * Mirrors text into a URL search param after a pause. Pass the param as
 * an accessor. The first element of the returned tuple is a text accessor.
 */
export function useUrlText(
  value: () => string | undefined,
  write: (next: string | undefined) => void,
) {
  type Draft = { text: string; value: string | undefined; typing: boolean }
  const [draft, setDraft] = createSignal<Draft>()

  function textFor(current: Draft | undefined, param: string | undefined) {
    return current &&
      (current.typing ||
        current.value === param ||
        (current.text.trim() || undefined) === param)
      ? current.text
      : (param ?? "")
  }

  const text = () => textFor(draft(), value())

  createEffect(value, (param) => {
    setDraft((current) =>
      !current || current.value === param
        ? current
        : { ...current, text: textFor(current, param), value: param },
    )
  })

  let timer: number | undefined
  let typed: string | undefined
  onSettled(() => () => window.clearTimeout(timer))

  const commit = (text: string) => {
    typed = undefined
    const param = value()
    const next = text.trim() || undefined
    setDraft({ text, value: param, typing: false })
    if (next !== param) write(next)
  }

  const setText = (text: string) => {
    typed = text
    setDraft({ text, value: value(), typing: true })
    window.clearTimeout(timer)
    timer = window.setTimeout(() => commit(text), DELAY_MS)
  }

  const flush = () => {
    window.clearTimeout(timer)
    commit(typed ?? text())
  }

  return [text, setText, flush] as const
}
