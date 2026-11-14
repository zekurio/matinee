import type {
  DescribedField,
  FieldSection,
  FulfilmentValues,
  RemoteRef,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import type { FulfilmentConnection } from "../types"
import { call, list } from "./client"

const httpUrl = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** How Radarr and Sonarr are reached, and what they do with a request. */
export const settings = t.object({
  baseUrl: t.string().url().refine(httpUrl, "Use an HTTP or HTTPS URL."),
  /** Where people open it, for links. Empty uses `baseUrl`. */
  externalUrl: t
    .string()
    .trim()
    .refine(
      (value) => value === "" || httpUrl(value),
      "Use an HTTP or HTTPS URL.",
    )
    .$default(""),
  /** Search for the title as soon as it is added. */
  search: t.boolean().$default(true),
  /** Add a tag named after the person who asked. */
  tagRequests: t.boolean().$default(false),
})

/**
 * Values without the ones a form leaves empty, so an unchosen field is
 * missing rather than an empty string, a null, or an empty list.
 */
export function filled(value: FulfilmentValues): FulfilmentValues {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) =>
        entry !== "" &&
        entry !== null &&
        entry !== undefined &&
        !(Array.isArray(entry) && entry.length === 0),
    ),
  )
}

export const profileId = t.coerce.number().int().min(1)
export const tagIds = t.array(t.coerce.number().int().min(1))

export function field(
  key: string,
  label: string,
  kind: DescribedField["kind"],
  section: FieldSection,
  options: {
    required?: boolean
    choices?: DescribedField["choices"]
    folder?: DescribedField["folder"]
  } = {},
): DescribedField {
  return {
    key,
    label,
    kind,
    required: options.required ?? false,
    choices: options.choices ?? [],
    section,
    folder: options.folder ?? null,
  }
}

/** The fields every Radarr or Sonarr connection has, apart from its key. */
export function settingFields(): DescribedField[] {
  return [
    field("baseUrl", "Base URL", "text", "connection", { required: true }),
    field("externalUrl", "External URL", "text", "behaviour"),
    field("search", "Automatic search", "switch", "behaviour"),
    field("tagRequests", "Tag requests", "switch", "behaviour"),
  ]
}

const choice = (value: string, label: string) => ({
  value,
  label,
  description: null,
})

/** The quality profiles, root folders, and tags a server offers. */
export async function serverChoices(connection: FulfilmentConnection) {
  const [profiles, roots, tags] = await Promise.all([
    list(connection, "qualityprofile"),
    list(connection, "rootfolder"),
    list(connection, "tag"),
  ])
  return {
    profiles: profiles.map((value) => {
      const profile = t
        .object({ id: t.number(), name: t.string() })
        .parse(value)
      return choice(String(profile.id), profile.name)
    }),
    roots: roots.map((value) => {
      const root = t.object({ path: t.string() }).parse(value)
      return choice(root.path, root.path)
    }),
    tags: tags.map((value) => {
      const tag = t.object({ id: t.number(), label: t.string() }).parse(value)
      return choice(String(tag.id), tag.label)
    }),
  }
}

/**
 * The settings an override rule takes over: its quality, folder, and
 * tags, with each left empty keeping the connection's.
 */
export const ruleSettings = t.object({
  qualityProfileId: profileId.optional(),
  rootFolderPath: t.string().min(1).optional(),
  tags: tagIds.optional(),
})

/** `sending` with the winning rule's settings, and every matching rule's tags. */
export function override(
  sending: FulfilmentValues,
  winner: FulfilmentValues,
  matched: FulfilmentValues[],
): FulfilmentValues {
  const own = tagIds.safeParse(sending.tags)
  const tags = new Set(own.success ? own.data : [])
  for (const rule of matched) {
    const parsed = tagIds.safeParse(rule.tags)
    for (const tag of parsed.success ? parsed.data : []) tags.add(tag)
  }
  const rest = Object.entries(filled(winner)).filter(([key]) => key !== "tags")
  return { ...sending, ...Object.fromEntries(rest), tags: [...tags] }
}

export function ruleFolder(value: FulfilmentValues): string | null {
  const parsed = t
    .object({ rootFolderPath: t.string().optional() })
    .safeParse(value)
  return (parsed.success && parsed.data.rootFolderPath) || null
}

/**
 * The tag named after the person who asked, created if the server has
 * none yet. Tag labels take lowercase letters, digits, and hyphens.
 */
export async function requesterTag(
  connection: FulfilmentConnection,
  username: string,
): Promise<number> {
  const label =
    username
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "matinee"
  const tag = t.object({ id: t.number(), label: t.string() })
  const found = (await list(connection, "tag"))
    .map((value) => tag.parse(value))
    .find((entry) => entry.label === label)
  if (found) return found.id
  const created = tag.parse(
    await call(connection, "tag", tag, "POST", { label }),
  )
  return created.id
}

/** A page on the server people open, from its external URL or its base URL. */
export function link(
  connection: FulfilmentConnection,
  ref: RemoteRef,
  page: string,
): string | null {
  const own = settings.safeParse(connection.settings)
  const slug = t.object({ slug: t.string().min(1) }).safeParse(ref)
  if (!own.success || !slug.success) return null
  const base = (own.data.externalUrl || own.data.baseUrl).replace(/\/+$/, "")
  return `${base}/${page}/${encodeURIComponent(slug.data.slug)}`
}
