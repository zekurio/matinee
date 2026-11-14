import assert from "node:assert/strict"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
  parsePluginManifest,
  pluginGrant,
  type PluginManifest,
} from "@matinee/contracts"
import type { PluginRow } from "@matinee/db"

import { pool } from "../src/db"
import { hostAllowed } from "../src/net/guarded-fetch"
import { registerBuiltin, builtins } from "../src/plugins/builtin"
import { validateValue } from "../src/plugins/config"
import { integrity, readFolder, type PluginFiles } from "../src/plugins/files"
import { networkRules } from "../src/plugins/host"
import { pluginState } from "../src/plugins/state"
import { rows } from "../src/plugins/store"
import { leaseChecks } from "./plugin-lease-check"

const root = await mkdtemp(join(tmpdir(), "matinee-manager-check-"))
try {
  const packageJson = Buffer.from(
    JSON.stringify({
      name: "matinee-plugin-check",
      version: "1.0.0",
      matinee: {
        id: "manager-check",
        name: "Manager check",
        api: 1,
        main: "plugin.js",
        permissions: { network: ["example.com"] },
        config: [
          {
            key: "required",
            label: "Required",
            type: "string",
            required: true,
          },
          { key: "endpoint", label: "Endpoint", type: "url", network: true },
        ],
      },
    }),
  )
  const parsed = parsePluginManifest(JSON.parse(packageJson.toString()))
  assert(!Array.isArray(parsed))
  const manifest: PluginManifest = parsed
  const code = Buffer.from(
    "export default Object.freeze({ matineePlugin: 1, setup() { return {} } })",
  )
  const file: PluginFiles = {
    path: root,
    external: false,
    manifest,
    integrity: integrity(packageJson, code),
    code: code.toString(),
    problems: [],
  }
  const row: PluginRow = {
    id: manifest.id,
    source: { type: "directory", path: root },
    manifest,
    enabled: false,
    grant: null,
    integrity: null,
    config: {},
    secrets: {},
    options: {},
    update: null,
    installedAt: new Date(),
    updatedAt: new Date(),
  }
  assert.equal(pluginState(row, file).state, "disabled")
  row.enabled = true
  assert.equal(pluginState(row, file).state, "needs-approval")
  row.grant = pluginGrant(manifest)
  row.integrity = file.integrity
  assert.equal(pluginState(row, file).state, "needs-config")
  row.config.required = "set"
  assert.equal(
    pluginState(row, file, { state: "running", error: null }).state,
    "running",
  )
  assert.equal(pluginState(row, undefined).state, "missing")
  assert.equal(
    pluginState(row, { ...file, problems: ["Bad manifest"] }).state,
    "incompatible",
  )
  assert.equal(
    pluginState(row, { ...file, manifest: { ...manifest, api: 2 } }).state,
    "incompatible",
  )
  assert.equal(
    pluginState(row, { ...file, integrity: "changed" }).state,
    "needs-approval",
  )
  const required = manifest.config[0]
  assert(required)
  assert.throws(() => validateValue(required, 42))
  const endpoint = manifest.config[1]
  assert(endpoint)
  assert.throws(() => validateValue(endpoint, "http://user:password@localhost"))
  validateValue(endpoint, "http://localhost:8431")
  const rules = networkRules(manifest, { endpoint: "http://127.0.0.1:8431" })
  assert(hostAllowed("https://example.com", rules))
  assert(!hostAllowed("http://example.com", rules))
  assert(!hostAllowed("https://example.com:8443", rules))
  assert(hostAllowed("http://127.0.0.1:8431", rules))
  assert(!hostAllowed("http://127.0.0.1:8432", rules))
  await writeFile(join(root, "package.json"), packageJson)
  await writeFile(join(root, "plugin.js"), code)
  assert.equal((await readFolder(root, false))?.files.integrity, file.integrity)
  const outside = join(root, "..", `${manifest.id}-${process.pid}.js`)
  try {
    await writeFile(outside, code)
    await rm(join(root, "plugin.js"))
    await symlink(outside, join(root, "plugin.js"))
    assert.match(
      (await readFolder(root, false))?.files.problems.join(" ") ?? "",
      /outside/,
    )
  } finally {
    await rm(outside, { force: true })
  }
  const builtin = registerBuiltin({
    id: "manager-check-builtin",
    name: "Builtin",
    description: "Check",
    config: [
      {
        key: "key",
        label: "Key",
        type: "secret",
        required: false,
        default: "default",
      },
    ],
    environment: {
      key: { variable: "MANAGER_CHECK_KEY", value: "environment" },
    },
  })
  assert.equal(builtin.config().key, "environment")
  rows.set("manager-check-builtin", {
    ...row,
    id: "manager-check-builtin",
    source: { type: "builtin" },
    manifest: null,
    secrets: { key: "saved" },
  })
  assert.equal(builtin.config().key, "saved")
  rows.delete("manager-check-builtin")
  builtins.delete("manager-check-builtin")
  await leaseChecks()
  process.stdout.write(
    "PASS state precedence, grants, config validation, network rules, integrity, symlink escape, builtin precedence, sandbox leases\n",
  )
} finally {
  await rm(root, { recursive: true, force: true })
  await pool.end()
}
