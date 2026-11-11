import {
  createGroup,
  GroupError,
  listGroups,
  providerGroups,
  removeGroup,
  updateGroup,
} from "../access/groups"
import { log } from "../log"
import { admin, badRequest, notFound } from "./base"

const GROUP_GONE = "That group no longer exists. Reload the list."

function groupFailure(cause: unknown): never {
  if (cause instanceof GroupError) throw badRequest(cause.message)
  throw cause
}

export const adminGroups = {
  list: admin.admin.groups.list.handler(() => listGroups()),

  create: admin.admin.groups.create.handler(async ({ context, input }) => {
    const created = await createGroup(input).catch(groupFailure)
    log.info(`${context.user.username} created the group ${created.name}`)
    return created
  }),

  update: admin.admin.groups.update.handler(async ({ context, input }) => {
    const { id, ...group } = input
    const updated = await updateGroup(id, group).catch(groupFailure)
    if (!updated) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} changed the group ${updated.name}`)
    return updated
  }),

  remove: admin.admin.groups.remove.handler(async ({ context, input }) => {
    const removed = await removeGroup(input.id).catch(groupFailure)
    if (!removed) throw notFound(GROUP_GONE)
    log.info(`${context.user.username} deleted the group ${input.id}`)
  }),

  providerGroups: admin.admin.groups.providerGroups.handler(() =>
    providerGroups(),
  ),
}
