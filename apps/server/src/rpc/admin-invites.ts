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
    // Judged with the maker's access as the transaction reads it, and the
    // request's credential, so a token still grants only what it holds.
    const created = await createInvite(
      context.user.id,
      input,
      (access, granted) => requireOwn({ ...context.user, access }, granted),
    )
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
