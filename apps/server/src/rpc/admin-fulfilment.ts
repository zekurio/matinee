import { t } from "@matinee/contracts/schema"
import { fulfilmentConnection, libraryFulfilment } from "@matinee/db"
import { ORPCError } from "@orpc/server"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { events } from "../realtime/events"
import {
  connectionById,
  getSource,
  landing,
  mappingForLibrary,
  redactConnection,
  resolveConnection,
  validateAnime,
  validateMapping,
} from "../requests/fulfilment/connections"
import { sourceList } from "../requests/fulfilment/sources"
import { admin } from "./base"

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

export const adminFulfilment = {
  sources: admin.admin.fulfilment.sources.handler(() =>
    sourceList().map((source) => ({
      id: source.id,
      name: source.name,
      kinds: source.kinds,
      needs: source.needs,
      scope: source.scope,
      apiKey: source.apiKey,
      fields: source.fields(),
    })),
  ),
  connections: admin.admin.fulfilment.connections.handler(async () =>
    (await db.select().from(fulfilmentConnection)).map(redactConnection),
  ),
  create: admin.admin.fulfilment.create.handler(async ({ input }) => {
    const settings = getSource(input.source).settings.parse(input.settings)
    const [row] = await db
      .insert(fulfilmentConnection)
      .values({ ...input, settings })
      .returning()
      .catch(connectionFailure)
    if (!row) throw new Error("Connection insert failed")
    events.publish("fulfilment", undefined)
    return redactConnection(row)
  }),
  update: admin.admin.fulfilment.update.handler(async ({ input }) => {
    await connectionById(input.id)
    const settings = getSource(input.source).settings.parse(input.settings)
    const [row] = await db
      .update(fulfilmentConnection)
      .set({
        name: input.name,
        slug: input.slug,
        source: input.source,
        settings,
        apiKey: input.apiKey,
        updatedAt: new Date(),
      })
      .where(eq(fulfilmentConnection.id, input.id))
      .returning()
      .catch(connectionFailure)
    if (!row) throw new Error("Connection update failed")
    events.publish("fulfilment", undefined)
    return redactConnection(row)
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
  mapping: admin.admin.fulfilment.mapping.handler(({ input }) =>
    mappingForLibrary(input.libraryId),
  ),
  setMapping: admin.admin.fulfilment.setMapping.handler(async ({ input }) => {
    if (input.connectionId) {
      const {
        options,
        library: destination,
        source,
      } = await validateMapping(
        input.libraryId,
        input.connectionId,
        input.options,
      )
      const connectionId = input.connectionId
      const anime = input.anime
        ? await validateAnime(destination, source, input.anime)
        : null
      const [saved] = await db
        .select()
        .from(libraryFulfilment)
        .where(eq(libraryFulfilment.libraryId, input.libraryId))
      // Left out, the options for anime stay as saved, unless they were
      // for another connection.
      const kept =
        input.anime === undefined && saved?.connectionId === connectionId
      const values = {
        connectionId,
        options,
        animeOptions: kept ? saved.animeOptions : (anime?.options ?? null),
        animeLibraryId: kept
          ? saved.animeLibraryId
          : (anime?.libraryId ?? null),
      }
      await db
        .insert(libraryFulfilment)
        .values({ libraryId: input.libraryId, ...values })
        .onConflictDoUpdate({
          target: libraryFulfilment.libraryId,
          set: { ...values, updatedAt: new Date() },
        })
    } else
      await db
        .delete(libraryFulfilment)
        .where(eq(libraryFulfilment.libraryId, input.libraryId))
    events.publish("fulfilment", undefined)
    return mappingForLibrary(input.libraryId)
  }),
  options: admin.admin.fulfilment.options.handler(async ({ input }) => {
    const row = await connectionById(input.connectionId)
    const described = await getSource(row.source).options(
      resolveConnection(row),
    )
    const mapping = await mappingForLibrary(input.libraryId)
    return {
      ...described,
      values:
        mapping.connectionId === row.id ? mapping.options : described.values,
    }
  }),
  landing: admin.admin.fulfilment.landing.handler(({ input }) =>
    landing(input.libraryId, input.connectionId, input.options),
  ),
}
