import {
  type AccessGroup,
  type AccessGroupInput,
  AccessOverride,
  type AccessPolicy,
  type AccessSource,
  type ProviderGroup,
  type UserAccess,
  type UserRole,
} from "@matinee/contracts"
import {
  accessGroup,
  accessGroupLibrary,
  accessGroupMember,
  type AccessGroupRow,
  inviteGroup,
  library,
  oidcAccount,
  user,
} from "@matinee/db"
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm"

import type { Tx } from "../auth/users"
import { db } from "../db"
import {
  type Access,
  EVERYTHING,
  mostGenerous,
  toAccess,
  withOverride,
} from "./policy"

/*
 * Access groups and who is in them. Every request for a library, a title,
 * or a file asks what its account may open, so the groups and memberships
 * are read once and kept, a few rows on any server. Everything that
 * changes them goes through this module and ends with `forgetGroups`.
 */

type Group = { row: AccessGroupRow; policy: AccessPolicy }
type Membership = { groupId: string; source: AccessSource }

type Snapshot = {
  groups: ReadonlyMap<string, Group>
  /** Null only if the row the migration made is gone. */
  everyone: Group | null
  /** By user id. An account in a group twice has both rows here. */
  members: ReadonlyMap<string, readonly Membership[]>
}

let snapshot: Promise<Snapshot> | null = null

function load(): Promise<Snapshot> {
  if (snapshot) return snapshot
  const loading = read()
  snapshot = loading
  loading.catch(() => {
    // The next request reads again.
    if (snapshot === loading) snapshot = null
  })
  return loading
}

/**
 * Read groups and memberships again on the next request. Call it once a
 * change to them has committed.
 */
export function forgetGroups(): void {
  snapshot = null
}

async function read(): Promise<Snapshot> {
  const [rows, libraries, memberships] = await Promise.all([
    db.select().from(accessGroup),
    db.select().from(accessGroupLibrary),
    db.select().from(accessGroupMember),
  ])
  const groups = new Map<string, Group>()
  for (const row of rows) {
    groups.set(row.id, {
      row,
      policy: {
        libraries: {
          all: row.allLibraries,
          ids: row.allLibraries
            ? []
            : libraries
                .filter((entry) => entry.groupId === row.id)
                .map((entry) => entry.libraryId),
        },
        maxBitrate: row.maxBitrate,
        transcode: row.transcode,
        downloads: row.downloads,
        maxStreams: row.maxStreams,
      },
    })
  }
  const members = new Map<string, Membership[]>()
  for (const { userId, groupId, source } of memberships) {
    const list = members.get(userId) ?? []
    list.push({ groupId, source })
    members.set(userId, list)
  }
  return {
    groups,
    everyone: [...groups.values()].find((group) => group.row.everyone) ?? null,
    members,
  }
}

/** An account, as far as its access goes. */
type Account = {
  id: string
  role: UserRole
  accessOverride: AccessOverride | null
}

function overrideOf(account: Account): AccessOverride {
  return AccessOverride.safeParse(account.accessOverride).data ?? {}
}

function policyOf(account: Account, state: Snapshot): AccessPolicy {
  if (account.role === "admin") return EVERYTHING
  const own = (state.members.get(account.id) ?? []).flatMap(
    (membership) => state.groups.get(membership.groupId) ?? [],
  )
  const groups = state.everyone ? [state.everyone, ...own] : own
  return withOverride(
    mostGenerous(groups.map((group) => group.policy)),
    overrideOf(account),
  )
}

/** What the account may open and how the server streams to it. */
export async function accessOf(account: Account): Promise<Access> {
  return toAccess(policyOf(account, await load()))
}

/** Each account's access as the admin's user list shows it, by user id. */
export async function describeAccess(
  accounts: readonly (Account & { accessOverrideSource: AccessSource })[],
): Promise<Map<string, UserAccess>> {
  const state = await load()
  const described = new Map<string, UserAccess>()
  for (const account of accounts) {
    const groups = (state.members.get(account.id) ?? [])
      .flatMap((membership) => {
        const group = state.groups.get(membership.groupId)
        return group
          ? [
              {
                id: group.row.id,
                name: group.row.name,
                source: membership.source,
              },
            ]
          : []
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    described.set(account.id, {
      groups,
      override: overrideOf(account),
      overrideSource: account.accessOverrideSource,
      effective: policyOf(account, state),
    })
  }
  return described
}

async function toGroups(
  groups: readonly Group[],
  state: Snapshot,
): Promise<AccessGroup[]> {
  const [everyone] = await db.select({ n: count() }).from(user)
  const members = new Map<string, Set<string>>()
  for (const [userId, memberships] of state.members) {
    for (const { groupId } of memberships) {
      const set = members.get(groupId) ?? new Set()
      set.add(userId)
      members.set(groupId, set)
    }
  }
  return groups.map(({ row, policy }) => ({
    id: row.id,
    name: row.name,
    everyone: row.everyone,
    providerGroup: row.providerGroup,
    policy,
    members: row.everyone
      ? (everyone?.n ?? 0)
      : (members.get(row.id)?.size ?? 0),
    createdAt: row.createdAt,
  }))
}

/** The built-in group first, then by name. */
export async function listGroups(): Promise<AccessGroup[]> {
  const state = await load()
  const groups = [...state.groups.values()].sort(
    (a, b) =>
      Number(b.row.everyone) - Number(a.row.everyone) ||
      a.row.name.localeCompare(b.row.name),
  )
  return toGroups(groups, state)
}

async function groupById(id: string): Promise<AccessGroup | null> {
  const state = await load()
  const group = state.groups.get(id)
  if (!group) return null
  const [described] = await toGroups([group], state)
  return described ?? null
}

/** Why a group can't be saved or removed, for the admin to act on. */
export class GroupError extends Error {}

const NAME_TAKEN = "Another group has that name."

async function nameTaken(tx: Tx, name: string, except?: string) {
  const [row] = await tx
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(
      and(
        sql`lower(${accessGroup.name}) = lower(${name})`,
        except ? ne(accessGroup.id, except) : undefined,
      ),
    )
    .limit(1)
  return row !== undefined
}

/** The policy's columns, and its libraries in their table. */
async function writePolicy(tx: Tx, groupId: string, policy: AccessPolicy) {
  await tx
    .delete(accessGroupLibrary)
    .where(eq(accessGroupLibrary.groupId, groupId))
  if (policy.libraries.all || policy.libraries.ids.length === 0) return
  // A library deleted since the form loaded drops out.
  const existing = await tx
    .select({ id: library.id })
    .from(library)
    .where(inArray(library.id, policy.libraries.ids))
  if (existing.length === 0) return
  await tx
    .insert(accessGroupLibrary)
    .values(existing.map((row) => ({ groupId, libraryId: row.id })))
}

/**
 * Fill a group from the provider group it follows, with the linked
 * accounts whose last claims had them in it, so a new or renamed mapping
 * holds its members before they next sign in. Without one, nobody the
 * provider put there stays.
 */
async function followProviderGroup(
  tx: Tx,
  groupId: string,
  providerGroup: string | null,
) {
  await tx
    .delete(accessGroupMember)
    .where(
      and(
        eq(accessGroupMember.groupId, groupId),
        eq(accessGroupMember.source, "provider"),
      ),
    )
  if (!providerGroup) return
  const accounts = await tx
    .select({ userId: oidcAccount.userId })
    .from(oidcAccount)
    .where(
      sql`exists (select 1 from unnest(${oidcAccount.groups}) as held(name) where lower(trim(held.name)) = ${providerGroup.trim().toLowerCase()})`,
    )
  if (accounts.length === 0) return
  await tx.insert(accessGroupMember).values(
    accounts.map(({ userId }) => ({
      groupId,
      userId,
      source: "provider" as const,
    })),
  )
}

function policyColumns(policy: AccessPolicy) {
  return {
    allLibraries: policy.libraries.all,
    maxBitrate: policy.maxBitrate,
    transcode: policy.transcode,
    downloads: policy.downloads,
    maxStreams: policy.maxStreams,
  }
}

export async function createGroup(
  input: AccessGroupInput,
): Promise<AccessGroup> {
  const id = await db.transaction(async (tx) => {
    if (await nameTaken(tx, input.name)) throw new GroupError(NAME_TAKEN)
    const [row] = await tx
      .insert(accessGroup)
      .values({
        name: input.name,
        providerGroup: input.providerGroup || null,
        ...policyColumns(input.policy),
      })
      .returning({ id: accessGroup.id })
    if (!row) throw new Error("Could not create the group.")
    await writePolicy(tx, row.id, input.policy)
    await followProviderGroup(tx, row.id, input.providerGroup || null)
    return row.id
  })
  forgetGroups()
  const created = await groupById(id)
  if (!created) throw new Error("Could not load the group.")
  return created
}

/**
 * Save a group. The built-in one keeps its name and follows no provider
 * group. Null when the group is gone.
 */
export async function updateGroup(
  id: string,
  input: AccessGroupInput,
): Promise<AccessGroup | null> {
  const found = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ everyone: accessGroup.everyone })
      .from(accessGroup)
      .where(eq(accessGroup.id, id))
      .for("update")
    if (!current) return false
    if (!current.everyone && (await nameTaken(tx, input.name, id))) {
      throw new GroupError(NAME_TAKEN)
    }
    // The built-in group keeps its name and follows no provider group.
    const named = current.everyone
      ? null
      : { name: input.name, providerGroup: input.providerGroup || null }
    await tx
      .update(accessGroup)
      .set({ ...named, ...policyColumns(input.policy), updatedAt: new Date() })
      .where(eq(accessGroup.id, id))
    await writePolicy(tx, id, input.policy)
    if (!current.everyone) {
      await followProviderGroup(tx, id, input.providerGroup || null)
    }
    return true
  })
  forgetGroups()
  return found ? groupById(id) : null
}

/** False when the group is gone already. */
export async function removeGroup(id: string): Promise<boolean> {
  const [current] = await db
    .select({ everyone: accessGroup.everyone })
    .from(accessGroup)
    .where(eq(accessGroup.id, id))
  if (!current) return false
  if (current.everyone) {
    throw new GroupError(
      "Every account is in this group, so it can't be deleted. Take its libraries away instead.",
    )
  }
  await db.delete(accessGroup).where(eq(accessGroup.id, id))
  forgetGroups()
  return true
}

/**
 * Put the account in exactly `groupIds` as far as `source` goes. Rows from
 * the other source stay. Ids of groups that are gone, and the built-in
 * group's, are skipped. The caller calls `forgetGroups` once its
 * transaction has committed.
 */
export async function setMemberships(
  tx: Tx,
  userId: string,
  source: AccessSource,
  groupIds: readonly string[],
): Promise<void> {
  await tx
    .delete(accessGroupMember)
    .where(
      and(
        eq(accessGroupMember.userId, userId),
        eq(accessGroupMember.source, source),
      ),
    )
  if (groupIds.length === 0) return
  const existing = await tx
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(
      and(
        inArray(accessGroup.id, [...new Set(groupIds)]),
        eq(accessGroup.everyone, false),
      ),
    )
  if (existing.length === 0) return
  await tx
    .insert(accessGroupMember)
    .values(existing.map((row) => ({ groupId: row.id, userId, source })))
}

/**
 * The groups that follow one of the provider's group `names`, for
 * `setMemberships` with the `provider` source. Names compare without
 * regard to case.
 */
export async function groupsFollowing(
  names: readonly string[],
): Promise<string[]> {
  const wanted = new Set(names.map((name) => name.trim().toLowerCase()))
  const state = await load()
  return [...state.groups.values()]
    .filter(
      (group) =>
        group.row.providerGroup !== null &&
        wanted.has(group.row.providerGroup.trim().toLowerCase()),
    )
    .map((group) => group.row.id)
}

/** The groups an invite's account starts in. Read it before the invite is used up. */
export async function inviteGroupIds(
  tx: Tx,
  inviteId: string,
): Promise<string[]> {
  const rows = await tx
    .select({ groupId: inviteGroup.groupId })
    .from(inviteGroup)
    .where(eq(inviteGroup.inviteId, inviteId))
  return rows.map((row) => row.groupId)
}

/** The group names the provider sent for linked accounts, most accounts first. */
export async function providerGroups(): Promise<ProviderGroup[]> {
  const held = db
    .select({ name: sql<string>`unnest(${oidcAccount.groups})`.as("name") })
    .from(oidcAccount)
    .as("held")
  const accounts = count()
  return db
    .select({ name: held.name, accounts })
    .from(held)
    .groupBy(held.name)
    .orderBy(desc(accounts), asc(held.name))
}
