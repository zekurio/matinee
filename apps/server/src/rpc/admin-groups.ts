import type { Permission } from "@matinee/contracts"

import {
  createGroup,
  groupById,
  GroupError,
  listGroups,
  providerGroups,
  removeGroup,
  updateGroup,
} from "../access/groups"
import { grantable } from "../access/policy"
import { log } from "../log"
import { authed, badRequest, notFound, requireOwn } from "./base"

const GROUP_GONE = "That group no longer exists. Reload the list."

function groupFailure(cause: unknown): never {
  if (cause instanceof GroupError) throw badRequest(cause.message)
  throw cause
}

/** What is in one list and not the other. */
function changed(
  before: readonly Permission[],
  after: readonly Permission[],
): Permission[] {
  return [
    ...before.filter((permission) => !after.includes(permission)),
    ...after.filter((permission) => !before.includes(permission)),
  ]
}

// Whoever saves a group holds every permission they add to it or take
// from it, see `requireOwn`. Its libraries and limits are theirs to set
// with `group.update` alone.
export const adminGroups = {
  list: authed.admin.groups.list.handler(() => listGroups()),

  create: authed.admin.groups.create.handler(async ({ context, input }) => {
    requireOwn(context.user, grantable(input.policy.permissions))
    const created = await createGroup(input).catch(groupFailure)
    log.info(`${context.user.username} created the group ${created.name}`)
    return created
  }),

  update: authed.admin.groups.update.handler(async ({ context, input }) => {
    const { id, ...group } = input
    const before = await groupById(id)
    if (!before) throw notFound(GROUP_GONE)
    requireOwn(
      context.user,
      changed(before.policy.permissions, grantable(group.policy.permissions)),
    )
    const updated = await updateGroup(id, group).catch(groupFailure)
    if (!updated) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} changed the group ${updated.name}`)
    return updated
  }),

  remove: authed.admin.groups.remove.handler(async ({ context, input }) => {
    const before = await groupById(input.id)
    if (!before) throw notFound(GROUP_GONE)
    requireOwn(context.user, before.policy.permissions)
    const removed = await removeGroup(input.id).catch(groupFailure)
    if (!removed) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} deleted the group ${input.id}`)
  }),

  providerGroups: authed.admin.groups.providerGroups.handler(() =>
    providerGroups(),
  ),
}
