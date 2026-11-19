import * as client from "openid-client"

import { env } from "../env"
import { OidcError } from "./oidc-accounts"
import { activeOidc, type OidcState, sameIssuer } from "./oidc-settings"
import { PLAIN_HTTP_REFUSED, plainHttpRefused } from "./oidc-transport"

let discovered: {
  version: number
  config: Promise<client.Configuration>
} | null = null

/**
 * The discovery document names a different issuer than the settings. The
 * message is for the log; visitors get a generic one from auth/oidc.ts.
 */
export class WrongIssuerError extends OidcError {
  constructor(readonly issuer: string) {
    super(
      `Single sign-on is set up with the wrong issuer URL. An admin needs to change it to ${issuer}.`,
    )
  }
}

/**
 * The issuer is plain http off loopback, which the operator didn't allow.
 * Like WrongIssuerError, the message is for the admin and the log.
 */
export class InsecureIssuerError extends OidcError {
  constructor() {
    super(PLAIN_HTTP_REFUSED)
  }
}

/** Also used to check settings before they're saved. */
export async function discover(
  state: OidcState,
): Promise<client.Configuration> {
  // Saved settings from before this check, or a variable that changed, can
  // still name one. Refuse before anything, the secret above all, is sent.
  if (plainHttpRefused(state.settings.issuerUrl, env.MATINEE_OIDC_ALLOW_HTTP)) {
    throw new InsecureIssuerError()
  }
  const issuer = new URL(state.settings.issuerUrl)
  const config = await client.discovery(
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
  // Discovery URLs supplied directly don't get openid-client's issuer check.
  const named = config.serverMetadata().issuer
  if (!sameIssuer(named, state.settings.issuerUrl)) {
    throw new WrongIssuerError(named)
  }
  return config
}

/** Rediscover after settings change; failed discovery is retried next time. */
export async function oidcConfig(): Promise<{
  state: OidcState
  config: client.Configuration
}> {
  const state = await activeOidc()
  if (!state) throw new OidcError("Single sign-on is turned off.")
  if (discovered?.version !== state.version) {
    const entry = {
      version: state.version,
      config: discover(state).catch((cause: unknown) => {
        if (discovered === entry) discovered = null
        throw cause
      }),
    }
    discovered = entry
  }
  return { state, config: await discovered.config }
}
