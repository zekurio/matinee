/*
 * Notices when the server has a newer build of the app than this tab runs.
 * A tab left open across a deploy keeps the old code, which calls the
 * server with the old shapes. The router reloads by itself once a lazy
 * chunk it asks for is gone, but a tab that never loads one never finds
 * out. Each build names itself in its page's head (`buildId()` in
 * `vite.config.ts`); this asks for the page again and compares.
 */

/** Asks again this often while the tab shows. */
const CHECK_EVERY_MS = 12 * 60 * 1000
/** Focus and visibility arrive together; one question does for both. */
const MIN_GAP_MS = 30 * 1000

function buildOf(document: Document): string | null {
  return (
    document
      .querySelector('meta[name="matinee-build"]')
      ?.getAttribute("content") ?? null
  )
}

/** The build the server sends now, or null when it can't be told. */
async function serverBuild(): Promise<string | null> {
  try {
    const response = await fetch("/", {
      cache: "no-cache",
      credentials: "same-origin",
      headers: { accept: "text/html" },
    })
    if (!response.ok) return null
    const html = await response.text()
    return buildOf(new DOMParser().parseFromString(html, "text/html"))
  } catch {
    // Offline, or the server is restarting: ask again later.
    return null
  }
}

/**
 * Asks the server for its build when the tab comes back into view or
 * regains focus, and every few minutes while it shows, and calls `found`
 * with any build other than this tab's. Returns what stops it. A build
 * run by the dev server, or a page without a name, never asks.
 */
export function watchForNewBuild(found: (build: string) => void): () => void {
  const current = buildOf(document)
  if (import.meta.env.DEV || !current) return () => {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastAsked = Date.now()
  let asking = false

  const schedule = () => {
    clearTimeout(timer)
    timer =
      document.visibilityState === "visible"
        ? setTimeout(() => void check(), CHECK_EVERY_MS)
        : undefined
  }
  const check = async () => {
    if (asking || Date.now() - lastAsked < MIN_GAP_MS) return schedule()
    asking = true
    lastAsked = Date.now()
    const build = await serverBuild()
    asking = false
    if (build && build !== current) found(build)
    schedule()
  }
  const onVisibility = () => {
    if (document.visibilityState === "visible") void check()
    else schedule()
  }
  const onFocus = () => void check()

  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener("focus", onFocus)
  schedule()
  return () => {
    clearTimeout(timer)
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener("focus", onFocus)
  }
}
