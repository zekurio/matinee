import { type Permission, permissionsOf } from "@matinee/contracts"

import {
  createGroup,
  GroupError,
  listGroups,
  providerGroups,
  removeGroup,
  updateGroup,
} from "../access/groups"
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

// Whoever saves a group holds every permission its capabilities add or
// take away, see `requireOwn`. Following another provider group swaps the
// members the provider picks, which moves everything the group grants.
// Its libraries and limits are theirs to set with `group.update` alone.
export const adminGroups = {
  list: authed.admin.groups.list.handler(() => listGroups()),

  create: authed.admin.groups.create.handler(async ({ context, input }) => {
    requireOwn(context.user, permissionsOf(input.policy))
    const created = await createGroup(input).catch(groupFailure)
    log.info(`${context.user.username} created the group ${created.name}`)
    return created
  }),

  update: authed.admin.groups.update.handler(async ({ context, input }) => {
    const { id, ...group } = input
    const granted = permissionsOf(group.policy)
    const updated = await updateGroup(id, group, (before) => {
      const remapped =
        !before.everyone &&
        before.providerGroup !== (group.providerGroup || null)
      requireOwn(
        context.user,
        remapped
          ? [...before.permissions, ...granted]
          : changed(before.permissions, granted),
      )
    }).catch(groupFailure)
    if (!updated) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} changed the group ${updated.name}`)
    return updated
  }),

  remove: authed.admin.groups.remove.handler(async ({ context, input }) => {
    const removed = await removeGroup(input.id, (before) =>
      requireOwn(context.user, before.permissions),
    ).catch(groupFailure)
    if (!removed) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} deleted the group ${input.id}`)
  }),

  providerGroups: authed.admin.groups.providerGroups.handler(() =>
    providerGroups(),
  ),
}
