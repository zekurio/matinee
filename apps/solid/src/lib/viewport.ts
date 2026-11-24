import { type Accessor, createSignal } from "solid-js"

/*
 * The window as signals: its size, and media queries. Each is made once and
 * shared, so a hundred cards asking whether the pointer is coarse add one
 * listener between them.
 */

const queries = new Map<string, Accessor<boolean>>()

/** Whether `query` matches, kept current. */
export function mediaQuery(query: string): Accessor<boolean> {
  let made = queries.get(query)
  if (made === undefined) {
    const list = window.matchMedia(query)
    const [matches, setMatches] = createSignal(list.matches)
    list.addEventListener("change", (event) => setMatches(event.matches))
    made = matches
    queries.set(query, made)
  }
  return made
}

/**
 * Below Tailwind's `sm`, where the app takes the phone's frame: a header
 * band and tabs along the bottom, rather than the rail and the top bar.
 * The same edge as the React app's `usePhone`.
 */
export const PHONE_QUERY = "(width < 40rem)"

export const isPhone = () => mediaQuery(PHONE_QUERY)()

export const reducedMotion = () =>
  mediaQuery("(prefers-reduced-motion: reduce)")()

type Size = { readonly width: number; readonly height: number }

const measure = (): Size => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

const [size, setSize] = createSignal<Size>(measure(), {
  equals: (a, b) => a.width === b.width && a.height === b.height,
})
window.addEventListener("resize", () => setSize(measure()))

/** The window's inner size in CSS pixels. */
export const viewport = size

const [visible, setVisible] = createSignal(
  document.visibilityState === "visible",
)
document.addEventListener("visibilitychange", () =>
  setVisible(document.visibilityState === "visible"),
)

/** Whether the page is on screen: false in a background tab or a hidden window. */
export const pageVisible = visible
