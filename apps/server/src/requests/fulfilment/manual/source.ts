import { t } from "@matinee/contracts/schema"
import { library, libraryFolder } from "@matinee/db"
import { asc, eq, isNotNull } from "drizzle-orm"

import { db } from "../../../db"
import { field, filled } from "../arr/shared"
import type { FulfilmentSource } from "../types"

const options = t.object({
  movieFolder: t.string().min(1).optional(),
  showFolder: t.string().min(1).optional(),
})

const sending = t.object({ folder: t.string().min(1).nullable() })

/**
 * No backend. An approved request waits until an admin adds the file by
 * hand and the library scan finds it. Its folders say which library a
 * request lands in, one for films and one for shows, from the folders
 * Matinee scans.
 */
export const manual = {
  id: "manual",
  name: "By hand",
  kinds: ["movie", "show"],
  needs: [],
  scope: "season",
  apiKey: false,
  rules: false,
  settings: { parse: () => ({}) },
  fields: () => [],
  defaults: {},
  parseOptions: (value) => options.parse(filled(value)),
  sending(value, title) {
    const own = options.parse(value)
    return {
      folder:
        (title.kind === "movie" ? own.movieFolder : own.showFolder) ?? null,
    }
  },
  folder: (value) => sending.parse(value).folder,
  async options() {
    // ACCESS: an admin procedure, over every library.
    const rows = await db
      .select({
        path: libraryFolder.path,
        name: library.name,
        kind: library.kind,
      })
      .from(libraryFolder)
      .innerJoin(library, eq(library.id, libraryFolder.libraryId))
      .where(isNotNull(library.metadataProvider))
      .orderBy(asc(library.name), asc(libraryFolder.path))
    const choices = (kind: "movies" | "shows") =>
      rows
        .filter((row) => row.kind === kind)
        .map((row) => ({
          value: row.path,
          label: row.path,
          description: row.name,
        }))
    return {
      fields: [
        field("movieFolder", "Films folder", "select", "defaults", {
          choices: choices("movies"),
          folder: "movie",
        }),
        field("showFolder", "Shows folder", "select", "defaults", {
          choices: choices("shows"),
          folder: "show",
        }),
      ],
      values: {},
      rule: [],
    }
  },
  test: () => Promise.resolve(),
  submit: () => Promise.resolve({}),
} satisfies FulfilmentSource
