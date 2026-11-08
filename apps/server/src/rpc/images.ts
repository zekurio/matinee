import {
  type ImageSlot,
  type ImageTarget,
  type ItemImage,
  type RemoteImage,
  TITLE_IMAGE_SLOTS,
  type TitleImageSlot,
} from "@matinee/contracts"
import {
  artwork,
  episode,
  type EpisodeRow,
  type LibraryRow,
  season,
  type SeasonRow,
  title,
  type TitleRow,
} from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import {
  artworkId,
  dropUnusedUploads,
  placeholders,
  prepareArtwork,
  saveArtwork,
  saveUpload,
  toArtwork,
  uploadedArtwork,
} from "../media/artwork"
import { TITLE_IMAGE_COLUMNS } from "../metadata/choices"
import { refreshTitleNow, sourceFor } from "../metadata/refresh"
import type { ImageCandidate, ImageScope } from "../metadata/types"
import { admin, badRequest, notFound } from "./base"
import { loadRow, providerFailure, withLibrary } from "./titles"

// Enough to scroll through. Popular titles have hundreds in all languages.
const MAX_REMOTE_IMAGES = 120

/** The slots a title, season, and episode have. */
const SLOTS = {
  title: TITLE_IMAGE_SLOTS,
  season: ["poster"],
  episode: ["still"],
} satisfies Record<ImageScope["kind"], readonly ImageSlot[]>

function scopeOf(row: TitleRow, input: ImageTarget): ImageScope {
  if (input.season === undefined) {
    if (input.episode !== undefined) {
      throw badRequest("Give the episode's season too.")
    }
    return { kind: "title" }
  }
  if (row.kind !== "show") {
    throw badRequest("Only shows have seasons and episodes.")
  }
  return input.episode === undefined
    ? { kind: "season", season: input.season }
    : { kind: "episode", season: input.season, episode: input.episode }
}

/** The scope, once it's sure to have `slot`. */
function slotScope(row: TitleRow, input: ImageTarget & { slot: ImageSlot }) {
  const scope = scopeOf(row, input)
  const slots: readonly ImageSlot[] = SLOTS[scope.kind]
  if (!slots.includes(input.slot)) {
    throw badRequest(
      "Movies and shows take a poster, backdrop, or logo, seasons a poster, and episodes a still.",
    )
  }
  return scope
}

function isTitleSlot(slot: ImageSlot): slot is TitleImageSlot {
  return TITLE_IMAGE_SLOTS.some((s) => s === slot)
}

type Current = { slot: ImageSlot; id: string | null; chosen: boolean }

async function currentImages(
  titleId: string,
  scope: ImageScope,
): Promise<Current[]> {
  if (scope.kind === "title") {
    const row = await loadRow(titleId)
    return TITLE_IMAGE_SLOTS.map((slot) => ({
      slot,
      id: row[TITLE_IMAGE_COLUMNS[slot]],
      chosen: row.chosenImages.includes(slot),
    }))
  }
  if (scope.kind === "season") {
    const [row] = await db
      .select({ id: season.posterId, chosen: season.posterChosen })
      .from(season)
      .where(and(eq(season.titleId, titleId), eq(season.number, scope.season)))
    return [
      { slot: "poster", id: row?.id ?? null, chosen: row?.chosen ?? false },
    ]
  }
  const [row] = await db
    .select({ id: episode.stillId, chosen: episode.stillChosen })
    .from(episode)
    .where(
      and(
        eq(episode.titleId, titleId),
        eq(episode.seasonNumber, scope.season),
        eq(episode.episodeNumber, scope.episode),
      ),
    )
  return [{ slot: "still", id: row?.id ?? null, chosen: row?.chosen ?? false }]
}

async function itemImages(
  titleId: string,
  scope: ImageScope,
): Promise<ItemImage[]> {
  const current = await currentImages(titleId, scope)
  const ids = current.map((c) => c.id)
  const [art, uploads] = await Promise.all([
    placeholders(ids),
    uploadedArtwork(ids),
  ])
  return current.map((c) => ({
    slot: c.slot,
    image: toArtwork(c.id, art),
    chosen: c.chosen,
    uploaded: c.id !== null && uploads.has(c.id),
  }))
}

/**
 * Put an image in a slot and mark whether an admin chose it. Without `id`
 * the image stays as it is. A season or episode the provider doesn't list
 * gets a row for it. Returns the image the slot had.
 */
async function setSlot(
  titleId: string,
  scope: ImageScope,
  slot: ImageSlot,
  change: { id?: string | null; chosen: boolean },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    // A refresh locks the row too, so the two don't overwrite each other.
    const [row] = await tx
      .select()
      .from(title)
      .where(eq(title.id, titleId))
      .for("update")
    if (!row) throw notFound("This title isn't in any library.")
    if (scope.kind === "title") {
      if (!isTitleSlot(slot)) return null
      const column = TITLE_IMAGE_COLUMNS[slot]
      const others = row.chosenImages.filter((s) => s !== slot)
      const set: Partial<Pick<TitleRow, typeof column>> &
        Pick<TitleRow, "chosenImages"> = {
        chosenImages: change.chosen ? [...others, slot] : others,
      }
      if (change.id !== undefined) set[column] = change.id
      await tx.update(title).set(set).where(eq(title.id, titleId))
      return row[column]
    }
    if (scope.kind === "season") {
      const where = and(
        eq(season.titleId, titleId),
        eq(season.number, scope.season),
      )
      const [before] = await tx
        .select({ id: season.posterId })
        .from(season)
        .where(where)
      const set: Partial<Pick<SeasonRow, "posterId">> &
        Pick<SeasonRow, "posterChosen"> = { posterChosen: change.chosen }
      if (change.id !== undefined) set.posterId = change.id
      await tx
        .insert(season)
        .values({ titleId, number: scope.season, ...set })
        .onConflictDoUpdate({ target: [season.titleId, season.number], set })
      return before?.id ?? null
    }
    const where = and(
      eq(episode.titleId, titleId),
      eq(episode.seasonNumber, scope.season),
      eq(episode.episodeNumber, scope.episode),
    )
    const [before] = await tx
      .select({ id: episode.stillId })
      .from(episode)
      .where(where)
    const set: Partial<Pick<EpisodeRow, "stillId">> &
      Pick<EpisodeRow, "stillChosen"> = { stillChosen: change.chosen }
    if (change.id !== undefined) set.stillId = change.id
    await tx
      .insert(episode)
      .values({
        titleId,
        seasonNumber: scope.season,
        episodeNumber: scope.episode,
        ...set,
      })
      .onConflictDoUpdate({
        target: [episode.titleId, episode.seasonNumber, episode.episodeNumber],
        set,
      })
    return before?.id ?? null
  })
}

function baseLanguage(tag: string): string {
  try {
    return new Intl.Locale(tag).language
  } catch {
    return tag.toLowerCase()
  }
}

/**
 * Best first, as Jellyfin orders them: in the library's language, then
 * English, then without text, then the rest, each by the provider's
 * rating. Backdrops go behind titles, so those without text come first.
 * Without `all`, the rest are left out.
 */
function rank(
  images: ImageCandidate[],
  language: string,
  all: boolean,
): ImageCandidate[] {
  const wanted = baseLanguage(language)
  const order = (image: ImageCandidate) => {
    const lang = image.language === null ? null : baseLanguage(image.language)
    const groups =
      image.slot === "backdrop" ? [null, wanted, "en"] : [wanted, "en", null]
    const group = groups.indexOf(lang)
    return group === -1 ? groups.length : group
  }
  return images
    .filter((image) => all || order(image) < 3)
    .toSorted(
      (a, b) => order(a) - order(b) || b.score - a.score || b.votes - a.votes,
    )
}

/** Each URL once, as TheTVDB can list an image twice. */
function unique(images: ImageCandidate[]): ImageCandidate[] {
  const byUrl = new Map<string, ImageCandidate>()
  for (const image of images) {
    if (!byUrl.has(image.url)) byUrl.set(image.url, image)
  }
  return [...byUrl.values()]
}

/** The match's provider, if the title has a match it can list images for. */
function matchedSource(row: TitleRow, lib: LibraryRow) {
  const source = sourceFor(lib)
  if (!source?.configured() || row.provider !== source.id) return null
  return row.providerId ? { source, providerId: row.providerId } : null
}

export const titleImages = {
  images: admin.titles.images.handler(async ({ input }) => {
    const row = await loadRow(input.id)
    return itemImages(row.id, scopeOf(row, input))
  }),

  remoteImages: admin.titles.remoteImages.handler(async ({ input }) => {
    const { row, lib } = await withLibrary(input.id)
    const scope = slotScope(row, input)
    const match = matchedSource(row, lib)
    if (!match) return []
    const { source, providerId } = match
    const found = await source
      .images(
        providerId,
        { kind: row.kind, language: lib.metadataLanguage },
        scope,
      )
      .catch((cause: unknown) => providerFailure(source.name, cause))
    const shown = rank(
      unique(found.filter((image) => image.slot === input.slot)),
      lib.metadataLanguage,
      input.allLanguages,
    ).slice(0, MAX_REMOTE_IMAGES)
    await saveArtwork(shown.flatMap((image) => [image.url, image.preview]))
    const previews = shown.map((image) => artworkId(image.preview ?? image.url))
    // Choices seen before have a placeholder.
    const art = await placeholders(previews)
    return shown.map((image, i): RemoteImage => {
      const preview = previews[i] ?? artworkId(image.url)
      return {
        id: artworkId(image.url),
        preview: { id: preview, placeholder: art.get(preview) ?? null },
        width: image.width,
        height: image.height,
        language: image.language,
      }
    })
  }),

  setImage: admin.titles.setImage.handler(async ({ input }) => {
    const row = await loadRow(input.id)
    const scope = slotScope(row, input)
    if (input.imageId !== null) {
      const [known] = await db
        .select({ id: artwork.id })
        .from(artwork)
        .where(eq(artwork.id, input.imageId))
      if (!known) {
        throw notFound("That image isn't available any more. Search again.")
      }
      // Ready, with its placeholder, before the page shows it.
      await prepareArtwork(known.id)
    }
    const before = await setSlot(row.id, scope, input.slot, {
      id: input.imageId,
      chosen: true,
    })
    await dropUnusedUploads([before])
    return itemImages(row.id, scope)
  }),

  uploadImage: admin.titles.uploadImage.handler(async ({ input }) => {
    const row = await loadRow(input.id)
    const scope = slotScope(row, input)
    const id = await saveUpload(new Uint8Array(await input.file.arrayBuffer()))
    if (!id) throw badRequest("Pick a JPEG, PNG, or WebP image.")
    const before = await setSlot(row.id, scope, input.slot, {
      id,
      chosen: true,
    })
    await dropUnusedUploads([before])
    return itemImages(row.id, scope)
  }),

  resetImage: admin.titles.resetImage.handler(async ({ input }) => {
    const { row, lib } = await withLibrary(input.id)
    const scope = slotScope(row, input)
    const match = matchedSource(row, lib)
    // Without a match there is no provider image to go back to. With one,
    // the image stays until the refresh puts the provider's in.
    const before = await setSlot(row.id, scope, input.slot, {
      id: match ? undefined : null,
      chosen: false,
    })
    if (match) {
      await refreshTitleNow(row, lib).catch((cause: unknown) =>
        providerFailure(match.source.name, cause),
      )
    }
    await dropUnusedUploads([before])
    return itemImages(row.id, scope)
  }),
}
