import {
  type PluginInfo,
  PluginInstallSource,
  type PluginPreview,
  type PluginSearchResult,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useSelector } from "@tanstack/react-form"
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  PackageIcon,
  TriangleAlertIcon,
  UserIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { client, orpc } from "@/lib/rpc"

import {
  Clamped,
  Fact,
  pluginErrorMessage,
  pluginsUnavailable,
  Reason,
  usePluginSaved,
  usePluginsPanel,
} from "./plugins-common"
import { PermissionList } from "./plugins-permissions"

type InstallSource = t.infer<typeof PluginInstallSource>

/** The source an admin typed: an https address, or an npm package. */
function sourceFrom(
  text: string,
): { source: InstallSource } | { error: string } {
  const value = text.trim()
  if (/^https?:\/\//i.test(value)) {
    const parsed = PluginInstallSource.safeParse({ type: "url", url: value })
    return parsed.success
      ? { source: parsed.data }
      : { error: tr("plugins.add.badUrl") }
  }
  const parsed = PluginInstallSource.safeParse({ type: "npm", spec: value })
  return parsed.success && !/\s/.test(value)
    ? { source: parsed.data }
    : { error: tr("plugins.add.badName") }
}

/** Where a plugin comes from, as the admin named it. */
export function sourceText(source: InstallSource): string {
  return source.type === "npm" ? source.spec : source.url
}

function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError"
}

/**
 * Downloads a plugin and reads what it asks for, without installing it.
 * It can take a while, so it can be called off.
 */
export function useInspect({
  onPreview,
  onError,
}: {
  /** Gets the preview, and where it came from in words. */
  onPreview: (preview: PluginPreview, source: string) => void
  onError?: (message: string) => void
}) {
  const controller = useRef<AbortController | null>(null)
  const inspect = useMutation({
    mutationFn: (source: InstallSource) => {
      controller.current?.abort()
      const next = new AbortController()
      controller.current = next
      return client.admin.plugins.inspect({ source }, { signal: next.signal })
    },
    onSuccess: (preview, source) => onPreview(preview, sourceText(source)),
    onError: (error) => {
      if (!isAbort(error)) onError?.(pluginErrorMessage(error))
    },
  })
  // Calls off a download still going when its dialog goes away.
  useEffect(() => () => controller.current?.abort(), [])
  return {
    run: (source: InstallSource) => inspect.mutate(source),
    cancel: () => {
      controller.current?.abort()
      inspect.reset()
    },
    pending: inspect.isPending,
    source: inspect.variables,
  }
}

/** Add a plugin: name one or find one, then see what it asks for. */
export function InstallDialog({ plugins }: { plugins: PluginInfo[] }) {
  const open = usePluginsPanel((state) => state.installOpen)
  const step = usePluginsPanel((state) => state.install)
  const close = usePluginsPanel((state) => state.closeInstall)
  const popup = useRef<HTMLDivElement>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        ref={popup}
        // The search field when naming one; on the consent step, its
        // heading, so Enter can't install by accident.
        initialFocus={() =>
          popup.current?.querySelector<HTMLElement>("[data-initial-focus]") ??
          true
        }
        className="max-h-[calc(100dvh-2rem)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-xl [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4"
      >
        {step.step === "pick" ? (
          <PickStep key="pick" />
        ) : (
          <ConsentStep
            key={step.preview.ticket}
            preview={step.preview}
            source={step.source}
            installed={
              plugins.find(
                (plugin) => plugin.id === step.preview.manifest.id,
              ) ?? null
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function PickStep() {
  const showPreview = usePluginsPanel((state) => state.showPreview)
  const close = usePluginsPanel((state) => state.closeInstall)
  const [failure, setFailure] = useState<string | null>(null)
  const inspect = useInspect({ onPreview: showPreview, onError: setFailure })
  const form = useAppForm({
    defaultValues: { spec: "" },
    onSubmit: ({ value }) => {
      const parsed = sourceFrom(value.spec)
      if ("error" in parsed) setFailure(parsed.error)
      else inspect.run(parsed.source)
    },
  })
  const typed = useSelector(form.store, (state) => state.values.spec.trim())
  const looksLikeUrl = /^https?:\/\//i.test(typed)
  const query = useDebounced(looksLikeUrl ? "" : typed, 300)

  return (
    <div className="flex min-h-0 flex-col">
      <DialogHeader className="px-6 pt-6 pr-14">
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("plugins.add.title")}
        </DialogTitle>
        <DialogDescription>{tr("plugins.add.description")}</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-3 px-6 pt-5"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.AppField
          name="spec"
          listeners={{ onChange: () => setFailure(null) }}
        >
          {(field) => (
            <field.TextField
              id="plugin-source"
              data-initial-focus
              label={tr("plugins.add.source")}
              placeholder="matinee-plugin-anilist"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={inspect.pending}
              serverError={failure}
            />
          )}
        </form.AppField>
        {inspect.pending && inspect.source ? (
          <div
            role="status"
            className="bg-foreground/[0.03] flex items-center gap-3 rounded-xl border px-4 py-3"
          >
            <Spinner className="text-muted-foreground size-4 shrink-0" />
            <p className="min-w-0 flex-1 text-[13px] leading-5">
              <span className="block">{tr("plugins.add.reading")}</span>
              <Clamped
                text={sourceText(inspect.source)}
                className="text-muted-foreground font-mono text-xs"
              />
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={inspect.cancel}
            >
              {tr("plugins.add.cancelReading")}
            </Button>
          </div>
        ) : failure ? null : (
          <p className="text-muted-foreground text-[13px] leading-5">
            {tr("plugins.add.sourceHint")}
          </p>
        )}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>

      {!looksLikeUrl && (
        <SearchResults
          query={query}
          disabled={inspect.pending}
          onPick={(result) => {
            form.setFieldValue("spec", result.name)
            setFailure(null)
            inspect.run({ type: "npm", spec: result.name })
          }}
        />
      )}

      <DialogFooter className="mx-0 mt-5 mb-0 px-6 py-4">
        <Button type="button" variant="ghost" onClick={close}>
          {tr("plugins.consent.cancel")}
        </Button>
        <form.Subscribe selector={(state) => state.values.spec.trim() === ""}>
          {(empty) => (
            <Button
              type="button"
              disabled={empty || inspect.pending}
              onClick={() => void form.handleSubmit()}
            >
              {tr("plugins.add.continue")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </div>
  )
}

/** Packages on npm tagged for Matinee, for the admin to pick from. */
function SearchResults({
  query,
  disabled,
  onPick,
}: {
  query: string
  disabled: boolean
  onPick: (result: PluginSearchResult) => void
}) {
  const results = useQuery(
    orpc.admin.plugins.browse.queryOptions({
      input: { query: query || undefined },
      placeholderData: keepPreviousData,
      staleTime: 60_000,
      retry: (failures, error) => !pluginsUnavailable(error) && failures < 1,
    }),
  )

  return (
    <section
      aria-labelledby="plugin-search-title"
      className="mt-5 flex min-h-0 flex-col gap-2 border-t px-6 pt-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="plugin-search-title" className="text-sm leading-5 font-medium">
          {query
            ? tr("plugins.add.resultsFor", { query })
            : tr("plugins.add.browse")}
        </h3>
        {results.isFetching && !results.isPending && (
          <Spinner className="text-muted-foreground size-3.5" />
        )}
      </div>
      <p className="text-muted-foreground text-[13px] leading-5">
        {tr("plugins.add.strangers")}
      </p>
      <div className="-mx-6 min-h-0 overflow-y-auto px-6 pb-1">
        {results.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : results.isError ? (
          <p className="text-muted-foreground rounded-xl border px-4 py-3 text-[13px] leading-5">
            {tr("plugins.add.searchFailed", {
              error: pluginErrorMessage(results.error),
            })}
          </p>
        ) : results.data.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-[13px] leading-5">
            {query
              ? tr("plugins.add.noResults", { query })
              : tr("plugins.add.noneTagged")}
          </p>
        ) : (
          <ul className="bg-foreground/[0.02] flex flex-col divide-y overflow-hidden rounded-xl border">
            {results.data.map((result) => (
              <li key={result.name} className="flex">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(result)}
                  className="hover:bg-foreground/[0.06] focus-visible:ring-ring flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <Clamped
                        text={result.name}
                        className="text-sm leading-5 font-medium"
                      />
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {result.version}
                      </span>
                    </span>
                    {result.description && (
                      <Clamped
                        text={result.description}
                        lines={2}
                        className="text-muted-foreground text-[13px] leading-5"
                      />
                    )}
                    <span className="text-muted-foreground flex flex-wrap gap-x-3.5 text-xs leading-5">
                      {result.author && (
                        <Fact icon={<UserIcon />}>{result.author}</Fact>
                      )}
                      {result.installedId && (
                        <Fact icon={<CircleCheckIcon />}>
                          {tr("plugins.add.installed")}
                        </Fact>
                      )}
                    </span>
                  </span>
                  <ChevronRightIcon
                    aria-hidden
                    className="text-muted-foreground size-4 shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * What the plugin is and what it asks for, before anything is installed.
 * An update leads with what's new. Nothing is focused that Enter would
 * press.
 */
function ConsentStep({
  preview,
  source,
  installed,
}: {
  preview: PluginPreview
  /** The package or address it came from, as the admin named it. */
  source: string
  installed: PluginInfo | null
}) {
  const close = usePluginsPanel((state) => state.closeInstall)
  const backToPick = usePluginsPanel((state) => state.backToPick)
  const openPlugin = usePluginsPanel((state) => state.openPlugin)
  const saved = usePluginSaved()
  const { manifest } = preview
  const update = preview.installedVersion !== null
  const install = useMutation({
    mutationFn: (enable: boolean) =>
      client.admin.plugins.install({ ticket: preview.ticket, enable }),
    onSuccess: (plugin) => {
      saved(plugin)
      close()
      openPlugin(plugin.id)
      toast.success(
        update
          ? tr("plugins.consent.updated", {
              name: plugin.name,
              version: plugin.version,
            })
          : tr("plugins.consent.installed", { name: plugin.name }),
      )
    },
  })
  const pending = install.isPending ? install.variables : null
  // The server spends the ticket on any try, so after a failure the
  // buttons give way to the failure in full and a way out. An update that
  // didn't start is undone there, and its message says which version it
  // kept; the list follows on its own.
  const failure = install.isError
    ? {
        title: update
          ? tr("plugins.consent.updateFailed", { name: manifest.name })
          : tr("plugins.consent.installFailed", { name: manifest.name }),
        message: pluginErrorMessage(install.error),
      }
    : null

  return (
    <div className="flex min-h-0 flex-col">
      <DialogHeader className="px-6 pt-6 pr-14">
        <DialogTitle
          data-initial-focus
          tabIndex={-1}
          className="text-lg leading-7 font-semibold wrap-anywhere outline-none"
        >
          {update
            ? tr("plugins.consent.updateTitle", {
                name: manifest.name,
                version: manifest.version,
              })
            : tr("plugins.consent.installTitle", { name: manifest.name })}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground flex flex-wrap gap-x-3.5 gap-y-0.5 text-[13px] leading-5">
          <span className="tabular-nums">
            {update
              ? tr("plugins.consent.versionChange", {
                  from: preview.installedVersion ?? "",
                  to: manifest.version,
                })
              : tr("plugins.version", { version: manifest.version })}
          </span>
          <Fact icon={<PackageIcon />} title={source}>
            {source}
          </Fact>
          {manifest.author && (
            <Fact icon={<UserIcon />}>
              {tr("plugins.by", { author: manifest.author })}
            </Fact>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 pt-4 pb-6">
        {manifest.description && (
          <p className="text-sm leading-5 wrap-anywhere">
            {manifest.description}
          </p>
        )}
        <h3 className="text-sm leading-5 font-medium">
          {update
            ? preview.added.length > 0
              ? tr("plugins.consent.asksMore")
              : tr("plugins.consent.asksNothingNew")
            : tr("plugins.consent.asks")}
        </h3>
        <PermissionList
          permissions={preview.permissions}
          added={update ? preview.added : undefined}
        />
        {!update && (
          <p className="text-muted-foreground text-[13px] leading-5">
            {tr("plugins.consent.enableHint")}
          </p>
        )}
      </div>

      {failure && (
        <div
          ref={(node) => node?.focus()}
          role="alert"
          tabIndex={-1}
          className="flex flex-col gap-2 px-6 pb-4 outline-none"
        >
          <p className="inline-flex items-center gap-1.5 text-sm leading-5 font-medium">
            <TriangleAlertIcon
              aria-hidden
              className="text-warning size-4 shrink-0"
            />
            {failure.title}
          </p>
          <Reason text={failure.message} serverText />
        </div>
      )}

      <DialogFooter className="mx-0 mb-0 px-6 py-4">
        {!update && (
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            disabled={install.isPending}
            onClick={backToPick}
          >
            <ArrowLeftIcon />
            {tr("plugins.consent.back")}
          </Button>
        )}
        {failure ? (
          <Button type="button" variant="outline" onClick={close}>
            {tr("plugins.consent.close")}
          </Button>
        ) : update ? (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={install.isPending}
              onClick={close}
            >
              {tr("plugins.consent.cancel")}
            </Button>
            <Button
              type="button"
              disabled={install.isPending}
              onClick={() => install.mutate(installed?.enabled ?? false)}
            >
              {install.isPending && <Spinner />}
              {tr("plugins.consent.update", { version: manifest.version })}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={install.isPending}
              onClick={() => install.mutate(false)}
            >
              {pending === false && <Spinner />}
              {tr("plugins.consent.installOff")}
            </Button>
            <Button
              type="button"
              disabled={install.isPending}
              onClick={() => install.mutate(true)}
            >
              {pending === true && <Spinner />}
              {tr("plugins.consent.installOn")}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  )
}
