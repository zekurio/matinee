import {
  type AudioLanguage,
  DEFAULT_PLAYBACK_PREFERENCES,
  DEFAULT_SKIP_SECONDS,
  LanguageTag,
  ORIGINAL_LANGUAGE,
  type PlaybackPreferences,
  SkipSeconds,
  type User,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { toast } from "@matinee/ui/components/sonner"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"

import { tr } from "@/i18n"
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

/** The signed-in account's preferences, with a change on its way in place. */
export function usePlaybackPreferences(): PlaybackPreferences {
  const saved = useQuery(orpc.auth.session.queryOptions()).data?.user?.playback
  const pending = usePendingPlaybackStore((state) => state.pending)
  return pending ?? saved ?? DEFAULT_PLAYBACK_PREFERENCES
}

/**
 * The tag an audio language preference stands for in a title: `original`
 * becomes the title's own language, which is null when unknown.
 */
export function audioLanguageFor(
  preference: AudioLanguage | null,
  originalLanguage: string | null,
): string | null {
  return preference === ORIGINAL_LANGUAGE ? originalLanguage : preference
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
  let json: unknown
  try {
    json = JSON.parse(stored)
  } catch {
    return null
  }
  const parsed = LegacySubtitles.safeParse(json)
  if (!parsed.success) return null
  const language = LanguageTag.safeParse(parsed.data.language)
  return {
    // Off kept showing forced tracks, as `forced` does.
    subtitleMode: parsed.data.enabled ? "always" : "forced",
    subtitleLanguage: language.success ? language.data : null,
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
  let json: unknown
  try {
    json = JSON.parse(stored)
  } catch {
    return null
  }
  const parsed = LegacySkip.safeParse(json)
  if (!parsed.success) return null
  // Any set writes the store back without the old key.
  usePlayerPreferencesStore.setState({})
  return parsed.data.skipSeconds
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
  const session = useQuery(orpc.auth.session.queryOptions())
  const user = session.data?.user
  const userId = user?.id ?? null
  const unset = user ? user.playback === null : false

  // Moves the pick and the skip from local storage into the account.
  useEffect(() => {
    if (!userId) return
    const legacy = takeLegacySubtitles()
    if (legacy && unset) updatePlaybackPreferences(legacy)
    // Both changes go out in the same save.
    const skip = legacySkip()
    if (skip !== null) {
      updatePlaybackPreferences({
        skipBackSeconds: skip,
        skipForwardSeconds: skip,
      })
    }
  }, [userId, unset])

  return null
}
