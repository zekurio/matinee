import {
  MAX_USER_THEMES,
  type SyncedThemePreferences,
  UserTheme,
} from "@matinee/contracts"
import { user, userTheme, type UserRow, type UserThemeRow } from "@matinee/db"
import { and, asc, eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"

/**
 * The theme as clients read it. A row that no longer fits the contract (say,
 * after a color role is removed) is left out rather than failing the list.
 */
function publicUserTheme(row: UserThemeRow): UserTheme | null {
  const parsed = UserTheme.safeParse({
    id: row.id,
    name: row.name,
    variants: row.variants,
    guided: row.guided,
  })
  if (!parsed.success) {
    log.warn(`Skipping stored theme ${row.id} that no longer validates`)
    return null
  }
  return parsed.data
}

/** The user's themes, oldest first, so a new theme joins the end. */
export async function listUserThemes(userId: string): Promise<UserTheme[]> {
  const rows = await db
    .select()
    .from(userTheme)
    .where(eq(userTheme.userId, userId))
    .orderBy(asc(userTheme.createdAt), asc(userTheme.id))
  return rows.flatMap((row) => {
    const theme = publicUserTheme(row)
    return theme ? [theme] : []
  })
}

/**
 * Replaces the user's theme with this id, or adds it while they're under
 * `MAX_USER_THEMES`. Null means the limit stopped a new theme.
 */
export async function saveUserTheme(
  userId: string,
  input: UserTheme,
): Promise<UserTheme | null> {
  const values = {
    name: input.name,
    variants: input.variants,
    guided: input.guided,
  }
  const [updated] = await db
    .update(userTheme)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(userTheme.userId, userId), eq(userTheme.id, input.id)))
    .returning()
  if (updated) return input

  // Simultaneous first saves can each pass this check; the limit only bounds
  // storage, so going over by a theme or two is fine.
  const count = await db.$count(userTheme, eq(userTheme.userId, userId))
  if (count >= MAX_USER_THEMES) return null
  await db
    .insert(userTheme)
    .values({ userId, id: input.id, ...values })
    .onConflictDoUpdate({
      target: [userTheme.userId, userTheme.id],
      set: { ...values, updatedAt: new Date() },
    })
  return input
}

/** Deleting a theme that's already gone, say from another device, is fine. */
export async function deleteUserTheme(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .delete(userTheme)
    .where(and(eq(userTheme.userId, userId), eq(userTheme.id, id)))
}

export async function updateThemePreferences(
  userId: string,
  preferences: SyncedThemePreferences,
): Promise<UserRow | null> {
  const [row] = await db
    .update(user)
    .set({ themePreferences: preferences })
    .where(eq(user.id, userId))
    .returning()
  return row ?? null
}
