import { NO_THEME_ACCENTS, ThemeAccents } from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"

/*
 * The accents an admin picked for the default Matinee theme, shown to
 * everyone on the server, signed in or not. They load once and change only
 * through `saveThemeAccents`, so the public auth config reads them for free.
 */

const KEY = "theme_accents"

let saved: ThemeAccents | null = null
let loading: Promise<ThemeAccents> | null = null

async function readSaved(): Promise<ThemeAccents> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  if (!row) return NO_THEME_ACCENTS
  const parsed = ThemeAccents.safeParse(row.value)
  if (!parsed.success) {
    log.warn(
      "Ignoring saved theme accents that no longer validate",
      parsed.error,
    )
    return NO_THEME_ACCENTS
  }
  return parsed.data
}

export async function themeAccents(): Promise<ThemeAccents> {
  if (saved) return saved
  loading ??= readSaved()
    .then((accents) => {
      saved = accents
      return accents
    })
    .finally(() => {
      loading = null
    })
  return loading
}

export async function saveThemeAccents(
  input: ThemeAccents,
): Promise<ThemeAccents> {
  const next = { light: input.light, dark: input.dark }
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
  saved = next
  return next
}
