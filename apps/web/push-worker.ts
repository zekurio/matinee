/// <reference lib="webworker" />
import { t } from "@matinee/contracts/schema"

import de from "./src/i18n/locales/de/notifications"
import en from "./src/i18n/locales/en/notifications"

declare const self: ServiceWorkerGlobalScope
const worker = self
const Payload = t.object({
  kind: t.enum(["ready", "unavailable", "waiting", "needsAttention"]),
  name: t.string().optional(),
  season: t.number().nullable(),
  count: t.number(),
  path: t.string(),
})

// A worker has no document or saved UI locale. Use the browser language and the shared catalogs.
function tr(
  key: keyof typeof en,
  params: { name: string; count: number; number: number | null },
) {
  const messages = worker.navigator.language.startsWith("de") ? de : en
  return messages[key]
    .replace("{name}", params.name)
    .replace("{number}", String(params.number ?? ""))
    .replace(
      "{count}",
      new Intl.NumberFormat(worker.navigator.language).format(params.count),
    )
}
worker.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      const parsed = Payload.safeParse(event.data?.json())
      if (!parsed.success) return
      const payload = parsed.data
      const params = {
        name: payload.name ?? "",
        count: payload.count,
        number: payload.season,
      }
      const title = tr("notifications.requests", params)
      const key =
        payload.kind === "ready"
          ? payload.season === null
            ? "notifications.ready"
            : "notifications.readySeasonNumber"
          : payload.kind === "unavailable"
            ? "notifications.unavailable"
            : payload.kind === "waiting"
              ? payload.count === 1
                ? "notifications.waitingOne"
                : "notifications.waiting"
              : payload.count === 1
                ? "notifications.attentionOne"
                : "notifications.attention"
      const url = new URL(payload.path, worker.location.origin)
      if (url.origin !== worker.location.origin) return
      await worker.registration.showNotification(title, {
        body: tr(key, params),
        data: { path: url.pathname + url.search },
      })
    })(),
  )
})
worker.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const parsed = t
        .object({ path: t.string() })
        .safeParse(event.notification.data)
      const url = new URL(
        parsed.success ? parsed.data.path : "/requests",
        worker.location.origin,
      )
      if (url.origin !== worker.location.origin) return
      const windows = await worker.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const client of windows) {
        if (new URL(client.url).origin !== worker.location.origin) continue
        await client.navigate(url.href)
        await client.focus()
        return
      }
      await worker.clients.openWindow(url.href)
    })(),
  )
})
