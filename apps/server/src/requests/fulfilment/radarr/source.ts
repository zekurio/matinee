import { t } from "@matinee/contracts/schema"
import { ORPCError } from "@orpc/server"

import { call, list, select } from "../arr/client"
import type { FulfilmentSource } from "../types"

const settings = t.object({
  baseUrl: t
    .string()
    .url()
    .refine(
      (value) => ["http:", "https:"].includes(new URL(value).protocol),
      "Use an HTTP or HTTPS URL.",
    ),
})

const options = t.object({
  qualityProfileId: t.coerce.number().int().min(1),
  rootFolderPath: t.string().min(1),
})

const object = t.record(t.string(), t.unknown())
const title = t.object({
  id: t.number(),
  tmdbId: t.number(),
  monitored: t.boolean(),
  isAvailable: t.boolean(),
  inCinemas: t.string().nullable().optional(),
  digitalRelease: t.string().nullable().optional(),
  physicalRelease: t.string().nullable().optional(),
  seasons: t
    .array(t.object({ seasonNumber: t.number(), monitored: t.boolean() }))
    .optional(),
})

const queue = t.object({
  totalRecords: t.number(),
  records: t.array(
    t.object({
      movieId: t.number().optional(),
      size: t.number(),
      sizeleft: t.number(),
      status: t.string(),
      trackedDownloadStatus: t.string().optional(),
      estimatedCompletionTime: t.string().nullable().optional(),
    }),
  ),
})
async function queueRecords(connection: Parameters<typeof call>[0]) {
  const records: t.infer<typeof queue>["records"] = []
  let page = 1
  while (true) {
    const result = queue.parse(
      await call(
        connection,
        `queue?page=${page}&pageSize=100&includeUnknownSeriesItems=true`,
        queue,
      ),
    )
    records.push(...result.records)
    if (page * 100 >= result.totalRecords) return records
    page++
  }
}

export const adapter = {
  id: "radarr",
  name: "Radarr",
  kinds: ["movie"],
  needs: ["tmdb"],
  scope: "title",
  apiKey: true,
  settings,
  parseOptions: (value) => options.parse(value),
  folder: (value) => options.parse(value).rootFolderPath,
  fields: () => [
    {
      key: "baseUrl",
      label: "Base URL",
      kind: "text",
      required: true,
      choices: [],
    },
  ],
  async test(connection) {
    const status = t
      .object({ appName: t.string() })
      .parse(
        await call(
          connection,
          "system/status",
          t.object({ appName: t.string() }),
        ),
      )
    if (status.appName.toLowerCase() !== "radarr")
      throw new ORPCError("BAD_REQUEST", {
        message: "This URL is not a Radarr server.",
      })
  },
  async options(connection) {
    const profiles = (await list(connection, "qualityprofile")).map((value) =>
      t.object({ id: t.number(), name: t.string() }).parse(value),
    )
    const roots = (await list(connection, "rootfolder")).map((value) =>
      t.object({ path: t.string() }).parse(value),
    )
    return {
      fields: [
        select(
          "qualityProfileId",
          "Quality",
          profiles.map((value) => ({
            value: String(value.id),
            label: value.name,
            description: null,
          })),
        ),
        select(
          "rootFolderPath",
          "Save to",
          roots.map((value) => ({
            value: value.path,
            label: value.path,
            description: null,
          })),
        ),
      ],
      values: {
        qualityProfileId: profiles[0]?.id ?? 0,
        rootFolderPath: roots[0]?.path ?? "",
      },
      // Nothing is chosen for anime until an admin does.
      anime: {},
    }
  },
  // Repeating an order must retain prior monitoring and include added seasons.
  async submit(connection, order) {
    const chosen = options.parse(order.options)
    const externalId = t.coerce
      .number()
      .int()
      .min(1)
      .parse(order.externalIds.get("tmdb"))
    const existing = (await list(connection, `movie?tmdbId=${externalId}`))[0]
    const lookup =
      existing ??
      (await list(connection, `movie/lookup?term=tmdb:${externalId}`))[0]
    if (!lookup)
      throw new ORPCError("BAD_REQUEST", {
        message:
          "The connection could not find this title. Check its external identifier.",
      })
    // Keep the administrator's existing quality and destination settings.
    if (!existing) Object.assign(lookup, chosen)
    const payload = {
      ...lookup,
      monitored: true,
      minimumAvailability: existing ? lookup.minimumAvailability : "released",
      // Radarr searches a new movie after the refresh that follows the add.
      addOptions: { searchForMovie: true },
    }
    const saved = title.parse(
      await call(
        connection,
        existing ? `movie/${title.parse(existing).id}` : "movie",
        title,
        existing ? "PUT" : "POST",
        payload,
      ),
    )
    if (existing)
      await call(connection, "command", object, "POST", {
        name: "MoviesSearch",
        movieIds: [saved.id],
      })
    return { id: saved.id }
  },
  async progress(connection, sent) {
    const records = await queueRecords(connection)
    return Promise.all(
      sent.map(async (item) => {
        const id = t.object({ id: t.number() }).parse(item.ref).id
        const current = await call(
          connection,
          `movie/${id}`,
          title,
          "GET",
          undefined,
          true,
        )
        const active = records.filter((value) => value.movieId === id)
        const size = active.reduce((sum, value) => sum + value.size, 0)
        const remaining = active.reduce((sum, value) => sum + value.sizeleft, 0)
        const eta = active
          .map((value) =>
            value.estimatedCompletionTime
              ? Date.parse(value.estimatedCompletionTime)
              : NaN,
          )
          .filter(Number.isFinite)
        const releaseDate =
          current?.digitalRelease ??
          current?.physicalRelease ??
          current?.inCinemas ??
          null
        const waitingForRelease = Boolean(current && !current.isAvailable)
        return {
          requestId: item.requestId,
          season: null,
          fraction: size
            ? Math.max(0, Math.min(1, 1 - remaining / size))
            : null,
          etaSeconds: eta.length
            ? Math.max(0, Math.round((Math.max(...eta) - Date.now()) / 1000))
            : null,
          waitingForRelease,
          releaseDate,
          stillLooking: Boolean(
            current && !active.length && !waitingForRelease,
          ),
          problem: !current
            ? "The title was removed from the connection. Retry the request."
            : active.some(
                  (value) =>
                    value.trackedDownloadStatus === "error" ||
                    value.status === "failed",
                )
              ? "A transfer failed. Check the connection's queue."
              : null,
          diagnostics: [],
        }
      }),
    )
  },
} satisfies FulfilmentSource
