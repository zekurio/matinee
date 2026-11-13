import { oc } from "@orpc/contract"

import {
  AccessGroup,
  AccessGroupInput,
  ProviderGroup,
  UserAccessInput,
} from "./access"
import { AdminAuthSettings, AdminUser, AuthSettingsInput } from "./admin"
import { Branding, LoginBackdropArtwork, LoginBackdropTiles } from "./branding"
import { del, get, post, put } from "./contract-routes"
import {
  ConcurrencyInput,
  JobQueueStatus,
  JobsOverview,
  QueueInput,
  ScheduledTask,
  TaskInput,
} from "./jobs"
import { AdminNetworkSettings, NetworkSettings } from "./network"
import { t } from "./schema"
import {
  CreatedInvite,
  DirectoryListing,
  IdInput,
  Invite,
  InviteInput,
  UserRole,
} from "./schemas"
import { AdminTranscodingSettings, TranscodingSettings } from "./transcoding"
import { AdminTrickplaySettings, TrickplaySettings } from "./trickplay"

export const adminContract = oc.tag("Admin").router({
  /** List directories on the server, for picking library folders. */
  browse: get("/admin/browse")
    .input(t.object({ path: t.string().optional() }))
    .output(DirectoryListing),
  /**
   * How the server looks to everyone on it: the accent of the default
   * Matinee theme, and the login backdrop.
   */
  branding: {
    get: get("/admin/branding").output(Branding),
    update: put("/admin/branding").input(Branding).output(Branding),
    /**
     * Artwork the login backdrop would show with `artwork`, whether or not
     * it's on, for previewing it before saving.
     */
    preview: get("/admin/branding/login-backdrop")
      .input(t.object({ artwork: LoginBackdropArtwork }))
      .output(LoginBackdropTiles),
  },
  /** First-run setup, after the admin account exists. */
  setup: {
    /** Finish setup. Admins land on Home instead of the setup steps. */
    complete: post("/admin/setup/complete").output(t.void()),
  },
  auth: {
    get: get("/admin/auth").output(AdminAuthSettings),
    /**
     * Save passkeys and the OIDC provider. Applies to the next sign-in, no
     * restart. Fails when it would leave no way in, or leave you unable to
     * sign in.
     */
    update: put("/admin/auth")
      .input(AuthSettingsInput)
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
      .input(TranscodingSettings)
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
   * Which addresses are local, which proxies to believe, and what the
   * connection sends. See `NetworkSettings`. Saving applies at once, to
   * the next request. `connection` is how the server sees the request
   * that asked, for checking the result.
   */
  network: {
    get: get("/admin/network").output(AdminNetworkSettings),
    update: put("/admin/network")
      .input(NetworkSettings)
      .output(AdminNetworkSettings),
  },
  /**
   * Accounts. People make their own: with a passkey while passkey sign-up
   * is open or they hold an invite, or through the OIDC provider while it
   * allows sign-up. The server keeps at least one admin who can sign in, so
   * demoting or deleting the last one fails.
   */
  users: {
    /** Everyone, oldest account first. */
    list: get("/admin/users").output(t.array(AdminUser)),
    /** Takes effect on the user's next request. */
    setRole: put("/admin/users/{id}/role")
      .input(t.object({ id: t.uuid(), role: UserRole }))
      .output(AdminUser),
    /**
     * Put the account in groups and set its override. Takes effect on the
     * user's next request. An override the provider's policy claim set
     * comes back at the account's next sign-in.
     */
    setAccess: put("/admin/users/{id}/access")
      .input(UserAccessInput)
      .output(AdminUser),
    /** Delete the account with its sessions, passkeys, and progress. */
    remove: del("/admin/users/{id}").input(IdInput).output(t.void()),
    /** End the user's sessions. Yours keeps the one making the call. */
    signOut: post("/admin/users/{id}/sign-out")
      .input(IdInput)
      .output(t.object({ ended: t.number().int() })),
  },
  /**
   * Access groups: which libraries an account opens and how the server
   * streams to it. See `access.ts`. Changes take effect on each member's
   * next request.
   */
  groups: {
    /** The built-in group first, then by name. */
    list: get("/admin/groups").output(t.array(AccessGroup)),
    create: post("/admin/groups").input(AccessGroupInput).output(AccessGroup),
    /** For the built-in group, only the policy changes. */
    update: put("/admin/groups/{id}")
      .input(AccessGroupInput.extend({ id: t.uuid() }))
      .output(AccessGroup),
    /** Its members lose what only it allowed. Fails for the built-in group. */
    remove: del("/admin/groups/{id}").input(IdInput).output(t.void()),
    /**
     * The group names the provider sent for linked accounts at their last
     * sign-ins, most accounts first. Empty while no groups claim is set.
     */
    providerGroups: get("/admin/provider-groups").output(
      t.array(ProviderGroup),
    ),
  },
  /**
   * Invite links, for letting one person in while passkey sign-up is
   * closed. An admin's links stop working when the admin is deleted or
   * loses the role.
   */
  invites: {
    /** The links that still work, newest first. */
    list: get("/admin/invites").output(t.array(Invite)),
    /** Fails while passkeys are off, since nobody could use the link. */
    create: post("/admin/invites").input(InviteInput).output(CreatedInvite),
    /** Stop a link from working. */
    revoke: del("/admin/invites/{id}").input(IdInput).output(t.void()),
  },
})
