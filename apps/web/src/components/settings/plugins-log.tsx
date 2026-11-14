import type { PluginLogLine } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useLayoutEffect, useRef } from "react"

import { perLocale, tr } from "@/i18n"
import { formatDateTime } from "@/lib/format"
import { liveQuery, orpc } from "@/lib/rpc"

import { pluginErrorMessage, pluginsUnavailable } from "./plugins-common"

/** The most lines the panel draws; the server keeps 500. */
const SHOWN_LINES = 200

const times = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
)

const levelClassName = {
  debug: "text-foreground-faint",
  info: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
} satisfies Record<PluginLogLine["level"], string>

/**
 * The plugin's recent log, live, newest at the bottom. It follows new
 * lines while it's scrolled to the end, and stays put while someone reads
 * further up.
 */
export function PluginLog({ id }: { id: string }) {
  const logs = useQuery({
    ...orpc.admin.plugins.logs.experimental_liveOptions({ input: { id } }),
    ...liveQuery,
    retry: (failures, error) =>
      !pluginsUnavailable(error) && liveQuery.retry(failures, error),
    refetchInterval: (query) =>
      pluginsUnavailable(query.state.error)
        ? false
        : liveQuery.refetchInterval(query),
  })
  const lines = logs.data?.slice(-SHOWN_LINES) ?? []
  const box = useRef<HTMLDivElement>(null)
  // Whether the reader was at the end before this render's lines came in.
  const atEnd = useRef(true)
  const last = lines.at(-1)

  // Keeps the newest line in view as lines arrive, unless the reader has
  // scrolled up to read.
  useLayoutEffect(() => {
    const element = box.current
    if (element && atEnd.current) element.scrollTop = element.scrollHeight
  }, [lines.length, last])

  if (logs.isPending && !logs.isError) {
    return <Skeleton className="h-40 rounded-xl" />
  }
  if (logs.isError && !logs.data) {
    return (
      <p className="text-muted-foreground rounded-xl border px-4 py-3 text-[13px] leading-5">
        {tr("plugins.log.loadFailed", {
          error: pluginErrorMessage(logs.error),
        })}
      </p>
    )
  }
  if (lines.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-[13px] leading-5">
        {tr("plugins.log.empty")}
      </p>
    )
  }
  return (
    <div
      ref={box}
      role="log"
      aria-label={tr("plugins.log.label")}
      tabIndex={0}
      onScroll={(event) => {
        const element = event.currentTarget
        atEnd.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 8
      }}
      className="bg-surface-sunken focus-visible:ring-ring max-h-80 overflow-y-auto rounded-xl border py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2"
    >
      <ol>
        {lines.map((line, index) => (
          <li
            key={`${line.at.getTime()}:${index}`}
            className="hover:bg-foreground/[0.03] grid grid-cols-[auto_3.25rem_minmax(0,1fr)] gap-x-3 px-3"
          >
            <time
              dateTime={line.at.toISOString()}
              title={formatDateTime(line.at)}
              className="text-foreground-faint tabular-nums"
            >
              {times().format(line.at)}
            </time>
            <span className={cn(levelClassName[line.level])}>
              {tr(`plugins.log.level.${line.level}`)}
            </span>
            <span
              className={cn(
                "wrap-anywhere whitespace-pre-wrap",
                line.level === "error" ? "text-destructive" : "text-foreground",
                line.level === "debug" && "text-muted-foreground",
              )}
            >
              {line.message}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
