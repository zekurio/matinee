import { oc } from "@orpc/contract"

import { AdminAuthSettings, AdminUser, OidcSettingsInput } from "./admin"
import { del, get, post, put } from "./contract-routes"
import {
  ConcurrencyInput,
  JobQueueStatus,
  JobsOverview,
  QueueInput,
  ScheduledTask,
  TaskInput,
} from "./jobs"
import { t } from "./schema"
import { DirectoryListing, IdInput, UserRole } from "./schemas"
import { ThemeAccents } from "./theme"
import {
  AdminTranscodingSettings,
  TranscodingSettingsInput,
} from "./transcoding"
import { AdminTrickplaySettings, TrickplaySettings } from "./trickplay"

export const adminContract = oc.tag("Admin").router({
  /** List directories on the server, for picking library folders. */
  browse: get("/admin/browse")
    .input(t.object({ path: t.string().optional() }))
    .output(DirectoryListing),
  /** The accent of the default Matinee theme for everyone on the server. */
  appearance: {
    get: get("/admin/appearance").output(ThemeAccents),
    update: put("/admin/appearance").input(ThemeAccents).output(ThemeAccents),
  },
  auth: {
    get: get("/admin/auth").output(AdminAuthSettings),
    /** Save the OIDC provider. Applies to the next sign-in, no restart. */
    updateOidc: put("/admin/auth/oidc")
      .input(OidcSettingsInput)
      .output(AdminAuthSettings),
  },
  /**
   * Background work: the job queues and the scheduled tasks that fill
   * them. Changes apply at once, without a restart.
   */
  jobs: {
    get: get("/admin/jobs").output(JobsOverview),
    /** Start no more jobs from the queue. Running ones finish. */
    pause: post("/admin/jobs/{queue}/pause")
      .input(QueueInput)
      .output(JobQueueStatus),
    resume: post("/admin/jobs/{queue}/resume")
      .input(QueueInput)
      .output(JobQueueStatus),
    /** Drop the waiting jobs. The tasks that queued them find them again. */
    clear: post("/admin/jobs/{queue}/clear")
      .input(QueueInput)
      .output(JobQueueStatus),
    /**
     * How many jobs each queue runs at once. Applies now and is saved for
     * the next start. Fails for a queue that can't be changed or a number
     * past its maximum.
     */
    updateConcurrency: put("/admin/jobs/concurrency")
      .input(ConcurrencyInput)
      .output(JobsOverview),
    /** Start the task now, unless it's running. */
    runTask: post("/admin/tasks/{task}/run")
      .input(TaskInput)
      .output(ScheduledTask),
    /** Stop the task's run, and the jobs it queued that haven't finished. */
    cancelTask: post("/admin/tasks/{task}/cancel")
      .input(TaskInput)
      .output(ScheduledTask),
  },
  /**
   * How the server transcodes video. Saving applies to the next transcode
   * without a restart; new devices are detected before the answer.
   */
  transcoding: {
    get: get("/admin/transcoding").output(AdminTranscodingSettings),
    update: put("/admin/transcoding")
      .input(TranscodingSettingsInput)
      .output(AdminTranscodingSettings),
    /** Detect ffmpeg and the GPUs again, after a driver or ffmpeg update. */
    detect: post("/admin/transcoding/detect").output(AdminTranscodingSettings),
  },
  /**
   * The seek bar's preview images. Saving applies at once. Files whose
   * images don't match new settings get new ones in the background, and
   * show the old ones until then.
   */
  trickplay: {
    get: get("/admin/trickplay").output(AdminTrickplaySettings),
    update: put("/admin/trickplay")
      .input(TrickplaySettings)
      .output(AdminTrickplaySettings),
  },
  /**
   * Accounts. People make their own, with a passkey while open registration
   * is on or through the OIDC provider while it allows sign-up. The server
   * keeps at least one admin who can sign in, so demoting or deleting the
   * last one fails.
   */
  users: {
    /** Everyone, oldest account first. */
    list: get("/admin/users").output(t.array(AdminUser)),
    /** Takes effect on the user's next request. */
    setRole: put("/admin/users/{id}/role")
      .input(t.object({ id: t.uuid(), role: UserRole }))
      .output(AdminUser),
    /** Delete the account with its sessions, passkeys, and progress. */
    remove: del("/admin/users/{id}").input(IdInput).output(t.void()),
    /** End the user's sessions. Yours keeps the one making the call. */
    signOut: post("/admin/users/{id}/sign-out")
      .input(IdInput)
      .output(t.object({ ended: t.number().int() })),
  },
})
