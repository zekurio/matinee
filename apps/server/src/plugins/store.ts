import {
  PluginConfigValues,
  PluginGrant,
  PluginManifest,
  PluginSource,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { plugin, pluginIdentity, type PluginRow } from "@matinee/db"
import { countDistinct, eq } from "drizzle-orm"

import { db } from "../db"
import { log } from "../log"
import { events } from "../realtime/events"
import { Json } from "./schema"

export const rows = new Map<string, PluginRow>()
const Secrets = t.record(t.string(), t.string().max(10000))
const Options = t.record(t.string(), Json)
const Update = t
  .object({ version: t.string(), checkedAt: t.string() })
  .nullable()

export function changed(): void {
  void events.publish("plugins", undefined)
}
/** How many accounts sign in through one of a plugin's providers. */
export async function linkedAccounts(id: string): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(pluginIdentity.userId) })
    .from(pluginIdentity)
    .where(eq(pluginIdentity.pluginId, id))
  return row?.n ?? 0
}
/**
 * Forget who signs in through a plugin. Their accounts stay, and so do
 * the sessions they are signed in with now.
 */
export async function removeLinks(id: string): Promise<void> {
  await db.delete(pluginIdentity).where(eq(pluginIdentity.pluginId, id))
}

/**
 * Read the saved plugins. A column that no longer parses, from an older
 * server or a hand edit, falls back to nothing: the plugin then waits for
 * an admin again instead of keeping every other plugin from loading.
 */
export async function loadRows(): Promise<void> {
  for (const row of await db.select().from(plugin)) {
    const source = PluginSource.safeParse(row.source)
    if (!source.success) {
      log.warn(`Ignoring plugin ${row.id}: its saved source is unreadable`)
      continue
    }
    rows.set(row.id, {
      ...row,
      source: source.data,
      manifest: PluginManifest.nullable().safeParse(row.manifest).data ?? null,
      grant: PluginGrant.nullable().safeParse(row.grant).data ?? null,
      config: PluginConfigValues.safeParse(row.config).data ?? {},
      secrets: Secrets.safeParse(row.secrets).data ?? {},
      options: Options.safeParse(row.options).data ?? {},
      update: Update.safeParse(row.update).data ?? null,
    })
  }
}

export async function saveRow(
  id: string,
  values: Partial<typeof plugin.$inferInsert>,
): Promise<PluginRow> {
  const [row] = await db
    .insert(plugin)
    .values({ id, source: { type: "directory", path: "" }, ...values })
    .onConflictDoUpdate({
      target: plugin.id,
      set: { ...values, updatedAt: new Date() },
    })
    .returning()
  if (!row) throw new Error(`Couldn't save plugin ${id}`)
  rows.set(id, row)
  changed()
  return row
}

export async function deleteRow(id: string): Promise<void> {
  await db.delete(plugin).where(eq(plugin.id, id))
  rows.delete(id)
  changed()
}
