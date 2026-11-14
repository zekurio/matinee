import { t } from "@matinee/contracts/schema"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"
import { generateVAPIDKeys } from "web-push"

import { db } from "../db"

const Keys = t.object({ publicKey: t.string(), privateKey: t.string() })

export async function pushKeys() {
  await db
    .insert(setting)
    .values({ key: "web-push", value: { ...generateVAPIDKeys() } })
    .onConflictDoNothing()
  const [row] = await db
    .select()
    .from(setting)
    .where(eq(setting.key, "web-push"))
  return Keys.parse(row?.value)
}

/** Web push alone may deliver to client URLs. Keep this exception limited to browser push services. */
export function allowedEndpoint(endpoint: string) {
  const parsed = t.string().url().safeParse(endpoint)
  if (!parsed.success) return false
  const url = new URL(parsed.data)
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    (url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com"))
  )
}
