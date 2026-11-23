import { eventIterator, oc } from "@orpc/contract"

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
  InviteOptions,
  UserRole,
} from "./schemas"
import { AdminTranscodingSettings, TranscodingSettings } from "./transcoding"
import { AdminTrickplaySettings, TrickplaySettings } from "./trickplay"

export const adminContract = oc.tag("Admin").router({
  /** List directories on the server, for picking library folders. */
  browse: get("/admin/browse", "folder.read")
    .input(t.object({ path: t.string().optional() }))
    .output(DirectoryListing),
  /**
   * How the server looks to everyone on it: the accent of the default
   * Matinee theme, and the login backdrop.
   */
  branding: {
    get: get("/admin/branding", "branding.read").output(Branding),
    update: put("/admin/branding", "branding.update")
      .input(Branding)
      .output(Branding),
    /**
     * Artwork the login backdrop would show with `artwork`, whether or not
     * it's on, for previewing it before saving.
     */
    preview: get("/admin/branding/login-backdrop", "branding.read")
      .input(t.object({ artwork: LoginBackdropArtwork }))
      .output(LoginBackdropTiles),
  },
  /** First-run setup, after the admin account exists. */
  setup: {
    /** Finish setup. Admins land on Home instead of the setup steps. */
    complete: post("/admin/setup/complete", "serverSetup.update").output(
      t.void(),
    ),
  },
  auth: {
    get: get("/admin/auth", "authSettings.read").output(AdminAuthSettings),
    /**
     * Save passkeys and the OIDC provider. Applies to the next sign-in, no
     * restart. Fails when it would leave no way in, or leave you unable to
     * sign in. The provider and its role claim say who signs in as an
     * admin, so only an admin saves them.
     */
    update: put("/admin/auth", "all")
      .input(AuthSettingsInput)
      .output(AdminAuthSettings),
  },
  /**
   * Background work: the job queues and the scheduled tasks that fill
   * them. Changes apply at once, without a restart.
   */
  jobs: {
    /**
     * The queues and the tasks, as a stream: how they stand first, then
     * again whenever a job or a run changes them. Over REST it's
     * server-sent events. The server ends the stream every few minutes;
     * reconnect to keep following.
     */
    live: get("/admin/jobs/live", "job.read").output(
      eventIterator(JobsOverview),
    ),
    /** Start no more jobs from the queue. Running ones finish. */
    pause: post("/admin/jobs/{queue}/pause", "job.update")
      .input(QueueInput)
      .output(JobQueueStatus),
    resume: post("/admin/jobs/{queue}/resume", "job.update")
      .input(QueueInput)
      .output(JobQueueStatus),
    /** Drop the waiting jobs. The tasks that queued them find them again. */
    clear: post("/admin/jobs/{queue}/clear", "job.update")
      .input(QueueInput)
      .output(JobQueueStatus),
    /**
     * How many jobs each queue runs at once. Applies now and is saved for
     * the next start. Fails for a queue that can't be changed or a number
     * past its maximum.
     */
    updateConcurrency: put("/admin/jobs/concurrency", "job.update")
      .input(ConcurrencyInput)
      .output(JobsOverview),
    /** Start the task now, unless it's running. */
    runTask: post("/admin/tasks/{task}/run", "job.update")
      .input(TaskInput)
      .output(ScheduledTask),
    /** Stop the task's run, and the jobs it queued that haven't finished. */
    cancelTask: post("/admin/tasks/{task}/cancel", "job.update")
      .input(TaskInput)
      .output(ScheduledTask),
  },
  /**
   * How the server transcodes video. Saving applies to the next transcode
   * without a restart; new devices are detected before the answer.
   */
  transcoding: {
    get: get("/admin/transcoding", "transcodingSettings.read").output(
      AdminTranscodingSettings,
    ),
    update: put("/admin/transcoding", "transcodingSettings.update")
      .input(TranscodingSettings)
      .output(AdminTranscodingSettings),
    /** Detect ffmpeg and the GPUs again, after a driver or ffmpeg update. */
    detect: post(
      "/admin/transcoding/detect",
      "transcodingSettings.update",
    ).output(AdminTranscodingSettings),
  },
  /**
   * The seek bar's preview images. Saving applies at once. Files whose
   * images don't match new settings get new ones in the background, and
   * show the old ones until then.
   */
  trickplay: {
    get: get("/admin/trickplay", "trickplaySettings.read").output(
      AdminTrickplaySettings,
    ),
    update: put("/admin/trickplay", "trickplaySettings.update")
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
    get: get("/admin/network", "networkSettings.read").output(
      AdminNetworkSettings,
    ),
    update: put("/admin/network", "networkSettings.update")
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
    list: get("/admin/users", "adminUser.read").output(t.array(AdminUser)),
    /** Takes effect on the user's next request. */
    setRole: put("/admin/users/{id}/role", "all")
      .input(t.object({ id: t.uuid(), role: UserRole }))
      .output(AdminUser),
    /**
     * Put the account in groups and set its override. Takes effect on the
     * user's next request. An override the provider's policy claim set
     * comes back at the account's next sign-in.
     */
    setAccess: put("/admin/users/{id}/access", "adminUser.update")
      .input(UserAccessInput)
      .output(AdminUser),
    /** Delete the account with its sessions, passkeys, and progress. */
    remove: del("/admin/users/{id}", "adminUser.delete")
      .input(IdInput)
      .output(t.void()),
    /** End the user's sessions. Yours keeps the one making the call. */
    signOut: post("/admin/users/{id}/sign-out", "adminSession.delete")
      .input(IdInput)
      .output(t.object({ ended: t.number().int() })),
    /** Revoke every API token the user made. Returns how many. */
    revokeApiTokens: post(
      "/admin/users/{id}/api-tokens/revoke",
      "adminApiToken.delete",
    )
      .input(IdInput)
      .output(t.object({ revoked: t.number().int() })),
  },
  /**
   * Access groups: which libraries an account opens and how the server
   * streams to it. See `access.ts`. Changes take effect on each member's
   * next request.
   */
  groups: {
    /** The built-in group first, then by name. */
    list: get("/admin/groups", "group.read").output(t.array(AccessGroup)),
    create: post("/admin/groups", "group.create")
      .input(AccessGroupInput)
      .output(AccessGroup),
    /** For the built-in group, only the policy changes. */
    update: put("/admin/groups/{id}", "group.update")
      .input(AccessGroupInput.extend({ id: t.uuid() }))
      .output(AccessGroup),
    /** Its members lose what only it allowed. Fails for the built-in group. */
    remove: del("/admin/groups/{id}", "group.delete")
      .input(IdInput)
      .output(t.void()),
    /**
     * The group names the provider sent for linked accounts at their last
     * sign-ins, most accounts first. Empty while no groups claim is set.
     */
    providerGroups: get("/admin/provider-groups", "group.read").output(
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
    list: get("/admin/invites", "invite.read").output(t.array(Invite)),
    /** Fails while passkeys are off, since nobody could use the link. */
    create: post("/admin/invites", "invite.create")
      .input(InviteInput)
      .output(CreatedInvite),
    /** What the form for a new link offers: how long it can work. */
    options: get("/admin/invites/options", "invite.create").output(
      InviteOptions,
    ),
    /** Stop a link from working. */
    revoke: del("/admin/invites/{id}", "invite.delete")
      .input(IdInput)
      .output(t.void()),
  },
})
