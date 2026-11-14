import type { PluginLogLine } from "@matinee/contracts"

import { log } from "../log"
import { events } from "../realtime/events"

const buffers = new Map<string, PluginLogLine[]>()
const rates = new Map<
  string,
  { second: number; count: number; dropped: boolean }
>()
const pending = new Map<string, NodeJS.Timeout>()
/** Forget a removed plugin's lines, so a later plugin of that id starts clean. */
export function clearPluginLogs(id: string): void {
  buffers.delete(id)
  rates.delete(id)
}
export function pluginLogs(id: string): PluginLogLine[] {
  return [...(buffers.get(id) ?? [])]
}
export function pluginLog(
  id: string,
  level: PluginLogLine["level"],
  message: string,
  guest = false,
): void {
  if (guest) {
    const second = Math.floor(Date.now() / 1000)
    let rate = rates.get(id)
    if (!rate || rate.second !== second) {
      rate = { second, count: 0, dropped: false }
      rates.set(id, rate)
    }
    if (++rate.count > 50) {
      if (!rate.dropped) {
        rate.dropped = true
        pluginLog(
          id,
          "warn",
          "Log lines were dropped because the plugin logged more than 50 lines in a second",
        )
      }
      return
    }
  }
  const line = message.slice(0, 2000)
  const buffer = buffers.get(id) ?? []
  buffer.push({ at: new Date(), level, message: line })
  if (buffer.length > 500) buffer.shift()
  buffers.set(id, buffer)
  log.debug(`[plugin ${id}] ${line}`)
  if (!pending.has(id)) {
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id)
        void events.publish("plugins-log", undefined)
      }, 250).unref(),
    )
  }
}
