import { eventIterator } from "@orpc/contract"

import { del, get, post, put } from "./contract-routes"
import {
  PluginId,
  PluginImpact,
  PluginInfo,
  PluginPreview,
  PluginInstallSource,
  PluginConfigValues,
  PluginLogLine,
  PluginSearchResult,
} from "./plugins"
import { t } from "./schema"
const Id = t.object({ id: PluginId })
export const pluginsContract = {
  list: get("/admin/plugins").output(t.array(PluginInfo)),
  watch: get("/admin/plugins/watch").output(eventIterator(t.array(PluginInfo))),
  inspect: post("/admin/plugins/inspect")
    .input(t.object({ source: PluginInstallSource }))
    .output(PluginPreview),
  install: post("/admin/plugins/install")
    .input(t.object({ ticket: t.string().min(1), enable: t.boolean() }))
    .output(PluginInfo),
  rescan: post("/admin/plugins/rescan").output(t.array(PluginInfo)),
  enable: post("/admin/plugins/{id}/enable").input(Id).output(PluginInfo),
  disable: post("/admin/plugins/{id}/disable").input(Id).output(PluginInfo),
  approve: post("/admin/plugins/{id}/approve")
    .input(Id.extend({ integrity: t.string().regex(/^[a-f0-9]{64}$/) }))
    .output(PluginInfo),
  /**
   * `links` says what happens to the accounts linked through the plugin
   * when a setting in `config.identity` changes: keep them, because it is
   * the same service with the same people, or remove them. Without it
   * such a change is refused while accounts are linked.
   */
  configure: put("/admin/plugins/{id}/config")
    .input(
      Id.extend({
        values: PluginConfigValues,
        links: t.enum(["keep", "remove"]).optional(),
      }),
    )
    .output(PluginInfo),
  setAuthOptions: put("/admin/plugins/{id}/auth/{provider}")
    .input(Id.extend({ provider: PluginId, allowSignUp: t.boolean() }))
    .output(PluginInfo),
  restart: post("/admin/plugins/{id}/restart").input(Id).output(PluginInfo),
  /** Try its waiting events now, not when the next try is due. */
  retryEvents: post("/admin/plugins/{id}/events/retry")
    .input(Id)
    .output(PluginInfo),
  remove: del("/admin/plugins/{id}").input(Id).output(t.void()),
  /** What turning it off or removing it would take away. */
  impact: get("/admin/plugins/{id}/impact").input(Id).output(PluginImpact),
  logs: get("/admin/plugins/{id}/logs")
    .input(Id)
    .output(eventIterator(t.array(PluginLogLine))),
  checkUpdates: post("/admin/plugins/updates")
    .input(t.object({ force: t.boolean().optional() }))
    .output(t.array(PluginInfo)),
  browse: get("/admin/plugins/browse")
    .input(t.object({ query: t.string().max(300).optional() }))
    .output(t.array(PluginSearchResult)),
}
