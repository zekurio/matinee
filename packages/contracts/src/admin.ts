import { z } from "zod"

import { InviteKind, User, UserRole, Username } from "./schemas"

/**
 * The OpenID Connect provider as sign-in uses it. Text fields are "" when
 * unset.
 */
export const OidcSettings = z.object({
  /** Show the sign-in button and accept sign-ins. */
  enabled: z.boolean(),
  /** Shown on the button as "Continue with {displayName}". */
  displayName: z.string(),
  issuerUrl: z.string(),
  clientId: z.string(),
  /** Space-separated. */
  scopes: z.string(),
  /** Claim that suggests the username for new accounts. */
  usernameClaim: z.string(),
  /** Create an account on first sign-in instead of only accepting links. */
  allowSignUp: z.boolean(),
})
export type OidcSettings = z.infer<typeof OidcSettings>

/** Where the client secret in use comes from, or null when there is none. */
export const SecretSource = z.enum(["saved", "environment"]).nullable()
export type SecretSource = z.infer<typeof SecretSource>

export const AdminAuthSettings = z.object({
  /** The provider in use: saved values over the environment's. */
  oidc: OidcSettings,
  /** The environment's values, which an empty field falls back to. */
  defaults: OidcSettings,
  clientSecret: z.object({
    source: SecretSource,
    /** The environment sets one, so dropping the saved secret falls back. */
    environment: z.boolean(),
  }),
  /** The redirect URI to register with the provider. */
  callbackUrl: z.string(),
  /** Whether sign-in works: enabled, with an issuer and client ID. */
  active: z.boolean(),
  /** Accounts with a linked sign-in and no passkey. */
  ssoOnlyUsers: z.number().int(),
})
export type AdminAuthSettings = z.infer<typeof AdminAuthSettings>

/** An empty text field drops the saved value, so the environment's applies. */
const text = (max: number) => z.string().trim().max(max)

export const OidcSettingsInput = z
  .object({
    enabled: z.boolean(),
    allowSignUp: z.boolean(),
    displayName: text(64),
    issuerUrl: text(2048).pipe(
      z.union([
        z.literal(""),
        z.url({
          protocol: /^https?$/,
          error: "Enter the issuer as an http or https URL.",
        }),
      ]),
    ),
    clientId: text(512),
    scopes: text(512),
    usernameClaim: text(128),
    /** A new secret. Null drops the saved one; omitted keeps it. */
    clientSecret: z.string().trim().min(1).max(4096).nullable().optional(),
  })
  .refine(
    (input) => !input.scopes || input.scopes.split(/\s+/).includes("openid"),
    { path: ["scopes"], message: "Scopes must include openid." },
  )
export type OidcSettingsInput = z.infer<typeof OidcSettingsInput>

/** A sign-in link that hasn't been used yet. Its token is never shown again. */
export const InviteLink = z.object({
  id: z.uuid(),
  kind: InviteKind,
  createdAt: z.date(),
  expiresAt: z.date(),
  /** The admin who made it, or null if that account is gone. */
  createdBy: z.string().nullable(),
})
export type InviteLink = z.infer<typeof InviteLink>

/** A new link, with the URL to hand over. Only this answer carries it. */
export const IssuedLink = z.object({
  link: InviteLink,
  url: z.string(),
})
export type IssuedLink = z.infer<typeof IssuedLink>

/** An account as the admin's user list shows it. */
export const AdminUser = User.extend({
  createdAt: z.date(),
  /** Latest activity across the user's sessions, to the hour. */
  lastSeenAt: z.date().nullable(),
  passkeys: z.number().int(),
  /** Linked OIDC accounts. They only sign in while single sign-on is on. */
  oidcAccounts: z.number().int(),
  /** Sessions that haven't expired. */
  sessions: z.number().int(),
  /** Links that still work, newest first. */
  links: z.array(InviteLink),
})
export type AdminUser = z.infer<typeof AdminUser>

export const CreateUserInput = z.object({
  username: Username,
  role: UserRole,
})
export type CreateUserInput = z.infer<typeof CreateUserInput>
