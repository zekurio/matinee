import type { MediaItem, Party, PartyPlayback } from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"

import { itemLabel } from "./media"
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

/** The viewer's party, and how far the server's clock is ahead of ours. */
export function useParty() {
  const asked = useQuery(orpc.party.get.queryOptions())
  const member = asked.data != null
  const live = useQuery(liveParty(member))
  // The stream's state is the newer one, and null from it means the
  // party is over.
  const latest = member && live.data !== undefined ? live : asked
  const party: Party | null = (member && latest.data) || null
  return {
    party,
    // The state is as old as its trip here, which this counts as none.
    offsetMs: party ? party.now.getTime() - latest.dataUpdatedAt : 0,
  }
}

export type PartyRole = "owner" | "member"

function roleOf(party: Party | null): PartyRole | "none" {
  if (!party) return "none"
  return party.owner ? "owner" : "member"
}

/**
 * Whether the viewer is in a party, and as what. For the many places
 * that only offer a party action: it changes when the role does, not
 * each time the party moves.
 */
export function usePartyRole(): PartyRole | null {
  const asked = useQuery({
    ...orpc.party.get.queryOptions(),
    select: roleOf,
  })
  const member = asked.data !== undefined && asked.data !== "none"
  const live = useQuery({ ...liveParty(member), select: roleOf })
  const role = member ? (live.data ?? asked.data) : "none"
  return role === "none" ? null : role
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
