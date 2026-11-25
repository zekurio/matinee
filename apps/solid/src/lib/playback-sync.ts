import {
  DEFAULT_PLAYBACK_PREFERENCES,
  DEFAULT_SKIP_SECONDS,
  LanguageTag,
  type PlaybackPreferences,
  SkipSeconds,
  type User,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/solid-query"
import { createEffect, createMemo } from "solid-js"

import { tr } from "@/i18n"
import { toast } from "@/kit/toast"
import { usePendingPlaybackStore } from "@/stores/playback-preferences"
import { usePlayerPreferencesStore } from "@/stores/player-preferences"

import { client, errorMessage, orpc, queryClient } from "./rpc"

/*
 * The audio, subtitle, and skip preferences follow the account, so every
 * device signed in to it plays the same languages and skips as far. A change shows at once and is
 * saved a moment later; another device picks it up with its next session
 * read. The codecs and quality stay with each device, in
 * `usePlayerPreferencesStore`.
 */

/** Coalesces bursts, such as a few picks in a row, into one save. */
const SAVE_DELAY_MS = 600

let timer: number | undefined
let saving: Promise<void> | null = null

function sessionUser(): User | null {
  return queryClient.getQueryData(orpc.auth.session.queryKey())?.user ?? null
}

/** The preferences now, for code that runs outside a render. */
export function currentPlaybackPreferences(): PlaybackPreferences {
  return (
    usePendingPlaybackStore.getState().pending ??
    sessionUser()?.playback ??
    DEFAULT_PLAYBACK_PREFERENCES
  )
}

/** Accessor for the account's preferences, with a pending change in place. */
export function usePlaybackPreferences() {
  const session = useQuery(() => orpc.auth.session.queryOptions())
  const pending = usePendingPlaybackStore((state) => state.pending)
  return () =>
    pending() ??
    (session.isSuccess || session.isRefetchError
      ? session.data?.user?.playback
      : undefined) ??
    DEFAULT_PLAYBACK_PREFERENCES
}

/** Change some of the preferences. They apply at once and save shortly. */
export function updatePlaybackPreferences(
  change: Partial<PlaybackPreferences>,
): void {
  const current = currentPlaybackPreferences()
  const next = { ...current, ...change }
  if (
    next.audioLanguage === current.audioLanguage &&
    next.subtitleMode === current.subtitleMode &&
    next.subtitleLanguage === current.subtitleLanguage &&
    next.rememberSubtitles === current.rememberSubtitles &&
    next.rememberAudio === current.rememberAudio &&
    next.skipBackSeconds === current.skipBackSeconds &&
    next.skipForwardSeconds === current.skipForwardSeconds
  ) {
    return
  }
  usePendingPlaybackStore.getState().setPending(next)
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = undefined
    void flushSave()
  }, SAVE_DELAY_MS)
}

/** Saves the pending change, one request at a time. */
async function flushSave(): Promise<void> {
  if (saving) await saving
  const next = usePendingPlaybackStore.getState().pending
  if (!next) return
  // Clears the pending change unless another came while this one saved.
  const settle = () => {
    const { pending, setPending } = usePendingPlaybackStore.getState()
    if (pending === next) setPending(null)
  }
  saving = client.account.playback
    .setPreferences(next)
    .then((user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      settle()
    })
    .catch((cause: unknown) => {
      // Back to what the account has, so nothing pretends it was saved.
      settle()
      toast.error(tr("player.error.savePreferences"), {
        description: errorMessage(cause),
      })
    })
    .finally(() => {
      saving = null
    })
  await saving
}

/** Where the player kept the last subtitle pick before the account did. */
const LEGACY_SUBTITLES_KEY = "matinee.subtitles"

const LegacySubtitles = t.object({
  enabled: t.boolean(),
  language: t.string().nullable(),
})

/** The pick this browser remembered, as preferences, and then forgets it. */
function takeLegacySubtitles(): Partial<PlaybackPreferences> | null {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(LEGACY_SUBTITLES_KEY)
    window.localStorage.removeItem(LEGACY_SUBTITLES_KEY)
  } catch {
    // Storage is off, so there's nothing to bring along.
  }
  if (stored === null) return null
  try {
    const parsed = LegacySubtitles.safeParse(JSON.parse(stored))
    if (!parsed.success) return null
    const language = LanguageTag.safeParse(parsed.data.language)
    return {
      // Off kept showing forced tracks, as `forced` does.
      subtitleMode: parsed.data.enabled ? "always" : "forced",
      subtitleLanguage: language.success ? language.data : null,
    }
  } catch {
    return null
  }
}

/** Where the player kept how far it skipped before the account did. */
const LEGACY_PLAYER_KEY = "matinee.player"

const LegacySkip = t.object({ skipSeconds: SkipSeconds })

/**
 * How far this browser skipped, and then it forgets it: the player's
 * preferences no longer keep it, so writing them back drops it.
 */
function takeLegacySkip(): number | null {
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(LEGACY_PLAYER_KEY)
  } catch {
    return null
  }
  if (stored === null) return null
  try {
    const parsed = LegacySkip.safeParse(JSON.parse(stored))
    if (!parsed.success) return null
    // A preference write saves the device settings without the old key.
    usePlayerPreferencesStore.getState().setDevicePlayback({})
    return parsed.data.skipSeconds
  } catch {
    return null
  }
}

/** This browser's old skip, while the account's skips are the defaults. */
function legacySkip(): number | null {
  const skip = takeLegacySkip()
  const current = currentPlaybackPreferences()
  const untouched =
    current.skipBackSeconds === DEFAULT_SKIP_SECONDS &&
    current.skipForwardSeconds === DEFAULT_SKIP_SECONDS
  return untouched ? skip : null
}

/**
 * Brings what this browser remembered before the account kept it into the
 * account, as the theme's first sync does: the subtitle pick when the
 * account has no preferences yet, and the skip length when its skips are
 * still the defaults. What the account has already wins, and the browser
 * forgets its own either way.
 */
export function PlaybackAccountSync() {
  const session = useQuery(() => orpc.auth.session.queryOptions())
  const user = () => (session.isSuccess ? session.data?.user : undefined)
  const userId = createMemo(() => user()?.id ?? null)
  const unset = createMemo(() => user()?.playback === null)

  createEffect(
    () => ({ id: userId(), unset: unset() }),
    ({ id, unset }) => {
      if (!id) return
      const legacy = takeLegacySubtitles()
      const skip = legacySkip()
      if ((legacy && unset) || skip !== null) {
        updatePlaybackPreferences({
          ...(unset ? legacy : null),
          ...(skip === null
            ? null
            : { skipBackSeconds: skip, skipForwardSeconds: skip }),
        })
      }
    },
  )

  return null
}
