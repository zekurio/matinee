import { SyncedThemePreferences } from "@matinee/contracts"
import {
  applySyncedThemePreferences,
  deleteCustomTheme,
  getThemeState,
  saveCustomTheme,
  setCustomThemes,
  setServerThemeAccents,
  subscribeThemeEdits,
  syncedThemePreferences,
} from "@matinee/ui/lib/theme"
import {
  accountThemeInput,
  customThemeFromAccount,
  type CustomTheme,
} from "@matinee/ui/lib/theme-custom"
import { useQuery } from "@tanstack/react-query"
import { useEffect } from "react"

import { client, orpc, queryClient } from "./rpc"

/**
 * Keeps the theme engine in step with the server: the account's theme choice
 * and custom themes, and the admin's accent for the Matinee theme. Adapted
 * from alloy.
 *
 * Another device's change arrives with the next session and theme list
 * read. Both are queries, so coming back to the tab reads them again once
 * they're older than the client's stale time.
 */

/** Coalesces bursts, such as clicking through themes, into one save. */
const SAVE_DELAY_MS = 800

/** Theme choice saves: the one waiting out the delay, and the one in flight. */
interface SaveState {
  timer: number | undefined
  saving: Promise<void> | null
  queued: SyncedThemePreferences | null
}

const saves: SaveState = { timer: undefined, saving: null, queued: null }

function scheduleSave(synced: SyncedThemePreferences) {
  saves.queued = synced
  window.clearTimeout(saves.timer)
  saves.timer = window.setTimeout(() => {
    saves.timer = undefined
    void flushSave()
  }, SAVE_DELAY_MS)
}

/** Saves the latest queued choice, one request at a time. */
async function flushSave(): Promise<void> {
  if (saves.saving) await saves.saving
  const next = saves.queued
  saves.queued = null
  // Local storage isn't checked against the contract; ids that don't fit
  // stay on this device.
  const parsed = next ? SyncedThemePreferences.safeParse(next) : null
  if (!parsed?.success) return
  saves.saving = client.account.theme
    .setPreferences(parsed.data)
    .then(() => undefined)
    // The theme still applies here; the next change tries the save again.
    .catch(() => undefined)
    .finally(() => {
      saves.saving = null
    })
  await saves.saving
}

function saveOutstanding(): boolean {
  return (
    saves.timer !== undefined || saves.saving !== null || saves.queued !== null
  )
}

/**
 * The account's custom themes. The key names the user, so signing in as
 * someone else never starts from the last account's cached list.
 */
function accountThemesQuery(userId: string | null) {
  return orpc.account.theme.list.queryOptions({
    queryKey: [...orpc.account.theme.list.queryKey(), userId],
    enabled: userId !== null,
  })
}

/**
 * Runs a change to the account's custom themes. A list read that overlaps it
 * may predate it and would bring back a deleted theme or undo an edit, so
 * reads on their way are dropped and the list is read again afterwards.
 */
async function changeAccountThemes<Result>(
  change: () => Promise<Result>,
): Promise<Result> {
  const lists = { queryKey: orpc.account.theme.list.key() }
  await queryClient.cancelQueries(lists)
  try {
    return await change()
  } finally {
    // Cancels a read sent meanwhile and starts a fresh one.
    void queryClient.invalidateQueries(lists)
  }
}

/** Saves a new or edited theme, then shows it. Throws when the save fails. */
export function saveAccountTheme(theme: CustomTheme): Promise<CustomTheme> {
  return changeAccountThemes(async () => {
    const saved = customThemeFromAccount(
      await client.account.theme.save({
        id: theme.id,
        ...accountThemeInput(theme),
      }),
    )
    saveCustomTheme(saved)
    return saved
  })
}

/** Deletes the theme; appearances that used it go back to Matinee. */
export function deleteAccountTheme(id: string): Promise<void> {
  return changeAccountThemes(async () => {
    await client.account.theme.remove({ id })
    deleteCustomTheme(id)
  })
}

/** Applies the server's accents for the Matinee theme, signed in or not. */
export function ServerThemeAccents() {
  const config = useQuery(orpc.auth.config.queryOptions())
  const accents = config.data?.themeAccents
  // Hands each config's accents to the theme engine, which paints them.
  useEffect(() => {
    if (accents) setServerThemeAccents(accents)
  }, [accents])
  return null
}

/**
 * Shares the theme between the signed-in user's devices: edits made here are
 * saved to the account, and the account's choice is adopted when the session
 * loads. Devices with sync off (see Appearance) do neither, but still get
 * the account's custom themes.
 */
export function ThemeAccountSync() {
  const session = useQuery(orpc.auth.session.queryOptions())
  const user = session.data?.user
  const userId = user?.id ?? null
  // Structural sharing keeps this the same object until the choice changes.
  const saved = user?.theme ?? null
  const themes = useQuery(accountThemesQuery(userId)).data

  // Sends this device's theme edits to the account while signed in.
  useEffect(() => {
    if (!userId) return
    return subscribeThemeEdits(scheduleSave)
  }, [userId])

  // Brings the account's theme choice into the theme engine.
  useEffect(() => {
    // An edit still on its way would be undone by the older saved copy.
    if (!userId || saveOutstanding()) return
    if (saved) {
      applySyncedThemePreferences(saved)
      return
    }
    // The account has no theme yet, so this device's becomes it.
    const { preferences } = getThemeState()
    if (preferences.sync) scheduleSave(syncedThemePreferences(preferences))
  }, [userId, saved])

  // Brings the account's custom themes into the theme engine, which keeps a
  // copy in local storage for the next load.
  useEffect(() => {
    if (themes) setCustomThemes(themes.map(customThemeFromAccount))
  }, [themes])

  return null
}
