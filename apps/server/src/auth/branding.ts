import {
  type Branding,
  DEFAULT_LOGIN_BACKDROP,
  LoginBackdrop,
  NO_THEME_ACCENTS,
  ThemeAccents,
} from "@matinee/contracts"
import { setting } from "@matinee/db"
import { inArray } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"

/*
 * How the server looks to everyone on it, signed in or not: the accents
 * an admin picked for the default Matinee theme, and the login backdrop.
 * They load once and change only through `saveBranding`, so the public
 * auth config and every artwork request read them for free.
 */

const ACCENTS_KEY = "theme_accents"
const BACKDROP_KEY = "login_backdrop"

const SavedBackdrop = LoginBackdrop.partial()

let saved: Branding | null = null
let loading: Promise<Branding> | null = null

async function readSaved(): Promise<Branding> {
  const rows = await db
    .select()
    .from(setting)
    .where(inArray(setting.key, [ACCENTS_KEY, BACKDROP_KEY]))
  const value = (key: string) => rows.find((row) => row.key === key)?.value
  const accents = ThemeAccents.safeParse(value(ACCENTS_KEY) ?? NO_THEME_ACCENTS)
  if (!accents.success) {
    log.warn(
      "Ignoring saved theme accents that no longer validate",
      accents.error,
    )
  }
  const backdrop = SavedBackdrop.safeParse(value(BACKDROP_KEY) ?? {})
  if (!backdrop.success) {
    log.warn(
      "Ignoring saved login backdrop settings that no longer validate",
      backdrop.error,
    )
  }
  // Settings saved before one was added take its default.
  const loginBackdrop = { ...DEFAULT_LOGIN_BACKDROP }
  if (backdrop.success) Object.assign(loginBackdrop, backdrop.data)
  return {
    themeAccents: accents.success ? accents.data : NO_THEME_ACCENTS,
    loginBackdrop,
  }
}

export async function branding(): Promise<Branding> {
  if (saved) return saved
  loading ??= readSaved()
    .then((read) => {
      saved = read
      return read
    })
    .finally(() => {
      loading = null
    })
  return loading
}

export async function themeAccents(): Promise<ThemeAccents> {
  return (await branding()).themeAccents
}

export async function loginBackdrop(): Promise<LoginBackdrop> {
  return (await branding()).loginBackdrop
}

export async function saveBranding(input: Branding): Promise<Branding> {
  const next: Branding = {
    themeAccents: {
      light: input.themeAccents.light,
      dark: input.themeAccents.dark,
    },
    loginBackdrop: { ...input.loginBackdrop },
  }
  await db.transaction(async (tx) => {
    for (const [key, value] of [
      [ACCENTS_KEY, next.themeAccents],
      [BACKDROP_KEY, next.loginBackdrop],
    ] as const) {
      await tx
        .insert(setting)
        .values({ key, value })
        .onConflictDoUpdate({
          target: setting.key,
          set: { value, updatedAt: new Date() },
        })
    }
  })
  saved = next
  return next
}
