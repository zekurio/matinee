import { groupPermissions } from "../access/groups"
import { createInvite, listInvites, revokeInvite } from "../auth/invites"
import { log } from "../log"
import {
  authed,
  forbidden,
  notFound,
  requireOwn,
  requirePasskeys,
} from "./base"

export const adminInvites = {
  list: authed.admin.invites.list.handler(() => listInvites()),

  create: authed.admin.invites.create.handler(async ({ context, input }) => {
    await requirePasskeys()
    // The link puts whoever uses it in these groups, with what they grant.
    requireOwn(context.user, await groupPermissions(input.groupIds))
    const created = await createInvite(context.user.id, input)
    if (!created) throw forbidden("invite.create")
    log.info(`${context.user.username} created invite ${created.id}`)
    return created
  }),

  revoke: authed.admin.invites.revoke.handler(async ({ context, input }) => {
    if (!(await revokeInvite(input.id))) {
      throw notFound("That invite no longer exists. Reload the list.")
    }
    log.info(`${context.user.username} revoked invite ${input.id}`)
  }),
}
