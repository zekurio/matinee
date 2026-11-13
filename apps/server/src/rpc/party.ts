import type { Party } from "@matinee/contracts"
import { mediaItem } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { itemFor } from "../access/visible"
import { db } from "../db"
import {
  acceptInParty,
  addToParty,
  attend,
  controlParty,
  createParty,
  joinParty,
  kickFromParty,
  leaveParty,
  moveInParty,
  type PartyRefusal,
  partyById,
  type PartyState,
  partyOfUser,
  playInParty,
  removeFromParty,
  renameParty,
  sweepParties,
  takeNext,
  transferParty,
} from "../party/state"
import { partyInvite, partyView } from "../party/view"
import { follow } from "../realtime/follow"
import { authed, badRequest, notFound } from "./base"

// Every stream sends the party again this often, for the players' clocks
// and so members who went away drop out.
const PARTY_REFRESH_MS = 20_000

function refusal(reason: PartyRefusal): ORPCError<string, unknown> {
  switch (reason) {
    case "none":
      return notFound("This watch party is over.")
    case "not-owner":
      return new ORPCError("FORBIDDEN", {
        message: "Only the party's owner can do this.",
      })
    case "removed":
      return new ORPCError("FORBIDDEN", {
        message: "You were removed from this watch party.",
      })
    case "not-member":
      return notFound("That person isn't in the party anymore.")
    case "self":
      return badRequest("Pick someone other than yourself.")
    case "full":
      return badRequest("This watch party is full.")
    case "queue-full":
      return badRequest("The party's queue is full.")
    case "not-ended":
      return new ORPCError("FORBIDDEN", {
        message: "Only the party's owner can skip to the next one.",
      })
    case "no-entry":
      return notFound("That's no longer in the party's queue.")
  }
}

function settle(result: PartyRefusal | null): void {
  if (result) throw refusal(result)
}

function partyOf(viewer: Viewer): PartyState {
  const party = partyOfUser(viewer.id)
  if (!party) throw badRequest("You aren't in a watch party.")
  return party
}

function owned(viewer: Viewer): PartyState {
  const party = partyOf(viewer)
  if (party.ownerId !== viewer.id) throw refusal("not-owner")
  return party
}

/** The viewer's party as they see it, after members who went away left. */
async function viewOf(viewer: Viewer): Promise<Party | null> {
  sweepParties()
  const state = partyOfUser(viewer.id)
  return state ? partyView(viewer, state) : null
}

export const party = {
  get: authed.party.get.handler(({ context }) => viewOf(context.user)),

  follow: authed.party.follow.handler(async function* ({ context, signal }) {
    const release = attend(context.user.id)
    try {
      yield* follow({
        topics: ["party"],
        load: () => viewOf(context.user),
        signal,
        refreshMs: PARTY_REFRESH_MS,
        // A pause has to reach the others at once.
        settleMs: 0,
      })
    } finally {
      release()
    }
  }),

  create: authed.party.create.handler(({ context, input }) =>
    partyView(context.user, createParty(context.user.id, input.name || null)),
  ),

  invite: authed.party.invite.handler(async ({ context, input }) => {
    const found = partyById(input.partyId)
    // Someone the owner removed learns nothing more about it.
    const invite =
      found && !found.removed.has(context.user.id)
        ? await partyInvite(context.user, found)
        : null
    if (!invite) throw refusal("none")
    return invite
  }),

  join: authed.party.join.handler(async ({ context, input }) => {
    const joined = joinParty(context.user.id, input.partyId)
    if ("refused" in joined) throw refusal(joined.refused)
    return partyView(context.user, joined.party)
  }),

  leave: authed.party.leave.handler(({ context }) => {
    leaveParty(context.user.id)
  }),

  rename: authed.party.rename.handler(({ context, input }) => {
    const current = partyOf(context.user)
    settle(renameParty(current, context.user.id, input.name || null))
  }),

  transfer: authed.party.transfer.handler(({ context, input }) => {
    const current = partyOf(context.user)
    settle(transferParty(current, context.user.id, input.userId))
  }),

  kick: authed.party.kick.handler(({ context, input }) => {
    const current = partyOf(context.user)
    settle(kickFromParty(current, context.user.id, input.userId))
  }),

  play: authed.party.play.handler(async ({ context, input }) => {
    const current = owned(context.user)
    const item = await itemFor(context.user, input.itemId)
    if (!item) throw notFound("This title isn't in any library.")
    playInParty(current, context.user.id, item, input.positionSeconds ?? 0)
  }),

  control: authed.party.control.handler(async ({ context, input }) => {
    const current = partyOf(context.user)
    // Only someone who may watch the file moves it for the others.
    const item = await itemFor(context.user, input.itemId)
    if (!item) throw notFound("This title isn't in any library.")
    controlParty(current, context.user.id, input)
  }),

  next: authed.party.next.handler(async ({ context, input }) => {
    const current = partyOf(context.user)
    // A queued file that is gone by now is skipped.
    for (;;) {
      const next = takeNext(current, context.user.id, input.itemId)
      if ("refused" in next) throw refusal(next.refused)
      if (!next.entry) return
      // ACCESS: The owner queued this file, which `queue.add` checked they
      // may open. Only its id and length are read, and each member's view
      // filters the file by their own libraries.
      const [row] = await db
        .select()
        .from(mediaItem)
        .where(eq(mediaItem.id, next.entry.itemId))
      if (!row) continue
      playInParty(current, context.user.id, row, 0)
      return
    }
  }),

  queue: {
    add: authed.party.queue.add.handler(async ({ context, input }) => {
      const current = partyOf(context.user)
      const item = await itemFor(context.user, input.itemId)
      if (!item) throw notFound("This title isn't in any library.")
      settle(addToParty(current, context.user.id, item.id))
    }),

    accept: authed.party.queue.accept.handler(async ({ context, input }) => {
      const current = owned(context.user)
      const proposal = current.proposals.find(
        (entry) => entry.id === input.entryId,
      )
      // The owner queues only what they may open themselves.
      if (proposal && !(await itemFor(context.user, proposal.itemId))) {
        throw notFound("This title isn't in any library.")
      }
      settle(acceptInParty(current, context.user.id, input.entryId))
    }),

    remove: authed.party.queue.remove.handler(({ context, input }) => {
      const current = partyOf(context.user)
      settle(removeFromParty(current, context.user.id, input.entryId))
    }),

    move: authed.party.queue.move.handler(({ context, input }) => {
      const current = partyOf(context.user)
      settle(moveInParty(current, context.user.id, input.entryId, input.index))
    }),
  },
}
