import type { User } from "@matinee/contracts"

import { client } from "@/lib/rpc"

/*
 * What this browser calls itself, as Jellyfin's web client names its
 * device: the browser's product name, with the kind of device after it on
 * a phone or tablet, like `Chrome Android` or `Safari iPhone`. Product
 * names read the same in every language. The browser works this out about
 * itself; the server only keeps and shows it.
 */

// Edge and Opera say Chrome too, and Chrome says Safari, so they go first.
const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

function deviceSuffix(agent: string): string {
  if (/iPad/.test(agent)) return " iPad"
  // An iPad asks for desktop pages as a Mac does, but has a touch screen.
  if (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1) return " iPad"
  if (/iPhone|iPod/.test(agent)) return " iPhone"
  if (/Android/.test(agent)) return " Android"
  return ""
}

/** Like `Firefox` or `Chrome Android`; null for a browser it can't tell. */
export function browserName(): string | null {
  const agent = navigator.userAgent
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1]
  return browser ? browser + deviceSuffix(agent) : null
}

let identified: User | null = null

/**
 * Tell the server this browser's name, once for each signed-in user the
 * session query gives, so a new sign-in is named too. A browser it can't
 * tell sends nothing, and the session keeps the name it had.
 */
export function identifyBrowser(user: User): void {
  if (identified === user) return
  identified = user
  const name = browserName()
  if (!name) return
  // Only shown in lists; a failure here is never worth a toast.
  client.account.sessions.identify({ name }).catch(() => {})
}
