import {
  AUTH_ERROR_QUERY_KEY,
  OIDC_CALLBACK_PATH,
  type OidcMode,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { type Context, Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import * as client from "openid-client"

import { env } from "../env"
import { log } from "../log"
import { consumeChallenge, createChallenge } from "./challenges"
import {
  createOidcUser,
  linkedUserId,
  linkOidcAccount,
  noLinkedAccount,
  OidcError,
  syncAccess,
  syncRole,
  takePicture,
} from "./oidc-accounts"
import { readOidcIdentity } from "./oidc-claims"
import { oidcConfig } from "./oidc-client"
import { linkPagePath, savePendingLink } from "./oidc-pending"
import { passkeysEnabled } from "./passkey-settings"
import { readSession, signIn } from "./session"
import { endSetupAccess, markSetupDone, setupRequired } from "./setup"
import { findUserByUsernameHint } from "./users"

export { discover, WrongIssuerError } from "./oidc-client"

const FLOW_COOKIE = "matinee_oidc"
const FLOW_TTL_MS = 10 * 60 * 1000
const REDIRECT_URI = `${env.PUBLIC_URL}${OIDC_CALLBACK_PATH}`

const Mode = t.enum(["sign-in", "link"]) satisfies t.Type<OidcMode>

/** What `/start` stores with the challenge. */
const OidcFlow = t.object({
  codeVerifier: t.string(),
  nonce: t.string(),
  mode: Mode,
  setup: t.boolean(),
  userId: t.string().nullable(),
  redirect: t.string(),
})
type FlowStart = Omit<t.infer<typeof OidcFlow>, "codeVerifier" | "nonce">

/** Settings, open on the account section, where linking starts and ends. */
const LINK_PAGE = "/settings/account"

/** Only same-origin paths, so the callback can't bounce users elsewhere. */
function safeRedirect(value: string | undefined, fallback: string): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback
  }
  return value
}

function errorRedirect(c: Context, page: string, message: string) {
  const url = new URL(page, env.PUBLIC_URL)
  url.searchParams.set(AUTH_ERROR_QUERY_KEY, message)
  return c.redirect(`${url.pathname}${url.search}`)
}

/**
 * Store the round trip, bind it to this browser, and send the browser to the
 * provider. `check` runs first and may answer instead, with an error page.
 */
async function startFlow(
  c: Context,
  errorPage: string,
  check: () => Promise<FlowStart | Response>,
): Promise<Response> {
  try {
    const { state: provider, config } = await oidcConfig()
    const flow = await check()
    if (flow instanceof Response) return flow

    const codeVerifier = client.randomPKCECodeVerifier()
    const state = client.randomState()
    const nonce = client.randomNonce()
    const flowId = await createChallenge({
      purpose: "oidc",
      challenge: state,
      payload: { ...flow, codeVerifier, nonce },
      ttlMs: FLOW_TTL_MS,
    })
    // Binds the round trip to this browser, so a link someone else started
    // can't sign this browser in.
    setCookie(c, FLOW_COOKIE, flowId, {
      httpOnly: true,
      secure: env.secureCookies,
      sameSite: "Lax",
      path: "/api/auth/oidc",
      maxAge: FLOW_TTL_MS / 1000,
    })
    const url = client.buildAuthorizationUrl(config, {
      redirect_uri: REDIRECT_URI,
      scope: provider.settings.scopes || "openid",
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: "S256",
      state,
      nonce,
    })
    return c.redirect(url.href)
  } catch (cause) {
    log.error("OIDC start failed", cause)
    return errorRedirect(
      c,
      errorPage,
      cause instanceof OidcError
        ? cause.message
        : "Couldn't reach the sign-in provider.",
    )
  }
}

export const oidcRoutes = new Hono()
  .get("/start", async (c) => {
    const mode = Mode.catch("sign-in").parse(c.req.query("mode"))
    const errorPage = mode === "link" ? LINK_PAGE : "/login"
    return startFlow(c, errorPage, async () => {
      // With single sign-on set up, setup needs no token: the provider's
      // role claim says who may become the admin.
      const setup = mode === "sign-in" && (await setupRequired())
      const current = mode === "link" ? await readSession(c) : null
      if (mode === "link" && !current) {
        return errorRedirect(c, "/login", "Sign in before linking an account.")
      }
      return {
        mode,
        setup,
        userId: current?.id ?? null,
        redirect: safeRedirect(
          c.req.query("redirect"),
          mode === "link" ? LINK_PAGE : "/",
        ),
      }
    })
  })
  .get("/callback", async (c) => {
    const flowId = getCookie(c, FLOW_COOKIE)
    deleteCookie(c, FLOW_COOKIE, {
      path: "/api/auth/oidc",
      secure: env.secureCookies,
    })
    const flow = flowId ? await consumeChallenge(flowId, "oidc") : null
    const parsed = OidcFlow.safeParse(flow?.payload)
    if (!flow || !parsed.success) {
      return errorRedirect(c, "/login", "Sign-in expired. Try again.")
    }
    const payload = parsed.data
    const { mode, setup, redirect } = payload
    const errorPage = mode === "link" ? LINK_PAGE : setup ? "/setup" : "/login"

    try {
      const { state: provider, config } = await oidcConfig()
      const callbackUrl = new URL(OIDC_CALLBACK_PATH, env.PUBLIC_URL)
      callbackUrl.search = new URL(c.req.url).search
      const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: payload.codeVerifier,
        expectedState: flow.challenge,
        expectedNonce: payload.nonce,
        idTokenExpected: true,
      })
      const idClaims = tokens.claims()
      if (!idClaims) throw new OidcError("The provider sent no ID token.")
      const { identity, claims } = await readOidcIdentity(
        config,
        provider.settings,
        tokens,
        idClaims,
      )
      const { roleClaim } = provider.settings

      if (mode === "link") {
        const current = await readSession(c)
        if (!current || current.id !== payload.userId) {
          throw new OidcError("Sign in again before linking an account.")
        }
        await linkOidcAccount(current.id, identity)
        return c.redirect(redirect)
      }

      const linked = await linkedUserId(identity)
      if (linked) {
        await syncRole(linked, identity)
        await syncAccess(linked, identity)
        await takePicture(linked, identity)
        await signIn(c, linked)
        return c.redirect(redirect)
      }

      const isSetup = setup && (await setupRequired())
      if (isSetup && identity.role !== "admin") {
        const held = claims[roleClaim]
        log.warn(
          `OIDC setup refused ${identity.label ?? identity.subject}: the ${roleClaim} claim held ${held === undefined ? "nothing" : JSON.stringify(held)}`,
        )
        throw new OidcError(
          `Only an admin at ${provider.settings.displayName} can set up Matinee. Give your account the ${roleClaim} claim with the value admin, then sign in again.`,
        )
      }
      if (!isSetup) {
        // Linking on the claim alone would hand the account to whoever
        // controls that claim at the provider, so its owner signs in first.
        const match = await findUserByUsernameHint(identity.label)
        // Signed out, linking needs a passkey, so with passkeys off the
        // page could only offer a new account.
        const canLink =
          (await passkeysEnabled()) || (await readSession(c)) !== null
        if (match && (canLink || provider.settings.allowSignUp)) {
          log.info(
            `OIDC sign-in matched the username of user ${match}; asking to link`,
          )
          await savePendingLink(c, { identity, redirect })
          return c.redirect(linkPagePath(redirect))
        }
        if (!provider.settings.allowSignUp) {
          throw new OidcError(await noLinkedAccount())
        }
      }

      const created = await createOidcUser(identity, isSetup)
      if (created.role === "admin") {
        markSetupDone()
        endSetupAccess(c)
      }
      await signIn(c, created.id)
      return c.redirect(redirect)
    } catch (cause) {
      log.error("OIDC callback failed", cause)
      const message =
        cause instanceof OidcError
          ? cause.message
          : cause instanceof client.AuthorizationResponseError
            ? `The provider refused the sign-in: ${cause.error_description ?? cause.error}`
            : "Sign-in failed. Check the server log for details."
      return errorRedirect(c, errorPage, message)
    }
  })
