import type { Context } from "hono"

import { readSession, type SessionUser } from "../auth/session"
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
  return user ? viewerOf(user) : null
}
