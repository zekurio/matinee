import { t } from "./schema"
import { MediaItem, ProfileUser } from "./schemas"

/*
 * A watch party: accounts on the server that watch the same file at the
 * same point. Everyone in it plays, pauses, and seeks for all. Only its
 * owner picks what plays and sets the queue; the others propose files,
 * which the owner takes into the queue or turns down. The owner also
 * names the party, removes members, and hands it to another. An account
 * is in one party at a time. The server keeps parties in memory, so a restart
 * ends them.
 */

/** The most accounts in one party. */
export const PARTY_MAX_MEMBERS = 50
/** The most files in a party's queue, and as many proposals beside it. */
export const PARTY_MAX_QUEUE = 100

/**
 * What the owner calls a party, shown to its members and on its invite.
 * An empty name clears it.
 */
export const PartyName = t.string().trim().max(64, "Use at most 64 characters.")

/**
 * Where a party is in its file. While `playing`, the position now is
 * `positionSeconds` plus the time since `at`; paused, it stays
 * `positionSeconds`. `at` is the server's clock, so a player sets it
 * against `Party.now`, not its own.
 */
export const PartyPlayback = t.object({
  playing: t.boolean(),
  positionSeconds: t.number().min(0),
  at: t.date(),
  /** The member who last played, paused, or moved it. Null once they left. */
  by: t.uuid().nullable(),
})
export type PartyPlayback = t.infer<typeof PartyPlayback>

export const PartyMember = t.object({
  user: ProfileUser,
  owner: t.boolean(),
})
export type PartyMember = t.infer<typeof PartyMember>

/** A file in a party's queue, or one a member proposed for it. */
export const PartyEntry = t.object({
  id: t.uuid(),
  item: MediaItem,
  /** Who queued or proposed it. Null once they left the party. */
  by: ProfileUser.nullable(),
  /** The viewer may take it out: the owner any, a member their proposal. */
  removable: t.boolean(),
})
export type PartyEntry = t.infer<typeof PartyEntry>

/** A party as one of its members sees it. */
export const Party = t.object({
  /** Also what another account joins it with. */
  id: t.uuid(),
  /** Null until the owner names it, and a client words it itself. */
  name: t.string().nullable(),
  /** The viewer owns it. */
  owner: t.boolean(),
  /** The owner first, then in the order they joined. */
  members: t.array(PartyMember),
  /** The file the party watches. Null before the owner played one. */
  item: MediaItem.nullable(),
  /**
   * The party watches a file in a library the viewer may not open, so
   * `item` and `playback` are null.
   */
  restricted: t.boolean(),
  playback: PartyPlayback.nullable(),
  /** What plays next, first to last. Without files the viewer may not open. */
  queue: t.array(PartyEntry),
  /** What members asked the owner to queue, oldest first. */
  proposals: t.array(PartyEntry),
  /** The server's clock when it sent this, to read `playback.at` against. */
  now: t.date(),
})
export type Party = t.infer<typeof Party>

/**
 * What someone with a party's id sees of it before they join: enough to
 * know whose it is.
 */
export const PartyInvite = t.object({
  id: t.uuid(),
  name: t.string().nullable(),
  owner: ProfileUser,
  /** How many are in it. */
  members: t.number().int(),
  /** The viewer is in it already. */
  joined: t.boolean(),
})
export type PartyInvite = t.infer<typeof PartyInvite>
