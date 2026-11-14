import { serve } from "@hono/node-server"
import { migrateDb } from "@matinee/db"

import { createApp } from "./app"
import { oidcState } from "./auth/oidc-settings"
import { passkeySettings, warnWithoutSignIn } from "./auth/passkey-settings"
import { initSetupToken, setupRequired } from "./auth/setup"
import { db, pool } from "./db"
import { startDiscovery } from "./discovery"
import { env } from "./env"
import { stopQueues } from "./jobs/queue"
import { startTasks, stopTasks } from "./jobs/scheduler"
import { loadJobSettings } from "./jobs/settings"
import { TASKS } from "./jobs/tasks"
import { startWatching, stopWatching } from "./library/watcher"
import { log } from "./log"
import { stopEncodes } from "./media/hls"
import { startPlugins, stopPlugins } from "./plugins"
import { stopStreams } from "./realtime/events"
import { currentTranscoding } from "./transcode/capabilities"
import { transcodingSettings } from "./transcode/settings"

await migrateDb(db, env.MATINEE_MIGRATIONS_DIR)
// Read the saved settings now, so the log says at start which MATINEE_*
// variables they override.
await Promise.all([oidcState(), passkeySettings(), transcodingSettings()])
await initSetupToken()
// Before setup, initSetupToken says what can create the admin.
if (!(await setupRequired())) await warnWithoutSignIn()
await startPlugins()
await loadJobSettings()
await startTasks(TASKS)
if (env.MATINEE_WATCH_LIBRARIES) startWatching()
// Detect ffmpeg and the GPUs now, so the first transcode doesn't wait.
void currentTranscoding().catch((cause) =>
  log.warn("Couldn't detect what ffmpeg can do", cause),
)

const server = serve(
  { fetch: createApp().fetch, hostname: env.HOST, port: env.PORT },
  (info) => {
    log.info(
      `Matinee listening on port ${info.port}, public URL ${env.PUBLIC_URL}`,
    )
  },
)

const stopDiscovery = startDiscovery()

function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`)
  setTimeout(() => process.exit(1), 10_000).unref()
  stopDiscovery()
  // Open event streams would keep the server from closing.
  stopStreams()
  stopEncodes()
  // Jobs stop at their next check, a scan between files. Let them finish
  // before the pool closes.
  void Promise.all([stopWatching(), stopTasks(), stopQueues(), stopPlugins()])
    .catch((cause) => log.warn("Couldn't stop the background jobs", cause))
    .finally(() =>
      server.close(() => {
        void pool.end().finally(() => process.exit(0))
      }),
    )
}
process.once("SIGINT", () => shutdown("SIGINT"))
process.once("SIGTERM", () => shutdown("SIGTERM"))
