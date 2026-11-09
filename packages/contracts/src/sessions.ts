import { t } from "./schema"
import { User } from "./users"

/**
 * How a session signed in: `web` in a browser, which holds the cookie, or
 * `app` through `auth.app` or `auth.device`, which hand out a bearer token.
 */
export const SESSION_CLIENTS = ["web", "app"] as const
export const SessionClient = t.enum(SESSION_CLIENTS)
export type SessionClient = t.infer<typeof SessionClient>

/**
 * What an app runs on. The app says so when it signs in. TVs get their own
 * value, so the person approving one sees a TV.
 */
export const DEVICE_PLATFORMS = [
  "android",
  "androidtv",
  "ios",
  "linux",
  "macos",
  "tizen",
  "windows",
] as const
export const DevicePlatform = t.enum(DEVICE_PLATFORMS)
export type DevicePlatform = t.infer<typeof DevicePlatform>

/** What an app calls its device, like `Living room TV`. */
export const DeviceName = t
  .string()
  .trim()
  .max(64, "Use at most 64 characters.")

/** The device an app signs in from. */
export const AppDevice = t.object({
  /** Left out or empty, the sessions list shows the platform instead. */
  name: DeviceName.optional(),
  platform: DevicePlatform,
})
export type AppDevice = t.infer<typeof AppDevice>

/** A place the user is signed in, as their settings list it. */
export const Session = t.object({
  id: t.uuid(),
  /** The session that asked for the list. */
  current: t.boolean(),
  client: SessionClient,
  /** The name an app gave its device. Null for browsers. */
  deviceName: t.string().nullable(),
  /** What the app runs on. Null for browsers. */
  platform: DevicePlatform.nullable(),
  /** Like `Firefox on Linux`, from the User-Agent. Null for apps. */
  browser: t.string().nullable(),
  createdAt: t.date(),
  /** The server moves it at most once an hour. */
  lastSeenAt: t.date(),
  /** 30 days after the session was last used. */
  expiresAt: t.date(),
})
export type Session = t.infer<typeof Session>

/**
 * A session for an app. Send the token as `Authorization: Bearer <token>`
 * on every request, and keep it where the platform keeps secrets.
 */
export const AppSession = t.object({
  token: t.string(),
  user: User,
})
export type AppSession = t.infer<typeof AppSession>

/** The custom URI scheme apps can take the sign-in code back on. */
export const APP_URI_SCHEME = "matinee"

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"])

/**
 * Where a browser may send an app's sign-in code: a `matinee:` URI the app
 * registered, or a loopback `http` URL it listens on, as RFC 8252 has it.
 * No fragment, since the code goes in the query.
 */
export function isAppRedirectUri(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  if (url.hash) return false
  if (url.protocol === `${APP_URI_SCHEME}:`) return true
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)
}

/** RFC 7636's S256 challenge: the base64url SHA-256 of the verifier. */
export const CodeChallenge = t
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Invalid code challenge")

/** RFC 7636's code verifier: 43 to 128 unreserved characters. */
export const CodeVerifier = t
  .string()
  .regex(/^[A-Za-z0-9._~-]{43,128}$/, "Invalid code verifier")

/**
 * The query an app opens `APP_AUTHORIZE_PAGE_PATH` with, in OAuth's names.
 * The page posts the same fields to `APP_AUTHORIZE_PATH` once the person
 * approves.
 */
export const AppAuthorizeRequest = t.object({
  /** Where the browser goes with `code` and `state` afterwards. */
  redirect_uri: t
    .string()
    .refine(
      isAppRedirectUri,
      `Use a ${APP_URI_SCHEME}: URI or a loopback http URL.`,
    ),
  /** Comes back as it is, so the app can match the answer to its request. */
  state: t.string().min(1).max(512),
  code_challenge: CodeChallenge,
  code_challenge_method: t.literal("S256"),
  device_name: DeviceName.optional(),
  platform: DevicePlatform,
})
export type AppAuthorizeRequest = t.infer<typeof AppAuthorizeRequest>

/** Letters of a user code: no vowels, so no words, and none that look alike. */
export const USER_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ"

/**
 * The code someone enters for an app at `/link`: eight letters, shown as
 * `BCDF-GHJK`. Case, spaces, and the dash don't matter.
 */
export const UserCode = t
  .string()
  .trim()
  .regex(
    new RegExp(
      `^[${USER_CODE_LETTERS}]{4}[\\s-]?[${USER_CODE_LETTERS}]{4}$`,
      "i",
    ),
    "Enter the 8 letters the device shows.",
  )

/** A user code as the server stores and shows it: `BCDF-GHJK`. */
export function formatUserCode(code: string): string {
  const letters = code.toUpperCase().replace(/[^A-Z]/g, "")
  return `${letters.slice(0, 4)}-${letters.slice(4)}`
}

/** What `auth.device.start` gives the app to show. */
export const DeviceCode = t.object({
  /** The secret the app polls `auth.device.poll` with. Never show it. */
  deviceCode: t.string(),
  /** What the person enters, like `BCDF-GHJK`. */
  userCode: t.string(),
  /** The page to enter it on. */
  verificationUri: t.string(),
  /**
   * The page with the code filled in, for the QR code the app shows. A
   * phone's camera opens it in the browser; the apps read the code from it.
   */
  verificationUriComplete: t.string(),
  /** Seconds until the codes stop working. */
  expiresIn: t.number().int(),
  /** Seconds to wait between polls. */
  interval: t.number().int(),
})
export type DeviceCode = t.infer<typeof DeviceCode>

/** An answer to `auth.device.poll`. */
export const DeviceSignIn = t.union([
  t.object({ status: t.literal("pending") }),
  t.object({ status: t.literal("approved"), token: t.string(), user: User }),
])
export type DeviceSignIn = t.infer<typeof DeviceSignIn>

/** A device waiting for someone to approve it, as the `/link` page shows it. */
export const DeviceRequest = t.object({
  userCode: t.string(),
  deviceName: t.string().nullable(),
  platform: DevicePlatform,
  expiresAt: t.date(),
})
export type DeviceRequest = t.infer<typeof DeviceRequest>
