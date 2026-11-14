import { pluginAuthCallbackPath } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"

import { env } from "../env"
import { consumeChallenge, createChallenge } from "./challenges"
import { errorRedirect, safeRedirect } from "./oidc"
import {
  acceptPluginIdentity,
  pluginAuthFailure,
  PluginIdentityResult,
  PluginSession,
  PluginStartResult,
  requirePluginSetup,
  resolveAuthProvider,
} from "./plugin-auth"
import { PluginAuthError } from "./plugin-identities"
import { readSession } from "./session"
import { randomToken, safeEqual } from "./tokens"

const COOKIE = "matinee_plugin_auth"
const COOKIE_PATH = "/api/auth/plugins"
const TTL_MS = 10 * 60 * 1000
const LINK_PAGE = "/settings/account"
const EXPIRED = "Sign-in expired. Try again."
const Mode = t.enum(["sign-in", "link"])
const Flow = t.object({
  key: t.string().min(1).max(65),
  mode: Mode,
  userId: t.uuid().nullable(),
  redirect: t.string().max(4096),
  session: t.string().max(4096),
})

/** Backslashes can turn a path into an authority in a browser's URL parser. */
function localRedirect(value: string | undefined, fallback: string): string {
  if (value && (value.length > 4096 || /[\\\p{Cc}\p{Cf}]/u.test(value)))
    return fallback
  return safeRedirect(value, fallback)
}

function callbackUri(key: string): string {
  return `${env.PUBLIC_URL}${pluginAuthCallbackPath(key)}`
}

/** First value per key only. Do not give the plugin headers or cookies. */
function callbackQuery(url: string): Record<string, string> {
  const parsed = new URL(url)
  if (Buffer.byteLength(parsed.search) > 8192) {
    throw new PluginAuthError("The sign-in response is too large. Try again.")
  }
  const query = new Map<string, string>()
  let bytes = 0
  for (const [key, value] of parsed.searchParams) {
    if (query.has(key)) continue
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value)
    query.set(key, value)
    if (query.size > 50 || bytes > 8192) {
      throw new PluginAuthError("The sign-in response is too large. Try again.")
    }
  }
  return Object.fromEntries(query)
}

export const pluginAuthRoutes = new Hono()
  .get("/:key/start", async (c) => {
    const mode = Mode.safeParse(c.req.query("mode") ?? "sign-in")
    const errorPage =
      mode.success && mode.data === "link" ? LINK_PAGE : "/login"
    try {
      const provider = resolveAuthProvider(c.req.param("key"), "redirect")
      if (!mode.success)
        throw new PluginAuthError("The sign-in request is invalid.")
      await requirePluginSetup()
      const current = mode.data === "link" ? await readSession(c) : null
      if (mode.data === "link" && !current) {
        return errorRedirect(c, "/login", "Sign in before linking an account.")
      }
      const redirect = localRedirect(
        c.req.query("redirect"),
        mode.data === "link" ? LINK_PAGE : "/",
      )
      const state = randomToken()
      const result = PluginStartResult.parse(
        await provider.call(
          "start",
          [
            {
              redirectUri: callbackUri(c.req.param("key")),
              state,
            },
          ],
          { timeoutMs: 15000 },
        ),
      )
      const url = URL.parse(result.url)
      if (
        !url ||
        (url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username ||
        url.password ||
        !provider.allows(url.href)
      ) {
        throw new PluginAuthError(
          "The sign-in provider returned an address it isn't allowed to use.",
        )
      }
      const id = await createChallenge({
        purpose: "plugin-auth",
        challenge: state,
        payload: {
          key: c.req.param("key"),
          mode: mode.data,
          userId: current?.id ?? null,
          redirect,
          session: JSON.stringify(result.session ?? null),
        },
        ttlMs: TTL_MS,
      })
      setCookie(c, COOKIE, id, {
        httpOnly: true,
        secure: env.secureCookies,
        sameSite: "Lax",
        path: COOKIE_PATH,
        maxAge: TTL_MS / 1000,
      })
      return c.redirect(url.href)
    } catch (cause) {
      return errorRedirect(c, errorPage, pluginAuthFailure(cause).message)
    }
  })
  .get("/:key/callback", async (c) => {
    const id = t.uuid().safeParse(getCookie(c, COOKIE)).data
    deleteCookie(c, COOKIE, { path: COOKIE_PATH, secure: env.secureCookies })
    let errorPage = "/login"
    try {
      const challenge = id ? await consumeChallenge(id, "plugin-auth") : null
      const parsed = Flow.safeParse(challenge?.payload)
      if (!challenge || !parsed.success) throw new PluginAuthError(EXPIRED)
      const flow = parsed.data
      errorPage = flow.mode === "link" ? LINK_PAGE : "/login"
      if (flow.key !== c.req.param("key")) throw new PluginAuthError(EXPIRED)
      const provider = resolveAuthProvider(c.req.param("key"), "redirect")
      await requirePluginSetup()
      const query = callbackQuery(c.req.url)
      if (!query.state || !safeEqual(query.state, challenge.challenge)) {
        throw new PluginAuthError(EXPIRED)
      }
      // A different session must not even submit this user's link flow to the plugin.
      if (flow.mode === "link") {
        const current = await readSession(c)
        if (!current || current.id !== flow.userId) {
          throw new PluginAuthError("Sign in again before linking an account.")
        }
      }
      const session = PluginSession.parse(JSON.parse(flow.session))
      const identity = PluginIdentityResult.parse(
        await provider.call(
          "finish",
          [
            {
              query,
              session,
              redirectUri: callbackUri(flow.key),
            },
          ],
          { timeoutMs: 15000 },
        ),
      )
      await acceptPluginIdentity(c, provider, identity, flow.mode, flow.userId)
      return c.redirect(
        localRedirect(flow.redirect, flow.mode === "link" ? LINK_PAGE : "/"),
      )
    } catch (cause) {
      return errorRedirect(c, errorPage, pluginAuthFailure(cause).message)
    }
  })
