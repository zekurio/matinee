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
import { LIMITS, takeTry, TOO_MANY_TRIES } from "../rate-limit"
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
import {
  InsecureIssuerError,
  oidcConfig,
  WrongIssuerError,
} from "./oidc-client"
import { linkPagePath, savePendingLink } from "./oidc-pending"
import { passkeysEnabled } from "./passkey-settings"
import { readSession, signIn } from "./session"
import { endSetupAccess, markSetupDone, setupRequired } from "./setup"
import { findUserByUsernameHint } from "./users"

export { discover, InsecureIssuerError, WrongIssuerError } from "./oidc-client"

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

/**
 * Only same-origin paths, so the callback can't bounce users elsewhere.
 * The path is resolved the way a browser would, since `/\evil.com` and
 * tabs or newlines inside `//` still lead off-site, and it's sent back in
 * its normalised form.
 */
function safeRedirect(value: string | undefined, fallback: string): string {
  if (!value?.startsWith("/")) return fallback
  const origin = new URL(env.PUBLIC_URL).origin
  const url = URL.canParse(value, origin) ? new URL(value, origin) : null
  if (url?.origin !== origin) return fallback
  // `/a/../..//x` normalises to `//x`, which a browser reads as a host.
  if (url.pathname.startsWith("//")) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}

/** Shown for a setup problem the user can't fix; the log has the detail. */
const MISCONFIGURED =
  "Single sign-on isn't set up correctly. Ask an admin to check the server log."
/** Shown when the provider refuses without an error code we know. */
const REFUSED = "The provider refused the sign-in."
/** Shown for any other failure in the callback. */
const FAILED =
  "Sign-in failed. Try again, or ask an admin to check the server log."

/** What the user is told for each error code the provider sends back. */
const REFUSAL_MESSAGES = new Map<string, string>([
  [
    "access_denied",
    "The provider denied access. Try again, or ask an admin to check the provider's access rules.",
  ],
  ["login_required", "Sign in at the provider, then try again."],
  [
    "consent_required",
    "The provider needs your consent first. Try again and accept the request.",
  ],
  [
    "interaction_required",
    "The provider needs you to finish a step there. Try again.",
  ],
  [
    "invalid_request",
    "The provider rejected the sign-in request. Ask an admin to check the single sign-on settings.",
  ],
  ["server_error", "The provider had an error. Try again later."],
  [
    "temporarily_unavailable",
    "The provider is unavailable right now. Try again later.",
  ],
])

function refusalMessage(cause: client.AuthorizationResponseError): string {
  return REFUSAL_MESSAGES.get(cause.error) ?? REFUSED
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
      cause instanceof WrongIssuerError || cause instanceof InsecureIssuerError
        ? MISCONFIGURED
        : cause instanceof OidcError
          ? cause.message
          : "Couldn't reach the sign-in provider.",
    )
  }
}

export const oidcRoutes = new Hono()
  .get("/start", async (c) => {
    const mode = Mode.catch("sign-in").parse(c.req.query("mode"))
    const errorPage = mode === "link" ? LINK_PAGE : "/login"
    // Before the provider is called or a challenge stored.
    if ((await takeTry(c, LIMITS.oidcStart)) > 0) {
      return errorRedirect(c, errorPage, TOO_MANY_TRIES)
    }
    return startFlow(c, errorPage, async () => {
      // With single sign-on set up, setup needs no token: the provider's
      // role claim says who may become the admin.
      const setup = mode === "sign-in" && (await setupRequired())
      const current = mode === "link" ? await readSession(c) : null
      // Linking changes how the account signs in, so an API token can't.
      if (mode === "link" && current?.credential.kind !== "session") {
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
      if (!idClaims) {
        throw new OidcError(
          "Your provider didn't send the sign-in token Matinee needs. Ask an admin to check the provider's settings.",
        )
      }
      const { identity, claims } = await readOidcIdentity(
        config,
        provider.settings,
        tokens,
        idClaims,
      )
      const { roleClaim } = provider.settings

      if (mode === "link") {
        const current = await readSession(c)
        if (
          current?.credential.kind !== "session" ||
          current.id !== payload.userId
        ) {
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
        // Linking is offered only to a caller who holds a valid provider
        // identity with this username claim. The page then asks them to sign
        // in to the account before it links; the username match itself is
        // accepted, since the offer is the point of the branch.
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
      if (cause instanceof client.AuthorizationResponseError) {
        log.warn(
          `The provider refused with ${cause.error}: ${cause.error_description ?? "no description"}`,
        )
      }
      const message =
        cause instanceof WrongIssuerError ||
        cause instanceof InsecureIssuerError
          ? MISCONFIGURED
          : cause instanceof OidcError
            ? cause.message
            : cause instanceof client.AuthorizationResponseError
              ? refusalMessage(cause)
              : FAILED
      return errorRedirect(c, errorPage, message)
    }
  })
