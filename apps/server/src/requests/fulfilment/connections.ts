import { readFileSync } from "node:fs"

import type {
  CatalogRef,
  FulfilmentLanding,
  FulfilmentValues,
} from "@matinee/contracts"
import {
  fulfilmentConnection,
  fulfilmentRule,
  libraryFolder,
  library,
} from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { asc, eq, isNotNull } from "drizzle-orm"

import { db } from "../../db"
import { sources } from "./sources"
import type { FulfilmentSource, TitleFacts } from "./types"

type ConnectionRow = typeof fulfilmentConnection.$inferSelect
type RuleRow = typeof fulfilmentRule.$inferSelect
type Library = typeof library.$inferSelect
type Kind = CatalogRef["kind"]
type Reader = Pick<typeof db, "select">

export function getSource(id: string) {
  const source = sources.get(id)
  if (!source)
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an available fulfilment source.",
    })
  return source
}

export function environmentKey(slug: string) {
  const name = `MATINEE_CONNECTION_${slug}_API_KEY`
  const value = process.env[name]
  const file = process.env[`${name}_FILE`]
  if (value && file)
    throw new ORPCError("BAD_REQUEST", {
      message: "Set the connection key or its file, not both.",
    })
  if (value) return value
  if (!file) return null
  try {
    return readFileSync(file, "utf8").trim() || null
  } catch {
    throw new ORPCError("BAD_REQUEST", {
      message:
        "Cannot read the connection key file. Check its path and permissions.",
    })
  }
}

export async function connectionById(id: string, tx: Reader = db) {
  const [row] = await tx
    .select()
    .from(fulfilmentConnection)
    .where(eq(fulfilmentConnection.id, id))
  if (!row)
    throw new ORPCError("NOT_FOUND", { message: "Connection not found." })
  return row
}

export function resolveConnection(row: ConnectionRow) {
  return {
    id: row.id,
    slug: row.slug,
    settings: getSource(row.source).settings.parse(row.settings),
    apiKey: row.apiKey ?? environmentKey(row.slug),
  }
}

/** The kinds of title a connection is the default for. */
export function defaultFor(row: ConnectionRow): Kind[] {
  return [
    ...(row.defaultMovies ? (["movie"] as const) : []),
    ...(row.defaultShows ? (["show"] as const) : []),
  ]
}

export function redactConnection(row: ConnectionRow, routing: Routing) {
  const source = getSource(row.source)
  const settings = source.settings.parse(row.settings)
  for (const field of source.fields())
    if (field.kind === "secret") delete settings[field.key]
  const environment = Boolean(environmentKey(row.slug))
  const secretSource: "saved" | "environment" | null = row.apiKey
    ? "saved"
    : environment
      ? "environment"
      : null
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    source: row.source,
    settings,
    options: row.options,
    defaultFor: defaultFor(row),
    folderLibraries: row.folderLibraries,
    apiKey: {
      source: secretSource,
      environment,
    },
    landings: routing.landings(row.id),
  }
}

/** A path as written, without the separators it may end in. */
export function bare(path: string) {
  return path.replace(/(?<=.)[/\\]+$/, "")
}

/** `folder` is `root`, or inside it. */
function inside(folder: string, root: string) {
  return (
    folder === root ||
    [`/`, `\\`].some((separator) =>
      folder.startsWith(root.endsWith(separator) ? root : root + separator),
    )
  )
}

const libraryKind = (kind: Kind): Library["kind"] =>
  kind === "movie" ? "movies" : "shows"

/**
 * Every library folder Matinee scans, longest first, of the libraries
 * that can take requests: those with a metadata provider.
 */
async function scannedFolders(tx: Reader = db) {
  // ACCESS: admin settings and internal routing, over every library.
  const rows = await tx
    .select({ path: libraryFolder.path, library })
    .from(libraryFolder)
    .innerJoin(library, eq(library.id, libraryFolder.libraryId))
    .where(isNotNull(library.metadataProvider))
  return rows
    .map((row) => ({ path: bare(row.path), library: row.library }))
    .toSorted((a, b) => b.path.length - a.path.length)
}
type Folders = Awaited<ReturnType<typeof scannedFolders>>

/**
 * The library of a kind a folder lands in: the one with that folder, or
 * the folder it is inside of, the deepest first. A download manager in a
 * container may see the folder under another path, so none can be found.
 */
function foundIn(folders: Folders, folder: string, kind: Kind) {
  const path = bare(folder)
  return (
    folders.find(
      (entry) =>
        entry.library.kind === libraryKind(kind) && inside(path, entry.path),
    )?.library ?? null
  )
}

/** Where a folder lands by the folders Matinee scans, for the settings. */
export async function landing(kind: Kind, folder: string) {
  const found = foundIn(await scannedFolders(), folder, kind)
  return { library: found ? { id: found.id, name: found.name } : null }
}

/** How many of a rule's conditions a title meets, or 0 when one fails. */
export function matchedConditions(
  rule: Pick<RuleRow, "users" | "genres" | "languages" | "keywords">,
  facts: TitleFacts,
  user: string | null,
) {
  const primary = (tag: string) => tag.split("-")[0]?.toLowerCase()
  const language = facts.language ? primary(facts.language) : null
  const conditions: [boolean, () => boolean][] = [
    [rule.users.length > 0, () => !!user && rule.users.includes(user)],
    [
      rule.genres.length > 0,
      () => rule.genres.some((genre) => facts.genres.includes(genre)),
    ],
    [
      rule.languages.length > 0,
      () => rule.languages.some((code) => primary(code) === language),
    ],
    [
      rule.keywords.length > 0,
      () =>
        rule.keywords.some((keyword) => facts.keywords.includes(keyword.id)),
    ],
  ]
  let matched = 0
  for (const [set, meets] of conditions) {
    if (!set) continue
    if (!meets()) return 0
    matched++
  }
  return matched
}

/** A connection, with its options and rules parsed by its source. */
type Entry = {
  row: ConnectionRow
  source: FulfilmentSource
  /** Null when they no longer parse, as after its server changed. */
  options: FulfilmentValues | null
  rules: { row: RuleRow; settings: FulfilmentValues }[]
}

/**
 * Where a request goes and what it is sent with: the connection, the
 * options from its settings, anime fields, and override rules, and the
 * library their folder lands in.
 */
export type Plan = {
  connection: ConnectionRow
  source: FulfilmentSource
  options: FulfilmentValues
  library: Library
}

function parsed<T>(parse: () => T): T | null {
  try {
    return parse()
  } catch {
    return null
  }
}

/**
 * Every connection with its rules, and the folders their settings send
 * to, read once, for working out where requests land.
 */
export class Routing {
  constructor(
    private readonly entries: Entry[],
    private readonly folders: Folders,
    private readonly libraries: Library[],
  ) {}

  /** The library a connection's folder lands in, found or picked. */
  landsIn(entry: Entry, folder: string | null, kind: Kind): Library | null {
    if (!folder) return null
    const found = foundIn(this.folders, folder, kind)
    if (found) return found
    const picked = entry.row.folderLibraries[bare(folder)]
    return (
      this.libraries.find(
        (row) => row.id === picked && row.kind === libraryKind(kind),
      ) ?? null
    )
  }

  /** What a title goes with through a connection, before any rule. */
  private sending(entry: Entry, kind: Kind, anime: boolean) {
    const { options } = entry
    return (
      options && parsed(() => entry.source.sending(options, { kind, anime }))
    )
  }

  /** What a title goes with through a connection: anime fields, then rules. */
  private resolved(entry: Entry, facts: TitleFacts, user: string | null) {
    const sending = this.sending(entry, facts.kind, facts.anime)
    if (!sending || !entry.source.override) return sending
    const matches = entry.rules
      .map((rule) => ({
        rule,
        count: matchedConditions(rule.row, facts, user),
      }))
      .filter((match) => match.count > 0)
    // The most conditions met wins, then the one listed first.
    const winner = matches.reduce<(typeof matches)[number] | null>(
      (best, match) => (!best || match.count > best.count ? match : best),
      null,
    )
    if (!winner) return sending
    return entry.source.override(
      sending,
      winner.rule.settings,
      matches.map((match) => match.rule.settings),
    )
  }

  private plan(
    entry: Entry,
    options: FulfilmentValues | null,
    kind: Kind,
  ): Plan | null {
    if (!options) return null
    const library = this.landsIn(
      entry,
      parsed(() => entry.source.folder(options)),
      kind,
    )
    return library
      ? { connection: entry.row, source: entry.source, options, library }
      : null
  }

  /** The connections that take a kind, the default first, then by name. */
  private fitting(kind: Kind) {
    const isDefault = (entry: Entry) =>
      kind === "movie" ? entry.row.defaultMovies : entry.row.defaultShows
    return this.entries
      .filter((entry) => entry.source.kinds.includes(kind))
      .toSorted(
        (a, b) =>
          Number(isDefault(b)) - Number(isDefault(a)) ||
          a.row.name.localeCompare(b.row.name),
      )
  }

  private defaultEntry(kind: Kind) {
    return this.entries.find(
      (entry) =>
        entry.source.kinds.includes(kind) &&
        (kind === "movie" ? entry.row.defaultMovies : entry.row.defaultShows),
    )
  }

  /**
   * Where a title goes when nobody chose: through the default connection
   * for its kind, with what its anime fields and rules make of it, into
   * the library that folder lands in. Null when there's no default, or
   * the folder lands in no library.
   */
  resolve(facts: TitleFacts, user: string | null): Plan | null {
    const entry = this.defaultEntry(facts.kind)
    return entry
      ? this.plan(entry, this.resolved(entry, facts, user), facts.kind)
      : null
  }

  /**
   * How a title goes to a chosen library: what it would be sent with, if
   * that lands there; else the first of a connection's settings that
   * land there, the default connection's first, its anime fields and
   * rules as they apply to the title before the others.
   */
  into(libraryId: string, facts: TitleFacts, user: string | null): Plan | null {
    for (const entry of this.fitting(facts.kind)) {
      const sendings = [this.resolved(entry, facts, user)]
      for (const anime of [facts.anime, !facts.anime]) {
        const base = this.sending(entry, facts.kind, anime)
        sendings.push(base)
        for (const rule of entry.rules)
          if (base && entry.source.override)
            sendings.push(
              entry.source.override(base, rule.settings, [rule.settings]),
            )
      }
      for (const options of sendings) {
        const plan = this.plan(entry, options, facts.kind)
        if (plan?.library.id === libraryId) return plan
      }
    }
    return null
  }

  /** Each folder a connection's settings and rules send to, by kind. */
  private folderList(entry: Entry) {
    const found: {
      kind: Kind
      from: FulfilmentLanding["from"]
      folder: string
    }[] = []
    const add = (
      kind: Kind,
      from: FulfilmentLanding["from"],
      folder: string | null,
    ) => {
      if (
        folder &&
        !found.some((entry) => entry.kind === kind && entry.folder === folder)
      )
        found.push({ kind, from, folder })
    }
    for (const kind of entry.source.kinds) {
      for (const anime of [false, true]) {
        const sending = this.sending(entry, kind, anime)
        add(
          kind,
          anime ? "anime" : "default",
          sending && parsed(() => entry.source.folder(sending)),
        )
      }
      for (const rule of entry.rules)
        add(kind, "rule", entry.source.ruleFolder?.(rule.settings) ?? null)
    }
    return found
  }

  /** Every folder a connection sends to, and the library it lands in. */
  landings(connectionId: string): FulfilmentLanding[] {
    const entry = this.entries.find((each) => each.row.id === connectionId)
    if (!entry) return []
    return this.folderList(entry).map((each) => {
      const library = this.landsIn(entry, each.folder, each.kind)
      return {
        ...each,
        library: library ? { id: library.id, name: library.name } : null,
      }
    })
  }

  /**
   * The libraries of a kind some connection's settings or rules land in,
   * each with the first connection that reaches it.
   */
  reached(kind: Kind): Map<string, string> {
    const found = new Map<string, string>()
    for (const entry of this.fitting(kind))
      for (const each of this.folderList(entry)) {
        if (each.kind !== kind) continue
        const library = this.landsIn(entry, each.folder, kind)
        if (library && !found.has(library.id))
          found.set(library.id, entry.row.name)
      }
    return found
  }

  /** The library a connection's options send a kind to, for the language to read in. */
  defaultLibrary(kind: Kind): Library | null {
    return (
      this.resolve(
        { kind, anime: false, genres: [], language: null, keywords: [] },
        null,
      )?.library ?? null
    )
  }
}

/** Reads every connection, rule, and library folder for routing. */
export async function loadRouting(tx: Reader = db): Promise<Routing> {
  const [connections, rules, folders, libraries] = await Promise.all([
    tx.select().from(fulfilmentConnection),
    tx
      .select()
      .from(fulfilmentRule)
      .orderBy(asc(fulfilmentRule.position), asc(fulfilmentRule.createdAt)),
    scannedFolders(tx),
    // ACCESS: routing reads every library a folder can be picked for;
    // callers filter what a viewer can see.
    tx.select().from(library).where(isNotNull(library.metadataProvider)),
  ])
  const entries = connections.flatMap((row): Entry[] => {
    const source = sources.get(row.source)
    if (!source) return []
    return [
      {
        row,
        source,
        options: parsed(() => source.parseOptions(row.options)),
        rules: rules.flatMap((rule) => {
          if (rule.connectionId !== row.id) return []
          const settings = parsed(
            () => source.parseRule?.(rule.settings) ?? rule.settings,
          )
          return settings ? [{ row: rule, settings }] : []
        }),
      },
    ]
  })
  return new Routing(entries, folders, libraries)
}

/**
 * Checks that every folder a connection's options or a rule sends to
 * lands in a library of its kind, found or picked, and that it has a
 * folder for each kind it's the default for. `routing` was loaded with
 * the connection as it would be saved.
 */
export function checkLandings(
  routing: Routing,
  connectionId: string,
  kinds: Kind[],
) {
  const landings = routing.landings(connectionId)
  const lost = landings.find((each) => !each.library)
  if (lost)
    throw new ORPCError("BAD_REQUEST", {
      message: `${lost.folder} isn't in any library Matinee scans for this kind of title. Choose the library it lands in, or save it to another folder.`,
    })
  for (const kind of kinds)
    if (!landings.some((each) => each.kind === kind && each.from === "default"))
      throw new ORPCError("BAD_REQUEST", {
        message:
          kind === "movie"
            ? "Choose the folder films are saved to."
            : "Choose the folder shows are saved to.",
      })
}

/** Internal dispatch entry point. Secrets must never leave the server. */
export async function sendingFor(row: {
  connectionId: string | null
  options: FulfilmentValues | null
}) {
  if (!row.connectionId || !row.options) return null
  try {
    const connection = await connectionById(row.connectionId)
    const source = getSource(connection.source)
    return { source, connection: resolveConnection(connection) }
  } catch {
    return null
  }
}
