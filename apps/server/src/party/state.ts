import { randomUUID } from "node:crypto"

import {
  MIN_BITRATE_LIMIT,
  PARTY_MAX_MEMBERS,
  PARTY_MAX_QUEUE,
} from "@matinee/contracts"

import { events } from "../realtime/events"

/*
 * Watch parties, kept in memory: the server is one process, and a party
 * is over when it restarts anyway, since its members' streams end. What
 * a member sees of one, with the files and people loaded, is
 * `partyView` in `view.ts`.
 *
 * A member is there while they follow the party: `attend` counts their
 * open streams, and one with none for `AWAY_MS` has left. Streams end
 * and open again every few minutes, and a page reload or a short loss of
 * the network takes a moment, which is what the wait is for. Nothing
 * runs on a timer. Every stream loads again each `PARTY_REFRESH_MS`, and
 * each load sweeps.
 */

/** A member with no stream open this long has left. */
const AWAY_MS = 60_000
/** A member may move the party on once its file is this close to the end. */
const END_SLACK_S = 15

export type PartyEntryState = { id: string; itemId: string; by: string }

export type PartyState = {
  id: string
  name: string | null
  ownerId: string
  /** User ids in the order they joined. */
  members: string[]
  itemId: string | null
  /** The file's length, when the server knows it. */
  durationSeconds: number | null
  playback: {
    playing: boolean
    positionSeconds: number
    /** Milliseconds, as `Date.now()`. */
    at: number
    by: string
  } | null
  queue: PartyEntryState[]
  proposals: PartyEntryState[]
  /** Accounts the owner removed, which can't join again. */
  removed: Set<string>
  /** Members whose last request came from outside the local networks. */
  remote: Set<string>
}

/** Why a change to a party didn't happen. */
export type PartyRefusal =
  | "none"
  | "not-owner"
  | "removed"
  | "not-member"
  | "self"
  | "full"
  | "queue-full"
  | "not-ended"
  | "no-entry"

const parties = new Map<string, PartyState>()
/** The party each account is in. */
const partyOf = new Map<string, string>()
/** Open `party.follow` streams by account. */
const streams = new Map<string, number>()
/** When an account's last stream closed, or when it joined. */
const seenAt = new Map<string, number>()

function changed(): void {
  events.publish("party", undefined)
}

export function partyOfUser(userId: string): PartyState | null {
  const id = partyOf.get(userId)
  return (id && parties.get(id)) || null
}

function remove(party: PartyState, userId: string): void {
  party.members = party.members.filter((id) => id !== userId)
  party.remote.delete(userId)
  partyOf.delete(userId)
  seenAt.delete(userId)
  const next = party.members[0]
  if (next === undefined) {
    parties.delete(party.id)
    return
  }
  if (party.ownerId === userId) party.ownerId = next
}

/** Takes out the members who went away. */
export function sweepParties(now = Date.now()): void {
  let any = false
  // Removing replaces `members` and may delete the party, which both
  // loops take.
  for (const party of parties.values()) {
    for (const userId of party.members) {
      if ((streams.get(userId) ?? 0) > 0) continue
      if (now - (seenAt.get(userId) ?? 0) < AWAY_MS) continue
      remove(party, userId)
      any = true
    }
  }
  if (any) changed()
}

/**
 * Counts a stream the account opened, until the function it returns is
 * called. Someone who comes back after being away too long has left
 * before this counts them in again.
 */
export function attend(userId: string): () => void {
  sweepParties()
  streams.set(userId, (streams.get(userId) ?? 0) + 1)
  let open = true
  return () => {
    if (!open) return
    open = false
    const left = (streams.get(userId) ?? 1) - 1
    if (left > 0) streams.set(userId, left)
    else streams.delete(userId)
    if (partyOf.has(userId)) seenAt.set(userId, Date.now())
  }
}

export function leaveParty(userId: string): void {
  const party = partyOfUser(userId)
  if (!party) return
  remove(party, userId)
  changed()
}

export function partyById(partyId: string): PartyState | null {
  sweepParties()
  return parties.get(partyId) ?? null
}

export function createParty(userId: string, name: string | null): PartyState {
  leaveParty(userId)
  const party: PartyState = {
    id: randomUUID(),
    name,
    ownerId: userId,
    members: [userId],
    itemId: null,
    durationSeconds: null,
    playback: null,
    queue: [],
    proposals: [],
    removed: new Set(),
    remote: new Set(),
  }
  parties.set(party.id, party)
  partyOf.set(userId, party.id)
  seenAt.set(userId, Date.now())
  changed()
  return party
}

export function joinParty(
  userId: string,
  partyId: string,
): { party: PartyState } | { refused: PartyRefusal } {
  sweepParties()
  const party = parties.get(partyId)
  if (!party) return { refused: "none" }
  if (party.members.includes(userId)) return { party }
  if (party.removed.has(userId)) return { refused: "removed" }
  if (party.members.length >= PARTY_MAX_MEMBERS) return { refused: "full" }
  leaveParty(userId)
  party.members.push(userId)
  partyOf.set(userId, party.id)
  seenAt.set(userId, Date.now())
  changed()
  return { party }
}

export function renameParty(
  party: PartyState,
  userId: string,
  name: string | null,
): PartyRefusal | null {
  if (party.ownerId !== userId) return "not-owner"
  party.name = name
  changed()
  return null
}

/** The owner's choices about another member start here. */
function otherMember(
  party: PartyState,
  userId: string,
  otherId: string,
): PartyRefusal | null {
  if (party.ownerId !== userId) return "not-owner"
  if (otherId === userId) return "self"
  return party.members.includes(otherId) ? null : "not-member"
}

export function transferParty(
  party: PartyState,
  userId: string,
  toId: string,
): PartyRefusal | null {
  const refused = otherMember(party, userId, toId)
  if (refused) return refused
  party.ownerId = toId
  changed()
  return null
}

export function kickFromParty(
  party: PartyState,
  userId: string,
  otherId: string,
): PartyRefusal | null {
  const refused = otherMember(party, userId, otherId)
  if (refused) return refused
  remove(party, otherId)
  party.removed.add(otherId)
  party.proposals = party.proposals.filter((entry) => entry.by !== otherId)
  changed()
  return null
}

/**
 * The bit rate limit a party puts on one member's request, or null for
 * none: a remote member's equal share of the upload among the party's
 * remote members. Local members use none of it and get no limit. Each
 * request also says where its member is now, which is how the party
 * knows. The share holds for streams that start from here on; one that
 * plays already keeps its rate until its player asks again.
 */
export function partyShare(
  userId: string,
  remote: boolean,
  uploadBitrate: number | null,
): number | null {
  const party = partyOfUser(userId)
  if (!party) return null
  if (remote) party.remote.add(userId)
  else party.remote.delete(userId)
  if (!remote || uploadBitrate === null) return null
  return Math.max(
    MIN_BITRATE_LIMIT,
    Math.floor(uploadBitrate / party.remote.size),
  )
}

/** Where the party is in its file now. */
export function partyPosition(party: PartyState, now = Date.now()): number {
  const { playback, durationSeconds } = party
  if (!playback) return 0
  const position = playback.playing
    ? playback.positionSeconds + (now - playback.at) / 1000
    : playback.positionSeconds
  return durationSeconds === null
    ? position
    : Math.min(position, durationSeconds)
}

/** Has the party watch a file, which leaves the queue if it was in it. */
export function playInParty(
  party: PartyState,
  userId: string,
  item: { id: string; durationSeconds: number | null },
  positionSeconds: number,
): void {
  party.itemId = item.id
  party.durationSeconds = item.durationSeconds
  party.playback = {
    playing: true,
    positionSeconds,
    at: Date.now(),
    by: userId,
  }
  party.queue = party.queue.filter((entry) => entry.itemId !== item.id)
  party.proposals = party.proposals.filter((entry) => entry.itemId !== item.id)
  changed()
}

export function controlParty(
  party: PartyState,
  userId: string,
  change: { itemId: string; playing: boolean; positionSeconds: number },
): void {
  // The party moved on while the call was on its way.
  if (party.itemId !== change.itemId) return
  const length = party.durationSeconds
  party.playback = {
    playing: change.playing,
    positionSeconds:
      length === null
        ? change.positionSeconds
        : Math.min(change.positionSeconds, length),
    at: Date.now(),
    by: userId,
  }
  changed()
}

/** What `takeNext` found for a party to go on to. */
export type PartyNext =
  /** The first entry, taken off the queue. */
  | { entry: PartyEntryState }
  /** The party left that file already, or the queue is empty and it rests. */
  | { entry: null }
  | { refused: PartyRefusal }

/** The entry the party goes on to from `itemId`. */
export function takeNext(
  party: PartyState,
  userId: string,
  itemId: string,
): PartyNext {
  if (party.itemId !== itemId) return { entry: null }
  if (party.ownerId !== userId) {
    const length = party.durationSeconds
    if (length !== null && partyPosition(party) < length - END_SLACK_S) {
      return { refused: "not-ended" }
    }
  }
  const entry = party.queue.shift()
  if (entry) return { entry }
  if (party.playback?.playing) {
    party.playback = {
      playing: false,
      positionSeconds: partyPosition(party),
      at: Date.now(),
      by: userId,
    }
    changed()
  }
  return { entry: null }
}

export function addToParty(
  party: PartyState,
  userId: string,
  itemId: string,
): PartyRefusal | null {
  const known = (entry: PartyEntryState) => entry.itemId === itemId
  if (party.queue.some(known)) return null
  const entry = { id: randomUUID(), itemId, by: userId }
  if (party.ownerId === userId) {
    if (party.queue.length >= PARTY_MAX_QUEUE) return "queue-full"
    // The owner queues what someone proposed, which settles the proposal.
    party.proposals = party.proposals.filter((other) => !known(other))
    party.queue.push(entry)
  } else {
    if (party.proposals.some(known)) return null
    if (party.proposals.length >= PARTY_MAX_QUEUE) return "queue-full"
    party.proposals.push(entry)
  }
  changed()
  return null
}

export function acceptInParty(
  party: PartyState,
  userId: string,
  entryId: string,
): PartyRefusal | null {
  if (party.ownerId !== userId) return "not-owner"
  const entry = party.proposals.find((other) => other.id === entryId)
  if (!entry) return "no-entry"
  if (party.queue.length >= PARTY_MAX_QUEUE) return "queue-full"
  party.proposals = party.proposals.filter((other) => other !== entry)
  party.queue.push(entry)
  changed()
  return null
}

export function removeFromParty(
  party: PartyState,
  userId: string,
  entryId: string,
): PartyRefusal | null {
  const owner = party.ownerId === userId
  const proposal = party.proposals.find((other) => other.id === entryId)
  if (proposal) {
    if (!owner && proposal.by !== userId) return "not-owner"
    party.proposals = party.proposals.filter((other) => other !== proposal)
    changed()
    return null
  }
  if (!party.queue.some((other) => other.id === entryId)) return null
  if (!owner) return "not-owner"
  party.queue = party.queue.filter((other) => other.id !== entryId)
  changed()
  return null
}

export function moveInParty(
  party: PartyState,
  userId: string,
  entryId: string,
  index: number,
): PartyRefusal | null {
  if (party.ownerId !== userId) return "not-owner"
  const entry = party.queue.find((other) => other.id === entryId)
  if (!entry) return "no-entry"
  const rest = party.queue.filter((other) => other !== entry)
  rest.splice(Math.min(index, rest.length), 0, entry)
  party.queue = rest
  changed()
  return null
}
