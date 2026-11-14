import { readFileSync } from "node:fs"

import type { FulfilmentValues } from "@matinee/contracts"
import {
  fulfilmentConnection,
  libraryFolder,
  libraryFulfilment,
  library,
} from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { asc, eq, isNotNull } from "drizzle-orm"

import { db } from "../../db"
import { sources } from "./sources"
import type { FulfilmentSource } from "./types"

export function getSource(id: string) {
  const source = sources.get(id)
  if (!source)
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose an available fulfilment source.",
    })
  return source
}

function environmentKey(slug: string) {
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

export async function connectionById(id: string) {
  const [row] = await db
    .select()
    .from(fulfilmentConnection)
    .where(eq(fulfilmentConnection.id, id))
  if (!row)
    throw new ORPCError("NOT_FOUND", { message: "Connection not found." })
  return row
}

export function resolveConnection(
  row: typeof fulfilmentConnection.$inferSelect,
) {
  return {
    id: row.id,
    slug: row.slug,
    settings: getSource(row.source).settings.parse(row.settings),
    apiKey: row.apiKey ?? environmentKey(row.slug),
  }
}

export function redactConnection(
  row: typeof fulfilmentConnection.$inferSelect,
) {
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
    apiKey: {
      source: secretSource,
      environment,
    },
  }
}

type Library = typeof library.$inferSelect

/** A path as written, without the separators it may end in. */
function bare(path: string) {
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

/**
 * Every library folder Matinee scans, longest first, of the libraries
 * that can take requests: those with a metadata provider.
 */
async function scannedFolders(tx: Pick<typeof db, "select"> = db) {
  // ACCESS: admin settings and internal dispatch, over every library.
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
function landsIn(
  folders: Folders,
  folder: string | null,
  kind: Library["kind"],
): Library | null {
  if (!folder) return null
  const path = bare(folder)
  return (
    folders.find(
      (entry) => entry.library.kind === kind && inside(path, entry.path),
    )?.library ?? null
  )
}

/** A source's folder for a set of options, or null when it names none. */
function folderOf(source: FulfilmentSource, options: FulfilmentValues) {
  try {
    return source.folder?.(source.parseOptions(options)) ?? null
  } catch {
    return null
  }
}

/** A library's saved mapping, with where its options for anime land. */
export type Mapping = {
  library: Library
  connection: typeof fulfilmentConnection.$inferSelect
  source: FulfilmentSource
  options: FulfilmentValues
  anime: {
    options: FulfilmentValues
    /** The library they land in, or null when neither found nor picked. */
    library: Library | null
    /** Its folder holds theirs; false for a pick. */
    found: boolean
  } | null
}

/** Every saved mapping whose source is still registered, by library name. */
export async function allMappings(
  tx: Pick<typeof db, "select"> = db,
): Promise<Mapping[]> {
  const [rows, folders, libraries] = await Promise.all([
    tx
      .select({
        mapping: libraryFulfilment,
        library,
        connection: fulfilmentConnection,
      })
      .from(libraryFulfilment)
      // ACCESS: admin settings and routing read every mapping; callers
      // filter the libraries a viewer can see.
      .innerJoin(library, eq(library.id, libraryFulfilment.libraryId))
      .innerJoin(
        fulfilmentConnection,
        eq(fulfilmentConnection.id, libraryFulfilment.connectionId),
      )
      .orderBy(asc(library.name), asc(library.id)),
    scannedFolders(tx),
    // ACCESS: as above, for an admin's pick of where anime lands.
    tx.select().from(library).where(isNotNull(library.metadataProvider)),
  ])
  return rows.flatMap((row) => {
    const source = sources.get(row.connection.source)
    if (!source) return []
    const saved = row.mapping.animeOptions
    let anime: Mapping["anime"] = null
    if (saved) {
      const found = landsIn(folders, folderOf(source, saved), row.library.kind)
      const picked = libraries.find(
        (entry) =>
          entry.id === row.mapping.animeLibraryId &&
          entry.kind === row.library.kind,
      )
      anime = {
        options: saved,
        library: found ?? picked ?? null,
        found: !!found,
      }
    }
    return [
      {
        library: row.library,
        connection: row.connection,
        source,
        options: row.mapping.options,
        anime,
      },
    ]
  })
}

const named = (entry: Library) => ({ id: entry.id, name: entry.name })

/** A library's mapping as the settings show it. */
export async function mappingForLibrary(libraryId: string) {
  const mappings = await allMappings()
  const own = mappings.find((entry) => entry.library.id === libraryId)
  return {
    libraryId,
    connectionId: own?.connection.id ?? null,
    options: own?.options ?? {},
    anime: own?.anime
      ? {
          options: own.anime.options,
          library: own.anime.library ? named(own.anime.library) : null,
          found: own.anime.found,
        }
      : null,
    animeFrom: mappings
      .filter(
        (entry) =>
          entry.library.id !== libraryId &&
          entry.anime?.library?.id === libraryId,
      )
      .map((entry) => named(entry.library)),
  }
}

/** Where a set of options saves, for a library's kind, before it's saved. */
export async function landing(
  libraryId: string,
  connectionId: string,
  options: FulfilmentValues,
) {
  // ACCESS: an admin procedure, over every library.
  const [destination] = await db
    .select()
    .from(library)
    .where(eq(library.id, libraryId))
  if (!destination)
    throw new ORPCError("NOT_FOUND", { message: "Library not found." })
  const source = getSource((await connectionById(connectionId)).source)
  const folder = folderOf(source, options)
  const found = landsIn(await scannedFolders(), folder, destination.kind)
  return { folder, library: found ? named(found) : null }
}

/** The options a source parses, or an error an admin can act on. */
function choices(
  source: FulfilmentSource,
  options: FulfilmentValues,
  message: string,
) {
  try {
    return source.parseOptions(options)
  } catch {
    throw new ORPCError("BAD_REQUEST", { message })
  }
}

export async function validateMapping(
  libraryId: string,
  connectionId: string,
  options: FulfilmentValues,
) {
  // ACCESS: called only by admin procedures or internal dispatch.
  const [destination] = await db
    .select()
    .from(library)
    .where(eq(library.id, libraryId))
  const row = await connectionById(connectionId)
  const source = getSource(row.source)
  if (
    !destination ||
    !destination.metadataProvider ||
    !source.kinds.includes(destination.kind === "movies" ? "movie" : "show")
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose a connection that supports this library.",
    })
  return {
    library: destination,
    source,
    connection: resolveConnection(row),
    options: choices(
      source,
      options,
      "Choose each of the connection's options for this library.",
    ),
  }
}

/**
 * The options anime is sent with for a library, checked: they parse, and
 * they land in a library of its kind, the one their folder is in or, when
 * no library's folder holds it, the one picked.
 */
export async function validateAnime(
  destination: Library,
  source: FulfilmentSource,
  anime: { options: FulfilmentValues; libraryId?: string | null },
) {
  const options = choices(
    source,
    anime.options,
    "Choose each of the options for anime, or leave them all empty.",
  )
  const folder = folderOf(source, options)
  const found = landsIn(await scannedFolders(), folder, destination.kind)
  if (found) return { options, libraryId: null }
  // ACCESS: an admin procedure, over every library.
  const [picked] = anime.libraryId
    ? await db.select().from(library).where(eq(library.id, anime.libraryId))
    : []
  if (picked?.kind === destination.kind && picked.metadataProvider)
    return { options, libraryId: picked.id }
  throw new ORPCError("BAD_REQUEST", {
    message: folder
      ? `${folder} isn't in any library Matinee scans for this kind of title. Choose the library anime lands in, or save it to another folder.`
      : "Choose the library anime lands in.",
  })
}

/**
 * The mapping a request is sent with: the one whose options for anime it
 * took, while those still land in its library; else its library's own;
 * else, for a library only anime reaches, the first mapping whose anime
 * lands there.
 */
export function sendingMapping(
  mappings: Mapping[],
  row: { libraryId: string; animeFrom: string | null },
): { mapping: Mapping; anime: boolean } | null {
  const lands = (entry: Mapping) => entry.anime?.library?.id === row.libraryId
  const via = mappings.find(
    (entry) => entry.library.id === row.animeFrom && lands(entry),
  )
  if (via) return { mapping: via, anime: true }
  const own = mappings.find((entry) => entry.library.id === row.libraryId)
  if (own) return { mapping: own, anime: false }
  const other = mappings.find(lands)
  return other ? { mapping: other, anime: true } : null
}

/** Internal dispatch entry point. Secrets must never leave the server. */
export async function fulfilmentFor(row: {
  libraryId: string
  animeFrom: string | null
}) {
  const route = sendingMapping(await allMappings(), row)
  if (!route) return null
  try {
    return await validateMapping(
      row.libraryId,
      route.mapping.connection.id,
      route.anime && route.mapping.anime
        ? route.mapping.anime.options
        : route.mapping.options,
    )
  } catch {
    return null
  }
}
