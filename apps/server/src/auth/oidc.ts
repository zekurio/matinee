import {
  AUTH_ERROR_QUERY_KEY,
  OIDC_CALLBACK_PATH,
  type OidcMode,
} from "@matinee/contracts"
import { oidcAccount, user } from "@matinee/db"
import { and, eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import * as client from "openid-client"
import { z } from "zod"

import { db } from "../db"
import { env } from "../env"
import { log } from "../log"
import { consumeChallenge, createChallenge } from "./challenges"
import { activeOidc, type OidcState } from "./oidc-settings"
import { readSession, signIn } from "./session"
import {
  endSetupAccess,
  hasSetupAccess,
  markSetupDone,
  setupRequired,
} from "./setup"
import { availableUsername, insertUser, lockUsers } from "./users"

const FLOW_COOKIE = "matinee_oidc"
const FLOW_TTL_MS = 10 * 60 * 1000
const REDIRECT_URI = `${env.PUBLIC_URL}${OIDC_CALLBACK_PATH}`

class OidcFlowError extends Error {}

/** What `/start` stored with the challenge. */
const OidcFlow = z.object({
  codeVerifier: z.string(),
  nonce: z.string(),
  mode: z.enum(["sign-in", "link"]) satisfies z.ZodType<OidcMode>,
  setup: z.boolean(),
  userId: z.string().nullable(),
  redirect: z.string(),
})

/** A non-empty string claim, trimmed. */
const ClaimString = z.string().trim().min(1)

let discovered: {
  version: number
  config: Promise<client.Configuration>
} | null = null

/**
 * Fetch the provider's discovery document and build a client from it. Also
 * used to check settings before they're saved.
 */
export function discover(state: OidcState): Promise<client.Configuration> {
  const issuer = new URL(state.settings.issuerUrl)
  return client.discovery(
    issuer,
    state.settings.clientId,
    state.secret,
    state.secret ? undefined : client.None(),
    {
      timeout: 10,
      execute:
        issuer.protocol === "http:" ? [client.allowInsecureRequests] : [],
    },
  )
}

/** The provider and its client, rediscovered after the settings change. */
async function oidcConfig(): Promise<{
  state: OidcState
  config: client.Configuration
}> {
  const state = await activeOidc()
  if (!state) throw new OidcFlowError("Single sign-on is turned off.")
  if (discovered?.version !== state.version) {
    const entry = {
      version: state.version,
      config: discover(state).catch((cause: unknown) => {
        // Forget the failure so the next sign-in retries discovery.
        if (discovered === entry) discovered = null
        throw cause
      }),
    }
    discovered = entry
  }
  return { state, config: await discovered.config }
}

/** Settings, open on the account section, where linking starts and ends. */
const LINK_PAGE = "/?settings=account"

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

function claimString(
  claims: Readonly<Record<string, client.JsonValue | undefined>>,
  key: string,
): string | undefined {
  return ClaimString.safeParse(claims[key]).data
}

export const oidcRoutes = new Hono()
  .get("/start", async (c) => {
    const mode: OidcMode = c.req.query("mode") === "link" ? "link" : "sign-in"
    const errorPage = mode === "link" ? LINK_PAGE : "/login"
    try {
      const { state: provider, config } = await oidcConfig()
      const setup = mode === "sign-in" && (await setupRequired())
      if (setup && !hasSetupAccess(c)) {
        return errorRedirect(c, "/setup", "Enter the setup token first.")
      }
      const current = mode === "link" ? await readSession(c) : null
      if (mode === "link" && !current) {
        return errorRedirect(c, "/login", "Sign in before linking an account.")
      }

      const codeVerifier = client.randomPKCECodeVerifier()
      const state = client.randomState()
      const nonce = client.randomNonce()
      const flowId = await createChallenge({
        purpose: "oidc",
        challenge: state,
        payload: {
          codeVerifier,
          nonce,
          mode,
          setup,
          userId: current?.id ?? null,
          redirect: safeRedirect(
            c.req.query("redirect"),
            mode === "link" ? LINK_PAGE : "/",
          ),
        },
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
        cause instanceof OidcFlowError
          ? cause.message
          : "Couldn't reach the sign-in provider.",
      )
    }
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
      if (!idClaims) throw new OidcFlowError("The provider sent no ID token.")
      const issuer = idClaims.iss
      const subject = idClaims.sub

      const [linked] = await db
        .select({ userId: oidcAccount.userId })
        .from(oidcAccount)
        .where(
          and(eq(oidcAccount.issuer, issuer), eq(oidcAccount.subject, subject)),
        )
        .limit(1)

      const usernameClaim =
        provider.settings.usernameClaim || "preferred_username"
      // The ID token may leave the username out; the userinfo endpoint fills
      // in what it lacks.
      const userInfo =
        !claimString(idClaims, usernameClaim) && tokens.access_token
          ? await client.fetchUserInfo(config, tokens.access_token, subject)
          : null
      const claims = { ...userInfo, ...idClaims }
      const label =
        claimString(claims, usernameClaim) ??
        claimString(claims, "preferred_username") ??
        claimString(claims, "email") ??
        null

      if (mode === "link") {
        const current = await readSession(c)
        if (!current || current.id !== payload.userId) {
          throw new OidcFlowError("Sign in again before linking an account.")
        }
        if (linked && linked.userId !== current.id) {
          throw new OidcFlowError(
            "This sign-in is already linked to another account.",
          )
        }
        if (!linked) {
          await db
            .insert(oidcAccount)
            .values({ userId: current.id, issuer, subject, label })
        }
        return c.redirect(redirect)
      }

      if (linked) {
        await signIn(c, linked.userId)
        return c.redirect(redirect)
      }

      const isSetup = setup && (await setupRequired())
      if (isSetup && !hasSetupAccess(c)) {
        throw new OidcFlowError("Enter the setup token first.")
      }
      if (!isSetup && !provider.settings.allowSignUp) {
        throw new OidcFlowError(
          "No account is linked to this sign-in. Sign in with a passkey, then link it in settings.",
        )
      }

      const created = await db.transaction(async (tx) => {
        const { empty } = await lockUsers(tx)
        if (isSetup && !empty) {
          throw new OidcFlowError("Setup is already done. Sign in instead.")
        }
        if (!isSetup && empty) {
          throw new OidcFlowError(
            "Create the admin account on the setup page first.",
          )
        }
        const username = await availableUsername(
          label?.split("@")[0] ?? "user",
          tx,
        )
        const row = await insertUser(tx, {
          username,
          role: empty ? "admin" : "user",
        })
        const name = claimString(claims, "name")
        if (name) {
          await tx
            .update(user)
            .set({ displayName: name.slice(0, 64) })
            .where(eq(user.id, row.id))
        }
        await tx
          .insert(oidcAccount)
          .values({ userId: row.id, issuer, subject, label })
        return row
      })
      if (created.role === "admin") {
        markSetupDone()
        endSetupAccess(c)
      }
      await signIn(c, created.id)
      return c.redirect(redirect)
    } catch (cause) {
      log.error("OIDC callback failed", cause)
      const message =
        cause instanceof OidcFlowError
          ? cause.message
          : cause instanceof client.AuthorizationResponseError
            ? `The provider refused the sign-in: ${cause.error_description ?? cause.error}`
            : "Sign-in failed. Check the server log for details."
      return errorRedirect(c, errorPage, message)
    }
  })
