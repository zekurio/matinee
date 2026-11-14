import { createHash, timingSafeEqual } from "node:crypto"

import { t } from "@matinee/contracts/schema"

import {
  guardedFetch,
  GuardedFetchError,
  ruleForAddress,
  type HostRule,
} from "../../net/guarded-fetch"
import { PluginInstallError } from "./error"

export const DEFAULT_REGISTRY = "https://registry.npmjs.org"
const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
function versionParts(value: string) {
  const match = versionPattern.exec(value)
  if (
    !match ||
    match[4]
      ?.split(".")
      .some(
        (part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0"),
      )
  )
    return null
  return {
    core: [match[1] ?? "0", match[2] ?? "0", match[3] ?? "0"],
    pre: match[4]?.split("."),
  }
}
/** Semver precedence, ignoring build metadata. Invalid versions return null, never an update decision. */
export function compareVersions(a: string, b: string): number | null {
  const left = versionParts(a)
  const right = versionParts(b)
  if (!left || !right) return null
  for (let i = 0; i < 3; i++) {
    const x = BigInt(left.core[i] ?? "0"),
      y = BigInt(right.core[i] ?? "0")
    if (x !== y) return x > y ? 1 : -1
  }
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i],
      y = right.pre[i]
    if (x === y) continue
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x),
      yn = /^\d+$/.test(y)
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1
    if (xn !== yn) return xn ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}
export function validPackageName(name: string): boolean {
  return (
    name.length <= 214 &&
    /^(?:@[a-z0-9-][a-z0-9._-]*\/)?[a-z0-9-][a-z0-9._-]*$/.test(name) &&
    !["node_modules", "favicon.ico"].includes(name)
  )
}
export function parseNpmSpec(spec: string) {
  const split = spec.lastIndexOf("@")
  const name = split > 0 ? spec.slice(0, split) : spec
  const selector = split > 0 ? spec.slice(split + 1) : "latest"
  if (
    !validPackageName(name) ||
    !(
      versionParts(selector) ||
      (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(selector) &&
        !/^(?:v?\d+(?:\.(?:\d+|x|X)){0,2})(?:-[\w.-]+)?$/.test(selector) &&
        !/^[xX]$/.test(selector))
    )
  )
    throw new PluginInstallError(
      "Use an npm package name, name@version, or name@tag, including @scope/name. Ranges, URLs, paths, and aliases are not supported.",
    )
  return { name, selector }
}
function rules(registry: string): HostRule[] {
  const rule = ruleForAddress(registry)
  if (!rule) return []
  return [{ ...rule, trusted: registry !== DEFAULT_REGISTRY }]
}
export async function requestPackage(
  url: string,
  registry: string | null,
  maxBytes: number,
  signal?: AbortSignal,
) {
  try {
    return await guardedFetch(url, {
      allow: registry === null ? "public" : rules(registry),
      // Keep trusted HTTP registries from redirecting to another scheme on the same port.
      maxRedirects:
        registry !== null && new URL(registry).protocol === "http:" ? 0 : 5,
      maxBytes,
      signal,
      headers: { accept: "application/vnd.npm.install-v1+json" },
    })
  } catch (cause) {
    if (cause instanceof GuardedFetchError) {
      const messages = {
        blocked: `The package address is not allowed: ${cause.message.slice(0, 240).replace(/[^\x20-\x7e]/g, " ")}. Check the registry or package URL.`,
        "too-large":
          "The registry response or package is too large. Choose a smaller package.",
        timeout: "The package request timed out or was cancelled. Try again.",
        network:
          "Could not reach the package server. Check the address and your connection, then try again.",
      }
      throw new PluginInstallError(messages[cause.code], { cause })
    }
    throw new PluginInstallError(
      "Could not request the package. Check the registry address.",
      { cause },
    )
  }
}
export function checkStatus(response: { status: number; statusText: string }) {
  if (response.status < 200 || response.status >= 300)
    throw new PluginInstallError(
      `The package server returned HTTP ${response.status} ${response.statusText.replace(/[^\x20-\x7e]/g, " ").slice(0, 80)}. Try again or check the package address.`,
    )
}
const Packument = t.object({
  "dist-tags": t.record(t.string(), t.string().max(100)).$default({}),
  versions: t
    .record(
      t.string(),
      t.object({
        dist: t.object({
          tarball: t.string().max(2048),
          integrity: t.string().max(4096).optional(),
        }),
      }),
    )
    .$default({}),
})
async function packument(name: string, registry: string, signal?: AbortSignal) {
  if (!validPackageName(name))
    throw new PluginInstallError("Use a valid lowercase npm package name.")
  const response = await requestPackage(
    `${registry}/${encodeURIComponent(name)}`,
    registry,
    5 * 1024 * 1024,
    signal,
  )
  if (response.status === 404) return null
  checkStatus(response)
  try {
    return Packument.parse(
      JSON.parse(Buffer.from(response.body).toString("utf8")),
    )
  } catch (cause) {
    throw new PluginInstallError(
      "The registry returned invalid package metadata. Try another registry.",
      { cause },
    )
  }
}
export async function resolvePackage(
  spec: string,
  registry: string,
  signal?: AbortSignal,
) {
  const { name, selector } = parseNpmSpec(spec)
  const metadata = await packument(name, registry, signal)
  if (!metadata)
    throw new PluginInstallError(`No package named ${name} at the registry.`)
  const version = versionParts(selector)
    ? selector
    : Object.hasOwn(metadata["dist-tags"], selector)
      ? metadata["dist-tags"][selector]
      : undefined
  const release =
    version && Object.hasOwn(metadata.versions, version)
      ? metadata.versions[version]
      : undefined
  if (!version || !release || !versionParts(version))
    throw new PluginInstallError(
      `No version or tag ${selector} for ${name}. Choose a published version.`,
    )
  let url: URL
  try {
    url = new URL(release.dist.tarball)
  } catch {
    throw new PluginInstallError(
      "The registry supplied an invalid tarball URL.",
    )
  }
  const origin = new URL(registry)
  if (
    url.host !== origin.host ||
    url.protocol !== origin.protocol ||
    url.username ||
    url.password
  )
    throw new PluginInstallError(
      "The tarball must use the registry's host and scheme. Check the registry metadata.",
    )
  return { name, version, url: url.href, integrity: release.dist.integrity }
}
export function verifyIntegrity(bytes: Uint8Array, integrity?: string) {
  const hashes =
    integrity?.split(/\s+/).filter((entry) => entry.startsWith("sha512-")) ?? []
  if (!hashes.length)
    throw new PluginInstallError(
      "The registry supplied no sha512 integrity. Use a registry that provides sha512 hashes.",
    )
  const actual = createHash("sha512").update(bytes).digest()
  if (
    !hashes.some((entry) => {
      const value = entry.slice(7).split("?")[0] ?? ""
      if (!/^[A-Za-z0-9+/]{86}(?:==)?$/.test(value)) return false
      const expected = Buffer.from(value, "base64")
      return (
        expected.length === actual.length && timingSafeEqual(actual, expected)
      )
    })
  )
    throw new PluginInstallError(
      "The package does not match the registry's sha512 integrity. Do not install it; try again or contact the package author.",
    )
}
export async function latestVersionAt(
  name: string,
  registry: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const metadata = await packument(name, registry, signal)
  return metadata && Object.hasOwn(metadata["dist-tags"], "latest")
    ? (metadata["dist-tags"].latest ?? null)
    : null
}
const SearchText = t
  .string()
  .max(5 * 1024 * 1024)
  .transform((value) => value.slice(0, 300))
const Search = t.object({
  objects: t
    .array(
      t.object({
        package: t.object({
          name: t.string().max(214),
          version: t.string().max(100),
          description: SearchText.optional(),
          author: t
            .union([SearchText, t.object({ name: SearchText })])
            .optional(),
          publisher: t.object({ username: SearchText }).optional(),
          links: t.object({ homepage: SearchText.optional() }).optional(),
          keywords: t.array(SearchText).max(10000).optional(),
        }),
      }),
    )
    .max(1000),
})
export async function searchPluginsAt(
  query: string,
  registry: string,
  signal?: AbortSignal,
) {
  const url = new URL(`${registry}/-/v1/search`)
  url.searchParams.set("text", `keywords:matinee-plugin ${query}`)
  url.searchParams.set("size", "30")
  const response = await requestPackage(
    url.href,
    registry,
    5 * 1024 * 1024,
    signal,
  )
  checkStatus(response)
  try {
    return Search.parse(JSON.parse(Buffer.from(response.body).toString("utf8")))
      .objects.flatMap(({ package: pkg }) => {
        if (
          !validPackageName(pkg.name) ||
          (pkg.keywords && !pkg.keywords.includes("matinee-plugin"))
        )
          return []
        const person = t.object({ name: t.string() }).safeParse(pkg.author)
        const author = t.string().safeParse(pkg.author)
        const homepage = t
          .string()
          .url()
          .refine((value) => new URL(value).protocol === "https:")
          .safeParse(pkg.links?.homepage)
        return [
          {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description ?? "",
            author: author.success
              ? author.data
              : person.success
                ? person.data.name
                : (pkg.publisher?.username ?? null),
            homepage: homepage.success ? homepage.data : null,
            npmUrl:
              registry === DEFAULT_REGISTRY
                ? `https://www.npmjs.com/package/${pkg.name}`
                : `${registry}/${encodeURIComponent(pkg.name)}`,
          },
        ]
      })
      .slice(0, 30)
  } catch (cause) {
    throw new PluginInstallError(
      "The registry returned invalid search results. Try another registry.",
      { cause },
    )
  }
}
