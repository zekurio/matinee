import type {
  Party,
  PartyEntry,
  PartyHealth,
  PartyInvite,
  PartyMemberHealth,
} from "@matinee/contracts"
import { mediaItem, user } from "@matinee/db"
import { and, eq, inArray } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleItems } from "../access/visible"
import { profileUser } from "../auth/session"
import { db } from "../db"
import { publicItems } from "../media/items"
import { type PartyEntryState, type PartyState, statusOf } from "./state"

/**
 * A party as the viewer sees it: its files as theirs, with their own
 * progress, and without the ones in libraries they may not open.
 */
export async function partyView(
  viewer: Viewer,
  party: PartyState,
): Promise<Party> {
  const itemIds = [
    ...new Set([
      ...(party.itemId ? [party.itemId] : []),
      ...party.queue.map((entry) => entry.itemId),
      ...party.proposals.map((entry) => entry.itemId),
    ]),
  ]
  const [rows, people] = await Promise.all([
    itemIds.length > 0
      ? db
          .select()
          .from(mediaItem)
          .where(and(visibleItems(viewer), inArray(mediaItem.id, itemIds)))
      : [],
    db.select().from(user).where(inArray(user.id, party.members)),
  ])
  const items = new Map(
    (await publicItems(rows, viewer.id)).map((item) => [item.id, item]),
  )
  const users = new Map(people.map((row) => [row.id, profileUser(row)]))
  const owner = party.ownerId === viewer.id

  const entries = (list: PartyEntryState[]): PartyEntry[] =>
    list.flatMap((entry) => {
      const item = items.get(entry.itemId)
      if (!item) return []
      return [
        {
          id: entry.id,
          item,
          by: users.get(entry.by) ?? null,
          removable: owner || entry.by === viewer.id,
        },
      ]
    })

  const item = party.itemId ? (items.get(party.itemId) ?? null) : null
  const { playback } = party
  return {
    id: party.id,
    name: party.name,
    owner,
    members: [
      party.ownerId,
      ...party.members.filter((id) => id !== party.ownerId),
    ].flatMap((id) => {
      const member = users.get(id)
      return member ? [{ user: member, owner: id === party.ownerId }] : []
    }),
    item,
    restricted: party.itemId !== null && item === null,
    playback:
      item && playback
        ? {
            playing: playback.playing,
            positionSeconds: playback.positionSeconds,
            at: new Date(playback.at),
            by: users.has(playback.by) ? playback.by : null,
          }
        : null,
    queue: entries(party.queue),
    // A proposal is the proposer's to take back, not every member's.
    proposals: entries(party.proposals),
    waitingFor: [...party.waitingFor].filter((id) => users.has(id)),
    now: new Date(),
  }
}

/**
 * How each member keeps up, owner first as in `partyView`. Only the
 * party's own state, so a stream of it can load often.
 */
export function partyHealth(party: PartyState): PartyHealth {
  const now = Date.now()
  const ids = [
    party.ownerId,
    ...party.members.filter((id) => id !== party.ownerId),
  ]
  return {
    members: ids.map((userId): PartyMemberHealth => {
      const status = statusOf(party, userId, now)
      const remote = party.remote.has(userId)
      const waitedFor = party.waitingFor.has(userId)
      if (!status) {
        return {
          userId,
          state: "away",
          driftSeconds: null,
          bufferedSeconds: null,
          method: null,
          quality: null,
          remote,
          waitedFor,
        }
      }
      return {
        userId,
        state: status.state,
        driftSeconds: status.driftSeconds,
        bufferedSeconds: status.bufferedSeconds,
        method: status.method,
        quality: status.quality,
        remote,
        waitedFor,
      }
    }),
  }
}

/**
 * What an invite shows of a party. Null when its owner's account is
 * gone, which a sweep settles soon after.
 */
export async function partyInvite(
  viewer: Viewer,
  party: PartyState,
): Promise<PartyInvite | null> {
  const [owner] = await db.select().from(user).where(eq(user.id, party.ownerId))
  if (!owner) return null
  return {
    id: party.id,
    name: party.name,
    owner: profileUser(owner),
    members: party.members.length,
    joined: party.members.includes(viewer.id),
  }
}
