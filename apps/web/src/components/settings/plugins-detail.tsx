import type { PluginInfo } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  CircleArrowUpIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  FolderSearchIcon,
  PackageIcon,
  RefreshCwIcon,
  RotateCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { tr, translateKnown } from "@/i18n"
import { client } from "@/lib/rpc"

import {
  eventLabel,
  Fact,
  httpsHomepage,
  invalidSettings,
  listOf,
  missingSettings,
  npmPackage,
  PluginGlyph,
  pluginErrorMessage,
  provides,
  Reason,
  sourceDetail,
  sourceLabel,
  StateLabel,
  usePluginSaved,
  usePluginsPanel,
} from "./plugins-common"
import { PluginConfigForm } from "./plugins-config"
import { DeliveryRow, SleepNote } from "./plugins-delivery"
import {
  couldHaveImpact,
  impactEmpty,
  impactOptions,
  removeContent,
  TurnOffDialog,
  usePrefetchImpact,
} from "./plugins-impact"
import { useInspect } from "./plugins-install"
import { PluginLog } from "./plugins-log"
import { PermissionList } from "./plugins-permissions"
import {
  SettingNote,
  SettingRow,
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

/** A call that returns the plugin as it is now, with its failure toasted. */
function usePluginAction(call: () => Promise<PluginInfo>, failed: string) {
  const saved = usePluginSaved()
  return useMutation({
    mutationFn: call,
    onSuccess: saved,
    onError: (error) =>
      toast.error(failed, { description: pluginErrorMessage(error) }),
  })
}

/**
 * Turns a plugin on or off, moving the switch at once. Turning off a
 * plugin that takes something away asks first, with what it takes: the
 * switch holds while the server is asked, which hovering or focusing it
 * usually did already. Render `confirm` beside the switch.
 */
export function useEnabledSwitch(plugin: PluginInfo) {
  const saved = usePluginSaved()
  const queryClient = useQueryClient()
  const prefetch = usePrefetchImpact(plugin)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      enabled
        ? client.admin.plugins.enable({ id: plugin.id })
        : client.admin.plugins.disable({ id: plugin.id }),
    onSuccess: saved,
    onError: (error, enabled) =>
      toast.error(
        enabled
          ? tr("plugins.enableFailed", { name: plugin.name })
          : tr("plugins.disableFailed", { name: plugin.name }),
        { description: pluginErrorMessage(error) },
      ),
  })
  const set = async (enabled: boolean) => {
    if (enabled || !couldHaveImpact(plugin)) {
      toggle.mutate(enabled)
      return
    }
    setChecking(true)
    try {
      const impact = await queryClient.fetchQuery(impactOptions(plugin.id))
      if (impactEmpty(impact)) toggle.mutate(false)
      else setConfirming(true)
    } catch {
      // The question still comes, in general words.
      setConfirming(true)
    } finally {
      setChecking(false)
    }
  }
  return {
    checked: toggle.isPending ? (toggle.variables ?? false) : plugin.enabled,
    pending: toggle.isPending || checking,
    set: (enabled: boolean) => void set(enabled),
    /** For the switch's hover and focus, when it would turn the plugin off. */
    prefetch: () => {
      if (plugin.enabled) prefetch()
    },
    confirm: (
      <TurnOffDialog
        plugin={plugin}
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => toggle.mutate(false)}
      />
    ),
  }
}

/** Checks the registry for a newer version, and reads one to update to. */
function useUpdate(plugin: PluginInfo) {
  const saved = usePluginSaved()
  const showPreview = usePluginsPanel((state) => state.showPreview)
  const inspect = useInspect({
    onPreview: showPreview,
    onError: (message) =>
      toast.error(tr("plugins.update.readFailed", { name: plugin.name }), {
        description: message,
      }),
  })
  const check = useMutation({
    mutationFn: () => client.admin.plugins.checkUpdates({ force: true }),
    onSuccess: (plugins) => {
      const next = plugins.find((item) => item.id === plugin.id)
      if (!next) return
      saved(next)
      if (next.update) {
        toast.success(
          tr("plugins.update.available", {
            name: next.name,
            version: next.update.version,
          }),
        )
      } else {
        toast.success(tr("plugins.update.none", { name: next.name }))
      }
    },
    onError: (error) =>
      toast.error(tr("plugins.update.checkFailed"), {
        description: pluginErrorMessage(error),
      }),
  })
  const source = plugin.source
  return {
    checkable: source.type === "npm",
    check: () => check.mutate(),
    checking: check.isPending,
    read: () => {
      if (source.type !== "npm" || !plugin.update) return
      inspect.run({
        type: "npm",
        spec: `${npmPackage(source.spec)}@${plugin.update.version}`,
      })
    },
    reading: inspect.pending,
    cancel: inspect.cancel,
  }
}

/**
 * Everything about one plugin, in place of the list: what it is, how it's
 * doing and what fixes it, what it may do, its settings, and its log.
 */
export function PluginDetail({ plugin }: { plugin: PluginInfo }) {
  const backToList = usePluginsPanel((state) => state.backToList)
  const configDirty = usePluginsPanel((state) => state.configDirty)
  const [leaving, setLeaving] = useState(false)
  const top = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // The page opens at its top with its name focused, as a new page would.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" })
    heading.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div ref={top} className="flex scroll-mt-8 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2.5"
          onClick={() => (configDirty ? setLeaving(true) : backToList())}
        >
          <ArrowLeftIcon />
          {tr("plugins.detail.back")}
        </Button>
        <AlertDialog open={leaving} onOpenChange={setLeaving}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tr("plugins.leave.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {tr("plugins.leave.description", { name: plugin.name })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tr("plugins.leave.stay")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={backToList}>
                {tr("plugins.leave.discard")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <HeaderActions plugin={plugin} />
      </div>
      <Header plugin={plugin} heading={heading} />
      <SettingsSections>
        {plugin.approval?.needed && <ApprovalPrompt plugin={plugin} />}
        <StatusSection plugin={plugin} />
        {!plugin.builtin && !plugin.approval?.needed && (
          <SettingsSubsection
            id="plugin-permissions"
            title={tr("plugins.detail.permissions")}
          >
            <PermissionList permissions={plugin.permissions} />
          </SettingsSubsection>
        )}
        {plugin.config.fields.length > 0 && (
          <SettingsSubsection
            id="plugin-settings"
            title={tr("plugins.detail.settings")}
          >
            <PluginConfigForm
              key={JSON.stringify(plugin.config.fields)}
              plugin={plugin}
            />
          </SettingsSubsection>
        )}
        {plugin.contributes.auth.length > 0 && (
          <SignInSection plugin={plugin} />
        )}
        <SettingsSubsection id="plugin-log" title={tr("plugins.detail.log")}>
          <PluginLog id={plugin.id} />
        </SettingsSubsection>
      </SettingsSections>
    </div>
  )
}

function Header({
  plugin,
  heading,
}: {
  plugin: PluginInfo
  heading: React.RefObject<HTMLHeadingElement | null>
}) {
  const homepage = httpsHomepage(plugin.homepage)
  const detail = sourceDetail(plugin.source)
  const kinds = provides(plugin)
  return (
    <header className="@container flex flex-col gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <PluginGlyph plugin={plugin} size="lg" />
        <div className="min-w-0 flex-1">
          <h3
            ref={heading}
            tabIndex={-1}
            className="text-xl leading-7 font-semibold tracking-tight wrap-anywhere outline-none"
          >
            {plugin.name}
          </h3>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-5">
            {!plugin.builtin && (
              <span className="tabular-nums">
                {tr("plugins.version", { version: plugin.version })}
              </span>
            )}
            <Fact icon={<PackageIcon />} title={detail ?? undefined}>
              {sourceLabel(plugin.source)}
            </Fact>
            {plugin.author && (
              <Fact icon={<UserIcon />}>
                {tr("plugins.by", { author: plugin.author })}
              </Fact>
            )}
            {homepage && (
              <a
                href={homepage}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm underline-offset-3 outline-none hover:underline focus-visible:ring-2 [&>svg]:size-3.5"
              >
                {tr("plugins.homepage")}
                <ExternalLinkIcon aria-hidden />
              </a>
            )}
          </p>
        </div>
      </div>
      {plugin.description && (
        <p className="max-w-prose text-sm leading-6 wrap-anywhere">
          {plugin.description}
        </p>
      )}
      {(kinds.length > 0 || detail) && (
        <dl className="bg-foreground/[0.03] grid gap-x-6 gap-y-3 rounded-lg px-3 py-2.5 @lg:grid-cols-[auto_minmax(0,1fr)]">
          {plugin.contributes.metadata.length > 0 && (
            <Term label={tr("plugins.provides.metadata")}>
              {listOf(plugin.contributes.metadata.map((item) => item.name))}
            </Term>
          )}
          {plugin.contributes.auth.length > 0 && (
            <Term label={tr("plugins.provides.auth")}>
              {listOf(plugin.contributes.auth.map((item) => item.name))}
            </Term>
          )}
          {plugin.contributes.events.length > 0 && (
            <Term label={tr("plugins.provides.events")}>
              {listOf(plugin.contributes.events.map(eventLabel))}
            </Term>
          )}
          {detail && (
            <Term label={tr(`plugins.detail.from.${plugin.source.type}`)}>
              <span className="font-mono text-xs wrap-anywhere">{detail}</span>
            </Term>
          )}
        </dl>
      )}
    </header>
  )
}

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-foreground-faint text-xs leading-5">{label}</dt>
      <dd className="-mt-3 min-w-0 text-[13px] leading-5 @lg:mt-0">
        {children}
      </dd>
    </div>
  )
}

function HeaderActions({ plugin }: { plugin: PluginInfo }) {
  const update = useUpdate(plugin)
  const [removing, setRemoving] = useState(false)
  const restart = usePluginAction(
    () => client.admin.plugins.restart({ id: plugin.id }),
    tr("plugins.restartFailed", { name: plugin.name }),
  )
  // A plugin whose files are gone can still go; the server finds its row.
  const removable =
    plugin.removable || (!plugin.builtin && plugin.state === "missing")
  const canRestart = !plugin.builtin && plugin.enabled
  const hasMenu = update.checkable || canRestart || removable
  const prefetchImpact = usePrefetchImpact(plugin)
  if (plugin.builtin) return null

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {plugin.update &&
        (update.reading ? (
          <>
            <Button variant="outline" disabled>
              <Spinner />
              {tr("plugins.update.reading", {
                version: plugin.update.version,
              })}
            </Button>
            <Button variant="ghost" onClick={update.cancel}>
              {tr("plugins.add.cancelReading")}
            </Button>
          </>
        ) : (
          <Button onClick={update.read}>
            <CircleArrowUpIcon />
            {tr("plugins.update.to", { version: plugin.update.version })}
          </Button>
        ))}
      {hasMenu && (
        <DropdownMenu
          // Opening the menu asks what removing takes, so the question
          // has its answer by the time Remove is chosen.
          onOpenChange={(open) => {
            if (open && removable) prefetchImpact()
          }}
        >
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="rounded-lg"
                aria-label={tr("plugins.actions", { name: plugin.name })}
              />
            }
          >
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
            {canRestart && (
              <DropdownMenuItem
                disabled={restart.isPending}
                onClick={() => restart.mutate()}
              >
                <RotateCwIcon />
                {tr("plugins.restart")}
              </DropdownMenuItem>
            )}
            {update.checkable && (
              <DropdownMenuItem
                disabled={update.checking}
                onClick={update.check}
              >
                <RefreshCwIcon />
                {tr("plugins.update.check")}
              </DropdownMenuItem>
            )}
            {removable && (
              <>
                {(canRestart || update.checkable) && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setRemoving(true)}
                >
                  <Trash2Icon />
                  {tr("plugins.remove")}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <RemoveDialog
        plugin={plugin}
        open={removing}
        onOpenChange={setRemoving}
      />
    </div>
  )
}

function RemoveDialog({
  plugin,
  open,
  onOpenChange,
}: {
  plugin: PluginInfo
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const backToList = usePluginsPanel((state) => state.backToList)
  const remove = useMutation({
    mutationFn: () => client.admin.plugins.remove({ id: plugin.id }),
    onSuccess: () => {
      onOpenChange(false)
      backToList()
      toast.success(tr("plugins.removed", { name: plugin.name }))
    },
    onError: (error) =>
      toast.error(tr("plugins.removeFailed", { name: plugin.name }), {
        description: pluginErrorMessage(error),
      }),
  })
  const cancel = useRef<HTMLButtonElement>(null)
  const impact = useQuery({
    ...impactOptions(plugin.id),
    enabled: open && couldHaveImpact(plugin),
  })
  // Removing waits for the answer, which is a moment, or its failure.
  const checking = couldHaveImpact(plugin) && impact.isPending && open
  const content = removeContent(plugin, impact)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        initialFocus={cancel}
        className="data-[size=default]:sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="wrap-anywhere">
            {tr("plugins.remove.title", { name: plugin.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>{content.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {content.list}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancel}>
            {tr("plugins.consent.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending || checking}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Spinner />}
            {tr("plugins.remove.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * The plugin asks for more than was approved, or its files changed. It
 * stays stopped until an admin says yes to exactly what it asks for now.
 */
function ApprovalPrompt({ plugin }: { plugin: PluginInfo }) {
  const saved = usePluginSaved()
  const approval = plugin.approval
  const approve = useMutation({
    mutationFn: async () => {
      const next = await client.admin.plugins.approve({
        id: plugin.id,
        integrity: approval?.integrity ?? "",
      })
      // Approving a plugin that's off turns it on: that's what the
      // button says.
      return next.enabled
        ? next
        : client.admin.plugins.enable({ id: plugin.id })
    },
    onSuccess: (next) => {
      saved(next)
      toast.success(tr("plugins.approval.done", { name: plugin.name }))
    },
    onError: (error) =>
      toast.error(tr("plugins.approval.failed", { name: plugin.name }), {
        description: pluginErrorMessage(error),
      }),
  })
  if (!approval) return null
  const added = approval.added
  // Nothing approved before: everything it asks for is new, and listing
  // it all as new says nothing.
  const fresh =
    !approval.changedOnDisk &&
    added.length > 0 &&
    added.length >= plugin.permissions.length &&
    added.every((item) =>
      plugin.permissions.some(
        (permission) =>
          permission.kind === item.kind &&
          permission.detail.length === item.detail.length,
      ),
    )
  const message = approval.changedOnDisk
    ? tr("plugins.approval.changedOnDisk")
    : fresh
      ? tr("plugins.approval.fresh")
      : tr("plugins.approval.more")

  return (
    <SettingsSubsection
      id="plugin-approval"
      title={tr("plugins.approval.title")}
    >
      <div className="border-warning/40 flex flex-col gap-4 rounded-xl border p-4">
        <p className="text-sm leading-5">{message}</p>
        <PermissionList
          permissions={plugin.permissions}
          added={fresh || approval.changedOnDisk ? undefined : added}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
            {approve.isPending ? <Spinner /> : <ShieldCheckIcon />}
            {plugin.enabled
              ? tr("plugins.approval.approve")
              : tr("plugins.approval.approveAndEnable")}
          </Button>
        </div>
      </div>
    </SettingsSubsection>
  )
}

/** Why the plugin is in its state, in a sentence or the server's words. */
function stateReason(plugin: PluginInfo): string | null {
  switch (plugin.state) {
    case "running":
      return plugin.builtin
        ? tr("plugins.reason.builtin")
        : tr("plugins.sleep.reason")
    case "starting":
      return tr("plugins.reason.starting")
    case "disabled":
      return plugin.approval?.needed
        ? tr("plugins.reason.disabledUnapproved")
        : tr("plugins.reason.disabled")
    case "needs-approval":
      return tr("plugins.reason.needsApproval")
    case "needs-config": {
      // Saved values that stopped fitting come first: nothing is empty
      // there, so "fill in" would send the admin looking for a blank.
      const invalid = invalidSettings(plugin)
      const missing = missingSettings(plugin)
      const parts: string[] = []
      if (invalid.length > 0) {
        parts.push(
          tr("plugins.reason.invalidConfig", {
            count: invalid.length,
            fields: listOf(invalid),
          }),
        )
      }
      if (missing.length > 0) {
        parts.push(
          tr("plugins.reason.needsConfig", { fields: listOf(missing) }),
        )
      }
      return parts.length > 0
        ? parts.join(" ")
        : tr("plugins.reason.needsConfigAny")
    }
    case "error":
      return plugin.error
        ? translateKnown(plugin.error)
        : tr("plugins.reason.error")
    case "missing":
      return tr("plugins.reason.missing")
    case "incompatible":
      return plugin.error
        ? translateKnown(plugin.error)
        : tr("plugins.reason.incompatible")
  }
}

function StatusSection({ plugin }: { plugin: PluginInfo }) {
  const enabled = useEnabledSwitch(plugin)
  const saved = usePluginSaved()
  const restart = usePluginAction(
    () => client.admin.plugins.restart({ id: plugin.id }),
    tr("plugins.restartFailed", { name: plugin.name }),
  )
  const rescan = useMutation({
    mutationFn: () => client.admin.plugins.rescan(),
    onSuccess: (plugins) => {
      const next = plugins.find((item) => item.id === plugin.id)
      if (next) saved(next)
    },
    onError: (error) =>
      toast.error(tr("plugins.rescanFailed"), {
        description: pluginErrorMessage(error),
      }),
  })
  const reason = stateReason(plugin)
  const serverText =
    (plugin.state === "error" || plugin.state === "incompatible") &&
    plugin.error !== null
  const fix =
    plugin.state === "error" ? (
      <Button
        variant="outline"
        size="sm"
        disabled={restart.isPending}
        onClick={() => restart.mutate()}
      >
        {restart.isPending ? <Spinner /> : <RotateCwIcon />}
        {tr("plugins.restart")}
      </Button>
    ) : plugin.state === "missing" ? (
      <Button
        variant="outline"
        size="sm"
        disabled={rescan.isPending}
        onClick={() => rescan.mutate()}
      >
        {rescan.isPending ? <Spinner /> : <FolderSearchIcon />}
        {tr("plugins.rescan")}
      </Button>
    ) : null

  return (
    <SettingsSubsection id="plugin-status" title={tr("plugins.detail.status")}>
      <SettingRows>
        {!plugin.builtin && (
          <SettingRow title={tr("plugins.detail.enabled")}>
            {({ controlId, labelId }) => (
              <Switch
                id={controlId}
                aria-labelledby={labelId}
                checked={enabled.checked}
                disabled={
                  enabled.pending ||
                  (!plugin.enabled &&
                    (plugin.state === "missing" ||
                      plugin.state === "incompatible"))
                }
                onCheckedChange={enabled.set}
                onPointerEnter={enabled.prefetch}
                onFocus={enabled.prefetch}
              />
            )}
          </SettingRow>
        )}
        <div className="@container flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1">
              <StateLabel
                state={plugin.state}
                className="text-sm font-medium"
              />
              {plugin.state === "running" && !plugin.builtin && (
                <SleepNote awake={plugin.awake} />
              )}
            </span>
            {fix}
          </div>
          {reason && <Reason text={reason} serverText={serverText} />}
        </div>
        {plugin.events && (
          <DeliveryRow
            id={plugin.id}
            events={plugin.events}
            running={plugin.state === "running"}
          />
        )}
      </SettingRows>
      {enabled.confirm}
      {!plugin.builtin && !plugin.removable && plugin.state !== "missing" && (
        <SettingNote>{tr("plugins.detail.externalFolder")}</SettingNote>
      )}
    </SettingsSubsection>
  )
}

/** For each sign-in it provides: whether new people may sign up with it. */
function SignInSection({ plugin }: { plugin: PluginInfo }) {
  const saved = usePluginSaved()
  const update = useMutation({
    mutationFn: (input: { provider: string; allowSignUp: boolean }) =>
      client.admin.plugins.setAuthOptions({ id: plugin.id, ...input }),
    onSuccess: saved,
    onError: (error) =>
      toast.error(tr("plugins.signIn.failed"), {
        description: pluginErrorMessage(error),
      }),
  })
  const pending = update.isPending ? update.variables : undefined
  return (
    <SettingsSubsection id="plugin-sign-in" title={tr("plugins.detail.signIn")}>
      <SettingRows>
        {plugin.contributes.auth.map((provider) => (
          <SettingRow
            key={provider.id}
            title={tr("plugins.signIn.allowSignUp", {
              provider: provider.name,
            })}
            footer={
              <SettingNote>
                {tr("plugins.signIn.allowSignUpHint", {
                  provider: provider.name,
                })}
              </SettingNote>
            }
          >
            {({ controlId, labelId }) => (
              <Switch
                id={controlId}
                aria-labelledby={labelId}
                checked={
                  pending?.provider === provider.id
                    ? pending.allowSignUp
                    : provider.allowSignUp
                }
                onCheckedChange={(allowSignUp) =>
                  update.mutate({ provider: provider.id, allowSignUp })
                }
              />
            )}
          </SettingRow>
        ))}
      </SettingRows>
    </SettingsSubsection>
  )
}
