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
 * requests and answering them, which takes approving or declining. A
 * token that only retries failed sends reads the queue but doesn't run
 * it.
 */
export function runsQueue(user: Pick<User, "permissions">): boolean {
  return (
    can(user, "adminRequest.read") &&
    (can(user, "adminRequest.approve") || can(user, "adminRequest.decline"))
  )
}

/** What the account may do with a request in the queue. */
export type QueueActions = {
  approve: boolean
  decline: boolean
  retry: boolean
  /** Taking one out of the queue, which approving or declining allows. */
  remove: boolean
}

export function queueActions(user: Pick<User, "permissions">): QueueActions {
  const approve = can(user, "adminRequest.approve")
  const decline = can(user, "adminRequest.decline")
  return {
    approve,
    decline,
    retry: can(user, "adminRequest.retry"),
    remove: approve || decline,
  }
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

/** Whether the account holds every one of `permissions`. */
export function canAll(
  user: Pick<User, "permissions">,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => can(user, permission))
}
