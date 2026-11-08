import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { DevicePath, HardwareAcceleration } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

// Fill unset variables from the nearest `.env` above the working directory.
// Variables already in the environment win.
function loadDotenv(): void {
  let dir = process.cwd()
  while (true) {
    const file = join(dir, ".env")
    if (existsSync(file)) {
      process.loadEnvFile(file)
      return
    }
    const parent = dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

// `$default` fills in the input, so it comes before the transform, as one of
// the strings.
const flag = (fallback: boolean) =>
  t
    .enum(["true", "false", "1", "0"])
    .$default(fallback ? "true" : "false")
    .transform((value) => value === "true" || value === "1")

const optional = t
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional()

const EnvSchema = t.object({
  NODE_ENV: t
    .enum(["development", "production", "test"])
    .$default("production"),
  DATABASE_URL: t.string().min(1, "DATABASE_URL is required."),
  HOST: t.string().$default("::"),
  PORT: t.coerce.number().int().min(1).max(65535).$default(8420),
  /** Origin users open Matinee on. Passkeys and OIDC redirects bind to it. */
  PUBLIC_URL: t
    .string()
    .trim()
    .url()
    .$default("http://localhost:8420")
    .transform((value) => new URL(value).origin),
  /** Built web app to serve. Unset in dev, where Vite serves it. */
  MATINEE_WEB_DIST: optional,
  MATINEE_MIGRATIONS_DIR: optional,
  /** Thumbnails and other generated files. Relative to the working dir. */
  MATINEE_DATA_DIR: t.string().$default("data"),
  /**
   * HLS encodes, shared by everyone who plays the same file the same way.
   * Defaults to `transcodes` in the data dir. A fast disk helps.
   */
  MATINEE_TRANSCODE_DIR: optional,
  /** Hours an encode nobody plays stays on disk; 0 deletes it at once. */
  MATINEE_TRANSCODE_CACHE_HOURS: t.coerce.number().min(0).$default(24),
  /**
   * Gigabytes all encodes may take. The least recently played go first;
   * ones playing now stay. 0 sets no limit.
   */
  MATINEE_TRANSCODE_CACHE_GB: t.coerce.number().min(0).$default(50),
  MATINEE_FFMPEG_PATH: t.string().$default("ffmpeg"),
  MATINEE_FFPROBE_PATH: t.string().$default("ffprobe"),
  /**
   * Defaults for the transcoding settings an admin can change in the app:
   * the acceleration and its device nodes. Unset leaves Matinee's own, so
   * setup knows to ask.
   */
  MATINEE_HARDWARE_ACCELERATION: HardwareAcceleration.optional(),
  MATINEE_VAAPI_DEVICE: DevicePath.optional(),
  MATINEE_QSV_DEVICE: DevicePath.optional(),
  /** Scan the library folders that change, as they change. */
  MATINEE_WATCH_LIBRARIES: flag(true),
  /**
   * Hours between full scans of every library; 0 turns them off. Node's
   * timers can't wait longer than about 24 days.
   */
  MATINEE_SCAN_INTERVAL_HOURS: t.coerce
    .number()
    .min(0)
    .max(24 * 24)
    .$default(12),
  MATINEE_SETUP_TOKEN: t.string().min(32).optional(),
  MATINEE_OPEN_REGISTRATION: flag(false),
  MATINEE_OIDC_ISSUER_URL: t
    .string()
    .trim()
    .refine((value) => !value || URL.canParse(value), "Invalid URL")
    // The URL parser skips tabs and newlines, so the value does too.
    .transform((value) => value.replaceAll(/[\t\n\r]/g, "") || undefined)
    .optional(),
  MATINEE_OIDC_CLIENT_ID: optional,
  MATINEE_OIDC_CLIENT_SECRET: optional,
  MATINEE_OIDC_DISPLAY_NAME: t.string().$default("Single sign-on"),
  MATINEE_OIDC_SCOPES: t.string().$default("openid profile"),
  MATINEE_OIDC_USERNAME_CLAIM: t.string().$default("preferred_username"),
  /**
   * Claim that gives the account's role, `admin` or `user`, as a string or
   * a list, as alloy and Immich read it.
   */
  MATINEE_OIDC_ROLE_CLAIM: t.string().trim().min(1).$default("matinee_role"),
  MATINEE_OIDC_ALLOW_SIGN_UP: flag(false),
  /** TMDB API key (v3) or API read access token. */
  MATINEE_TMDB_API_KEY: optional,
  /** TheTVDB v4 project API key, plus a subscriber PIN for user keys. */
  MATINEE_TVDB_API_KEY: optional,
  MATINEE_TVDB_PIN: optional,
})

/**
 * Fill `NAME` from the file `NAME_FILE` names, for any variable, so secrets
 * can come from files such as systemd credentials. Surrounding whitespace,
 * like the newline most files end with, is dropped.
 */
function readFiles(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const filled = { ...source }
  for (const name of Object.keys(EnvSchema.properties)) {
    const file = source[`${name}_FILE`]
    if (!file) continue
    if (source[name]) {
      throw new Error(`Set ${name} or ${name}_FILE, not both.`)
    }
    try {
      filled[name] = readFileSync(file, "utf8").trim()
    } catch (cause) {
      throw new Error(`Couldn't read ${name}_FILE (${file}).`, { cause })
    }
  }
  return filled
}

function parseEnv() {
  loadDotenv()
  const result = EnvSchema.safeParse(readFiles(process.env))
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) =>
        `✖ ${issue.message}${issue.path.length ? `\n  → at ${issue.path.join(".")}` : ""}`,
    )
    throw new Error(`Invalid environment:\n${issues.join("\n")}`)
  }
  const env = result.data
  const publicUrl = new URL(env.PUBLIC_URL)
  const dataDir = resolve(env.MATINEE_DATA_DIR)
  return {
    ...env,
    dataDir,
    transcodeDir: env.MATINEE_TRANSCODE_DIR
      ? resolve(env.MATINEE_TRANSCODE_DIR)
      : join(dataDir, "transcodes"),
    secureCookies: publicUrl.protocol === "https:",
    isLoopback: ["localhost", "127.0.0.1", "[::1]"].includes(
      publicUrl.hostname,
    ),
  }
}

export const env = parseEnv()
