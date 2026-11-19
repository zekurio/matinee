import { useEffect, useState } from "preact/hooks"

import { session } from "@/auth/session"

/*
 * Pictures from the server. They need the session, and an `<img>` can't
 * send a token, so the app fetches each one itself and hands the element
 * the bytes. Loaded pictures are kept a while, since a row scrolled away
 * and back asks for the same ones, but only so many: a TV has little
 * memory to spare.
 *
 * On the server's own origin, as in a browser during development, the
 * session is in a cookie and the element loads the address itself.
 */

/** How many pictures stay loaded once nothing shows them. */
const KEPT = 120
/** How many load at once, so a page of posters doesn't hold up its data. */
const AT_ONCE = 6

type Entry = {
  path: string
  /** The address an element shows, once loaded. */
  url: string | null
  failed: boolean
  /** How many elements show it. */
  users: number
  waiting: Set<() => void>
  started: boolean
}

const entries = new Map<string, Entry>()
const queue: Entry[] = []
let loading = 0

function trim() {
  if (entries.size <= KEPT) return
  // Insertion order is the order they were last used in.
  for (const [key, entry] of entries) {
    if (entries.size <= KEPT) break
    if (entry.users > 0 || !entry.started) continue
    if (entry.url) URL.revokeObjectURL(entry.url)
    entries.delete(key)
  }
}

function settle(entry: Entry) {
  for (const listener of entry.waiting) listener()
}

async function load(entry: Entry) {
  entry.started = true
  loading += 1
  try {
    const token = session.token
    const response = await fetch(session.url(entry.path), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    entry.url = URL.createObjectURL(await response.blob())
  } catch {
    entry.failed = true
  }
  loading -= 1
  settle(entry)
  pump()
}

function pump() {
  while (loading < AT_ONCE) {
    // The newest asked for first: it's what the person is looking at now.
    const next = queue.pop()
    if (!next) return
    // Nothing shows it any more, so it never loads.
    if (next.users === 0) {
      entries.delete(key(next.path))
      continue
    }
    void load(next)
  }
}

/** Pictures are per server: another server's path could name another picture. */
function key(path: string): string {
  return `${session.server ?? ""} ${path}`
}

function acquire(path: string): Entry {
  const id = key(path)
  let entry = entries.get(id)
  if (entry) {
    // Used again, so it's the last to go.
    entries.delete(id)
  } else {
    entry = {
      path,
      url: null,
      failed: false,
      users: 0,
      waiting: new Set(),
      started: false,
    }
    queue.push(entry)
  }
  entries.set(id, entry)
  entry.users += 1
  pump()
  return entry
}

function release(entry: Entry) {
  entry.users -= 1
  trim()
}

export type Picture = {
  /** What an element shows. Null until it loaded, or when it failed. */
  src: string | null
  failed: boolean
}

const NONE: Picture = { src: null, failed: false }

/** The picture at `path` on the server, loaded with the session. */
export function usePicture(path: string | null | undefined): Picture {
  const direct = session.sameOrigin
  const [state, setState] = useState<{ path: string; picture: Picture } | null>(
    null,
  )
  useEffect(() => {
    if (!path || direct) return
    const entry = acquire(path)
    const show = () =>
      setState({ path, picture: { src: entry.url, failed: entry.failed } })
    if (entry.url || entry.failed) show()
    entry.waiting.add(show)
    return () => {
      entry.waiting.delete(show)
      release(entry)
    }
  }, [path, direct])
  if (!path) return NONE
  if (direct) return { src: session.url(path), failed: false }
  // Another path's picture is still in the state for a render.
  return state?.path === path ? state.picture : NONE
}

/** Drops every loaded picture, as when the server or the account changes. */
export function forgetPictures() {
  for (const entry of entries.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url)
  }
  entries.clear()
  queue.length = 0
}
