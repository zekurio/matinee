import { t } from "@matinee/contracts/schema"
import { ORPCError } from "@orpc/server"

import { call, list } from "../arr/client"
import {
  field,
  filled,
  link,
  override,
  profileId,
  requesterTag,
  ruleFolder,
  ruleSettings,
  serverChoices,
  settingFields,
  settings,
  tagIds,
} from "../arr/shared"
import type { FulfilmentSource } from "../types"

const AVAILABILITY = ["announced", "inCinemas", "released"] as const

const options = t.object({
  qualityProfileId: profileId,
  rootFolderPath: t.string().min(1),
  minimumAvailability: t.enum(AVAILABILITY).$default("released"),
  tags: tagIds.$default([]),
})

/** What a film is sent with: the options themselves, Radarr has no anime fields. */
const sending = options

const object = t.record(t.string(), t.unknown())
const title = t.object({
  id: t.number(),
  tmdbId: t.number(),
  titleSlug: t.string().optional(),
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
  rules: true,
  settings,
  fields: settingFields,
  parseOptions: (value) => options.parse(filled(value)),
  sending: (value) => sending.parse(value),
  override,
  folder: (value) => sending.parse(value).rootFolderPath,
  ruleFolder,
  parseRule: (value) => ruleSettings.parse(filled(value)),
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
    const { profiles, roots, tags } = await serverChoices(connection)
    const quality = (required: boolean) =>
      field("qualityProfileId", "Quality profile", "select", "defaults", {
        required,
        choices: profiles,
      })
    const root = (required: boolean) =>
      field("rootFolderPath", "Root folder", "select", "defaults", {
        required,
        choices: roots,
        folder: "movie",
      })
    const tagField = field("tags", "Tags", "multiselect", "defaults", {
      choices: tags,
    })
    return {
      fields: [
        quality(true),
        root(true),
        field(
          "minimumAvailability",
          "Minimum availability",
          "select",
          "defaults",
          {
            required: true,
            choices: AVAILABILITY.map((value) => ({
              value,
              label:
                value === "announced"
                  ? "Announced"
                  : value === "inCinemas"
                    ? "In cinemas"
                    : "Released",
              description: null,
            })),
          },
        ),
        tagField,
      ],
      values: {
        qualityProfileId: profiles[0]?.value ?? "",
        rootFolderPath: roots[0]?.value ?? "",
        minimumAvailability: "released",
        tags: [],
      },
      rule: [root(false), quality(false), tagField],
    }
  },
  // Repeating an order must retain prior monitoring and include added seasons.
  async submit(connection, order) {
    const chosen = sending.parse(order.options)
    const behaviour = settings.parse(connection.settings)
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
    if (!existing) {
      const tags = new Set(chosen.tags)
      if (behaviour.tagRequests && order.requester)
        tags.add(await requesterTag(connection, order.requester.username))
      Object.assign(lookup, {
        qualityProfileId: chosen.qualityProfileId,
        rootFolderPath: chosen.rootFolderPath,
        minimumAvailability: chosen.minimumAvailability,
        tags: [...tags],
      })
    }
    const payload = {
      ...lookup,
      monitored: true,
      addOptions: { searchForMovie: false },
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
    if (behaviour.search)
      await call(connection, "command", object, "POST", {
        name: "MoviesSearch",
        movieIds: [saved.id],
      })
    return { id: saved.id, slug: saved.titleSlug ?? String(saved.tmdbId) }
  },
  link: (connection, ref) => link(connection, ref, "movie"),
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
