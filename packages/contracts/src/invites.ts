import { t } from "./schema"

/**
 * The secret in an invite link: 32 random bytes as base64url. It sits in
 * the link's fragment, which a browser keeps to itself, so it stays out of
 * server and proxy logs. The server stores only its SHA-256.
 */
export const InviteToken = t
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "That invite link is incomplete.")

/** How long a link can work, in days. The first choices a form offers. */
export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const
export const DEFAULT_INVITE_EXPIRY_DAYS = 7
export const MAX_INVITE_EXPIRY_DAYS = 30

/** A note on who the link is for. Empty means none. */
export const InviteLabel = t
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")

export const InviteInput = t.object({
  label: InviteLabel.optional(),
  expiresInDays: t.number().int().min(1).max(MAX_INVITE_EXPIRY_DAYS),
})
export type InviteInput = t.infer<typeof InviteInput>

/**
 * A link that lets one person create an account with a passkey while
 * sign-up is closed. It works once, until it expires or an admin revokes
 * it. Only links that still work are listed.
 */
export const Invite = t.object({
  id: t.uuid(),
  label: t.string().nullable(),
  createdAt: t.date(),
  expiresAt: t.date(),
})
export type Invite = t.infer<typeof Invite>

export const CreatedInvite = Invite.extend({
  /**
   * The link to hand over, at `PUBLIC_URL`. The server can't show it
   * again, since it keeps only the token's hash.
   */
  url: t.string(),
})
export type CreatedInvite = t.infer<typeof CreatedInvite>
