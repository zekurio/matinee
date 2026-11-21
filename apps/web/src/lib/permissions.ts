import {
  holdsPermission,
  type Permission,
  sortPermissions,
  type User,
} from "@matinee/contracts"

/*
 * What the signed-in account may do, for showing only what it can use.
 * The server decides each call again; this only keeps a screen from
 * offering what would be refused.
 */

/** Whether the account holds `permission`, from its groups or as an admin. */
export function can(
  user: Pick<User, "permissions">,
  permission: Permission,
): boolean {
  return holdsPermission(user.permissions, permission)
}

/** Whether the account holds any of `permissions`. */
export function canAny(
  user: Pick<User, "permissions">,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => can(user, permission))
}

/**
 * Whether the account runs the request queue: reading everyone's
 * requests and answering them. The queue's screen is all answers, so it
 * takes both.
 */
export function runsQueue(user: Pick<User, "permissions">): boolean {
  return can(user, "adminRequest.read") && can(user, "adminRequest.update")
}

/** `permissions` with `changed` all held or all gone, in the contract's order. */
export function withPermissions(
  permissions: readonly Permission[],
  changed: readonly Permission[],
  on: boolean,
): Permission[] {
  return sortPermissions(
    on
      ? [...permissions, ...changed]
      : permissions.filter((permission) => !changed.includes(permission)),
  )
}

/**
 * Asking for titles as one choice, the way a form offers it: not at all,
 * with an approval, or added right away. It stands for `request.create`
 * and `request.autoApprove`.
 */
export type RequestsChoice = "off" | "ask" | "add"
export const REQUESTS_CHOICES: readonly RequestsChoice[] = ["off", "ask", "add"]

/** The two permissions a request choice stands for. */
export const REQUEST_PERMISSIONS: readonly Permission[] = [
  "request.create",
  "request.autoApprove",
]

/** The permissions the access forms give a control of their own. */
export const POLICY_PERMISSIONS: readonly Permission[] = [
  "media.download",
  "request.create",
  "request.autoApprove",
]

export function requestsOf(permissions: readonly Permission[]): RequestsChoice {
  if (!holdsPermission(permissions, "request.create")) return "off"
  return holdsPermission(permissions, "request.autoApprove") ? "add" : "ask"
}

export function withRequests(
  permissions: readonly Permission[],
  choice: RequestsChoice,
): Permission[] {
  return withPermissions(
    withPermissions(permissions, ["request.create"], choice !== "off"),
    ["request.autoApprove"],
    choice === "add",
  )
}
