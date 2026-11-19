import type { DesktopBridge, PlayerStats } from "@matinee/desktop-bridge"
import { useEffect, useState } from "react"

import { tr } from "@/i18n"
import { formatBytes } from "@/lib/format"

import { formatBitrate } from "./player-format"
import {
  counts,
  decimals,
  type LiveStats,
  size,
  type StatsRow,
  tenths,
} from "./player-stats"

const POLL_MS = 1000

/** mpv's names for colors, like `bt.2020` and `pq`, as players write them. */
function mpvColor(name: string): string {
  return name.toUpperCase()
}

function videoRows(stats: PlayerStats): StatsRow[] {
  const rows: StatsRow[] = []
  if (stats.videoCodec !== null) {
    rows.push({
      label: tr("player.stats.mpv.decoder"),
      value: [
        stats.videoCodec,
        stats.hardwareDecoder === null
          ? tr("player.stats.decoder.software")
          : tr("player.stats.decoder.hardwareOn", {
              device: stats.hardwareDecoder,
            }),
      ].join(" · "),
    })
  }
  if (stats.width !== null && stats.height !== null) {
    rows.push({
      label: tr("player.stats.decoded"),
      value: [size(stats.width, stats.height), stats.pixelFormat]
        .filter(Boolean)
        .join(" · "),
    })
  }
  if (stats.shownWidth !== null && stats.shownHeight !== null) {
    rows.push({
      label: tr("player.stats.display"),
      value: size(stats.shownWidth, stats.shownHeight),
    })
  }
  if (stats.frameRate !== null) {
    const fps = decimals().format(stats.frameRate)
    rows.push({
      label: tr("player.stats.mpv.frameRate"),
      value:
        stats.displayFrameRate === null
          ? tr("player.stats.fps", { fps })
          : tr("player.stats.mpv.frameRateValue", {
              fps,
              hz: tenths().format(stats.displayFrameRate),
            }),
    })
  }
  const color = [stats.colorPrimaries, stats.colorTransfer].flatMap((name) =>
    name === null ? [] : mpvColor(name),
  )
  if (color.length > 0) {
    rows.push({ label: tr("player.stats.mpv.color"), value: color.join(" · ") })
  }
  if (stats.videoBitRate !== null) {
    rows.push({
      label: tr("player.stats.mpv.videoBitrate"),
      value: formatBitrate(stats.videoBitRate),
    })
  }
  if (stats.videoCodec !== null) {
    rows.push(
      {
        label: tr("player.stats.dropped"),
        value: counts().format(stats.droppedFrames),
      },
      {
        label: tr("player.stats.mpv.decoderDropped"),
        value: counts().format(stats.decoderDroppedFrames),
      },
      {
        label: tr("player.stats.mpv.delayed"),
        value: counts().format(stats.delayedFrames),
      },
    )
  }
  if (stats.avSync !== null) {
    rows.push({
      label: tr("player.stats.mpv.avSync"),
      value: tr("player.stats.mpv.milliseconds", {
        ms: Math.round(stats.avSync * 1000),
      }),
    })
  }
  return rows
}

function audioRows(stats: PlayerStats): StatsRow[] {
  const rows: StatsRow[] = []
  const codec = stats.audioCodec
  if (codec !== null) {
    const channels = stats.audioOutputChannels ?? stats.audioChannels
    rows.push({
      label: tr("player.stats.mpv.audioOut"),
      value: stats.audioPassthrough
        ? tr("player.stats.mpv.passthrough", { codec })
        : [
            channels !== null &&
              tr("player.stats.mpv.channels", { count: channels }),
            stats.audioSampleRate !== null &&
              tr("player.stats.mpv.sampleRate", {
                rate: tenths().format(stats.audioSampleRate / 1000),
              }),
          ]
            .filter(Boolean)
            .join(" · ") || codec,
    })
  }
  if (stats.audioBitRate !== null) {
    rows.push({
      label: tr("player.stats.mpv.audioBitrate"),
      value: formatBitrate(stats.audioBitRate),
    })
  }
  return rows
}

function playbackRows(stats: PlayerStats): StatsRow[] {
  const rows: StatsRow[] = []
  if (stats.cacheBytes !== null) {
    rows.push({
      label: tr("player.stats.mpv.cache"),
      value: formatBytes(stats.cacheBytes),
    })
  }
  if (stats.downloadSpeed !== null) {
    rows.push({
      label: tr("player.stats.mpv.speed"),
      value: formatBitrate(stats.downloadSpeed * 8),
    })
  }
  return rows
}

/** What mpv says of how it plays, asked once a second while it shows. */
export function useMpvStats(shell: DesktopBridge): LiveStats | null {
  const [stats, setStats] = useState<PlayerStats | null>(null)
  useEffect(() => {
    let stopped = false
    const read = () => {
      shell.request("player.stats").then(
        (latest) => {
          if (!stopped) setStats(latest)
        },
        () => {},
      )
    }
    read()
    const timer = window.setInterval(read, POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [shell])
  if (!stats) return null
  return {
    ahead: stats.cacheSeconds,
    playback: playbackRows(stats),
    video: videoRows(stats),
    audio: audioRows(stats),
  }
}
