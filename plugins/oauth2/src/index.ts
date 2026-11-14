/// <reference types="@matinee/plugin/globals" />
import {
  base64Url,
  definePlugin,
  ProviderError,
  type Json,
} from "@matinee/plugin"

// The guest has no schema library. These checks decode only JSON scalars and objects.
/* oxlint-disable anti-slop/no-runtime-typeof */
function text(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
function at(value: Json | undefined, path: string): Json | undefined {
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return undefined
    value = Object.hasOwn(value, key) ? value[key] : undefined
  }
  return value
}
/* oxlint-enable anti-slop/no-runtime-typeof */

export default definePlugin((ctx) => {
  const setting = (key: string) => String(ctx.config[key] ?? "")
  async function request(url: string, init?: Parameters<typeof fetch>[1]) {
    try {
      const response = await fetch(url, init)
      if (!response.ok)
        throw new ProviderError(
          `OAuth request failed with HTTP ${response.status}. Check the provider settings.`,
          response.status,
        )
      return await response.json()
    } catch (cause) {
      if (cause instanceof ProviderError) throw cause
      throw new ProviderError(
        "Cannot read the OAuth provider. Check its address and try again.",
      )
    }
  }
  return {
    auth: {
      oauth2: {
        async start({ redirectUri, state }) {
          const url = new URL(setting("authorizeUrl"))
          for (const [key, value] of Object.entries({
            response_type: "code",
            client_id: setting("clientId"),
            redirect_uri: redirectUri,
            state,
            scope: setting("scopes"),
          }))
            url.searchParams.set(key, value)
          const verifier =
            ctx.config.pkce === true
              ? base64Url(ctx.crypto.randomBytes(32))
              : null
          if (verifier) {
            url.searchParams.set(
              "code_challenge",
              base64Url(await ctx.crypto.sha256(verifier)),
            )
            url.searchParams.set("code_challenge_method", "S256")
          }
          return { url: url.href, session: { verifier } }
        },
        async finish({ query, session, redirectUri }) {
          // The host already checked state and bound this session to the browser.
          if (query.error)
            throw new ProviderError(
              `The provider refused sign-in: ${(query.error_description || query.error).slice(0, 500)}`,
            )
          if (!query.code)
            throw new ProviderError(
              "The provider returned no authorization code. Try signing in again.",
            )
          const body = new URLSearchParams({
            grant_type: "authorization_code",
            code: query.code,
            client_id: setting("clientId"),
            redirect_uri: redirectUri,
          })
          if (setting("clientSecret"))
            body.set("client_secret", setting("clientSecret"))
          if (ctx.config.pkce === true) {
            const verifier = text(at(session, "verifier"))
            if (!verifier)
              throw new ProviderError(
                "The PKCE session is missing. Start sign-in again.",
              )
            body.set("code_verifier", verifier)
          }
          const token = await request(setting("tokenUrl"), {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
          })
          const accessToken = text(at(token, "access_token"))
          if (!accessToken)
            throw new ProviderError(
              "The provider returned no access token. Check the client settings.",
            )
          const user = await request(setting("userInfoUrl"), {
            headers: {
              accept: "application/json",
              authorization: `Bearer ${accessToken}`,
            },
          })
          const rawSubject = at(user, setting("subjectField"))
          // JSON numbers are permitted for provider ids, but not booleans or objects.
          const subject =
            // oxlint-disable-next-line anti-slop/no-runtime-typeof
            typeof rawSubject === "number" && Number.isSafeInteger(rawSubject)
              ? String(rawSubject)
              : text(rawSubject)
          if (!subject || subject.length > 256)
            throw new ProviderError(
              `The provider's user info has no valid \`${setting("subjectField")}\` field. Set Subject field in the plugin's settings.`,
            )
          return {
            subject,
            username: text(at(user, setting("usernameField"))),
            name: text(at(user, setting("nameField"))),
          }
        },
      },
    },
  }
})
