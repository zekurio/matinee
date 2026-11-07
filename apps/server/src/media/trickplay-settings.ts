import { TrickplaySettings } from "@matinee/contracts"
import { setting } from "@matinee/db"
import { eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"

/*
 * How the server makes trickplay images, as an admin set it. Settings load
 * once and change only through `saveTrickplay`, so a job reads them for
 * free.
 */

const KEY = "trickplay"

const SavedTrickplay = TrickplaySettings.partial()
type Saved = Partial<TrickplaySettings>

let saved: Saved | null = null
let loading: Promise<Saved> | null = null

/**
 * Jellyfin's TrickplayOptions, but on and with keyframes only. Decoding
 * every frame of a 24-minute 1080p H.264 episode took four CPU minutes in
 * a test; its keyframes took 20 seconds, which makes a library feasible.
 * Hardware decoding is off, as in Jellyfin.
 */
export const TRICKPLAY_DEFAULTS: TrickplaySettings = {
  enabled: true,
  intervalSeconds: 10,
  width: 320,
  keyframesOnly: true,
  hardwareDecoding: false,
}

async function load(): Promise<Saved> {
  if (saved) return saved
  loading ??= readSaved().finally(() => {
    loading = null
  })
  return loading
}

async function readSaved(): Promise<Saved> {
  const [row] = await db.select().from(setting).where(eq(setting.key, KEY))
  const parsed = SavedTrickplay.safeParse(row?.value ?? {})
  if (!parsed.success) {
    log.warn(
      "Ignoring saved trickplay settings that no longer validate",
      parsed.error,
    )
  }
  saved = parsed.success ? parsed.data : {}
  return saved
}

/** The settings in use: saved values over the defaults. */
export async function trickplaySettings(): Promise<TrickplaySettings> {
  return { ...TRICKPLAY_DEFAULTS, ...(await load()) }
}

export async function saveTrickplay(
  input: TrickplaySettings,
): Promise<TrickplaySettings> {
  const next: Saved = { ...input }
  await db
    .insert(setting)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: next, updatedAt: new Date() },
    })
  saved = next
  return { ...TRICKPLAY_DEFAULTS, ...next }
}
