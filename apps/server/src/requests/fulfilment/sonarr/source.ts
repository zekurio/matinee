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

const SERIES_TYPES = ["standard", "daily", "anime"] as const
const seriesType = t.enum(SERIES_TYPES)

const options = t.object({
  qualityProfileId: profileId,
  rootFolderPath: t.string().min(1),
  seriesType: seriesType.$default("standard"),
  seasonFolders: t.boolean().$default(true),
  /** Monitor seasons that come out later for every show, asked for or not. */
  monitorNewSeasons: t.boolean().$default(false),
  tags: tagIds.$default([]),
  // Used for anime instead of the ones above, each when it's filled.
  animeSeriesType: seriesType.optional(),
  animeQualityProfileId: profileId.optional(),
  animeRootFolderPath: t.string().min(1).optional(),
  animeTags: tagIds.optional(),
})

/** What a show is sent with, its anime fields already applied. */
const sending = t.object({
  qualityProfileId: profileId,
  rootFolderPath: t.string().min(1),
  seriesType: seriesType,
  seasonFolders: t.boolean(),
  monitorNewSeasons: t.boolean(),
  tags: tagIds,
})

const rule = ruleSettings.extend({ seriesType: seriesType.optional() })

const typeChoices = SERIES_TYPES.map((value) => ({
  value,
  label:
    value === "standard" ? "Standard" : value === "daily" ? "Daily" : "Anime",
  description: null,
}))

const object = t.record(t.string(), t.unknown())
const title = t.object({
  firstAired: t.string().nullable().optional(),
  nextAiring: t.string().nullable().optional(),
  id: t.number(),
  tvdbId: t.number(),
  titleSlug: t.string().optional(),
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
  rules: true,
  settings,
  fields: settingFields,
  parseOptions: (value) => options.parse(filled(value)),
  sending(value, title) {
    const own = options.parse(value)
    const anime = title.anime
    return {
      qualityProfileId:
        (anime && own.animeQualityProfileId) || own.qualityProfileId,
      rootFolderPath: (anime && own.animeRootFolderPath) || own.rootFolderPath,
      seriesType: (anime && own.animeSeriesType) || own.seriesType,
      seasonFolders: own.seasonFolders,
      monitorNewSeasons: own.monitorNewSeasons,
      tags: anime && own.animeTags?.length ? own.animeTags : own.tags,
    }
  },
  override,
  folder: (value) => sending.parse(value).rootFolderPath,
  ruleFolder,
  parseRule: (value) => rule.parse(filled(value)),
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
    const { profiles, roots, tags } = await serverChoices(connection)
    const quality = (key: string, label: string, required: boolean) =>
      field(
        key,
        label,
        "select",
        key.startsWith("anime") ? "anime" : "defaults",
        {
          required,
          choices: profiles,
        },
      )
    const root = (key: string, label: string, required: boolean) =>
      field(
        key,
        label,
        "select",
        key.startsWith("anime") ? "anime" : "defaults",
        {
          required,
          choices: roots,
          folder: "show",
        },
      )
    const type = (key: string, label: string, required: boolean) =>
      field(
        key,
        label,
        "select",
        key.startsWith("anime") ? "anime" : "defaults",
        {
          required,
          choices: typeChoices,
        },
      )
    const tagField = (key: string, label: string) =>
      field(
        key,
        label,
        "multiselect",
        key.startsWith("anime") ? "anime" : "defaults",
        {
          choices: tags,
        },
      )
    return {
      fields: [
        quality("qualityProfileId", "Quality profile", true),
        root("rootFolderPath", "Root folder", true),
        type("seriesType", "Series type", true),
        tagField("tags", "Tags"),
        field("seasonFolders", "Season folders", "switch", "defaults"),
        field("monitorNewSeasons", "Monitor new seasons", "switch", "defaults"),
        type("animeSeriesType", "Anime series type", false),
        quality("animeQualityProfileId", "Anime quality profile", false),
        root("animeRootFolderPath", "Anime root folder", false),
        tagField("animeTags", "Anime tags"),
      ],
      values: {
        qualityProfileId: profiles[0]?.value ?? "",
        rootFolderPath: roots[0]?.value ?? "",
        seriesType: "standard",
        seasonFolders: true,
        monitorNewSeasons: false,
        tags: [],
        animeSeriesType: "anime",
      },
      rule: [
        root("rootFolderPath", "Root folder", false),
        quality("qualityProfileId", "Quality profile", false),
        tagField("tags", "Tags"),
        type("seriesType", "Series type", false),
      ],
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
    if (!existing) {
      const tags = new Set(chosen.tags)
      if (behaviour.tagRequests && order.requester)
        tags.add(await requesterTag(connection, order.requester.username))
      Object.assign(lookup, {
        qualityProfileId: chosen.qualityProfileId,
        rootFolderPath: chosen.rootFolderPath,
        seriesType: chosen.seriesType,
        seasonFolder: chosen.seasonFolders,
        tags: [...tags],
      })
    }
    const payload = {
      ...lookup,
      monitored: true,
      monitorNewItems:
        order.scope?.future || chosen.monitorNewSeasons ? "all" : "none",
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
      addOptions: { searchForMissingEpisodes: false },
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
    }
    if (behaviour.search)
      await call(connection, "command", object, "POST", {
        name: "MissingEpisodeSearch",
        seriesId: saved.id,
      })
    return {
      id: saved.id,
      slug: saved.titleSlug ?? null,
      seasons: order.scope?.seasons ?? [],
      future: order.scope?.future ?? false,
    }
  },
  link: (connection, ref) => link(connection, ref, "series"),
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
