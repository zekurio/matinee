import type { Context } from "hono"

import { readSession, type SessionUser } from "../auth/session"
import { connectionOf } from "../network/connection"
import { networkRules } from "../network/settings"
import { partyShare } from "../party/state"
import { accessOf } from "./groups"
import type { Access } from "./policy"

/**
 * The signed-in user with what they may open. Request code that reads
 * libraries, titles, or files takes one, and filters with `visible.ts`.
 */
export type Viewer = SessionUser & { access: Access }

export async function viewerOf(user: SessionUser): Promise<Viewer> {
  return { ...user, access: await accessOf(user) }
}

/** The viewer of a plain HTTP route, or null when nobody is signed in. */
export async function readViewer(c: Context): Promise<Viewer | null> {
  const user = await readSession(c)
  if (!user) return null
  const viewer = await viewerOf(user)
  // In a watch party, a remote member's limit is also their share of
  // the upload. It goes on the viewer, so the answer to how a file plays
  // and the routes that stream it hold the same limit.
  const rules = await networkRules()
  const share = partyShare(
    user.id,
    !connectionOf(c, rules).local,
    rules.settings.uploadBitrate,
  )
  if (share === null) return viewer
  const own = viewer.access.maxBitrate
  return {
    ...viewer,
    access: {
      ...viewer.access,
      maxBitrate: own === null ? share : Math.min(own, share),
    },
  }
}
