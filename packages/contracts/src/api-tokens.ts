import { t } from "./schema"

/**
 * What every API token starts with. Session tokens are 43 base64url
 * characters and never contain it at that length, so the server tells the
 * two apart without a lookup, and a secret scanner can find a leaked one.
 */
export const API_TOKEN_PREFIX = "matinee_"

/** What the owner calls a token, like `blitzcrank` or `Home Assistant`. */
export const ApiTokenName = t
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(64, "Use at most 64 characters.")

/** What `account.apiTokens.create` takes. */
export const ApiTokenInput = t.object({ name: ApiTokenName })
export type ApiTokenInput = t.infer<typeof ApiTokenInput>

/**
 * A credential for a service that calls the API as the account, unattended.
 * It never expires on its own; it stops working when revoked or when the
 * account is deleted. The list never holds the secret.
 */
export const ApiToken = t.object({
  id: t.uuid(),
  name: t.string(),
  createdAt: t.date(),
  /** Null until the token is first used. The server moves it at most once a minute. */
  lastUsedAt: t.date().nullable(),
})
export type ApiToken = t.infer<typeof ApiToken>

/**
 * A token just created, with its secret. The server keeps only a hash, so
 * this is the one time anyone sees it. Send it as
 * `Authorization: Bearer <token>`.
 */
export const CreatedApiToken = t.object({
  token: t.string(),
  apiToken: ApiToken,
})
export type CreatedApiToken = t.infer<typeof CreatedApiToken>
