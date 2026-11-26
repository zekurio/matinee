import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  Show,
} from "solid-js"

import { tr } from "@/i18n"

export function HeaderOverview(props: {
  tagline: string | null
  overview: string | null
  /** How many lines show before More. */
  lines?: number
}) {
  const lines = () => props.lines ?? 3
  const id = createUniqueId()
  const [open, setOpen] = createSignal(false)
  const [overflows, setOverflows] = createSignal(false)
  let paragraph: HTMLParagraphElement | undefined
  const content = createMemo(
    () => `${props.tagline ?? ""}\n${props.overview ?? ""}`,
  )
  createEffect(
    () => ({ content: content(), lines: lines() }),
    ({ lines: shown }) => {
      const text = paragraph
      if (!text) return
      const measure = () => {
        const line = Number.parseFloat(getComputedStyle(text).lineHeight)
        setOverflows(text.scrollHeight > line * shown + 1)
      }
      const resize = new ResizeObserver(measure)
      resize.observe(text)
      document.fonts.addEventListener("loadingdone", measure)
      measure()
      return () => {
        resize.disconnect()
        document.fonts.removeEventListener("loadingdone", measure)
      }
    },
  )

  return (
    <Show when={props.overview || props.tagline}>
      <div class="max-w-[75ch]">
        <p
          ref={(element) => (paragraph = element)}
          id={id}
          style={{ "--lines": lines() }}
          class={[
            "text-foreground/85 sm:text-15px text-sm leading-6 whitespace-pre-line",
            { "line-clamp-(--lines)": !open() },
          ]}
        >
          <Show when={props.tagline}>
            <span class="text-foreground font-medium">{props.tagline}</span>
          </Show>
          {props.tagline && props.overview ? "\n" : null}
          {props.overview}
        </p>
        <Show when={overflows() || open()}>
          <button
            type="button"
            aria-expanded={open() ? "true" : "false"}
            aria-controls={id}
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring block rounded text-sm leading-6 font-medium outline-none focus-visible:ring-2"
            onClick={() => setOpen((value) => !value)}
          >
            {tr(open() ? "title.less" : "title.more")}
          </button>
        </Show>
      </div>
    </Show>
  )
}
