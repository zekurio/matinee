import { serve } from "@hono/node-server"
import { migrateDb } from "@matinee/db"

import { createApp } from "./app"
import { deleteExpiredSessions } from "./auth/session"
import { initSetupToken } from "./auth/setup"
import { db, pool } from "./db"
import { env } from "./env"
import { catchUpLibraries } from "./library/scanner"
import { log } from "./log"

await migrateDb(db, env.MATINEE_MIGRATIONS_DIR)
await initSetupToken()
await deleteExpiredSessions()
void catchUpLibraries().catch((cause) =>
  log.warn("Couldn't check libraries for pending work", cause),
)

const server = serve(
  { fetch: createApp().fetch, hostname: env.HOST, port: env.PORT },
  (info) => {
    log.info(
      `Matinee listening on port ${info.port}, public URL ${env.PUBLIC_URL}`,
    )
  },
)

const cleanup = setInterval(
  () =>
    void deleteExpiredSessions().catch((cause) =>
      log.warn("Session cleanup failed", cause),
    ),
  6 * 60 * 60 * 1000,
)
cleanup.unref()

function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`)
  server.close(() => {
    void pool.end().finally(() => process.exit(0))
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}
process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
