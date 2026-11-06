import { serve } from "@hono/node-server"
import { migrateDb } from "@matinee/db"

import { createApp } from "./app"
import { deleteExpiredSessions } from "./auth/session"
import { initSetupToken } from "./auth/setup"
import { db, pool } from "./db"
import { env } from "./env"
import { stopScans } from "./library/scanner"
import { startScheduledScans, stopScheduledScans } from "./library/schedule"
import { startWatching, stopWatching } from "./library/watcher"
import { log } from "./log"
import { requestShutdown } from "./shutdown"

await migrateDb(db, env.MATINEE_MIGRATIONS_DIR)
await initSetupToken()
await deleteExpiredSessions()
startScheduledScans(env.MATINEE_SCAN_INTERVAL_HOURS)
if (env.MATINEE_WATCH_LIBRARIES) startWatching()

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
  setTimeout(() => process.exit(1), 10_000).unref()
  requestShutdown()
  clearInterval(cleanup)
  stopScheduledScans()
  // Scans stop between files. Let them finish before the pool closes.
  void Promise.all([stopWatching(), stopScans()])
    .catch((cause) => log.warn("Couldn't stop library scans", cause))
    .finally(() =>
      server.close(() => {
        void pool.end().finally(() => process.exit(0))
      }),
    )
}
process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
