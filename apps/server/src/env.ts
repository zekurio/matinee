import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { z } from "zod"

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

const flag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1")

const optional = z
  .string()
  .trim()
  .transform((value) => value || undefined)
  .optional()

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  HOST: z.string().default("::"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8420),
  /** Origin users open Matinee on. Passkeys and OIDC redirects bind to it. */
  PUBLIC_URL: z
    .url()
    .default("http://localhost:8420")
    .transform((value) => new URL(value).origin),
  /** Built web app to serve. Unset in dev, where Vite serves it. */
  MATINEE_WEB_DIST: optional,
  MATINEE_MIGRATIONS_DIR: optional,
  /** Thumbnails and other generated files. Relative to the working dir. */
  MATINEE_DATA_DIR: z.string().default("data"),
  MATINEE_FFMPEG_PATH: z.string().default("ffmpeg"),
  MATINEE_FFPROBE_PATH: z.string().default("ffprobe"),
  /** Scan the library folders that change, as they change. */
  MATINEE_WATCH_LIBRARIES: flag.default(true),
  /**
   * Hours between full scans of every library; 0 turns them off. Node's
   * timers can't wait longer than about 24 days.
   */
  MATINEE_SCAN_INTERVAL_HOURS: z.coerce
    .number()
    .min(0)
    .max(24 * 24)
    .default(12),
  MATINEE_SETUP_TOKEN: z.string().min(32).optional(),
  MATINEE_OPEN_REGISTRATION: flag.default(false),
  MATINEE_OIDC_ISSUER_URL: optional.pipe(z.url().optional()),
  MATINEE_OIDC_CLIENT_ID: optional,
  MATINEE_OIDC_CLIENT_SECRET: optional,
  MATINEE_OIDC_CLIENT_SECRET_FILE: optional,
  MATINEE_OIDC_DISPLAY_NAME: z.string().default("Single sign-on"),
  MATINEE_OIDC_SCOPES: z.string().default("openid profile email"),
  MATINEE_OIDC_USERNAME_CLAIM: z.string().default("preferred_username"),
  MATINEE_OIDC_ALLOW_SIGN_UP: flag.default(false),
  /** TMDB API key (v3) or API read access token. */
  MATINEE_TMDB_API_KEY: optional,
  MATINEE_TMDB_API_KEY_FILE: optional,
  /** TheTVDB v4 project API key, plus a subscriber PIN for user keys. */
  MATINEE_TVDB_API_KEY: optional,
  MATINEE_TVDB_API_KEY_FILE: optional,
  MATINEE_TVDB_PIN: optional,
})

function secret(value?: string, file?: string): string | undefined {
  if (value) return value
  return file ? readFileSync(file, "utf8").trim() || undefined : undefined
}

function parseEnv() {
  loadDotenv()
  const result = EnvSchema.safeParse(process.env)
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`)
  }
  const env = result.data
  const publicUrl = new URL(env.PUBLIC_URL)
  const dataDir = resolve(env.MATINEE_DATA_DIR)
  return {
    ...env,
    // The rest of the OIDC variables are defaults for the admin settings,
    // see auth/oidc-settings.ts.
    oidcClientSecret: secret(
      env.MATINEE_OIDC_CLIENT_SECRET,
      env.MATINEE_OIDC_CLIENT_SECRET_FILE,
    ),
    tmdbApiKey: secret(env.MATINEE_TMDB_API_KEY, env.MATINEE_TMDB_API_KEY_FILE),
    tvdbApiKey: secret(env.MATINEE_TVDB_API_KEY, env.MATINEE_TVDB_API_KEY_FILE),
    dataDir,
    secureCookies: publicUrl.protocol === "https:",
    isLoopback: ["localhost", "127.0.0.1", "[::1]"].includes(
      publicUrl.hostname,
    ),
  }
}

export const env = parseEnv()
