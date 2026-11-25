import type { MediaItem, Party, PartyPlayback } from "@matinee/contracts"
import { useQuery } from "@tanstack/solid-query"
import { createMemo } from "solid-js"

import { itemLabel } from "@/lib/media"

import { liveData, useLiveQuery } from "./live-query"
import { liveQuery, orpc, queryClient } from "./rpc"

/*
 * The watch party the account is in. Every page asks once whether there
 * is one, and only an account in a party keeps a stream open for it,
 * which the server takes as the member being there. A browser allows a
 * site a handful of connections, so a stream in every tab of everyone
 * would use them up.
 */

/** Follows the party once the account is known to be in one. */
function liveParty(member: boolean) {
  return {
    ...orpc.party.follow.experimental_liveOptions(),
    ...liveQuery,
    enabled: member,
  }
}

/**
 * Puts a party a call answered with, or null after leaving, where the
 * app reads it, in place of what the stream of another party left.
 */
export function setParty(party: Party | null): void {
  queryClient.removeQueries({ queryKey: orpc.party.follow.key() })
  queryClient.setQueryData(orpc.party.get.queryKey(), party)
}

/**
 * How far the server's clock is ahead of this one. Each state says the
 * server's time when it left, and arrived some way later, so each sample
 * is short by its trip. The quickest trip is the truest, so this takes
 * the largest of the recent samples, from both the call and the stream.
 * A few only, so a clock set anew here is followed soon. Samples are
 * keyed by when they arrived, so reading one again changes nothing.
 */
const OFFSET_SAMPLES = 6
const offsets = new Map<number, number>()

function serverOffset(serverNow: Date, receivedAt: number): number {
  if (!offsets.has(receivedAt)) {
    offsets.set(receivedAt, serverNow.getTime() - receivedAt)
    for (const key of offsets.keys()) {
      if (offsets.size <= OFFSET_SAMPLES) break
      offsets.delete(key)
    }
  }
  return Math.max(...offsets.values())
}

/** party and offsetMs are accessors for the viewer's party and server clock offset. */
export function useParty() {
  const asked = useQuery(() => orpc.party.get.queryOptions())
  const member = createMemo(() => readPartyData(asked) != null)
  const live = useLiveQuery(() => liveParty(member()))
  const streamed = () => (member() ? liveData(live()) : undefined)
  const party = () =>
    member() ? (streamed() ?? readPartyData(asked) ?? null) : null
  const offsetMs = createMemo(() => {
    const current = party()
    if (!current) return 0
    const at =
      streamed() !== undefined
        ? (live()?.dataUpdatedAt ?? 0)
        : asked.dataUpdatedAt
    return serverOffset(current.now, at)
  })
  return { party, offsetMs }
}

function readPartyData<Data>(query: {
  isSuccess: boolean
  isRefetchError: boolean
  data: Data
}): Data | undefined {
  return query.isSuccess || query.isRefetchError ? query.data : undefined
}

export type PartyRole = "owner" | "member"

function roleOf(party: Party | null): PartyRole | "none" {
  if (!party) return "none"
  return party.owner ? "owner" : "member"
}

/**
 * Whether the viewer is in a party, and as what. For the many places
 * that only offer a party action: it changes when the role does, not
 * each time the party moves. Returns an accessor, with null outside a party.
 */
export function usePartyRole() {
  const asked = useQuery(() => ({
    ...orpc.party.get.queryOptions(),
    select: roleOf,
  }))
  const member = createMemo(() => {
    const role = readPartyData(asked)
    return role !== undefined && role !== "none"
  })
  const live = useLiveQuery(() => ({ ...liveParty(member()), select: roleOf }))
  return createMemo<PartyRole | null>(() => {
    const role = member() ? (liveData(live()) ?? readPartyData(asked)) : "none"
    return role === "none" ? null : (role ?? null)
  })
}

/** Where a party is in its file now, in seconds. */
export function partyPosition(
  playback: PartyPlayback,
  offsetMs: number,
): number {
  if (!playback.playing) return playback.positionSeconds
  const elapsed = (Date.now() + offsetMs - playback.at.getTime()) / 1000
  return playback.positionSeconds + Math.max(0, elapsed)
}

/** A file's name in a party's lists: the show and episode, or the movie. */
export function partyItemName(item: MediaItem): string {
  const label = itemLabel(item)
  return label.code
    ? `${label.showName} · ${label.code} · ${label.title}`
    : label.title
}

/** The link another account joins the party with. */
export function partyInviteUrl(party: Party): string {
  return `${window.location.origin}/party/${party.id}`
}
