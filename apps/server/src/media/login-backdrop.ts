import type {
  ArtworkSize,
  LoginBackdropArtwork,
  LoginBackdropKind,
  LoginBackdropTile,
} from "@matinee/contracts"
import { artwork, title } from "@matinee/db"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import { everyoneAccess } from "../access/groups"
import { visibleTitles } from "../access/visible"
import { loginBackdrop } from "../auth/branding"
import { db } from "../db"

/*
 * The wall of artwork behind the login form. Anyone who opens the login
 * page sees it, so it shows only titles from the libraries the built-in
 * group opens, and only images the server has downloaded already: a
 * visitor never makes it fetch from a provider or scale a large copy.
 */

/** About as many as fill the wall before rows repeat themselves. */
const TILES = 40

/** Posters are narrow, so a mixed wall takes more of them. */
const MIXED_POSTERS = 24

/** The sizes the wall loads, the only ones served without a session. */
export const LOGIN_BACKDROP_SIZES: ReadonlySet<ArtworkSize> = new Set([
  "thumb",
  "small",
])

function columnOf(kind: LoginBackdropKind): PgColumn {
  return kind === "poster" ? title.posterId : title.backdropId
}

function kindsFor(choice: LoginBackdropArtwork): LoginBackdropKind[] {
  if (choice === "posters") return ["poster"]
  if (choice === "thumbs") return ["thumb"]
  return ["poster", "thumb"]
}

async function pick(
  kind: LoginBackdropKind,
  limit: number,
): Promise<LoginBackdropTile[]> {
  const viewer = { access: await everyoneAccess() }
  const rows = await db
    .select({
      id: artwork.id,
      blurhash: artwork.blurhash,
      aspectRatio: artwork.aspectRatio,
    })
    .from(title)
    // A placeholder means the server has the image and its small copy.
    .innerJoin(artwork, eq(artwork.id, columnOf(kind)))
    .where(and(visibleTitles(viewer), isNotNull(artwork.blurhash)))
    .orderBy(sql`random()`)
    .limit(limit)
  return rows.map(({ id, blurhash, aspectRatio }) => ({
    artwork: {
      id,
      placeholder: blurhash && aspectRatio ? { blurhash, aspectRatio } : null,
    },
    kind,
  }))
}

/** In place, uniformly at random. */
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = list[i]
    const b = list[j]
    if (a === undefined || b === undefined) continue
    list[i] = b
    list[j] = a
  }
  return list
}

/**
 * A fresh random set for the wall. A mixed wall takes posters and thumbs
 * in one shuffled order, so each row is a different run of kinds.
 */
export async function loginBackdropTiles(
  choice: LoginBackdropArtwork,
): Promise<LoginBackdropTile[]> {
  const kinds = kindsFor(choice)
  const picked = await Promise.all(
    kinds.map((kind) =>
      pick(
        kind,
        kinds.length === 1
          ? TILES
          : kind === "poster"
            ? MIXED_POSTERS
            : TILES - MIXED_POSTERS,
      ),
    ),
  )
  // A title can share an image with another; the wall shows it once.
  const seen = new Set<string>()
  return shuffle(
    picked.flat().filter(({ artwork: { id } }) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
}

/**
 * Whether someone who isn't signed in may load the image: the backdrop is
 * on, and it's one the wall could show now.
 */
export async function showsOnLoginBackdrop(
  id: string,
  size: ArtworkSize,
): Promise<boolean> {
  if (!LOGIN_BACKDROP_SIZES.has(size)) return false
  const backdrop = await loginBackdrop()
  if (!backdrop.enabled) return false
  const viewer = { access: await everyoneAccess() }
  const checks = kindsFor(backdrop.artwork).map(async (kind) => {
    const column = columnOf(kind)
    const rows = await db
      .select({ id: title.id })
      .from(title)
      .innerJoin(artwork, eq(artwork.id, column))
      .where(
        and(eq(column, id), visibleTitles(viewer), isNotNull(artwork.blurhash)),
      )
      .limit(1)
    return rows.length > 0
  })
  return (await Promise.all(checks)).some(Boolean)
}
