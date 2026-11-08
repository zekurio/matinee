import type { TitleImageSlot } from "@matinee/contracts"
import { episode, season, title } from "@matinee/db"
import { and, eq } from "drizzle-orm"

import type { Tx } from "../auth/users"
import { uploadedArtwork } from "../media/artwork"

/** The column of `title` that holds each of its images. */
export const TITLE_IMAGE_COLUMNS = {
  poster: "posterId",
  backdrop: "backdropId",
  logo: "logoId",
} as const satisfies Record<TitleImageSlot, keyof typeof title.$inferSelect>

/**
 * The images an admin chose for a title and its seasons and episodes, by
 * where they go. A null id is an image removed on purpose.
 */
export type Choices = {
  title: Map<TitleImageSlot, string | null>
  /** By season number. */
  seasons: Map<number, string | null>
  /** By `episodeKey`. */
  episodes: Map<string, { season: number; episode: number; id: string | null }>
}

export function episodeKey(season: number, episode: number): string {
  return `${season}x${episode}`
}

/**
 * Lock the title's row and read what an admin chose for it, so a refresh
 * can keep it. A choice made meanwhile waits for the refresh, since it
 * locks the row too. With `onlyUploads`, as when the title gets another
 * match, the provider's images are dropped, since they show the old one.
 */
export async function readChoices(
  tx: Tx,
  titleId: string,
  options: { onlyUploads: boolean },
): Promise<Choices> {
  const [row] = await tx
    .select()
    .from(title)
    .where(eq(title.id, titleId))
    .for("update")
  const [seasons, episodes] = await Promise.all([
    tx
      .select({ number: season.number, id: season.posterId })
      .from(season)
      .where(and(eq(season.titleId, titleId), eq(season.posterChosen, true))),
    tx
      .select({
        season: episode.seasonNumber,
        episode: episode.episodeNumber,
        id: episode.stillId,
      })
      .from(episode)
      .where(and(eq(episode.titleId, titleId), eq(episode.stillChosen, true))),
  ])
  const choices: Choices = {
    title: new Map(
      (row?.chosenImages ?? []).map((slot) => [
        slot,
        row?.[TITLE_IMAGE_COLUMNS[slot]] ?? null,
      ]),
    ),
    seasons: new Map(seasons.map((s) => [s.number, s.id])),
    episodes: new Map(
      episodes.map((e) => [episodeKey(e.season, e.episode), e]),
    ),
  }
  if (!options.onlyUploads) return choices
  const uploads = await uploadedArtwork([
    ...choices.title.values(),
    ...choices.seasons.values(),
    ...episodes.map((e) => e.id),
  ])
  const kept = (id: string | null) => id !== null && uploads.has(id)
  for (const [slot, id] of choices.title) {
    if (!kept(id)) choices.title.delete(slot)
  }
  for (const [number, id] of choices.seasons) {
    if (!kept(id)) choices.seasons.delete(number)
  }
  for (const [key, choice] of choices.episodes) {
    if (!kept(choice.id)) choices.episodes.delete(key)
  }
  return choices
}
