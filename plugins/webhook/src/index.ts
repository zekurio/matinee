/// <reference types="@matinee/plugin/globals" />
import {
  definePlugin,
  hex,
  type PluginEventName,
  type PluginEvents,
  type PluginEventMeta,
} from "@matinee/plugin"

export default definePlugin((ctx) => {
  async function deliver<K extends PluginEventName>(
    event: K,
    data: PluginEvents[K],
    meta: PluginEventMeta,
  ) {
    const group = event.startsWith("playback.")
      ? "playback"
      : event.startsWith("user.")
        ? "users"
        : "library"
    if (ctx.config[group] !== true) return
    const body = JSON.stringify({
      event,
      at: meta.at,
      server: ctx.server.publicUrl,
      data,
    })
    const headers = {
      "content-type": "application/json",
      "x-matinee-event": event,
      "x-matinee-delivery": meta.id,
    } satisfies Record<string, string>
    const secret = String(ctx.config.secret ?? "")
    if (secret)
      Object.assign(headers, {
        "x-matinee-signature": `sha256=${hex(await ctx.crypto.hmacSha256(secret, body))}`,
      })
    // The host retries failed deliveries; each attempt has its own deadline.
    const response = await fetch(String(ctx.config.url), {
      signal: AbortSignal.any([meta.signal, AbortSignal.timeout(15000)]),
      method: "POST",
      headers,
      body,
    })
    if (response.ok) return
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      ctx.log.warn("Webhook delivery was rejected and will not be retried.", {
        status: response.status,
      })
      return
    }
    throw new Error(`Webhook delivery failed with HTTP ${response.status}.`)
  }
  return {
    events: {
      "library.scanned": (event, meta) =>
        deliver("library.scanned", event, meta),
      "title.added": (event, meta) => deliver("title.added", event, meta),
      "title.matched": (event, meta) => deliver("title.matched", event, meta),
      "playback.started": (event, meta) =>
        deliver("playback.started", event, meta),
      "playback.stopped": (event, meta) =>
        deliver("playback.stopped", event, meta),
      "playback.watched": (event, meta) =>
        deliver("playback.watched", event, meta),
      "user.created": (event, meta) => deliver("user.created", event, meta),
    },
  }
})
