import { ORPCError } from "@matinee/client"
import type {
  PluginEventName,
  PluginInfo,
  PluginSource,
  PluginState,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { useQueryClient } from "@tanstack/react-query"
import {
  ClapperboardIcon,
  LogInIcon,
  PuzzleIcon,
  RadioIcon,
} from "lucide-react"
import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react"
import { useStore } from "zustand"

import { perLocale, tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"
import type { PluginsPanelStore } from "@/stores/plugins-panel"

const StoreContext = createContext<PluginsPanelStore | null>(null)
export const PluginsStoreProvider = StoreContext.Provider

/** Reads the plugins panel's store, which the panel provides. */
export function usePluginsPanel<Value>(
  select: (state: ReturnType<PluginsPanelStore["getState"]>) => Value,
): Value {
  const store = useContext(StoreContext)
  if (!store) throw new Error("The plugins panel's store is missing.")
  return useStore(store, select)
}

/**
 * The server has no plugin manager yet: its procedures answer that they
 * aren't implemented. Asking again won't change that.
 */
export function pluginsUnavailable(cause: unknown): boolean {
  return cause instanceof ORPCError && cause.code === "NOT_IMPLEMENTED"
}

/** What to show for a failed plugin call. */
export function pluginErrorMessage(cause: unknown): string {
  return pluginsUnavailable(cause)
    ? tr("plugins.unavailable")
    : errorMessage(cause)
}

/** Put a plugin the server returned into the live list. */
export function usePluginSaved() {
  const queryClient = useQueryClient()
  return (next: PluginInfo) =>
    queryClient.setQueryData(
      orpc.admin.plugins.watch.experimental_liveKey(),
      (old) =>
        old?.some((plugin) => plugin.id === next.id)
          ? old.map((plugin) => (plugin.id === next.id ? next : plugin))
          : old && [...old, next],
    )
}

export function stateLabel(state: PluginState): string {
  return tr(`plugins.state.${state}`)
}

type Tone = "good" | "busy" | "attention" | "failed" | "idle"

function stateTone(state: PluginState): Tone {
  switch (state) {
    case "running":
      return "good"
    case "starting":
      return "busy"
    case "needs-approval":
    case "needs-config":
      return "attention"
    case "error":
      return "failed"
    case "disabled":
    case "missing":
    case "incompatible":
      return "idle"
  }
}

const dotClassName = {
  good: "bg-success ring-[3px] ring-success-soft",
  attention: "bg-warning ring-[3px] ring-warning-soft",
  failed: "bg-destructive ring-[3px] ring-danger-soft",
  idle: "border-[1.5px] border-muted-foreground/60",
} satisfies Record<Exclude<Tone, "busy">, string>

/** A state's dot, sized to sit in an icon's slot. Starting spins. */
export function StateMark({ state }: { state: PluginState }) {
  const tone = stateTone(state)
  if (tone === "busy") return <Spinner className="size-3.5 shrink-0" />
  return (
    <span aria-hidden className="grid size-3.5 shrink-0 place-items-center">
      <span className={cn("size-2 rounded-full", dotClassName[tone])} />
    </span>
  )
}

/** The state in words, with its dot. Only a failure takes the red. */
export function StateLabel({
  state,
  title,
  className,
}: {
  state: PluginState
  /** More about the state, on hover. */
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5",
        stateTone(state) === "failed" ? "text-destructive" : "text-foreground",
        className,
      )}
    >
      <StateMark state={state} />
      <span className="truncate">{stateLabel(state)}</span>
    </span>
  )
}

/** What the plugin adds to Matinee, by kind. */
export function provides(plugin: PluginInfo): string[] {
  const kinds: string[] = []
  if (plugin.contributes.metadata.length > 0) {
    kinds.push(tr("plugins.provides.metadata"))
  }
  if (plugin.contributes.auth.length > 0) {
    kinds.push(tr("plugins.provides.auth"))
  }
  if (plugin.contributes.events.length > 0) {
    kinds.push(tr("plugins.provides.events"))
  }
  return kinds
}

function glyphFor(plugin: PluginInfo): ReactNode {
  if (plugin.contributes.metadata.length > 0) return <ClapperboardIcon />
  if (plugin.contributes.auth.length > 0) return <LogInIcon />
  if (plugin.contributes.events.length > 0) return <RadioIcon />
  return <PuzzleIcon />
}

/**
 * The tile at the start of a plugin's row: a glyph for the main thing it
 * provides, since plugins bring no icons of their own.
 */
export function PluginGlyph({
  plugin,
  size = "default",
}: {
  plugin: PluginInfo
  size?: "default" | "lg"
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-secondary text-muted-foreground grid shrink-0 place-items-center",
        size === "lg"
          ? "size-12 rounded-xl [&_svg]:size-5"
          : "size-9 rounded-lg [&_svg]:size-4",
      )}
    >
      {glyphFor(plugin)}
    </span>
  )
}

/** Where the plugin came from, in a few words. */
export function sourceLabel(source: PluginSource): string {
  switch (source.type) {
    case "builtin":
      return tr("plugins.source.builtin")
    case "npm":
      return tr("plugins.source.npm")
    case "url":
      return tr("plugins.source.url", { host: hostOf(source.url) })
    case "directory":
      return tr("plugins.source.directory")
  }
}

/** The exact package, address, or folder, for its title or detail line. */
export function sourceDetail(source: PluginSource): string | null {
  switch (source.type) {
    case "builtin":
      return null
    case "npm":
      return source.spec
    case "url":
      return source.url
    case "directory":
      return source.path || null
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** A homepage worth linking to: an https address, and nothing else. */
export function httpsHomepage(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:" ? parsed.href : null
  } catch {
    return null
  }
}

/** The labels of required settings that have no value from anywhere. */
export function missingSettings(plugin: PluginInfo): string[] {
  const { fields, values, secretsSet, environment } = plugin.config
  return fields
    .filter((field) => {
      if (!field.required) return false
      if (secretsSet.includes(field.key)) return false
      if (environment.includes(field.key)) return false
      const value = values[field.key]
      if (value !== null && value !== undefined && value !== "") return false
      return field.default === undefined || field.default === ""
    })
    .map((field) => field.label)
}

/** The labels of saved settings that this version no longer takes. */
export function invalidSettings(plugin: PluginInfo): string[] {
  const { fields, invalid } = plugin.config
  return fields
    .filter((field) => invalid.includes(field.key))
    .map((field) => field.label)
}

/** The package name of an npm spec, without its version or tag. */
export function npmPackage(spec: string): string {
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}

const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** "A, B, and C" in the interface's language. */
export function listOf(items: string[]): string {
  return lists().format(items)
}

const EVENT_NAMES = new Set<string>([
  "library.scanned",
  "title.added",
  "title.matched",
  "playback.started",
  "playback.stopped",
  "playback.watched",
  "user.created",
] satisfies PluginEventName[])

function isEventName(name: string): name is PluginEventName {
  return EVENT_NAMES.has(name)
}

/** An event's name in words; one this app doesn't know shows as sent. */
export function eventLabel(name: string): string {
  return isEventName(name) ? tr(`plugins.event.${name}`) : name
}

/** Text a plugin wrote, cut to a line, with the whole of it on hover. */
export function Clamped({
  text,
  lines = 1,
  className,
}: {
  text: string
  lines?: 1 | 2
  className?: string
}) {
  return (
    <span
      title={text}
      className={cn(
        "block min-w-0 wrap-anywhere",
        lines === 1 ? "truncate" : "line-clamp-2",
        className,
      )}
    >
      {text}
    </span>
  )
}

/** A fact with its glyph, for the line under a plugin's name. */
export function Fact({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title?: string
  children: ReactNode
}) {
  return (
    <span
      title={title}
      className="inline-flex max-w-full min-w-0 items-center gap-1.5 [&>svg]:size-3.5 [&>svg]:shrink-0"
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

/**
 * The reason under the state. The server's error can run to many lines,
 * so it starts at four with the rest a click away.
 */
export function Reason({
  text,
  serverText,
}: {
  text: string
  serverText: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const long = text.length > 280 || text.split("\n").length > 4
  if (!serverText) {
    return (
      <p className="text-muted-foreground text-[13px] leading-5 wrap-anywhere">
        {text}
      </p>
    )
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <div className="bg-surface-sunken w-full rounded-lg px-3 py-2">
        <p
          id={id}
          className={cn(
            "font-mono text-xs leading-5 wrap-anywhere whitespace-pre-wrap",
            long && !expanded && "line-clamp-4",
          )}
        >
          {text}
        </p>
      </div>
      {long && (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-[13px]"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? tr("plugins.reason.less") : tr("plugins.reason.more")}
        </Button>
      )}
    </div>
  )
}
