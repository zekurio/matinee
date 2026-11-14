import { errorText } from "./files"
import { pluginList } from "./info"
import { compareVersions, latestVersion, searchPlugins } from "./install"
import { pluginLog } from "./logs"
import { serialize } from "./runtime"
import { rows, saveRow } from "./store"

export function newerVersion(candidate: string, installed: string): boolean {
  return (compareVersions(candidate, installed) ?? 0) > 0
}
export function npmName(spec: string): string {
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}
const checks = new Map<string, number>()
export async function checkPluginUpdates(force = false) {
  await Promise.all(
    [...rows.values()]
      .filter((row) => row.source.type === "npm")
      .map((row) =>
        serialize(row.id, async () => {
          const current = rows.get(row.id)
          if (current?.source.type !== "npm") return
          const last =
            checks.get(row.id) ??
            (current.update ? Date.parse(current.update.checkedAt) : 0)
          if (!force && Date.now() - last < 3600000) return
          checks.set(row.id, Date.now())
          try {
            const version = await latestVersion(npmName(current.source.spec))
            const update =
              version && newerVersion(version, current.manifest?.version ?? "")
                ? { version, checkedAt: new Date().toISOString() }
                : null
            await saveRow(row.id, { update })
          } catch (cause) {
            pluginLog(
              row.id,
              "warn",
              `Couldn't check for updates: ${errorText(cause)}`,
            )
          }
        }),
      ),
  )
  return pluginList()
}
export async function browsePlugins(query = "") {
  const result = await searchPlugins(query)
  const installed = new Map(
    [...rows.values()].flatMap((row) =>
      row.source.type === "npm" ? [[npmName(row.source.spec), row.id]] : [],
    ),
  )
  return result.map((pkg) => ({
    ...pkg,
    installedId: installed.get(pkg.name) ?? null,
  }))
}
