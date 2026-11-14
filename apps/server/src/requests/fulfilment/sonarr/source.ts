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
  seriesType: t.enum(["standard", "daily", "anime"]).$default("standard"),
})

const object = t.record(t.string(), t.unknown())
const title = t.object({
  firstAired: t.string().nullable().optional(),
  nextAiring: t.string().nullable().optional(),
  id: t.number(),
  tvdbId: t.number(),
  monitored: t.boolean(),
  seasons: t
    .array(t.object({ seasonNumber: t.number(), monitored: t.boolean() }))
    .optional(),
})

const queue = t.object({
  totalRecords: t.number(),
  records: t.array(
    t.object({
      seriesId: t.number().optional(),
      seasonNumber: t.number().optional(),
      episode: t.object({ seasonNumber: t.number() }).nullable().optional(),
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
        `queue?page=${page}&pageSize=100&includeUnknownSeriesItems=true&includeEpisode=true`,
        queue,
      ),
    )
    records.push(...result.records)
    if (page * 100 >= result.totalRecords) return records
    page++
  }
}

export const adapter = {
  id: "sonarr",
  name: "Sonarr",
  kinds: ["show"],
  needs: ["tvdb"],
  scope: "season",
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
    if (status.appName.toLowerCase() !== "sonarr")
      throw new ORPCError("BAD_REQUEST", {
        message: "This URL is not a Sonarr server.",
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
        select(
          "seriesType",
          "Series type",
          ["standard", "daily", "anime"].map((value) => ({
            value,
            label:
              value === "standard"
                ? "Standard"
                : value === "daily"
                  ? "Daily"
                  : "Anime",
            description: null,
          })),
        ),
      ],
      values: {
        qualityProfileId: profiles[0]?.id ?? 0,
        rootFolderPath: roots[0]?.path ?? "",
        seriesType: "standard",
      },
      // Nothing is chosen for anime until an admin does, but its
      // series type.
      anime: { seriesType: "anime" },
    }
  },
  // Repeating an order must retain prior monitoring and include added seasons.
  async submit(connection, order) {
    const chosen = options.parse(order.options)
    const externalId = t.coerce
      .number()
      .int()
      .min(1)
      .parse(order.externalIds.get("tvdb"))
    const existing = (await list(connection, `series?tvdbId=${externalId}`))[0]
    const lookup =
      existing ??
      (await list(connection, `series/lookup?term=tvdb:${externalId}`))[0]
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
      seasonFolder: true,
      monitorNewItems: order.scope?.future ? "all" : "none",
      seasons: t
        .object({
          seasons: t.array(
            t.object({ seasonNumber: t.number(), monitored: t.boolean() }),
          ),
        })
        .parse(lookup)
        .seasons.map((season) => ({
          ...season,
          monitored:
            (season.monitored && Boolean(existing)) ||
            Boolean(order.scope?.seasons.includes(season.seasonNumber)),
        })),
      // Sonarr fills a new series' episodes in the refresh after the add,
      // so a search sent now would find none. Let Sonarr search once they
      // exist, as Seerr does.
      addOptions: { searchForMissingEpisodes: true },
    }
    const saved = title.parse(
      await call(
        connection,
        existing ? `series/${title.parse(existing).id}` : "series",
        title,
        existing ? "PUT" : "POST",
        payload,
      ),
    )
    if (existing) {
      const episodes = (
        await list(connection, `episode?seriesId=${saved.id}`)
      ).map((value) =>
        t.object({ id: t.number(), seasonNumber: t.number() }).parse(value),
      )
      const episodeIds = episodes
        .filter((value) => order.scope?.seasons.includes(value.seasonNumber))
        .map((value) => value.id)
      if (episodeIds.length) {
        await call(connection, "episode/monitor", t.array(object), "PUT", {
          episodeIds,
          monitored: true,
        })
      }
      for (const seasonNumber of order.scope?.seasons ?? []) {
        await call(connection, "command", object, "POST", {
          name: "SeasonSearch",
          seriesId: saved.id,
          seasonNumber,
        })
      }
    }
    return {
      id: saved.id,
      seasons: order.scope?.seasons ?? [],
      future: order.scope?.future ?? false,
    }
  },
  async progress(connection, sent) {
    const records = await queueRecords(connection)
    return Promise.all(
      sent.map(async (item) => {
        const id = t.object({ id: t.number() }).parse(item.ref).id
        const current = await call(
          connection,
          `series/${id}`,
          title,
          "GET",
          undefined,
          true,
        )
        const forTitle = records.filter((value) => value.seriesId === id)
        const requested = t
          .object({
            seasons: t.array(t.number()).optional(),
            future: t.boolean().optional(),
          })
          .parse(item.ref)
        const episodes = current
          ? (await list(connection, `episode?seriesId=${id}`))
              .map((value) =>
                t
                  .object({
                    seasonNumber: t.number(),
                    hasFile: t.boolean(),
                    airDateUtc: t.string().optional(),
                  })
                  .parse(value),
              )
              .filter(
                (value) =>
                  !value.hasFile &&
                  (requested.seasons?.includes(value.seasonNumber) ||
                    (requested.future &&
                      value.seasonNumber >
                        Math.max(0, ...(requested.seasons ?? [])))),
              )
          : []
        const summarize = (season: number | null) => {
          const active = forTitle.filter(
            (value) =>
              season === null ||
              (value.episode?.seasonNumber ?? value.seasonNumber) === season,
          )
          const size = active.reduce((sum, value) => sum + value.size, 0)
          const remaining = active.reduce(
            (sum, value) => sum + value.sizeleft,
            0,
          )
          const eta = active
            .map((value) =>
              value.estimatedCompletionTime
                ? Date.parse(value.estimatedCompletionTime)
                : NaN,
            )
            .filter(Number.isFinite)
          const missing = episodes.filter(
            (value) => season === null || value.seasonNumber === season,
          )
          const upcoming = missing
            .map((value) => value.airDateUtc)
            .filter((value) => value !== undefined)
            .sort()
          const allUnreleased =
            missing.length > 0 &&
            missing.every(
              (value) => Date.parse(value.airDateUtc ?? "") > Date.now(),
            )
          const releaseDate = allUnreleased ? (upcoming[0] ?? null) : null
          const waitingForRelease = Boolean(
            releaseDate && Date.parse(releaseDate) > Date.now(),
          )
          return {
            requestId: item.requestId,
            season,
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
        }
        const seasons = [
          ...new Set([
            ...(requested.seasons ?? []),
            ...episodes.map((value) => value.seasonNumber),
          ]),
        ]
        return [summarize(null), ...seasons.map(summarize)]
      }),
    ).then((results) => results.flat())
  },
} satisfies FulfilmentSource
