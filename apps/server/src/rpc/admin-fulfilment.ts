import type {
  CatalogRef,
  FulfilmentConnectionInput,
  FulfilmentRuleInput,
  FulfilmentValues,
} from "@matinee/contracts"
import { SchemaError, t } from "@matinee/contracts/schema"
import { fulfilmentConnection, fulfilmentRule, user } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { and, asc, eq, inArray, ne } from "drizzle-orm"

import { languagesIn } from "../catalog/browse"
import { genreProvider, keywordProvider } from "../catalog/cache"
import { db } from "../db"
import { sources as metadata } from "../metadata/sources"
import { events } from "../realtime/events"
import {
  bare,
  checkLandings,
  connectionById,
  environmentKey,
  getSource,
  landing,
  loadRouting,
  redactConnection,
  resolveConnection,
} from "../requests/fulfilment/connections"
import { sourceList } from "../requests/fulfilment/sources"
import type { FulfilmentSource } from "../requests/fulfilment/types"
import { admin } from "./base"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type RuleRow = typeof fulfilmentRule.$inferSelect

function connectionFailure(cause: unknown): never {
  const error = t
    .object({
      cause: t.object({ code: t.string() }).optional(),
      code: t.string().optional(),
    })
    .safeParse(cause)
  if (
    error.success &&
    (error.data.code === "23505" || error.data.cause?.code === "23505")
  )
    throw new ORPCError("CONFLICT", {
      message: "A connection already uses this slug. Choose another slug.",
    })
  throw cause
}

/**
 * Values a source parses, or an error an admin can act on: the source's
 * own message when it has one, like "Use an HTTP or HTTPS URL.", else
 * `message`.
 */
function parse(run: () => FulfilmentValues, message: string): FulfilmentValues {
  try {
    return run()
  } catch (cause) {
    const own = cause instanceof SchemaError ? cause.issues[0]?.message : null
    throw new ORPCError("BAD_REQUEST", {
      message: own?.startsWith("Use ") ? own : message,
    })
  }
}

/** The kinds a connection is the default for, of those its source takes. */
function defaults(source: FulfilmentSource, kinds: CatalogRef["kind"][]) {
  return {
    defaultMovies: kinds.includes("movie") && source.kinds.includes("movie"),
    defaultShows: kinds.includes("show") && source.kinds.includes("show"),
  }
}

/**
 * Saves a connection, checks that every folder it sends to lands in a
 * library, and makes it the only default for the kinds it's the default
 * for. All in one transaction, so a refused save changes nothing.
 */
async function saveConnection(input: FulfilmentConnectionInput, id?: string) {
  const source = getSource(input.source)
  const settings = parse(
    () => source.settings.parse(input.settings),
    "Check the connection's settings.",
  )
  const options = parse(
    () => source.parseOptions(input.options),
    "Choose each of the connection's options.",
  )
  const flags = defaults(source, input.defaultFor)
  const folderLibraries = Object.fromEntries(
    Object.entries(input.folderLibraries).map(([folder, library]) => [
      bare(folder),
      library,
    ]),
  )
  const result = await db
    .transaction(async (tx) => {
      const others = id ? ne(fulfilmentConnection.id, id) : undefined
      if (flags.defaultMovies)
        await tx
          .update(fulfilmentConnection)
          .set({ defaultMovies: false })
          .where(and(eq(fulfilmentConnection.defaultMovies, true), others))
      if (flags.defaultShows)
        await tx
          .update(fulfilmentConnection)
          .set({ defaultShows: false })
          .where(and(eq(fulfilmentConnection.defaultShows, true), others))
      const values = {
        name: input.name,
        slug: input.slug,
        source: input.source,
        settings,
        options,
        folderLibraries,
        ...flags,
      }
      const [row] = id
        ? await tx
            .update(fulfilmentConnection)
            .set({ ...values, apiKey: input.apiKey, updatedAt: new Date() })
            .where(eq(fulfilmentConnection.id, id))
            .returning()
        : await tx
            .insert(fulfilmentConnection)
            .values({ ...values, apiKey: input.apiKey ?? null })
            .returning()
      if (!row) throw new Error("Connection save failed")
      const routing = await loadRouting(tx)
      checkLandings(routing, row.id, input.defaultFor)
      return redactConnection(row, routing)
    })
    .catch(connectionFailure)
  events.publish("fulfilment", undefined)
  return result
}

function ruleOut(row: RuleRow) {
  return {
    id: row.id,
    connectionId: row.connectionId,
    users: row.users,
    genres: row.genres,
    languages: row.languages,
    keywords: row.keywords,
    settings: row.settings,
  }
}

async function rulesOf(
  connectionId: string,
  tx: Pick<typeof db, "select"> = db,
) {
  const rows = await tx
    .select()
    .from(fulfilmentRule)
    .where(eq(fulfilmentRule.connectionId, connectionId))
    .orderBy(asc(fulfilmentRule.position), asc(fulfilmentRule.createdAt))
  return rows.map(ruleOut)
}

/**
 * Checks a rule and saves it: it has a condition and a setting, its
 * settings are choices the connection takes, and its folder lands in a
 * library. A pick for that folder is kept on the connection.
 */
async function saveRule(input: FulfilmentRuleInput, id?: string) {
  const connection = await connectionById(input.connectionId)
  const source = getSource(connection.source)
  if (!source.rules || !source.parseRule)
    throw new ORPCError("BAD_REQUEST", {
      message: "This connection doesn't take override rules.",
    })
  if (
    !input.users.length &&
    !input.genres.length &&
    !input.languages.length &&
    !input.keywords.length
  )
    throw new ORPCError("BAD_REQUEST", {
      message: "Give the rule at least one condition.",
    })
  const parseRule = source.parseRule
  const settings = parse(
    () => parseRule(input.settings),
    "Choose each of the rule's settings from the connection's choices.",
  )
  if (!Object.keys(settings).length)
    throw new ORPCError("BAD_REQUEST", {
      message: "Choose at least one setting the rule changes.",
    })
  if (input.users.length) {
    const found = await db
      .select({ id: user.id })
      .from(user)
      .where(inArray(user.id, input.users))
    if (found.length !== new Set(input.users).size)
      throw new ORPCError("BAD_REQUEST", {
        message: "Choose accounts that exist.",
      })
  }
  const folder = source.ruleFolder?.(settings) ?? null
  const row = await db.transaction(async (tx: Transaction) => {
    if (folder && input.folderLibraryId !== undefined) {
      const picks = { ...connection.folderLibraries }
      if (input.folderLibraryId) picks[bare(folder)] = input.folderLibraryId
      else delete picks[bare(folder)]
      await tx
        .update(fulfilmentConnection)
        .set({ folderLibraries: picks })
        .where(eq(fulfilmentConnection.id, connection.id))
    }
    const values = {
      users: [...new Set(input.users)],
      genres: [...new Set(input.genres)],
      languages: [...new Set(input.languages)],
      keywords: input.keywords.filter(
        (keyword, index, all) =>
          all.findIndex((each) => each.id === keyword.id) === index,
      ),
      settings,
    }
    let saved: RuleRow | undefined
    if (id) {
      ;[saved] = await tx
        .update(fulfilmentRule)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(fulfilmentRule.id, id),
            eq(fulfilmentRule.connectionId, connection.id),
          ),
        )
        .returning()
      if (!saved)
        throw new ORPCError("NOT_FOUND", { message: "Rule not found." })
    } else {
      const existing = await rulesOf(connection.id, tx)
      ;[saved] = await tx
        .insert(fulfilmentRule)
        .values({
          ...values,
          connectionId: connection.id,
          position: existing.length,
        })
        .returning()
    }
    if (!saved) throw new Error("Rule save failed")
    const routing = await loadRouting(tx)
    checkLandings(routing, connection.id, [])
    return saved
  })
  events.publish("fulfilment", undefined)
  return ruleOut(row)
}

/** The language to name genres and languages in: the default library's for a kind. */
async function languageFor(kind: CatalogRef["kind"]) {
  const routing = await loadRouting()
  return routing.defaultLibrary(kind)?.metadataLanguage ?? "en-US"
}

/** Languages by their names, from ICU, for when TMDB isn't set up. */
function knownLanguages(language: string) {
  const names = new Intl.DisplayNames([language], { type: "language" })
  const letters = "abcdefghijklmnopqrstuvwxyz"
  const found: { id: string; name: string }[] = []
  for (const a of letters)
    for (const b of letters) {
      const code = a + b
      try {
        const name = names.of(code)
        if (name && name !== code) found.push({ id: code, name })
      } catch {
        // Not a language ICU knows.
      }
    }
  const collator = new Intl.Collator(language)
  return found.toSorted((x, y) => collator.compare(x.name, y.name))
}

export const adminFulfilment = {
  sources: admin.admin.fulfilment.sources.handler(() =>
    sourceList().map((source) => ({
      id: source.id,
      name: source.name,
      kinds: source.kinds,
      needs: source.needs,
      scope: source.scope,
      apiKey: source.apiKey,
      rules: source.rules,
      fields: source.fields(),
    })),
  ),
  connections: admin.admin.fulfilment.connections.handler(async () => {
    const [rows, routing] = await Promise.all([
      db
        .select()
        .from(fulfilmentConnection)
        .orderBy(asc(fulfilmentConnection.name)),
      loadRouting(),
    ])
    return rows.map((row) => redactConnection(row, routing))
  }),
  create: admin.admin.fulfilment.create.handler(({ input }) =>
    saveConnection(input),
  ),
  update: admin.admin.fulfilment.update.handler(async ({ input }) => {
    await connectionById(input.id)
    return saveConnection(input, input.id)
  }),
  remove: admin.admin.fulfilment.remove.handler(async ({ input }) => {
    await db
      .delete(fulfilmentConnection)
      .where(eq(fulfilmentConnection.id, input.id))
    events.publish("fulfilment", undefined)
  }),
  test: admin.admin.fulfilment.test.handler(async ({ input }) => {
    const row = await connectionById(input.id)
    await getSource(row.source).test(resolveConnection(row))
  }),
  options: admin.admin.fulfilment.options.handler(async ({ input }) => {
    const source = getSource(input.source)
    const saved = input.id ? await connectionById(input.id) : null
    const settings = parse(
      () => source.settings.parse(input.settings),
      "Check the connection's settings.",
    )
    // A key typed in the form, else the saved one if the slug didn't
    // change, else the environment's for the slug.
    const apiKey =
      input.apiKey ??
      (saved && saved.slug === input.slug ? saved.apiKey : null) ??
      environmentKey(input.slug)
    return source.options({
      id: saved?.id ?? "",
      slug: input.slug,
      settings,
      apiKey,
    })
  }),
  landing: admin.admin.fulfilment.landing.handler(({ input }) =>
    landing(input.kind, input.folder),
  ),
  rules: admin.admin.fulfilment.rules.handler(async ({ input }) => {
    await connectionById(input.connectionId)
    return rulesOf(input.connectionId)
  }),
  createRule: admin.admin.fulfilment.createRule.handler(({ input }) =>
    saveRule(input),
  ),
  updateRule: admin.admin.fulfilment.updateRule.handler(({ input }) =>
    saveRule(input, input.id),
  ),
  removeRule: admin.admin.fulfilment.removeRule.handler(async ({ input }) => {
    await db.delete(fulfilmentRule).where(eq(fulfilmentRule.id, input.id))
    events.publish("fulfilment", undefined)
  }),
  reorderRules: admin.admin.fulfilment.reorderRules.handler(
    async ({ input }) => {
      const current = await rulesOf(input.connectionId)
      if (
        current.length !== input.ids.length ||
        current.some((rule) => !input.ids.includes(rule.id))
      )
        throw new ORPCError("CONFLICT", {
          message: "The rules changed. Reload them and try again.",
        })
      await db.transaction(async (tx) => {
        for (const [position, id] of input.ids.entries())
          await tx
            .update(fulfilmentRule)
            .set({ position })
            .where(eq(fulfilmentRule.id, id))
      })
      events.publish("fulfilment", undefined)
      return rulesOf(input.connectionId)
    },
  ),
  ruleChoices: admin.admin.fulfilment.ruleChoices.handler(async ({ input }) => {
    const language = await languageFor(input.kind)
    const tmdb = metadata.tmdb.configured()
    const [genres, languages, users] = await Promise.all([
      tmdb
        ? genreProvider(input.kind, language).then((result) => result.value)
        : [],
      tmdb
        ? languagesIn(language).then((result) => result.languages)
        : knownLanguages(language),
      db
        .select({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        })
        .from(user)
        .orderBy(asc(user.username)),
    ])
    return {
      tmdb,
      genres: genres.map((genre) => ({ id: genre.id, name: genre.name })),
      languages,
      users: users.map((row) => ({
        id: row.id,
        name: row.displayName ?? row.username,
      })),
    }
  }),
  keywords: admin.admin.fulfilment.keywords.handler(async ({ input }) => {
    if (!metadata.tmdb.configured())
      throw new ORPCError("BAD_REQUEST", {
        message: "Keywords come from TMDB. Set MATINEE_TMDB_API_KEY first.",
      })
    return (await keywordProvider(input.query)).value
  }),
}
