import {
  parsePluginManifest,
  type PluginInstallSource,
  type PluginManifest,
  type PluginSearchResult,
  type PluginSource,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import { env } from "../../env"
import { PluginInstallError } from "./error"
import {
  checkStatus,
  latestVersionAt,
  requestPackage,
  resolvePackage,
  searchPluginsAt,
  verifyIntegrity,
} from "./registry"
import { gunzip, untar } from "./tar"

export { PluginInstallError } from "./error"
export { compareVersions } from "./registry"
export type FetchedPlugin = {
  manifest: PluginManifest
  /** The bytes of package.json, as packed. */
  packageJson: Uint8Array
  main: Uint8Array
  source: PluginSource
  npm: { name: string; version: string } | null
}
type InstallSource = t.infer<typeof PluginInstallSource>
/** Registry parameter is exposed for offline checks. Production callers use fetchPluginPackage. */
export async function fetchPluginPackageAt(
  source: InstallSource,
  registry: string,
  signal?: AbortSignal,
): Promise<FetchedPlugin> {
  try {
    const resolved =
      source.type === "npm"
        ? await resolvePackage(source.spec, registry, signal)
        : null
    const response = await requestPackage(
      resolved?.url ?? (source.type === "url" ? source.url : ""),
      resolved ? registry : null,
      20 * 1024 * 1024,
      signal,
    )
    checkStatus(response)
    if (resolved) verifyIntegrity(response.body, resolved.integrity)
    const files = untar(gunzip(response.body))
    const roots = new Set(files.map((file) => file.path.split("/")[0]))
    if (roots.size !== 1 || files.some((file) => !file.path.includes("/")))
      throw new PluginInstallError(
        "The tarball must contain one top-level package folder.",
      )
    const root = files[0]?.path.split("/")[0]
    const packageJson = files.find(
      (file) => file.path === `${root}/package.json`,
    )?.bytes
    if (!packageJson)
      throw new PluginInstallError(
        "The package has no package.json. Ask the author to include it.",
      )
    const json = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(packageJson),
    )
    const manifest = parsePluginManifest(json)
    if (Array.isArray(manifest))
      throw new PluginInstallError(
        `The plugin manifest needs changes:\n${manifest.slice(0, 5).join("\n")}`,
      )
    if (resolved) {
      const identity = t
        .object({ name: t.string(), version: t.string() })
        .parse(json)
      if (
        identity.name !== resolved.name ||
        identity.version !== resolved.version
      )
        throw new PluginInstallError(
          "The package name or version differs from the registry metadata. Do not install it; contact the author.",
        )
    }
    const main = files.find(
      (file) => file.path === `${root}/${manifest.main}`,
    )?.bytes
    if (!main)
      throw new PluginInstallError(
        `The package is missing ${manifest.main}. Ask the author to include the bundled plugin.`,
      )
    if (main.length > 5 * 1024 * 1024)
      throw new PluginInstallError(
        "The bundled plugin exceeds 5 MB. Ask the author to reduce it.",
      )
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(main)
    } catch {
      throw new PluginInstallError(
        "The bundled plugin is not valid UTF-8 text. Ask the author to rebuild it.",
      )
    }
    return {
      manifest,
      packageJson,
      main,
      source: resolved
        ? { type: "npm", spec: `${resolved.name}@${resolved.version}` }
        : source,
      npm: resolved ? { name: resolved.name, version: resolved.version } : null,
    }
  } catch (cause) {
    if (cause instanceof PluginInstallError) throw cause
    throw new PluginInstallError(
      "Could not read the package's JSON manifest. Ask the author to check package.json.",
      { cause },
    )
  }
}
export async function fetchPluginPackage(
  source: InstallSource,
  signal?: AbortSignal,
): Promise<FetchedPlugin> {
  return fetchPluginPackageAt(source, env.MATINEE_PLUGIN_REGISTRY, signal)
}
export async function latestVersion(
  name: string,
  signal?: AbortSignal,
): Promise<string | null> {
  return latestVersionAt(name, env.MATINEE_PLUGIN_REGISTRY, signal)
}
export async function searchPlugins(
  query: string,
  signal?: AbortSignal,
): Promise<Omit<PluginSearchResult, "installedId">[]> {
  return searchPluginsAt(query, env.MATINEE_PLUGIN_REGISTRY, signal)
}
