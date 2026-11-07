import { t } from "./schema"
import { User } from "./schemas"

/**
 * The OpenID Connect provider as sign-in uses it. Text fields are "" when
 * unset.
 */
export const OidcSettings = t.object({
  /** Show the sign-in button and accept sign-ins. */
  enabled: t.boolean(),
  /** Shown on the button as "Continue with {displayName}". */
  displayName: t.string(),
  issuerUrl: t.string(),
  clientId: t.string(),
  /** Space-separated. */
  scopes: t.string(),
  /** Claim that suggests the username for new accounts. */
  usernameClaim: t.string(),
  /** Create an account on first sign-in instead of only accepting links. */
  allowSignUp: t.boolean(),
})
export type OidcSettings = t.infer<typeof OidcSettings>

/** Where the client secret in use comes from, or null when there is none. */
export const SecretSource = t.enum(["saved", "environment"]).nullable()
export type SecretSource = t.infer<typeof SecretSource>

export const AdminAuthSettings = t.object({
  /** The provider in use: saved values over the environment's. */
  oidc: OidcSettings,
  /** The environment's values, which an empty field falls back to. */
  defaults: OidcSettings,
  clientSecret: t.object({
    source: SecretSource,
    /** The environment sets one, so dropping the saved secret falls back. */
    environment: t.boolean(),
  }),
  /** The redirect URI to register with the provider. */
  callbackUrl: t.string(),
  /** Whether sign-in works: enabled, with an issuer and client ID. */
  active: t.boolean(),
  /** Accounts with a linked sign-in and no passkey. */
  ssoOnlyUsers: t.number().int(),
})
export type AdminAuthSettings = t.infer<typeof AdminAuthSettings>

/** An empty text field drops the saved value, so the environment's applies. */
const text = (max: number) => t.string().trim().max(max)

/** An http or https URL, written out with `://`. */
const isHttpUrl = (value: string) =>
  /^https?:\/\//i.test(value) && URL.canParse(value)

export const OidcSettingsInput = t
  .object({
    enabled: t.boolean(),
    allowSignUp: t.boolean(),
    displayName: text(64),
    issuerUrl: text(2048)
      .refine(
        (value) => value === "" || isHttpUrl(value),
        "Enter the issuer as an http or https URL.",
      )
      // The URL parser skips tabs and newlines, so the saved value does too.
      .transform((value) => value.replaceAll(/[\t\n\r]/g, "")),
    clientId: text(512),
    scopes: text(512),
    usernameClaim: text(128),
    /** A new secret. Null drops the saved one; omitted keeps it. */
    clientSecret: t.string().trim().min(1).max(4096).nullable().optional(),
  })
  .refine(
    (input) => !input.scopes || input.scopes.split(/\s+/).includes("openid"),
    { path: ["scopes"], message: "Scopes must include openid." },
  )
export type OidcSettingsInput = t.infer<typeof OidcSettingsInput>

/** An account as the admin's user list shows it. */
export const AdminUser = User.extend({
  createdAt: t.date(),
  /** Latest activity across the user's sessions, to the hour. */
  lastSeenAt: t.date().nullable(),
  passkeys: t.number().int(),
  /** Has a linked OIDC account. It only signs in while single sign-on is on. */
  oidcLinked: t.boolean(),
  /** Sessions that haven't expired. */
  sessions: t.number().int(),
})
export type AdminUser = t.infer<typeof AdminUser>
