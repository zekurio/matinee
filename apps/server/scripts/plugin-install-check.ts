import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { gzipSync } from "node:zlib"

import {
  fetchPluginPackageAt,
  PluginInstallError,
} from "../src/plugins/install"
import {
  compareVersions,
  DEFAULT_REGISTRY,
  latestVersionAt,
  parseNpmSpec,
  resolvePackage,
  searchPluginsAt,
} from "../src/plugins/install/registry"
import { gunzip, INFLATE_LIMIT, untar } from "../src/plugins/install/tar"

let failures = 0
async function check(name: string, run: () => void | Promise<void>) {
  try {
    await run()
    process.stdout.write(`PASS ${name}\n`)
  } catch (cause) {
    failures++
    process.stderr.write(
      `FAIL ${name}: ${cause instanceof Error ? cause.stack : String(cause)}\n`,
    )
  }
}
type Entry = { path: string; data?: Uint8Array | string; type?: string }
function tar(entries: Entry[]) {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? "")
    const header = Buffer.alloc(512)
    header.write(entry.path, 0, 100)
    header.write("0000644\0", 100)
    header.write(`${data.length.toString(8).padStart(11, "0")}\0`, 124)
    header.fill(32, 148, 156)
    header.write(entry.type ?? "0", 156)
    header.write("ustar\0", 257)
    const sum = header.reduce((a, b) => a + b, 0)
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148)
    chunks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512))
  }
  return Buffer.concat([...chunks, Buffer.alloc(1024)])
}
function paxPath(path: string) {
  const record = ` path=${path}\n`
  let length = Buffer.byteLength(record) + 1
  while (String(length).length + Buffer.byteLength(record) !== length)
    length = String(length).length + Buffer.byteLength(record)
  return `${length}${record}`
}
const pkg = {
  name: "matinee-plugin-check",
  version: "1.2.3",
  matinee: { api: 1, id: "check", name: "Check", main: "dist/plugin.js" },
}
function bundle(
  manifest = pkg,
  extra: Entry[] = [
    { path: "package/dist/plugin.js", data: "export default () => ({})" },
  ],
) {
  return gzipSync(
    tar([
      { path: "package/", type: "5" },
      { path: "package/package.json", data: JSON.stringify(manifest) },
      ...extra,
    ]),
  )
}
let archive = bundle()
let integrity = ""
let tarballOverride = ""
function hash() {
  integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`
}
hash()
const server = createServer((req, res) => {
  if (req.url?.startsWith("/-/v1/search")) {
    res.end(
      JSON.stringify({
        objects: [
          {
            package: {
              name: pkg.name,
              version: "1.2.3",
              keywords: ["matinee-plugin"],
              description: `<b>${"x".repeat(10000)}</b>`,
              author: { name: "y".repeat(2000) },
              links: { homepage: "javascript:alert(1)" },
            },
          },
          { package: { name: "other", version: "1.0.0", keywords: ["other"] } },
        ],
      }),
    )
  } else if (req.url === "/package.tgz") res.end(archive)
  else if (req.url === "/missing") {
    res.statusCode = 404
    res.end("not found")
  } else
    res.end(
      JSON.stringify({
        "dist-tags": { latest: "1.2.3", next: "1.2.3" },
        versions: {
          "1.2.3": {
            dist: {
              tarball: tarballOverride || `${registry}/package.tgz`,
              integrity,
            },
          },
        },
      }),
    )
})
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
const address = server.address()
assert(address && address instanceof Object)
const registry = `http://127.0.0.1:${address.port}`
const fetch = () =>
  fetchPluginPackageAt({ type: "npm", spec: pkg.name }, registry)
async function refuses<T>(run: () => T | Promise<T>, pattern: RegExp) {
  await assert.rejects(
    async () => {
      await run()
    },
    (cause: unknown) =>
      cause instanceof PluginInstallError && pattern.test(cause.message),
  )
}
try {
  await check("npm pack shape and duplicate last wins", () => {
    const files = untar(
      tar([
        { path: "package/", type: "5" },
        { path: "package/a", data: "old" },
        { path: "package/a", data: "new" },
      ]),
    )
    assert.equal(Buffer.from(files[0]?.bytes ?? []).toString(), "new")
  })
  for (const type of ["x", "L"])
    await check(`long path ${type}`, () => {
      const path = `package/${"long/".repeat(30)}a.js`
      const files = untar(
        tar([
          {
            path: "extension",
            type,
            data: type === "x" ? paxPath(path) : `${path}\0`,
          },
          { path: "short", data: "ok" },
        ]),
      )
      assert.equal(files[0]?.path, path)
    })
  for (const [name, entry] of [
    ["symlink", { path: "package/a", type: "2" }],
    ["hard link", { path: "package/a", type: "1" }],
    ["parent path", { path: "package/../a" }],
    ["absolute path", { path: "/a" }],
    ["embedded NUL", { path: "package/a\0hidden" }],
    ["backslash", { path: "package\\a" }],
    ["device", { path: "a", type: "3" }],
    ["FIFO", { path: "a", type: "6" }],
  ] satisfies [string, Entry][])
    await check(name, () => refuses(() => untar(tar([entry])), /tarball/))
  await check("checksum", () => {
    const bytes = tar([{ path: "a" }])
    bytes[0] = 98
    return refuses(() => untar(bytes), /checksum/)
  })
  await check("truncated file", () =>
    refuses(
      () => untar(tar([{ path: "a", data: "a" }]).subarray(0, 512)),
      /past the end/,
    ),
  )
  await check("too many entries", () =>
    refuses(
      () => untar(tar(Array.from({ length: 2001 }, () => ({ path: "a" })))),
      /2000/,
    ),
  )
  await check("too much data", () =>
    refuses(
      () =>
        untar(tar([{ path: "a", data: Buffer.alloc(50 * 1024 * 1024 + 1) }])),
      /50 MB/,
    ),
  )
  await check("inflate bomb", () =>
    refuses(
      () => gunzip(gzipSync(Buffer.alloc(INFLATE_LIMIT + 1))),
      /size limit/,
    ),
  )
  for (const spec of [
    "plugin",
    "plugin@1.2.3",
    "plugin@next",
    "@scope/plugin",
    "@scope/plugin@1.2.3",
  ])
    await check(`spec ${spec}`, () => {
      assert(parseNpmSpec(spec).name)
    })
  for (const spec of [
    "Plugin",
    "plugin@^1.0.0",
    "git+https://example.com/x",
    "./plugin",
    "alias@npm:plugin",
    "plugin@1.x",
    "plugin@",
    "@bad scope/name",
  ])
    await check(`refuse spec ${spec}`, () =>
      refuses(() => parseNpmSpec(spec), /Use an npm/),
    )
  for (const spec of [pkg.name, `${pkg.name}@next`, `${pkg.name}@1.2.3`])
    await check(`resolve ${spec}`, async () => {
      assert.equal((await resolvePackage(spec, registry)).version, "1.2.3")
    })
  await check("missing version", () =>
    refuses(() => resolvePackage(`${pkg.name}@2.0.0`, registry), /No version/),
  )
  await check("missing package", () =>
    refuses(
      () => resolvePackage("missing", registry),
      /No package named missing/,
    ),
  )
  await check("fetch pinned package", async () => {
    const result = await fetch()
    assert.equal(
      result.source.type === "npm" && result.source.spec,
      `${pkg.name}@1.2.3`,
    )
    assert.deepEqual(result.packageJson, Buffer.from(JSON.stringify(pkg)))
  })
  await check("integrity mismatch", async () => {
    integrity = `sha512-${Buffer.alloc(64).toString("base64")}`
    await refuses(fetch, /does not match/)
    hash()
  })
  await check("missing sha512", async () => {
    integrity = "sha1-abc"
    await refuses(fetch, /no sha512/)
    hash()
  })
  await check("other host tarball", async () => {
    tarballOverride = "https://example.com/x.tgz"
    await refuses(fetch, /host and scheme/)
    tarballOverride = ""
  })
  for (const field of ["name", "version"])
    await check(`${field} mismatch`, async () => {
      archive = bundle({ ...pkg, [field]: "different" })
      hash()
      await refuses(fetch, /differs/)
      archive = bundle()
      hash()
    })
  await check("manifest problems listed", async () => {
    archive = bundle({
      ...pkg,
      matinee: { ...pkg.matinee, id: "!", name: "", main: "../bad" },
    })
    hash()
    await refuses(fetch, /changes:\n.*\n/)
    archive = bundle()
    hash()
  })
  for (const [name, extra, pattern] of [
    ["missing main", [], /missing dist/],
    [
      "large main",
      [
        {
          path: "package/dist/plugin.js",
          data: Buffer.alloc(5 * 1024 * 1024 + 1),
        },
      ],
      /exceeds 5 MB/,
    ],
    ["two roots", [{ path: "other/file" }], /top-level/],
    [
      "invalid UTF-8",
      [{ path: "package/dist/plugin.js", data: Buffer.from([255]) }],
      /UTF-8/,
    ],
  ] satisfies [string, Entry[], RegExp][])
    await check(name, async () => {
      archive = bundle(pkg, extra)
      hash()
      await refuses(fetch, pattern)
      archive = bundle()
      hash()
    })
  await check("latest and missing latest", async () => {
    assert.equal(await latestVersionAt(pkg.name, registry), "1.2.3")
    assert.equal(await latestVersionAt("missing", registry), null)
  })
  await check("search hostile text", async () => {
    const results = await searchPluginsAt("hello", registry)
    assert.equal(results.length, 1)
    assert.equal(results[0]?.description.length, 300)
    assert.equal(results[0]?.author?.length, 300)
    assert.equal(results[0]?.homepage, null)
    assert(results[0]?.npmUrl.startsWith(registry))
  })
  for (const [a, b, expected] of [
    ["1.0.0", "2.0.0", -1],
    ["2.0.0", "1.9.9", 1],
    ["1.0.0-alpha", "1.0.0", -1],
    ["1.0.0-alpha.2", "1.0.0-alpha.10", -1],
    ["1.0.0-1", "1.0.0-a", -1],
    ["1.0.0+a", "1.0.0+b", 0],
    ["1.0.0-01", "1.0.0", null],
    ["junk", "1.0.0", null],
    ["1.0.0-a", "1.0.0-a.1", -1],
  ] satisfies [string, string, number | null][])
    await check(`compare ${a} ${b}`, () =>
      assert.equal(compareVersions(a, b), expected),
    )
  await check("aborted signal", () =>
    refuses(
      () =>
        fetchPluginPackageAt(
          { type: "npm", spec: pkg.name },
          registry,
          AbortSignal.abort(),
        ),
      /cancelled/,
    ),
  )
  // With `--smoke`, also ask the real registry once, read-only. It never
  // fails the run, and `pnpm test` leaves it out so it needs no network.
  if (process.argv.includes("--smoke")) {
    try {
      await fetchPluginPackageAt(
        { type: "npm", spec: "is-number@7.0.0" },
        DEFAULT_REGISTRY,
      )
      process.stdout.write("SMOKE unexpected plugin manifest\n")
    } catch (cause) {
      process.stdout.write(
        `SMOKE real download: ${cause instanceof Error ? cause.message : "failed"}\n`,
      )
    }
    try {
      const results = await searchPluginsAt("", DEFAULT_REGISTRY)
      process.stdout.write(`SMOKE real search: ${results.length} results\n`)
    } catch (cause) {
      process.stdout.write(
        `SMOKE real search: ${cause instanceof Error ? cause.message : "failed"}\n`,
      )
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((cause) => (cause ? reject(cause) : resolve())),
  )
}
process.exitCode = failures ? 1 : 0
