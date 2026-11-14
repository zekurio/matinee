/// <reference types="@matinee/plugin/globals" />
import { definePlugin, ProviderError, type Json } from "@matinee/plugin"

// No schema library is available in the guest. Decode the fields we use here.
/* oxlint-disable anti-slop/no-runtime-typeof */
function object(value: Json | undefined): { [key: string]: Json } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value
}
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
/* oxlint-enable anti-slop/no-runtime-typeof */

export default definePlugin(async (ctx) => {
  let deviceId = text(await ctx.storage.get("deviceId"))
  if (!deviceId) {
    deviceId = ctx.crypto.randomUUID()
    await ctx.storage.set("deviceId", deviceId)
  }
  const base = String(ctx.config.url).replace(/\/+$/, "") + "/"
  const authorization = `MediaBrowser Client="Matinee", Device="Matinee server", DeviceId="${deviceId}", Version="${ctx.server.version}"`
  return {
    auth: {
      jellyfin: {
        async authenticate({ fields }, call) {
          if (!fields.username || !fields.password) return null
          let response
          try {
            response = await fetch(new URL("Users/AuthenticateByName", base), {
              signal: AbortSignal.any([
                call.signal,
                AbortSignal.timeout(10000),
              ]),
              method: "POST",
              headers: { authorization, "content-type": "application/json" },
              body: JSON.stringify({
                Username: fields.username,
                Pw: fields.password,
              }),
            })
          } catch {
            throw new ProviderError(
              "Cannot reach Jellyfin. Check the server address and try again.",
            )
          }
          if (response.status === 401) return null
          if (!response.ok)
            throw new ProviderError(
              `Jellyfin sign-in failed with HTTP ${response.status}. Try again later.`,
              response.status,
            )
          let result
          try {
            result = object(await response.json())
          } catch {
            throw new ProviderError(
              "Jellyfin returned invalid JSON. Check the server address.",
            )
          }
          const token = text(result.AccessToken)
          try {
            const user = object(result.User)
            if (object(user.Policy).IsDisabled === true) return null
            const subject = text(user.Id)
            const name = text(user.Name)
            if (!subject || subject.length > 256 || !name || !token)
              throw new ProviderError(
                "Jellyfin returned an incomplete user or session. Check the server address.",
              )
            return { subject, username: name, name }
          } finally {
            if (token) {
              try {
                const logout = await fetch(new URL("Sessions/Logout", base), {
                  signal: AbortSignal.any([
                    call.signal,
                    AbortSignal.timeout(5000),
                  ]),
                  method: "POST",
                  headers: { authorization, "x-emby-token": token },
                })
                if (!logout.ok)
                  ctx.log.warn("Jellyfin session logout failed.", {
                    status: logout.status,
                  })
              } catch {
                ctx.log.warn(
                  "Could not sign the temporary Jellyfin session out.",
                )
              }
            }
          }
        },
      },
    },
  }
})
