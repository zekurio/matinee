import { eventIterator, oc } from "@orpc/contract"

import { del, get, post, put } from "./contract-routes"
import { Party, PartyInvite, PartyName } from "./party"
import { t } from "./schema"

export const partyContract = oc.tag("Watch party").router({
  /** The party the viewer is in. Null while they're in none. */
  get: get("/party").output(Party.nullable()),
  /**
   * The viewer's party as a stream: the current state first, then again
   * on each change, and every little while for its clock. Null once
   * they're in none. A member with no stream open for a minute has left,
   * so a client keeps one open for as long as it's in a party.
   */
  follow: get("/party/live").output(eventIterator(Party.nullable())),
  /**
   * Start a party the viewer owns, leaving any they were in. It watches
   * nothing until the owner calls `play`.
   */
  create: post("/party")
    .input(t.object({ name: PartyName.optional() }))
    .output(Party),
  /**
   * What an invite leads to, for asking before joining. Not found for a
   * party that is over, and for one the viewer was removed from.
   */
  invite: get("/parties/{partyId}")
    .input(t.object({ partyId: t.uuid() }))
    .output(PartyInvite),
  /**
   * Join the party with this id, leaving any other. Someone the owner
   * removed can't join it again.
   */
  join: post("/parties/{partyId}/join")
    .input(t.object({ partyId: t.uuid() }))
    .output(Party),
  /**
   * Leave the viewer's party. The member who joined after the owner
   * owns it once the owner leaves, and it ends with its last member.
   */
  leave: post("/party/leave").output(t.void()),
  /** Name the party, or clear its name with an empty one. Only the owner. */
  rename: put("/party/name")
    .input(t.object({ name: PartyName }))
    .output(t.void()),
  /**
   * Hand the party to another member, who owns it from then on. Only the
   * owner, who stays in it as a member.
   */
  transfer: put("/party/owner")
    .input(t.object({ userId: t.uuid() }))
    .output(t.void()),
  /**
   * Remove a member, who can't join this party again. Their proposals go
   * with them. Only the owner.
   */
  kick: del("/party/members/{userId}")
    .input(t.object({ userId: t.uuid() }))
    .output(t.void()),
  /**
   * Have the party watch a file, from `positionSeconds` or its start.
   * Only the owner. A file from the queue leaves the queue.
   */
  play: put("/party/item")
    .input(
      t.object({
        itemId: t.uuid(),
        positionSeconds: t.number().min(0).optional(),
      }),
    )
    .output(t.void()),
  /**
   * Play, pause, or move the party's file, for every member. A player
   * calls it when its viewer does one of these, not when it follows the
   * party. `itemId` is the file the player has, so a call that arrives
   * after the party moved on does nothing.
   */
  control: put("/party/playback")
    .input(
      t.object({
        itemId: t.uuid(),
        playing: t.boolean(),
        positionSeconds: t.number().min(0),
      }),
    )
    .output(t.void()),
  /**
   * Go on to the first file in the queue. The owner at any time. Any
   * member once the file is at its end, which is how a player moves the
   * party on when the file ends. Without a queue the party pauses at the
   * end. `itemId` is the file the player has, as in `control`.
   */
  next: post("/party/next")
    .input(t.object({ itemId: t.uuid() }))
    .output(t.void()),
  queue: {
    /**
     * From the owner, the file goes to the end of the queue. From anyone
     * else it becomes a proposal. A file already in either stays once.
     */
    add: post("/party/queue")
      .input(t.object({ itemId: t.uuid() }))
      .output(t.void()),
    /** Take a proposal into the queue, at its end. Only the owner. */
    accept: post("/party/queue/{entryId}/accept")
      .input(t.object({ entryId: t.uuid() }))
      .output(t.void()),
    /**
     * Take an entry out: the owner any from the queue or the proposals,
     * a member a proposal of their own.
     */
    remove: del("/party/queue/{entryId}")
      .input(t.object({ entryId: t.uuid() }))
      .output(t.void()),
    /** Move a queued file to `index`, 0 for next. Only the owner. */
    move: put("/party/queue/{entryId}")
      .input(t.object({ entryId: t.uuid(), index: t.number().int().min(0) }))
      .output(t.void()),
  },
})
