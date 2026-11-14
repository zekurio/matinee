import { pluginGrant } from "@matinee/contracts"

import { env } from "../env"
import { log } from "../log"
import { builtins, logBuiltinOverrides } from "./builtin"
import { discover, errorText, files, recoverPackages } from "./files"
import { pluginList } from "./info"
import { pluginLog } from "./logs"
import {
  resumeRuntimes,
  serialize,
  activateRuntime,
  stopRuntime,
} from "./runtime"
import { changed, loadRows, rows, saveRow } from "./store"

let scanning = Promise.resolve()
export function rescanPlugins(
  declarative = false,
): Promise<ReturnType<typeof pluginList>> {
  const scan = scanning.then(async () => {
    const found = await discover()
    const ids = new Set([...files.keys(), ...found.keys(), ...rows.keys()])
    // Discovery changes availability only. No plugin code runs during a scan.
    for (const id of ids) {
      if (builtins.has(id)) {
        if (found.has(id))
          log.warn(
            `Plugin folder ${found.get(id)?.path} conflicts with built-in plugin ${id}`,
          )
        continue
      }
      await serialize(id, async () => {
        const file = found.get(id)
        const old = files.get(id)
        if (
          !file ||
          old?.integrity !== file.integrity ||
          old?.path !== file.path ||
          file.problems.length
        )
          await stopRuntime(id)
        if (!file) {
          files.delete(id)
          changed()
          return
        }
        files.set(id, file)
        const row = rows.get(id)
        if (!row)
          await saveRow(id, {
            source: { type: "directory", path: file.path },
            manifest: file.manifest,
          })
        else {
          const values: Parameters<typeof saveRow>[1] = {
            manifest: file.manifest ?? row.manifest,
          }
          if (row.source.type === "directory")
            values.source = { type: "directory", path: file.path }
          await saveRow(id, values)
        }
        if (
          declarative &&
          file.external &&
          file.manifest &&
          !file.problems.length &&
          env.MATINEE_PLUGINS_ENABLE.includes(id)
        ) {
          await saveRow(id, {
            enabled: true,
            grant: pluginGrant(file.manifest),
            integrity: file.integrity,
          })
          pluginLog(
            id,
            "info",
            "Enabled and approved by MATINEE_PLUGINS_ENABLE",
          )
          log.info(`Enabled and approved plugin ${id} from MATINEE_PLUGIN_DIRS`)
        }
        await activateRuntime(id)
      }).catch((cause) =>
        pluginLog(id, "warn", `Couldn't rescan: ${errorText(cause)}`),
      )
    }
    changed()
    return pluginList()
  })
  scanning = scan.then(
    () => {},
    () => {},
  )
  return scan
}
export async function initializePlugins(): Promise<void> {
  try {
    resumeRuntimes()
    await loadRows()
    logBuiltinOverrides()
    await recoverPackages()
    await rescanPlugins(true)
  } catch (cause) {
    log.warn(`Couldn't start plugins: ${errorText(cause)}`, cause)
  }
}
