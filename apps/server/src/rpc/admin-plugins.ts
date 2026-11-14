import { library } from "@matinee/db"
import { inArray } from "drizzle-orm"

import { pluginSignInImpact } from "../auth/plugin-impact"
import { db } from "../db"
import { log } from "../log"
import {
  approvePlugin,
  browsePlugins,
  checkPluginUpdates,
  configurePlugin,
  inspectPlugin,
  installPlugin,
  pluginInfo,
  pluginList,
  readPluginLogs,
  removePlugin,
  rescanPlugins,
  restartPlugin,
  retryPluginEvents,
  setEnabled,
  setPluginAuthOptions,
} from "../plugins"
import { follow } from "../realtime/follow"
import { admin } from "./base"

export const adminPlugins = {
  list: admin.admin.plugins.list.handler(() => pluginList()),
  watch: admin.admin.plugins.watch.handler(({ signal }) =>
    follow({
      topics: ["plugins"],
      load: () => Promise.resolve(pluginList()),
      signal,
    }),
  ),
  inspect: admin.admin.plugins.inspect.handler(({ input }) =>
    inspectPlugin(input.source),
  ),
  // Who did what to a plugin goes to the server's log, as it does for
  // accounts. The plugin's own log is in memory and goes with the plugin.
  install: admin.admin.plugins.install.handler(async ({ context, input }) => {
    const info = await installPlugin(input.ticket, input.enable)
    log.info(
      `${context.user.username} installed plugin ${info.id} ${info.version} and approved what it asks for (${info.approval?.integrity ?? "no files"})`,
    )
    return info
  }),
  rescan: admin.admin.plugins.rescan.handler(() => rescanPlugins()),
  enable: admin.admin.plugins.enable.handler(async ({ context, input }) => {
    const info = await setEnabled(input.id, true)
    log.info(`${context.user.username} turned plugin ${input.id} on`)
    return info
  }),
  disable: admin.admin.plugins.disable.handler(async ({ context, input }) => {
    const info = await setEnabled(input.id, false)
    log.info(`${context.user.username} turned plugin ${input.id} off`)
    return info
  }),
  approve: admin.admin.plugins.approve.handler(async ({ context, input }) => {
    const info = await approvePlugin(input.id, input.integrity)
    log.info(
      `${context.user.username} approved plugin ${input.id} ${info.version} (${input.integrity})`,
    )
    return info
  }),
  // New settings and a restart are how an admin fixes a handler that
  // fails, so both try the waiting events at once.
  configure: admin.admin.plugins.configure.handler(
    async ({ context, input }) => {
      await configurePlugin(input.id, input.values, input.links)
      // Names only: a value can be a secret.
      log.info(
        `${context.user.username} changed plugin ${input.id}'s settings (${Object.keys(input.values).join(", ")})${input.links ? `, links: ${input.links}` : ""}`,
      )
      await retryPluginEvents(input.id)
      return pluginInfo(input.id)
    },
  ),
  setAuthOptions: admin.admin.plugins.setAuthOptions.handler(({ input }) =>
    setPluginAuthOptions(input.id, input.provider, input.allowSignUp),
  ),
  restart: admin.admin.plugins.restart.handler(async ({ input }) => {
    await restartPlugin(input.id)
    await retryPluginEvents(input.id)
    return pluginInfo(input.id)
  }),
  retryEvents: admin.admin.plugins.retryEvents.handler(async ({ input }) => {
    pluginInfo(input.id)
    await retryPluginEvents(input.id)
    return pluginInfo(input.id)
  }),
  remove: admin.admin.plugins.remove.handler(async ({ context, input }) => {
    await removePlugin(input.id)
    log.info(`${context.user.username} removed plugin ${input.id}`)
  }),
  impact: admin.admin.plugins.impact.handler(async ({ input }) => {
    // Throws NOT_FOUND for a plugin the server doesn't know.
    const info = pluginInfo(input.id)
    const providers = info.contributes.metadata.map((entry) => entry.id)
    // ACCESS: An admin sees every library, here by name only.
    const libraries =
      providers.length > 0 && !info.builtin
        ? await db
            .select({ id: library.id, name: library.name })
            .from(library)
            .where(inArray(library.metadataProvider, providers))
            .orderBy(library.name)
        : []
    return { libraries, ...(await pluginSignInImpact(input.id)) }
  }),
  logs: admin.admin.plugins.logs.handler(({ input, signal }) => {
    readPluginLogs(input.id)
    return follow({
      topics: ["plugins-log"],
      load: () => Promise.resolve(readPluginLogs(input.id)),
      signal,
    })
  }),
  checkUpdates: admin.admin.plugins.checkUpdates.handler(({ input }) =>
    checkPluginUpdates(input.force),
  ),
  browse: admin.admin.plugins.browse.handler(({ input }) =>
    browsePlugins(input.query),
  ),
}
