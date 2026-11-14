/* oxlint-disable no-console */
import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  parsePluginManifest,
  type PluginConfigValue,
} from "@matinee/contracts/plugins"
import { t } from "@matinee/contracts/schema"

import { guardedFetch, type HostRule } from "../src/net/guarded-fetch"
import { createSandbox, SandboxError } from "../src/plugins/sandbox"

const HttpCall = t.object({
  url: t.string(),
  method: t.string(),
  headers: t.array(t.array(t.string()).min(2).max(2)),
  body: t.string().nullable(),
})
const StorageCall = t.object({ key: t.string().max(128) })
const StorageSet = StorageCall.extend({ value: t.unknown() })
const LogCall = t.object({
  level: t.enum(["debug", "info", "warn", "error"]),
  message: t.string(),
  detail: t.string().nullable(),
})

async function main() {
  const [folder, ...argv] = process.argv.slice(2)
  if (!folder)
    throw new Error(
      "Usage: plugin-try.ts <plugin folder> <handler path|--list> [json args...] [--config key=value]...",
    )
  const manifest = parsePluginManifest(
    JSON.parse(await readFile(path.resolve(folder, "package.json"), "utf8")),
  )
  if (Array.isArray(manifest)) throw new Error(manifest.join("\n"))
  const config = new Map<string, PluginConfigValue>(
    manifest.config.map((field) => [field.key, field.default ?? null]),
  )
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg !== "--config") {
      if (arg) positional.push(arg)
      continue
    }
    const entry = argv[++i] ?? ""
    const split = entry.indexOf("=")
    const key = entry.slice(0, split)
    const value = entry.slice(split + 1)
    const field = manifest.config.find((candidate) => candidate.key === key)
    if (split < 1 || !field)
      throw new Error("--config needs a declared key=value")
    if (field.type === "boolean" && value !== "true" && value !== "false")
      throw new Error(`${key} must be true or false`)
    const parsed =
      field.type === "boolean"
        ? value === "true"
        : field.type === "number"
          ? Number(value)
          : value
    if (
      field.type === "number" &&
      (!Number.isFinite(Number(parsed)) ||
        (field.min !== undefined && Number(parsed) < field.min) ||
        (field.max !== undefined && Number(parsed) > field.max))
    )
      throw new Error(`${key} is outside its number bounds`)
    if (
      field.type === "select" &&
      !field.options.some((option) => option.value === parsed)
    )
      throw new Error(`${key} is not a declared option`)
    config.set(key, parsed)
  }
  const rules: HostRule[] = manifest.permissions.network.map((pattern) => ({
    pattern,
    port: 443,
  }))
  for (const field of manifest.config) {
    const value = config.get(field.key)
    if (
      field.required &&
      (value === null || value === undefined || value === "")
    )
      throw new Error(`Set --config ${field.key}=value`)
    if (field.type === "url" && value) {
      const url = new URL(String(value))
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(`${field.key} must be an HTTP URL without credentials`)
      if (field.network)
        rules.push({
          pattern: url.hostname.replace(/^\[|\]$/g, ""),
          port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
          trusted: true,
        })
    }
  }
  const storage = new Map<string, t.infer<typeof StorageSet>["value"]>()
  const sandbox = createSandbox({
    pluginId: manifest.id,
    code: await readFile(path.resolve(folder, manifest.main), "utf8"),
    context: {
      plugin: { id: manifest.id, version: manifest.version },
      server: {
        version: "plugin-try",
        api: 1,
        publicUrl: "http://localhost:3000",
      },
      config: Object.fromEntries(config),
    },
    async hostCall(name, args, signal) {
      if (name === "log") {
        const line = LogCall.parse(args)
        console.error(`[${line.level}] ${line.message}`, line.detail ?? "")
        return null
      }
      if (name === "http.fetch") {
        const input = HttpCall.parse(args)
        const body =
          input.body === null ? null : Buffer.from(input.body, "base64")
        if (body && body.length > 1024 * 1024)
          throw new Error("Request exceeds 1 MB")
        const response = await guardedFetch(input.url, {
          method: input.method,
          headers: Object.fromEntries(input.headers),
          body,
          allow: rules,
          signal,
        })
        return {
          ...response,
          body: Buffer.from(response.body).toString("base64"),
        }
      }
      if (!manifest.permissions.storage)
        throw new Error("Storage permission is required")
      if (name === "storage.get")
        return { value: storage.get(StorageCall.parse(args).key) ?? null }
      if (name === "storage.set") {
        const input = StorageSet.parse(args)
        if (JSON.stringify(input.value).length > 64 * 1024)
          throw new Error("Storage value exceeds 64 KB")
        storage.set(input.key, input.value)
        return null
      }
      if (name === "storage.delete") {
        storage.delete(StorageCall.parse(args).key)
        return null
      }
      if (name === "storage.keys") {
        const { prefix } = t
          .object({ prefix: t.string().nullable() })
          .parse(args)
        return {
          keys: [...storage.keys()].filter((key) =>
            key.startsWith(prefix ?? ""),
          ),
        }
      }
      throw new Error(`Unsupported host call: ${name}`)
    },
  })
  try {
    const { handlers } = await sandbox.start()
    console.error("Handlers:\n" + handlers.join("\n"))
    if (positional.includes("--list")) return
    const [handler, ...args] = positional
    if (!handler) throw new Error("Provide a handler path or --list")
    console.log(
      JSON.stringify(
        await sandbox.call(
          handler,
          args.map((arg) => JSON.parse(arg)),
        ),
        null,
        2,
      ),
    )
  } finally {
    await sandbox.stop()
  }
}
main().catch((cause) => {
  console.error(
    cause instanceof SandboxError
      ? `${cause.name} [${cause.kind}, status=${cause.status}]: ${cause.message}`
      : cause instanceof Error
        ? cause.message
        : "Plugin try failed",
  )
  process.exitCode = 1
})
