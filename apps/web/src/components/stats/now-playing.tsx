import {
  audioFormatName,
  channelLayoutName,
  type NowPlaying,
  videoCodecName,
} from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FilmIcon, PauseIcon, TvMinimalPlayIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { ItemLink, Picture, tone } from "@/components/media-item"
import { UserAvatar } from "@/components/user-avatar"
import { formatWatchTime, plural } from "@/lib/format"
import { art, itemLabel } from "@/lib/media"
import { errorMessage, liveQuery, orpc } from "@/lib/rpc"
import {
  audioEncoderName,
  dynamicRangeName,
  encoderDevice,
  encoderOutput,
  qualityName,
  resolutionOf,
  toneMapperName,
} from "@/lib/stats"

import { SectionHeading, StatsEmpty } from "./stat-blocks"

// Rows move on their own between updates, but no further than this past
// the player's last report, in case it stopped reporting. Players report
// every ten seconds, and at once on play, pause, and seek.
const MAX_ESTIMATE_S = 30

const rowsGrid = "grid gap-x-10 gap-y-4 md:grid-cols-2 2xl:grid-cols-3"

/** The current time, every second while `running`. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  return now
}

/**
 * Sessions playing now, as the server streams them. Between updates,
 * playing rows count on from the player's last report.
 */
export function WatchingNow() {
  const live = useQuery({
    ...orpc.stats.live.experimental_liveOptions(),
    ...liveQuery,
  })
  const data = live.data
  const count = data?.sessions.length ?? 0
  const now = useNow(data?.sessions.some((session) => !session.paused) ?? false)
  /** Where a session is now, from its report and the time since. */
  const estimate = (session: NowPlaying): number => {
    if (session.paused) return session.positionSeconds
    const since = session.reportAgeSeconds + (now - live.dataUpdatedAt) / 1000
    return (
      session.positionSeconds + Math.min(Math.max(0, since), MAX_ESTIMATE_S)
    )
  }
  return (
    <section aria-label="Watching now">
      <SectionHeading title="Watching now">
        {count > 0 && (
          <span className="text-muted-foreground text-sm tabular-nums">
            {plural(count, "stream")}
          </span>
        )}
      </SectionHeading>
      {!data ? (
        live.isError ? (
          <p className="text-muted-foreground text-sm">
            {errorMessage(live.error)}
          </p>
        ) : (
          <div className={rowsGrid}>
            <Skeleton className="h-[4.5rem] rounded-md" />
            <Skeleton className="h-[4.5rem] rounded-md max-md:hidden" />
          </div>
        )
      ) : count === 0 ? (
        <StatsEmpty
          compact
          icon={TvMinimalPlayIcon}
          title="Nobody's watching right now"
          description="Streams show up here while someone plays something."
        />
      ) : (
        <ul className={rowsGrid}>
          {data.sessions.map((session) => (
            <NowPlayingRow
              key={`${session.user.id}:${session.startedAt.getTime()}`}
              session={session}
              position={estimate(session)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** What the server does with one stream of the file. */
type Handling = "direct" | "copy" | "transcode"

const HANDLING = new Map<Handling, { label: string; className: string }>([
  ["direct", { label: "Direct", className: "text-emerald-400" }],
  ["copy", { label: "Copy", className: "text-sky-400" }],
  ["transcode", { label: "Transcode", className: "text-amber-400" }],
])

type StreamLine = {
  kind: "Video" | "Audio"
  handling: Handling
  /** The stream in the file, like `HEVC 4K HDR10`. */
  from: string
  /** What it becomes, when it's transcoded. */
  to?: string
  /** How, like `Quick Sync · tone mapped by OpenCL`. */
  how?: string
}

/** What happens to the video: `HEVC 4K HDR10 → H.264 720p 6 Mbps`. */
function videoLine(session: NowPlaying): StreamLine | null {
  const video = session.item?.probe?.video ?? null
  const codec = video?.codec ?? session.videoCodec
  if (!codec) return null
  const from = [
    videoCodecName(codec),
    video ? resolutionOf(video.width, video.height) : null,
    video?.hdr ? dynamicRangeName(video.hdr) : null,
  ]
    .filter(Boolean)
    .join(" ")
  if (session.method !== "transcode") {
    return {
      kind: "Video",
      handling: session.method === "direct" ? "direct" : "copy",
      from,
    }
  }
  const encoder = session.videoEncoder
  return {
    kind: "Video",
    handling: "transcode",
    from,
    to: [
      encoder ? encoderOutput(encoder) : null,
      session.quality ? qualityName(session.quality) : null,
    ]
      .filter(Boolean)
      .join(" "),
    how: [
      encoder ? encoderDevice(encoder) : null,
      session.toneMapper
        ? `tone mapped by ${toneMapperName(session.toneMapper)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · "),
  }
}

/** What happens to the audio: `TrueHD 7.1 → Opus stereo`. */
function audioLine(session: NowPlaying): StreamLine | null {
  const codec = session.audioCodec
  if (!codec) return null
  // The session keeps the codec, not the track; the file's first track in
  // that codec is the one nearly always.
  const tracks = session.item?.probe?.audio ?? []
  const track =
    tracks.find((entry) => entry.codec === codec && entry.default) ??
    tracks.find((entry) => entry.codec === codec)
  const layout = track
    ? channelLayoutName(track.channelLayout, track.channels)
    : null
  const from = [audioFormatName(codec, track?.profile ?? null), layout]
    .filter(Boolean)
    .join(" ")
  if (!session.audioConverted) {
    return {
      kind: "Audio",
      handling: session.method === "direct" ? "direct" : "copy",
      from,
    }
  }
  // Converted audio is stereo, or mono from mono.
  const channels = track?.channels === 1 ? "mono" : "stereo"
  return {
    kind: "Audio",
    handling: "transcode",
    from,
    to: session.audioEncoder
      ? `${audioEncoderName(session.audioEncoder)} ${channels}`
      : channels,
  }
}

function StreamRow({ line }: { line: StreamLine }) {
  const handling = HANDLING.get(line.handling)
  return (
    <p className="flex min-w-0 items-baseline gap-2 text-xs leading-5">
      <span className="text-muted-foreground w-9 shrink-0">{line.kind}</span>
      <span
        className={cn("w-[4.5rem] shrink-0 font-medium", handling?.className)}
      >
        {handling?.label}
      </span>
      <span
        className="min-w-0 truncate"
        title={[line.from, line.to, line.how].filter(Boolean).join(" ")}
      >
        <span className={line.to ? "text-muted-foreground" : undefined}>
          {line.from}
        </span>
        {line.to && (
          <>
            <span aria-label="to" className="text-muted-foreground">
              {" → "}
            </span>
            {line.to}
          </>
        )}
        {line.how && (
          <span className="text-muted-foreground">{` · ${line.how}`}</span>
        )}
      </span>
    </p>
  )
}

function NowPlayingRow({
  session,
  position: estimated,
}: {
  session: NowPlaying
  /** Seconds into the file, estimated for now. */
  position: number
}) {
  const { item, user } = session
  const label = item ? itemLabel(item) : null
  const poster = art(item?.title?.images.poster ?? null)
  const duration = item?.durationSeconds ?? item?.probe?.format.durationSeconds
  const position = duration ? Math.min(estimated, duration) : estimated
  const share = duration ? position / duration : 0
  const title = label ? (label.code ? label.title : label.show) : null
  const subtitle = label?.code ? `${label.showName} · ${label.code}` : null
  const lines = [videoLine(session), audioLine(session)].filter(
    (line) => line !== null,
  )

  return (
    <li className="flex min-w-0 gap-3">
      <span
        className={cn(
          "relative grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-md border",
          tone(item?.title?.id ?? user.id),
        )}
      >
        <FilmIcon aria-hidden className="text-muted-foreground/40 size-4" />
        {poster && <Picture sources={[poster]} />}
        {session.paused && (
          <span className="absolute inset-0 grid place-items-center bg-black/55">
            <PauseIcon aria-hidden className="size-5 fill-current text-white" />
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-baseline gap-3">
          <p className="min-w-0 flex-1 truncate text-sm leading-5 font-medium">
            {item && title ? (
              <ItemLink
                item={item}
                className="underline-offset-2 hover:underline"
              >
                {title}
              </ItemLink>
            ) : (
              "A file that's gone from the library"
            )}
          </p>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {session.paused ? (
              <span className="font-medium text-amber-400">Paused</span>
            ) : duration ? (
              `${formatWatchTime(Math.max(0, duration - position))} left`
            ) : (
              formatWatchTime(position)
            )}
          </span>
        </div>
        <p className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs leading-5">
          <UserAvatar user={user} className="size-4 shrink-0 text-[9px]" />
          <Link
            to="/profiles/$username"
            params={{ username: user.username }}
            className="shrink-0 underline-offset-2 hover:underline"
          >
            {user.displayName ?? user.username}
          </Link>
          {[subtitle, session.client].filter(Boolean).map((part) => (
            <span key={part} className="truncate">{`· ${part}`}</span>
          ))}
        </p>
        <span
          aria-hidden
          className="bg-foreground/15 my-1.5 block h-1 overflow-hidden rounded-full"
        >
          <span
            className="bg-primary block h-full rounded-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ width: `${share * 100}%` }}
          />
        </span>
        {lines.map((line) => (
          <StreamRow key={line.kind} line={line} />
        ))}
      </div>
    </li>
  )
}
