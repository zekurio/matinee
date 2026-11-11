import type { DevicePlatform, SessionClient } from "@matinee/contracts"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { createdAt } from "./columns"
import { user } from "./users"

/** One row per signed-in client. Only the token's SHA-256 is stored. */
export const session = pgTable(
  "session",
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    userAgent: text(),
    client: text().$type<SessionClient>().notNull().default("web"),
    /** What an app calls its device. Null for browsers and unnamed ones. */
    deviceName: text(),
    /** What an app runs on. Null for browsers. */
    platform: text().$type<DevicePlatform>(),
    createdAt: createdAt(),
    lastSeenAt: createdAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
)

/** A single-use sign-up link. Only the token's SHA-256 is stored. */
export const invite = pgTable("invite", {
  id: uuid().primaryKey().defaultRandom(),
  tokenHash: text().notNull().unique(),
  label: text(),
  createdBy: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export const passkey = pgTable(
  "passkey",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialId: text().notNull().unique(),
    /** COSE public key, base64url. */
    publicKey: text().notNull(),
    counter: integer().notNull().default(0),
    transports: text().array(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull().default(false),
    name: text(),
    createdAt: createdAt(),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("passkey_user_idx").on(t.userId)],
)

/**
 * A link between a user and a subject at the configured OIDC issuer. Each
 * user has at most one.
 */
export const oidcAccount = pgTable(
  "oidc_account",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    issuer: text().notNull(),
    subject: text().notNull(),
    /** Username claim at link time, so the owner sees which account it is. */
    label: text(),
    /** The `picture` claim at the last sign-in. */
    picture: text(),
    /**
     * The groups claim at the last sync, for admins to pick provider
     * groups from. Null while no groups claim was read.
     */
    groups: text().array(),
    /**
     * What the provider gave to read the account's claims again without
     * its owner, when the scopes ask for `offline_access`. Null without.
     */
    refreshToken: text(),
    /** When the claims were last read: a sign-in or a refresh. */
    syncedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("oidc_account_issuer_subject").on(t.issuer, t.subject),
    uniqueIndex("oidc_account_user_id").on(t.userId),
  ],
)

export type ChallengePayload = Record<string, string | number | boolean | null>

/** Single-use state for passkey ceremonies and OIDC round trips. */
export const authChallenge = pgTable(
  "auth_challenge",
  {
    id: uuid().primaryKey().defaultRandom(),
    purpose: text().notNull(),
    challenge: text().notNull(),
    payload: jsonb().$type<ChallengePayload>().notNull().default({}),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_challenge_expires_idx").on(t.expiresAt)],
)

/**
 * Sign-ins that apps without a browser started, as in RFC 8628. The app
 * polls with its device code until someone signed in enters the user code
 * and approves, which sets `userId`. The poll that sees it deletes the row.
 */
export const deviceAuthorization = pgTable("device_authorization", {
  id: uuid().primaryKey().defaultRandom(),
  /** SHA-256 of the secret the app polls with. */
  deviceCodeHash: text().notNull().unique(),
  /** Like `BCDF-GHJK`, as `formatUserCode` writes it. */
  userCode: text().notNull().unique(),
  deviceName: text(),
  platform: text().$type<DevicePlatform>().notNull(),
  /** Who approved it. Null while it waits. */
  userId: uuid().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
})

export type PasskeyRow = typeof passkey.$inferSelect
