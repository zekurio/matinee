import type {
  AuthenticationExtensionsClientOutputs,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser"

import { t } from "./schema"
import { ThemeAccents } from "./theme"

/**
 * How setup creates the admin account. With single sign-on set up, only an
 * admin at the provider can; otherwise a passkey, after the setup token.
 */
export const SETUP_MODES = ["passkey", "oidc"] as const
export const SetupMode = t.enum(SETUP_MODES)
export type SetupMode = t.infer<typeof SetupMode>

export const AuthConfig = t.object({
  /**
   * First-run setup, until the admin finishes it; null after. The first
   * account becomes the admin, who then sets up transcoding and libraries.
   */
  setup: t
    .object({
      /** No account exists yet. */
      accountRequired: t.boolean(),
      mode: SetupMode,
      /** A passkey admin needs the token the server printed to its log. */
      tokenRequired: t.boolean(),
    })
    .nullable(),
  /** Anyone may create an account with a passkey. */
  passkeySignUp: t.boolean(),
  oidc: t
    .object({
      displayName: t.string(),
      /** Signing in with the provider can create a new account. */
      allowSignUp: t.boolean(),
    })
    .nullable(),
  /** Accents an admin picked for the Matinee theme on this server. */
  themeAccents: ThemeAccents,
})
export type AuthConfig = t.infer<typeof AuthConfig>

// SimpleWebAuthn verifies the ceremony payloads. The schemas only check the
// envelope so malformed requests fail before reaching it.
const ExtensionOutputs = t.looseObject({})

const credentialEnvelope = {
  id: t.string().min(1),
  rawId: t.string().min(1),
  type: t.literal("public-key"),
  // Outputs vary by extension; SimpleWebAuthn reads the ones it knows.
  clientExtensionResults: t.custom<AuthenticationExtensionsClientOutputs>(
    (value) => ExtensionOutputs.safeParse(value).success,
  ),
  authenticatorAttachment: t.enum(["platform", "cross-platform"]).optional(),
}

export const RegistrationResponse = t.object({
  ...credentialEnvelope,
  response: t.object({
    clientDataJSON: t.string(),
    attestationObject: t.string(),
    authenticatorData: t.string().optional(),
    // Browsers report transports as free strings. The server keeps the
    // ones it knows.
    transports: t.array(t.string().max(32)).max(16).optional(),
    publicKeyAlgorithm: t.number().int().optional(),
    publicKey: t.string().optional(),
  }),
}) satisfies t.Type<RegistrationResponseJSON>

export const AuthenticationResponse = t.object({
  ...credentialEnvelope,
  response: t.object({
    clientDataJSON: t.string(),
    authenticatorData: t.string(),
    signature: t.string(),
    userHandle: t.string().optional(),
  }),
}) satisfies t.Type<AuthenticationResponseJSON>

export const PasskeyCreation = t.object({
  challengeId: t.uuid(),
  options: t.custom<PublicKeyCredentialCreationOptionsJSON>(),
})

export const PasskeyRequest = t.object({
  challengeId: t.uuid(),
  options: t.custom<PublicKeyCredentialRequestOptionsJSON>(),
})

export const Passkey = t.object({
  id: t.uuid(),
  name: t.string().nullable(),
  backedUp: t.boolean(),
  createdAt: t.date(),
  lastUsedAt: t.date().nullable(),
})
export type Passkey = t.infer<typeof Passkey>

export const PasskeyName = t.string().trim().max(64).nullable()

/** The provider account linked for single sign-on. Each user has at most one. */
export const OidcAccount = t.object({
  label: t.string().nullable(),
  /** The provider sent a picture at the last sign-in. */
  hasPicture: t.boolean(),
  createdAt: t.date(),
})
export type OidcAccount = t.infer<typeof OidcAccount>

/**
 * An OIDC sign-in whose username claim matched an existing account, kept for
 * this browser so it can be linked once signed in, or turned into a new
 * account, without another trip to the provider.
 */
export const PendingOidcLink = t.object({
  /** The provider's username claim, to show which account would be linked. */
  accountLabel: t.string().nullable(),
})
export type PendingOidcLink = t.infer<typeof PendingOidcLink>
