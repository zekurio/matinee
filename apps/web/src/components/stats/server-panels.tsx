import {
  audioFormatName,
  type MethodStat,
  type NamedCount,
  type PlaybackMethod,
  type ServerStats,
  videoCodecName,
} from "@matinee/contracts"
import { Link } from "@tanstack/solid-router"
import { createMemo, For, Show } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { formatWatchTime } from "@/lib/format"
import { encoderName, methodName } from "@/lib/stats"

import { percent, RankedBars, StatsSection } from "./stat-blocks"

const METHOD_TONES = new Map<PlaybackMethod, string>([
  ["direct", "bg-primary"],
  ["remux", "bg-primary/55"],
  ["transcode", "bg-primary/25"],
])

/** Each method's share of the watch time, as one bar and a legend. */
export function Methods(props: { methods: MethodStat[] }) {
  const total = createMemo(() =>
    props.methods.reduce((sum, entry) => sum + entry.watchSeconds, 0),
  )
  return (
    <StatsSection title={tr("stats.server.methods")}>
      <div
        aria-hidden="true"
        class="bg-foreground/[0.07] flex h-1.5 gap-0.5 overflow-hidden rounded-full"
      >
        <For
          each={props.methods.filter((entry) => entry.watchSeconds > 0)}
          keyed={(entry) => entry.method}
        >
          {(entry) => (
            <span
              style={{ width: `${(entry().watchSeconds / total()) * 100}%` }}
              class={METHOD_TONES.get(entry().method)}
            />
          )}
        </For>
      </div>
      <ul class="flex flex-col gap-2">
        <For each={props.methods} keyed={(entry) => entry.method}>
          {(entry) => (
            <li class="text-13px flex items-center gap-2.5 leading-5">
              <span
                aria-hidden="true"
                class={[
                  "size-2 shrink-0 rounded-[2px]",
                  METHOD_TONES.get(entry().method),
                ]}
              />
              <span class="min-w-0 flex-1 truncate">
                {methodName(entry().method)}
              </span>
              <span class="text-muted-foreground shrink-0 tabular-nums">
                {`${formatWatchTime(entry().watchSeconds)} · `}
                <span class="text-foreground font-medium">
                  {percent(entry().watchSeconds, total())}
                </span>
              </span>
            </li>
          )}
        </For>
      </ul>
    </StatsSection>
  )
}

/** Transcoded plays per name. */
function CodecSection(props: {
  title: string
  rows: NamedCount[]
  name: (value: string) => string
}) {
  return (
    <Show when={props.rows.length > 0}>
      <StatsSection title={props.title}>
        <RankedBars
          rows={props.rows.map((row) => ({
            key: row.name,
            label: props.name(row.name),
            value: row.plays,
            detail: tr("stats.plays", { count: row.plays }),
          }))}
        />
      </StatsSection>
    </Show>
  )
}

/** What transcoding needed: its encoders, and the codecs it converted. */
export function TranscodingSections(props: { stats: ServerStats }) {
  return (
    <>
      <CodecSection
        title={tr("stats.server.encoders")}
        rows={props.stats.transcoding.encoders}
        name={encoderName}
      />
      <CodecSection
        title={tr("stats.server.videoFrom")}
        rows={props.stats.transcoding.videoCodecs}
        name={videoCodecName}
      />
      <CodecSection
        title={tr("stats.server.audioFrom")}
        rows={props.stats.transcoding.audioCodecs}
        name={(codec) => audioFormatName(codec)}
      />
    </>
  )
}

export function Viewers(props: { stats: ServerStats }) {
  return (
    <Show when={props.stats.users.length > 0}>
      <StatsSection title={tr("stats.server.viewers")}>
        <RankedBars
          rows={props.stats.users.map((entry) => ({
            key: entry.user.id,
            label: (
              <Link
                to="/profiles/$username"
                params={{ username: entry.user.username }}
                class="inline-flex max-w-full items-center gap-2 underline-offset-2 hover:underline"
              >
                <UserAvatar
                  user={entry.user}
                  class="text-10px size-5 shrink-0"
                />
                <span class="truncate">
                  {entry.user.displayName ?? entry.user.username}
                </span>
              </Link>
            ),
            value: entry.watchSeconds,
            detail: formatWatchTime(entry.watchSeconds),
          }))}
        />
      </StatsSection>
    </Show>
  )
}

export function Clients(props: { stats: ServerStats }) {
  return (
    <Show when={props.stats.clients.length > 0}>
      <StatsSection title={tr("stats.server.clients")}>
        <RankedBars
          rows={props.stats.clients.map((client) => ({
            key: client.name,
            label: client.name,
            value: client.plays,
            detail: tr("stats.plays", { count: client.plays }),
          }))}
        />
      </StatsSection>
    </Show>
  )
}
