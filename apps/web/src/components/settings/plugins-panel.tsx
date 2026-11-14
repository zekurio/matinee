import type { PluginInfo } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  ChevronRightIcon,
  CircleArrowUpIcon,
  FolderSearchIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  BlocksIcon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { tr } from "@/i18n"
import { client, liveQuery, orpc } from "@/lib/rpc"
import { createPluginsPanelStore } from "@/stores/plugins-panel"

import {
  Clamped,
  Fact,
  PluginGlyph,
  PluginsStoreProvider,
  pluginErrorMessage,
  pluginsUnavailable,
  provides,
  sourceDetail,
  sourceLabel,
  StateLabel,
  usePluginSaved,
  usePluginsPanel,
} from "./plugins-common"
import { deliveryTrouble } from "./plugins-delivery"
import { PluginDetail, useEnabledSwitch } from "./plugins-detail"
import { usePrefetchImpact } from "./plugins-impact"
import { InstallDialog } from "./plugins-install"
import { SettingsSections, SettingsSubsection } from "./settings-panel"

/** Settings → Plugins: the list, a plugin's page, and adding one. */
export function PluginsPanel() {
  const [store] = useState(createPluginsPanelStore)
  return (
    <PluginsStoreProvider value={store}>
      <PluginsBody />
    </PluginsStoreProvider>
  )
}

function PluginsBody() {
  const plugins = useQuery({
    ...orpc.admin.plugins.watch.experimental_liveOptions(),
    ...liveQuery,
    // A server without the plugin manager says so once; asking again
    // won't change it.
    retry: (failures, error) =>
      !pluginsUnavailable(error) && liveQuery.retry(failures, error),
    refetchInterval: (query) =>
      pluginsUnavailable(query.state.error)
        ? false
        : liveQuery.refetchInterval(query),
  })
  const openId = usePluginsPanel((state) => state.openId)
  const open = plugins.data?.find((plugin) => plugin.id === openId)

  if (plugins.isPending && !plugins.isError) return <ListSkeleton />
  if (!plugins.data) {
    return (
      <SettingsSections>
        <SettingsSubsection id="plugins" title={tr("plugins.installed")}>
          <LoadError
            error={plugins.error}
            retry={() => void plugins.refetch()}
          />
        </SettingsSubsection>
      </SettingsSections>
    )
  }
  return (
    <>
      {open ? (
        <PluginDetail key={open.id} plugin={open} />
      ) : (
        <PluginList plugins={plugins.data} />
      )}
      <InstallDialog plugins={plugins.data} />
    </>
  )
}

function ListSkeleton() {
  return (
    <SettingsSections>
      <SettingsSubsection id="plugins" title={tr("plugins.installed")}>
        <Skeleton className="h-48 rounded-xl" />
      </SettingsSubsection>
      <SettingsSubsection id="plugins-builtin" title={tr("plugins.builtin")}>
        <Skeleton className="h-32 rounded-xl" />
      </SettingsSubsection>
    </SettingsSections>
  )
}

function LoadError({
  error,
  retry,
}: {
  error: Error | null
  retry: () => void
}) {
  const unavailable = pluginsUnavailable(error)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground min-w-0 flex-1 text-sm">
        {unavailable
          ? tr("plugins.unavailable")
          : tr("plugins.loadFailed", { error: pluginErrorMessage(error) })}
      </p>
      {!unavailable && (
        <Button variant="outline" onClick={retry}>
          <RefreshCwIcon />
          {tr("plugins.retry")}
        </Button>
      )}
    </div>
  )
}

function PluginList({ plugins }: { plugins: PluginInfo[] }) {
  const startAdd = usePluginsPanel((state) => state.startAdd)
  const returnId = usePluginsPanel((state) => state.returnId)
  const installed = plugins.filter((plugin) => !plugin.builtin)
  const builtin = plugins.filter((plugin) => plugin.builtin)

  // Back from a plugin's page, focus lands on its row again.
  useEffect(() => {
    if (!returnId) return
    document
      .querySelector<HTMLElement>(`[data-plugin-row="${CSS.escape(returnId)}"]`)
      ?.focus()
  }, [returnId])

  const addButton = (
    <Button onClick={startAdd}>
      <PlusIcon />
      {tr("plugins.add")}
    </Button>
  )

  return (
    <SettingsSections>
      <SettingsSubsection
        id="plugins"
        title={tr("plugins.installed")}
        action={installed.length > 0 ? addButton : undefined}
      >
        {installed.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyTitle>{tr("plugins.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {tr("plugins.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{addButton}</EmptyContent>
          </Empty>
        ) : (
          <ul className="bg-foreground/[0.02] flex shrink-0 flex-col divide-y overflow-hidden rounded-xl border">
            {installed.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} />
            ))}
          </ul>
        )}
        <ListTools hasNpm={installed.some((p) => p.source.type === "npm")} />
      </SettingsSubsection>

      {builtin.length > 0 && (
        <SettingsSubsection id="plugins-builtin" title={tr("plugins.builtin")}>
          <ul className="bg-foreground/[0.02] flex shrink-0 flex-col divide-y overflow-hidden rounded-xl border">
            {builtin.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} />
            ))}
          </ul>
        </SettingsSubsection>
      )}
    </SettingsSections>
  )
}

/**
 * The quiet tools under the list: look for folders dropped on the server,
 * and ask npm for updates now rather than within the hour.
 */
function ListTools({ hasNpm }: { hasNpm: boolean }) {
  const saved = usePluginSaved()
  const rescan = useMutation({
    mutationFn: () => client.admin.plugins.rescan(),
    onSuccess: (plugins) => {
      plugins.forEach(saved)
      toast.success(tr("plugins.rescanned"))
    },
    onError: (error) =>
      toast.error(tr("plugins.rescanFailed"), {
        description: pluginErrorMessage(error),
      }),
  })
  const check = useMutation({
    mutationFn: () => client.admin.plugins.checkUpdates({ force: true }),
    onSuccess: (plugins) => {
      plugins.forEach(saved)
      const count = plugins.filter((plugin) => plugin.update).length
      toast.success(
        count > 0
          ? tr("plugins.update.availableCount", { count })
          : tr("plugins.update.noneAll"),
      )
    },
    onError: (error) =>
      toast.error(tr("plugins.update.checkFailed"), {
        description: pluginErrorMessage(error),
      }),
  })
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] leading-5">
      <span className="mr-1">{tr("plugins.foldersHint")}</span>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-foreground"
        disabled={rescan.isPending}
        onClick={() => rescan.mutate()}
      >
        {rescan.isPending ? <Spinner /> : <FolderSearchIcon />}
        {tr("plugins.rescan")}
      </Button>
      {hasNpm && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
          disabled={check.isPending}
          onClick={() => check.mutate()}
        >
          {check.isPending ? <Spinner /> : <RefreshCwIcon />}
          {tr("plugins.update.check")}
        </Button>
      )}
    </div>
  )
}

/**
 * A plugin in the list: its name and version, a line of what it is, then
 * how it's doing, where it came from, and what it provides. The row opens
 * its page; the switch beside it turns it on and off.
 */
function PluginRow({ plugin }: { plugin: PluginInfo }) {
  const openPlugin = usePluginsPanel((state) => state.openPlugin)
  const enabled = useEnabledSwitch(plugin)
  const prefetchImpact = usePrefetchImpact(plugin)
  const kinds = provides(plugin)
  const detail = sourceDetail(plugin.source)
  const hasSwitch = !plugin.builtin
  const unapproved = plugin.approval?.needed && plugin.state === "disabled"
  // Nothing getting through is amber; a few events failing while the
  // rest flow is a muted note, since the plugin mostly works.
  const trouble = deliveryTrouble(plugin)
  // Asleep or awake changes often and means little in a list, so it's
  // only in the state's title here, and on the plugin's page.
  const sleep =
    plugin.state === "running" && !plugin.builtin
      ? plugin.awake
        ? tr("plugins.sleep.awakeTitle")
        : tr("plugins.sleep.asleepTitle")
      : undefined

  return (
    <li className="has-[>button:focus-visible]:bg-foreground/[0.06] has-[>button:hover]:bg-foreground/[0.06] relative flex transition-colors">
      <button
        type="button"
        data-plugin-row={plugin.id}
        onClick={() => {
          // Its page asks what turning it off would take, ahead of time.
          if (plugin.enabled) prefetchImpact()
          openPlugin(plugin.id)
        }}
        className="focus-visible:ring-ring flex min-h-16 min-w-0 flex-1 cursor-pointer items-start gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <PluginGlyph plugin={plugin} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <Clamped
              text={plugin.name}
              className="text-sm leading-5 font-medium"
            />
            {/* A built-in has the server's version, which says nothing. */}
            {!plugin.builtin && (
              <span
                title={plugin.version}
                className="text-muted-foreground max-w-32 shrink-0 truncate text-xs tabular-nums"
              >
                {plugin.version}
              </span>
            )}
          </span>
          {plugin.description && (
            <Clamped
              text={plugin.description}
              className="text-muted-foreground text-[13px] leading-5"
            />
          )}
          <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-[13px] leading-5">
            <StateLabel state={plugin.state} title={sleep} />
            {trouble === "blocked" && (
              <Fact icon={<TriangleAlertIcon className="text-warning" />}>
                {tr("plugins.row.deliveryBlocked")}
              </Fact>
            )}
            {trouble === "failing" && plugin.events && (
              <Fact icon={<TriangleAlertIcon />}>
                {tr("plugins.row.deliveryFailing", {
                  count: plugin.events.failing,
                })}
              </Fact>
            )}
            {unapproved && (
              <Fact icon={<ShieldAlertIcon className="text-warning" />}>
                {tr("plugins.row.unapproved")}
              </Fact>
            )}
            {!plugin.builtin && (
              <Fact icon={<PackageIcon />} title={detail ?? undefined}>
                {sourceLabel(plugin.source)}
              </Fact>
            )}
            {kinds.length > 0 && (
              <Fact icon={<BlocksIcon />}>{kinds.join(", ")}</Fact>
            )}
            {plugin.update && (
              <Fact icon={<CircleArrowUpIcon className="text-primary" />}>
                <span className="text-foreground">
                  {tr("plugins.row.update", {
                    version: plugin.update.version,
                  })}
                </span>
              </Fact>
            )}
          </span>
        </span>
        {/* Room for the switch, which sits over the row's end. */}
        {hasSwitch && <span aria-hidden className="w-12 shrink-0" />}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground mt-2.5 size-4 shrink-0"
        />
      </button>
      {hasSwitch && (
        <span className="absolute top-3 right-10 flex h-9 items-center">
          <Switch
            aria-label={tr("plugins.row.toggle", { name: plugin.name })}
            checked={enabled.checked}
            disabled={
              enabled.pending ||
              (!plugin.enabled &&
                (plugin.state === "missing" || plugin.state === "incompatible"))
            }
            onCheckedChange={enabled.set}
            onPointerEnter={enabled.prefetch}
            onFocus={enabled.prefetch}
          />
          {enabled.confirm}
        </span>
      )}
    </li>
  )
}
