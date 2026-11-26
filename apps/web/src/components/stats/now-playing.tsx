import {
  audioFormatName,
  type NowPlaying,
  videoCodecName,
} from "@matinee/contracts"
import { Link } from "@tanstack/solid-router"
import { Film, Pause, TvMinimalPlay } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js"

import { ItemLink } from "@/components/media-item"
import { Picture, tone } from "@/components/picture"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { formatSpan, formatWatchTime } from "@/lib/format"
import { liveData, useLiveQuery } from "@/lib/live-query"
import { art, channelLayout, itemLabel, present } from "@/lib/media"
import { errorMessage, liveQuery, orpc } from "@/lib/rpc"
import {
  audioEncoderName,
  encoderDevice,
  encoderOutput,
  qualityName,
  toneMapperName,
} from "@/lib/stats"

import { SectionHeading, StatsEmpty } from "./stat-blocks"

// Rows move on their own between updates, but no further than this past
// the player's last report, in case it stopped reporting. Players report
// every ten seconds, and at once on play, pause, and seek.
const MAX_ESTIMATE_S = 30

const rowsGrid = "grid gap-x-10 gap-y-4 md:grid-cols-2 2xl:grid-cols-3"

/** The current time, every second while `running`. */
function useNow(running: () => boolean): () => number {
  const [now, setNow] = createSignal(Date.now())
  createEffect(running, (on) => {
    if (!on) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  })
  return now
}

/**
 * Sessions playing now, as the server streams them. Between updates,
 * playing rows count on from the player's last report.
 */
export function WatchingNow() {
  const live = useLiveQuery(() => ({
    ...orpc.stats.live.experimental_liveOptions(),
    ...liveQuery,
  }))
  const sessions = () => liveData(live())?.sessions
  const count = () => sessions()?.length ?? 0
  const running = createMemo(
    () => sessions()?.some((session) => !session.paused) ?? false,
  )
  const now = useNow(running)
  /** Where a session is now, from its report and the time since. */
  const estimate = (session: NowPlaying): number => {
    if (session.paused) return session.positionSeconds
    const since =
      session.reportAgeSeconds + (now() - (live()?.dataUpdatedAt ?? 0)) / 1000
    return (
      session.positionSeconds + Math.min(Math.max(0, since), MAX_ESTIMATE_S)
    )
  }
  return (
    <section aria-label={tr("stats.live.title")}>
      <SectionHeading title={tr("stats.live.title")}>
        <Show when={count() > 0}>
          <span class="text-muted-foreground text-sm tabular-nums">
            {tr("stats.live.streams", { count: count() })}
          </span>
        </Show>
      </SectionHeading>
      <Switch
        fallback={
          <div class={rowsGrid}>
            <Skeleton class="h-[4.5rem] rounded-md" />
            <Skeleton class="h-[4.5rem] rounded-md max-md:hidden" />
          </div>
        }
      >
        <Match when={sessions()}>
          {(list) => (
            <Show
              when={list().length > 0}
              fallback={
                <StatsEmpty
                  compact
                  icon={TvMinimalPlay}
                  title={tr("stats.live.empty")}
                  description={tr("stats.live.emptyHint")}
                />
              }
            >
              <ul class={rowsGrid}>
                <For
                  each={list()}
                  keyed={(session) =>
                    `${session.user.id}:${session.startedAt.getTime()}`
                  }
                >
                  {(session) => (
                    <NowPlayingRow
                      session={session()}
                      position={estimate(session())}
                    />
                  )}
                </For>
              </ul>
            </Show>
          )}
        </Match>
        <Match when={live()?.isError}>
          <p class="text-muted-foreground text-sm">
            {errorMessage(live()?.error)}
          </p>
        </Match>
      </Switch>
    </section>
  )
}

/** What the server does with one stream of the file. */
type Handling = "direct" | "copy" | "transcode"

/** Each handling's color in its row. */
const HANDLING_TONES = new Map<Handling, string>([
  ["direct", "text-emerald-400"],
  ["copy", "text-sky-400"],
  ["transcode", "text-amber-400"],
])

type StreamLine = {
  kind: "video" | "audio"
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
    video?.format ?? videoCodecName(codec),
    video?.resolution,
    video?.dynamicRange,
  ]
    .filter(Boolean)
    .join(" ")
  if (session.method !== "transcode") {
    return {
      kind: "video",
      handling: session.method === "direct" ? "direct" : "copy",
      from,
    }
  }
  const encoder = session.videoEncoder
  return {
    kind: "video",
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
        ? tr("stats.live.toneMapped", {
            mapper: toneMapperName(session.toneMapper),
          })
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
  const layout = track ? channelLayout(track.layout, track.channels) : null
  const from = [track?.format ?? audioFormatName(codec), layout]
    .filter(Boolean)
    .join(" ")
  if (!session.audioConverted) {
    return {
      kind: "audio",
      handling: session.method === "direct" ? "direct" : "copy",
      from,
    }
  }
  // Converted audio is stereo, or mono from mono.
  const channels =
    track?.channels === 1 ? tr("stats.live.mono") : tr("stats.live.stereo")
  return {
    kind: "audio",
    handling: "transcode",
    from,
    to: session.audioEncoder
      ? `${audioEncoderName(session.audioEncoder)} ${channels}`
      : channels,
  }
}

function StreamRow(props: { line: StreamLine }) {
  return (
    <p class="flex min-w-0 items-baseline gap-2 text-xs leading-5">
      <span class="text-muted-foreground w-9 shrink-0">
        {tr(`stats.live.stream.${props.line.kind}`)}
      </span>
      <span
        class={[
          "w-[4.5rem] shrink-0 font-medium",
          HANDLING_TONES.get(props.line.handling),
        ]}
      >
        {tr(`stats.live.handling.${props.line.handling}`)}
      </span>
      <span
        class="min-w-0 truncate"
        title={[props.line.from, props.line.to, props.line.how]
          .filter(Boolean)
          .join(" ")}
      >
        <span class={props.line.to ? "text-muted-foreground" : undefined}>
          {props.line.from}
        </span>
        <Show when={props.line.to}>
          {(to) => (
            <>
              <span aria-hidden="true" class="text-muted-foreground">
                {" → "}
              </span>
              <span class="sr-only">{` ${tr("stats.live.to")} `}</span>
              {to()}
            </>
          )}
        </Show>
        <Show when={props.line.how}>
          {(how) => <span class="text-muted-foreground">{` · ${how()}`}</span>}
        </Show>
      </span>
    </p>
  )
}

/**
 * A time for the live list. formatWatchTime rounds to whole minutes, which
 * reads "0m" under a minute, so those show seconds.
 */
function liveTime(seconds: number): string {
  return seconds < 60
    ? formatSpan(Math.floor(seconds))
    : formatWatchTime(seconds)
}

/*
 * The clock ticks each second, which moves only the time left and the
 * bar. What the row says about the file follows the session, which
 * changes only with the server's updates.
 */
function NowPlayingRow(props: {
  session: NowPlaying
  /** Seconds into the file, estimated for now. */
  position: number
}) {
  const item = () => props.session.item
  const user = () => props.session.user
  const facts = createMemo(() => {
    const session = props.session
    const label = session.item ? itemLabel(session.item) : null
    return {
      poster: art(session.item?.title?.images.poster ?? null),
      duration:
        session.item?.durationSeconds ??
        session.item?.probe?.format.durationSeconds,
      title: label ? (label.code ? label.title : label.show) : null,
      subtitle: label?.code ? `${label.showName} · ${label.code}` : null,
      lines: [videoLine(session), audioLine(session)].filter(
        (line) => line !== null,
      ),
    }
  })
  const position = () => {
    const duration = facts().duration
    return duration ? Math.min(props.position, duration) : props.position
  }
  const timeLeft = () => {
    const duration = facts().duration
    return duration
      ? tr("stats.live.left", {
          time: liveTime(Math.max(0, duration - position())),
        })
      : liveTime(position())
  }
  const share = () => {
    const duration = facts().duration
    return duration ? position() / duration : 0
  }

  return (
    <li class="flex min-w-0 gap-3">
      <span
        class={[
          "relative grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-md border",
          tone(item()?.title?.id ?? user().id),
        ]}
      >
        <Picture
          sources={present(facts().poster)}
          fallback={
            <Icon icon={Film} class="text-muted-foreground/40 size-4" />
          }
        />
        <Show when={props.session.paused}>
          <span class="absolute inset-0 grid place-items-center bg-black/55">
            <Icon icon={Pause} fill="currentColor" class="size-5 text-white" />
          </span>
        </Show>
      </span>
      <div class="flex min-w-0 flex-1 flex-col">
        <div class="flex min-w-0 items-baseline gap-3">
          <p class="min-w-0 flex-1 truncate text-sm leading-5 font-medium">
            <Show
              when={item() && facts().title ? item() : undefined}
              fallback={tr("stats.live.gone")}
            >
              {(current) => (
                <ItemLink
                  item={current()}
                  class="underline-offset-2 hover:underline"
                >
                  {facts().title}
                </ItemLink>
              )}
            </Show>
          </p>
          <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
            <Show
              when={!props.session.paused}
              fallback={
                <span class="font-medium text-amber-400">
                  {tr("stats.live.paused")}
                </span>
              }
            >
              {timeLeft()}
            </Show>
          </span>
        </div>
        <p class="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs leading-5">
          <UserAvatar user={user()} class="text-9px size-4 shrink-0" />
          <Link
            to="/profiles/$username"
            params={{ username: user().username }}
            class="shrink-0 underline-offset-2 hover:underline"
          >
            {user().displayName ?? user().username}
          </Link>
          <For each={[facts().subtitle, props.session.client].filter(Boolean)}>
            {(part) => <span class="truncate">{`· ${part}`}</span>}
          </For>
        </p>
        <span
          aria-hidden="true"
          class="bg-foreground/15 my-1.5 block h-1 overflow-hidden rounded-full"
        >
          {/* Slid in from the left rather than widened, so a tick moves
              the bar without laying the row out again. */}
          <span
            class="bg-primary block h-full rounded-full transition-[translate] duration-1000 ease-linear motion-reduce:transition-none"
            style={{ translate: `${(share() - 1) * 100}% 0` }}
          />
        </span>
        <For each={facts().lines} keyed={(line) => line.kind}>
          {(line) => <StreamRow line={line()} />}
        </For>
      </div>
    </li>
  )
}
