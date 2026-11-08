import { mediaItem, type MediaItemRow } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { buildDownload, DownloadSpecError } from "../media/download-encode"
import { removeDownload, startDownload } from "../media/downloads"
import { authed, badRequest, notFound } from "./base"

async function itemRow(id: string): Promise<MediaItemRow> {
  const [row] = await db.select().from(mediaItem).where(eq(mediaItem.id, id))
  if (!row) throw notFound("This title isn't in any library.")
  return row
}

/** A spec the file can't take becomes a message the user can act on. */
async function asBadRequest<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (cause) {
    if (cause instanceof DownloadSpecError) throw badRequest(cause.message)
    throw cause
  }
}

export const downloads = {
  plan: authed.downloads.plan.handler(async ({ input }) => {
    const row = await itemRow(input.id)
    return asBadRequest(async () => (await buildDownload(row, input.spec)).plan)
  }),

  start: authed.downloads.start.handler(async ({ context, input }) => {
    const row = await itemRow(input.id)
    return asBadRequest(() => startDownload(row, input.spec, context.user.id))
  }),

  remove: authed.downloads.remove.handler(async ({ context, input }) => {
    // Gone already is as good as removed.
    await removeDownload(input.downloadId, context.user.id)
  }),
}
