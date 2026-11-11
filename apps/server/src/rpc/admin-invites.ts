import { createInvite, listInvites, revokeInvite } from "../auth/invites"
import { log } from "../log"
import { admin, forbidden, notFound, requirePasskeys } from "./base"

export const adminInvites = {
  list: admin.admin.invites.list.handler(() => listInvites()),

  create: admin.admin.invites.create.handler(async ({ context, input }) => {
    await requirePasskeys()
    const created = await createInvite(context.user.id, input)
    if (!created) throw forbidden()
    log.info(`${context.user.username} created invite ${created.id}`)
    return created
  }),

  revoke: admin.admin.invites.revoke.handler(async ({ context, input }) => {
    if (!(await revokeInvite(input.id))) {
      throw notFound("That invite no longer exists. Reload the list.")
    }
    log.info(`${context.user.username} revoked invite ${input.id}`)
  }),
}
