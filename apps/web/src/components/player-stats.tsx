import {
  type AudioTrack,
  audioFormatName,
  type DisplayMediaProbe,
  PLAYBACK_QUALITIES,
  type PlaybackMethod,
  type PlaybackStart,
  type SessionStream,
  type DisplayVideoStream,
} from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"
import { XIcon } from "lucide-react"
import { type RefObject, useEffect, useState } from "react"

import { perLocale, tr } from "@/i18n"
import { formatBytes } from "@/lib/format"
import { trackLabel } from "@/lib/languages"
import { liveQuery, orpc } from "@/lib/rpc"
import {
  audioEncoderName,
  encoderDevice,
  encoderName,
  encoderOutput,
  toneMapperName,
} from "@/lib/stats"
import { usePlayerStore } from "@/stores/player"

import type { PlaybackSource } from "./playback-source"
import { formatBitrate } from "./player-format"

/** The file as the server knows it, for the stats. */
export type FileInfo = {
  /** Such as `mkv`. */
  container: string
  sizeBytes: number
  probe: DisplayMediaProbe | null
}

/** What the browser says about the picture, read once a second. */
type Sample = {
  /** The decoded picture. 0 before it loads. */
  width: number
  height: number
  /** The picture on screen, in device pixels. */
  shownWidth: number
  shownHeight: number
  dropped: number
  total: number
  /** Frames the browser showed over the last second. Null while paused. */
  fps: number | null
  /** Seconds loaded ahead of the playhead. */
  ahead: number
}

const SAMPLE_MS = 1000

/** Reads the video's size, frames, and buffer once a second. */
function useSample(video: RefObject<HTMLVideoElement | null>): Sample | null {
  const [sample, setSample] = useState<Sample | null>(null)
  useEffect(() => {
    let last: { shown: number; at: number } | null = null
    const read = () => {
      const el = video.current
      if (!el) return
      const quality = el.getVideoPlaybackQuality()
      const at = performance.now()
      const total = quality.totalVideoFrames
      // The total counts dropped frames too, which never showed.
      const shown = total - quality.droppedVideoFrames
      // A new source starts counting again.
      const fps =
        last && shown >= last.shown && !el.paused
          ? ((shown - last.shown) * 1000) / (at - last.at)
          : null
      last = { shown, at }
      let ahead = 0
      for (let i = 0; i < el.buffered.length; i++) {
        if (
          el.buffered.start(i) <= el.currentTime + 0.5 &&
          el.buffered.end(i) >= el.currentTime
        ) {
          ahead = el.buffered.end(i) - el.currentTime
        }
      }
      // The picture fits the element, keeping its shape.
      const fit =
        el.videoWidth > 0 && el.videoHeight > 0
          ? Math.min(
              el.clientWidth / el.videoWidth,
              el.clientHeight / el.videoHeight,
            )
          : 0
      const scale = fit * window.devicePixelRatio
      setSample({
        width: el.videoWidth,
        height: el.videoHeight,
        shownWidth: Math.round(el.videoWidth * scale),
        shownHeight: Math.round(el.videoHeight * scale),
        dropped: quality.droppedVideoFrames,
        total,
        fps,
        ahead,
      })
    }
    read()
    const timer = window.setInterval(read, SAMPLE_MS)
    return () => window.clearInterval(timer)
  }, [video])
  return sample
}

const decimals = perLocale(
  (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
)
const tenths = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
)
const counts = perLocale((locale) => new Intl.NumberFormat(locale))
const shares = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      style: "percent",
      maximumFractionDigits: 2,
    }),
)

function size(width: number, height: number): string {
  return `${width}×${height}`
}

// How players name ffmpeg's color primaries and transfers.
const COLOR_NAMES = new Map([
  ["bt709", "BT.709"],
  ["bt2020", "BT.2020"],
  ["bt470bg", "BT.601"],
  ["smpte170m", "BT.601"],
  ["smpte2084", "PQ"],
  ["arib-std-b67", "HLG"],
])

function colorName(name: string): string {
  return COLOR_NAMES.get(name) ?? name.toUpperCase()
}

/** `Dolby Vision profile 8.1`, `HDR10+`, or `SDR`. */
function dynamicRange(video: DisplayVideoStream): string {
  if (video.hdr === "dolby-vision") {
    const record = video.dolbyVision
    const compatible = record?.blCompatibilityId
    const profile = record
      ? compatible
        ? `${record.profile}.${compatible}`
        : String(record.profile)
      : video.dolbyVisionProfile
    return profile === null
      ? "Dolby Vision"
      : tr("player.stats.dolbyVision", { profile: String(profile) })
  }
  return video.dynamicRange ?? "SDR"
}

/** Why the file doesn't play as it is, as the server says. */
function reasons(
  plan: PlaybackStart,
  file: FileInfo,
  failed: readonly PlaybackMethod[],
): string[] {
  const video = file.probe?.video
  const quality = PLAYBACK_QUALITIES.find((entry) => entry.id === plan.quality)
  return plan.reasons.flatMap((reason) => {
    switch (reason) {
      case "container":
        return tr("player.stats.reason.container", {
          container: file.container.toUpperCase(),
        })
      case "video":
        return video
          ? tr("player.stats.reason.video", { codec: video.format })
          : []
      case "audio":
        return plan.audio
          ? tr("player.stats.reason.audioCodec", { format: plan.audio.format })
          : []
      case "audio-selection":
        return tr("player.stats.reason.audioTrack")
      case "subtitle":
        return tr("player.stats.reason.burnIn")
      case "quality":
        return quality
          ? tr("player.stats.reason.quality", { quality: `${quality.height}p` })
          : []
      case "failed":
        return failed.flatMap((method) =>
          method === "transcode"
            ? []
            : tr(`player.stats.reason.${method}Failed`),
        )
      case "limit":
        return tr("player.stats.reason.limit")
    }
  })
}

/** What a method asks of the browser, as the stats name it. */
const KINDS = {
  direct: "direct",
  remux: "remux",
  transcode: "encode",
} as const

type Row = { label: string; value: string }

function playbackRows(
  plan: PlaybackStart,
  source: PlaybackSource,
  failed: readonly PlaybackMethod[],
  file: FileInfo,
  sample: Sample | null,
): Row[] {
  const preset = PLAYBACK_QUALITIES.find((entry) => entry.id === plan.quality)
  const why = source.method === "direct" ? [] : reasons(plan, file, failed)
  const bitrate = preset?.bitrate ?? file.probe?.format.bitRate ?? null
  const delivery =
    source.method === "direct" ? "direct" : source.hls ? "hls" : "stream"
  return [
    {
      label: tr("player.stats.method"),
      value: tr(`player.stats.method.${KINDS[source.method]}`),
    },
    ...(why.length > 0
      ? [{ label: tr("player.stats.reason"), value: why.join(" · ") }]
      : []),
    {
      label: tr("player.stats.delivery"),
      value: tr(`player.stats.delivery.${delivery}`),
    },
    ...(bitrate
      ? [{ label: tr("player.stats.bitrate"), value: formatBitrate(bitrate) }]
      : []),
    ...(sample
      ? [
          {
            label: tr("player.stats.buffer"),
            value: tr("player.stats.seconds", {
              seconds: tenths().format(sample.ahead),
            }),
          },
        ]
      : []),
  ]
}

function videoRows(
  plan: PlaybackStart,
  video: DisplayVideoStream | null,
  server: SessionStream | null,
  sample: Sample | null,
): Row[] {
  const rows: Row[] = []
  const encode = plan.method === "transcode"
  if (video) {
    rows.push({
      label: tr("player.stats.video"),
      value: [
        [video.format, video.profile].filter(Boolean).join(" "),
        size(video.width, video.height),
        video.frameRate &&
          tr("player.stats.fps", { fps: decimals().format(video.frameRate) }),
      ]
        .filter(Boolean)
        .join(" · "),
    })
    if (video.bitRate) {
      rows.push({
        label: tr("player.stats.videoBitrate"),
        value: formatBitrate(video.bitRate),
      })
    }
    // Encodes are SDR, so HDR gets tone mapped on the way.
    const range = dynamicRange(video)
    const mapper = server?.toneMapper
    rows.push({
      label: tr("player.stats.range"),
      value:
        encode && video.hdr
          ? mapper
            ? tr("player.stats.toneMappedBy", {
                from: range,
                mapper: toneMapperName(mapper),
              })
            : tr("player.stats.toneMapped", { from: range })
          : range,
    })
    // BT.709 once when the primaries and the transfer agree.
    const primaries = video.colorPrimaries && colorName(video.colorPrimaries)
    const transfer = video.colorTransfer && colorName(video.colorTransfer)
    const color = [
      video.bitDepth && tr("player.stats.bitDepth", { depth: video.bitDepth }),
      primaries,
      transfer !== primaries && transfer,
    ].filter(Boolean)
    if (color.length > 0) {
      rows.push({ label: tr("player.stats.color"), value: color.join(" · ") })
    }
  }
  if (encode) {
    const preset = PLAYBACK_QUALITIES.find((entry) => entry.id === plan.quality)
    // The codec shows once the server says what it encodes with.
    const encoder = server?.videoEncoder ?? null
    rows.push({
      label: tr("player.stats.output"),
      value: [
        encoder && encoderOutput(encoder),
        preset && `${preset.height}p`,
        preset && formatBitrate(preset.bitrate),
      ]
        .filter(Boolean)
        .join(" · "),
    })
    if (encoder && server) {
      // The server only says whether a GPU decodes; the encoder's tells
      // which one.
      const device = encoderDevice(encoder)
      rows.push(
        {
          label: tr("player.stats.decoder"),
          value: !server.hardwareDecoding
            ? tr("player.stats.decoder.software")
            : device === "CPU"
              ? tr("player.stats.decoder.hardware")
              : tr("player.stats.decoder.hardwareOn", { device }),
        },
        { label: tr("player.stats.encoder"), value: encoderName(encoder) },
      )
    }
  }
  if (sample && sample.width > 0) {
    rows.push(
      {
        label: tr("player.stats.decoded"),
        value: size(sample.width, sample.height),
      },
      {
        label: tr("player.stats.display"),
        value: size(sample.shownWidth, sample.shownHeight),
      },
      {
        label: tr("player.stats.frameRate"),
        value:
          sample.fps === null
            ? "–"
            : tr("player.stats.fps", { fps: tenths().format(sample.fps) }),
      },
      {
        label: tr("player.stats.dropped"),
        value: tr("player.stats.droppedValue", {
          dropped: counts().format(sample.dropped),
          total: counts().format(sample.total),
          share: shares().format(
            sample.total > 0 ? sample.dropped / sample.total : 0,
          ),
        }),
      },
    )
  }
  return rows
}

function audioRows(plan: PlaybackStart, server: SessionStream | null): Row[] {
  const tracks = plan.audioTracks
  const track: AudioTrack | null = plan.audio
  if (!track) return []
  // As the audio menu names it.
  const position = tracks.findIndex((entry) => entry.index === track.index)
  const name = trackLabel(
    track.language,
    track.title,
    tr("player.track.unnamed", { number: position + 1 }),
  )
  const converted = plan.convertedAudio
  const codec = server?.audioEncoder
    ? audioEncoderName(server.audioEncoder)
    : audioFormatName(converted ?? track.codec)
  return [
    {
      label: tr("player.stats.audio"),
      value: [name, [track.format, track.layout].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" · "),
    },
    {
      label: tr("player.stats.audioOutput"),
      value: converted
        ? track.channels === 1
          ? codec
          : tr("player.notice.stereo", { codec })
        : tr("player.stats.unchanged"),
    },
  ]
}

function fileRows(file: FileInfo): Row[] {
  const bitrate = file.probe?.format.bitRate
  return [
    {
      label: tr("player.stats.container"),
      value: file.container.toUpperCase(),
    },
    { label: tr("player.stats.size"), value: formatBytes(file.sizeBytes) },
    ...(bitrate
      ? [
          {
            label: tr("player.stats.overallBitrate"),
            value: formatBitrate(bitrate),
          },
        ]
      : []),
  ]
}

function Rows({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null
  return (
    // On the panel's grid, so every group's labels line up.
    <dl className="col-span-2 grid grid-cols-subgrid gap-y-1 py-2 first:pt-0 last:pb-0">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-foreground/65 whitespace-nowrap">{row.label}</dt>
          <dd className="min-w-0 font-medium break-words tabular-nums">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * What plays and how, over the picture, like Jellyfin's playback info: the
 * method and why, bitrates, dynamic range, and the browser's frame counts.
 * A transcode adds what the server encodes with, for `sessionId`.
 */
export function PlayerStats({
  video,
  sessionId,
}: {
  video: RefObject<HTMLVideoElement | null>
  sessionId: string
}) {
  const plan = usePlayerStore((state) => state.plan)
  const source = usePlayerStore((state) => state.source)
  const failed = usePlayerStore((state) => state.failed)
  const file: FileInfo = plan.item
  const setStatsOpen = usePlayerStore((state) => state.setStatsOpen)
  const sample = useSample(video)
  const server = useQuery({
    ...orpc.playback.stream.experimental_liveOptions({ input: { sessionId } }),
    ...liveQuery,
  }).data
  const groups = [
    playbackRows(plan, source, failed, file, sample),
    videoRows(plan, file.probe?.video ?? null, server ?? null, sample),
    audioRows(plan, server ?? null),
    fileRows(file),
  ]

  return (
    <section
      aria-label={tr("player.stats.toggle")}
      className="glass text-popover-foreground ring-foreground/10 absolute top-3 right-3 z-10 max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl p-3 pr-9 text-xs shadow-xl ring-1 shadow-black/40 sm:top-4 sm:right-5"
    >
      <button
        type="button"
        aria-label={tr("player.stats.close")}
        title={tr("player.stats.close")}
        className="text-foreground/65 hover:text-foreground hover:bg-foreground/10 focus-visible:ring-ring absolute top-2 right-2 grid size-6 place-items-center rounded-full outline-none focus-visible:ring-2"
        onClick={() => setStatsOpen(false)}
      >
        <XIcon className="size-4" />
      </button>
      {/* A rule between the groups in place of headings. */}
      <div className="divide-foreground/10 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 divide-y">
        {groups.map((rows, at) => (
          <Rows key={at} rows={rows} />
        ))}
      </div>
    </section>
  )
}
