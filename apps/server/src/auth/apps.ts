import {
  AppAuthorizeRequest,
  type AppDevice,
  appAuthorizePagePath,
  DeviceName,
  DevicePlatform,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Hono } from "hono"

import { consumeChallenge, createChallenge } from "./challenges"
import { cleanDeviceName, readSession } from "./session"
import { safeEqual, sha256 } from "./tokens"

/*
 * Sign-in for apps that can open a browser, as in OAuth for native apps
 * (RFC 8252). The app opens the authorize page in the system browser, where
 * passkeys and the OIDC provider work as on the web. Once the person
 * approves, the browser carries a one-time code back to the app, which
 * trades it and its PKCE verifier for a session of its own. Only the app
 * that made the challenge holds the verifier, so another app that catches
 * the redirect can't use the code.
 */

const CODE_TTL_MS = 2 * 60 * 1000

/** What the code's challenge row keeps until the app trades it. */
const CodePayload = t.object({
  userId: t.string(),
  deviceName: DeviceName.nullable(),
  platform: DevicePlatform,
})

/** The redirect that hands the app its code. */
async function approve(
  userId: string,
  request: AppAuthorizeRequest,
): Promise<string> {
  // The challenge row's id is the code: a random UUID, good for one try.
  const code = await createChallenge({
    purpose: "app-authorize",
    challenge: request.code_challenge,
    payload: {
      userId,
      deviceName: cleanDeviceName(request.device_name),
      platform: request.platform,
    },
    ttlMs: CODE_TTL_MS,
  })
  const target = new URL(request.redirect_uri)
  target.searchParams.set("code", code)
  target.searchParams.set("state", request.state)
  return target.href
}

/**
 * The user and device a code was made for, when `verifier` is the one its
 * challenge came from. A wrong verifier uses the code up too.
 */
export async function redeemAppCode(
  code: string,
  verifier: string,
): Promise<{ userId: string; device: AppDevice } | null> {
  const row = await consumeChallenge(code, "app-authorize")
  if (!row || !safeEqual(row.challenge, sha256(verifier))) return null
  const payload = CodePayload.safeParse(row.payload)
  if (!payload.success) return null
  const { userId, deviceName, platform } = payload.data
  return { userId, device: { name: deviceName ?? undefined, platform } }
}

export const appRoutes = new Hono()
  // A form post from the authorize page, so the CSRF check in app.ts turns
  // away other sites. A redirect, rather than RPC, so the browser follows
  // it to the app's URI scheme.
  .post("/authorize", async (c) => {
    const body = await c.req
      .parseBody()
      .catch((): Record<string, string | File> => ({}))
    const request = AppAuthorizeRequest.safeParse(body)
    if (!request.success) {
      return c.text(
        "This sign-in request is invalid. Start again in the app.",
        400,
      )
    }
    const current = await readSession(c)
    if (!current) {
      // Signed out since the page loaded: sign in, then approve again.
      const page = appAuthorizePagePath(request.data)
      return c.redirect(`/login?${new URLSearchParams({ redirect: page })}`)
    }
    return c.redirect(await approve(current.id, request.data))
  })
