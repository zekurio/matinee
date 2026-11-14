import type { CatalogRef, RelatedTitle } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { title } from "@matinee/db"
import { and, inArray } from "drizzle-orm"

import type { Viewer } from "../access/viewer"
import { visibleTitles } from "../access/visible"
import { db } from "../db"
import { placeholders, saveArtwork, toArtwork } from "../media/artwork"
import { toSummaries } from "../media/items"
import { availability } from "../requests/availability"
import { withCachedDetails } from "../requests/cached-details"

/** A TMDB title as a feed or a browse lists it. */
type Row = {
  id: string
  name: string
  year: number | null
  poster: string | null
  releaseDate: string | null
}

/**
 * TMDB titles of one kind as cards, in their order, each with the
 * viewer's availability. A title here brings its library's card, which
 * clients draw in its place. A declined title stays, shown as not
 * available: browsing finds it as search does. Each card comes with its
 * row, for what the caller adds to it.
 */
export async function catalogCards<R extends Row>(
  viewer: Viewer,
  kind: CatalogRef["kind"],
  rows: R[],
): Promise<{ row: R; card: t.infer<typeof RelatedTitle> }[]> {
  const refs = rows.map((row) => {
    const ref: CatalogRef = { kind, provider: "tmdb", providerId: row.id }
    return { ref, releaseDate: row.releaseDate }
  })
  const states = await availability(
    viewer,
    await withCachedDetails(viewer, refs),
  )
  // Availability names only titles in libraries the viewer can see, and
  // this reads only those.
  const here = states.flatMap((state) =>
    state.availability.libraryTitleId
      ? [state.availability.libraryTitleId]
      : [],
  )
  const owned = here.length
    ? await toSummaries(
        await db
          .select()
          .from(title)
          .where(and(inArray(title.id, here), visibleTitles(viewer))),
        viewer.id,
      )
    : []
  const saved = await saveArtwork(rows.map((row) => row.poster))
  const art = await placeholders([...saved.values()])
  return rows.flatMap((row, index) => {
    const state = states[index]?.availability
    const ref = refs[index]?.ref
    if (!state || !ref) return []
    const library = state.libraryTitleId
      ? (owned.find((summary) => summary.id === state.libraryTitleId) ?? null)
      : null
    return [
      {
        row,
        card: {
          ref,
          name: row.name,
          year: row.year,
          poster: toArtwork(
            row.poster ? (saved.get(row.poster) ?? null) : null,
            art,
          ),
          availability: state,
          title: state.state === "here" ? library : null,
        },
      },
    ]
  })
}
