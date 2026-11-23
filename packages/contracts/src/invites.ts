import { t } from "./schema"

/**
 * The secret in an invite link: 32 random bytes as base64url. It sits in
 * the link's fragment, which a browser keeps to itself, so it stays out of
 * server and proxy logs. The server stores only its SHA-256.
 */
export const InviteToken = t
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "That invite link is incomplete.")

/** The longest a link can work, in days. */
export const MAX_INVITE_EXPIRY_DAYS = 30

/** How many days a link works: a whole number up to the longest. */
export const InviteExpiryDays = t
  .number()
  .int()
  .min(1)
  .max(MAX_INVITE_EXPIRY_DAYS)

/** A note on who the link is for. Empty means none. */
export const InviteLabel = t
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")

export const InviteInput = t.object({
  label: InviteLabel.optional(),
  expiresInDays: InviteExpiryDays,
  /** Access groups the new account starts in. */
  groupIds: t.array(t.uuid()).max(32).$default([]),
})
export type InviteInput = t.infer<typeof InviteInput>

/** What the form for a new invite offers. */
export const InviteOptions = t.object({
  /** How long a link can work, in days, shortest first. */
  expiryDays: t.array(InviteExpiryDays),
  /** The one of them the form starts on. */
  defaultExpiryDays: InviteExpiryDays,
})
export type InviteOptions = t.infer<typeof InviteOptions>

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
  /** The access groups the new account starts in. */
  groups: t.array(t.object({ id: t.uuid(), name: t.string() })),
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
