import {
  audioFormatName,
  type MethodStat,
  type NamedCount,
  type PlaybackMethod,
  type ServerStats,
  videoCodecName,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"

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
export function Methods({ methods }: { methods: MethodStat[] }) {
  const total = methods.reduce((sum, entry) => sum + entry.watchSeconds, 0)
  return (
    <StatsSection title={tr("stats.server.methods")}>
      <div
        aria-hidden
        className="bg-foreground/[0.07] flex h-1.5 gap-0.5 overflow-hidden rounded-full"
      >
        {methods
          .filter((entry) => entry.watchSeconds > 0)
          .map((entry) => (
            <span
              key={entry.method}
              style={{ width: `${(entry.watchSeconds / total) * 100}%` }}
              className={METHOD_TONES.get(entry.method)}
            />
          ))}
      </div>
      <ul className="flex flex-col gap-2">
        {methods.map((entry) => {
          return (
            <li
              key={entry.method}
              className="flex items-center gap-2.5 text-[13px] leading-5"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-[2px]",
                  METHOD_TONES.get(entry.method),
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {methodName(entry.method)}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {`${formatWatchTime(entry.watchSeconds)} · `}
                <span className="text-foreground font-medium">
                  {percent(entry.watchSeconds, total)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </StatsSection>
  )
}

/** Transcoded plays per name, each a part of `total`. */
function CodecSection({
  title,
  rows,
  total,
  name,
}: {
  title: string
  rows: NamedCount[]
  total: number
  name: (value: string) => string
}) {
  if (rows.length === 0) return null
  return (
    <StatsSection title={title}>
      <RankedBars
        total={total}
        rows={rows.map((row) => ({
          key: row.name,
          label: name(row.name),
          value: row.plays,
          detail: tr("stats.plays", { count: row.plays }),
        }))}
      />
    </StatsSection>
  )
}

/** What transcoding needed: its encoders, and the codecs it converted. */
export function TranscodingSections({ stats }: { stats: ServerStats }) {
  const { transcoding } = stats
  return (
    <>
      <CodecSection
        title={tr("stats.server.encoders")}
        rows={transcoding.encoders}
        total={transcoding.videoTranscodes}
        name={encoderName}
      />
      <CodecSection
        title={tr("stats.server.videoFrom")}
        rows={transcoding.videoCodecs}
        total={transcoding.videoTranscodes}
        name={videoCodecName}
      />
      <CodecSection
        title={tr("stats.server.audioFrom")}
        rows={transcoding.audioCodecs}
        total={transcoding.audioConversions}
        name={(codec) => audioFormatName(codec)}
      />
    </>
  )
}

export function Viewers({ stats }: { stats: ServerStats }) {
  if (stats.users.length === 0) return null
  return (
    <StatsSection title={tr("stats.server.viewers")}>
      <RankedBars
        total={stats.totals.watchSeconds}
        rows={stats.users.map((entry) => ({
          key: entry.user.id,
          label: (
            <Link
              to="/profiles/$username"
              params={{ username: entry.user.username }}
              className="inline-flex max-w-full items-center gap-2 underline-offset-2 hover:underline"
            >
              <UserAvatar
                user={entry.user}
                className="size-5 shrink-0 text-[10px]"
              />
              <span className="truncate">
                {entry.user.displayName ?? entry.user.username}
              </span>
            </Link>
          ),
          value: entry.watchSeconds,
          detail: formatWatchTime(entry.watchSeconds),
        }))}
      />
    </StatsSection>
  )
}

export function Clients({ stats }: { stats: ServerStats }) {
  if (stats.clients.length === 0) return null
  return (
    <StatsSection title={tr("stats.server.clients")}>
      <RankedBars
        total={stats.totals.plays}
        rows={stats.clients.map((client) => ({
          key: client.name,
          label: client.name,
          value: client.plays,
          detail: tr("stats.plays", { count: client.plays }),
        }))}
      />
    </StatsSection>
  )
}
