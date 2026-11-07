import {
  HARDWARE_DEVICES,
  type TranscodingCapabilities,
  type TranscodingSettings,
} from "@matinee/contracts"

import { env } from "../env"
import { log } from "../log"
import { detectBuild, emptyCapabilities } from "./detect/build"
import type { CapabilityDevices } from "./detect/device"
import { ffmpeg } from "./detect/ffmpeg"
import { detectHardware } from "./detect/hardware"
import { transcodingSettings } from "./settings"

/*
 * What the configured ffmpeg can do, as Jellyfin's EncoderValidator and
 * alloy's capabilities.ts find out: the build's encoders, filters, and
 * options, then each GPU path tried with a tiny encode, so nothing counts as
 * usable before it ran. Detection takes a few seconds and is cached per
 * device setting; concurrent callers share one run.
 */

let cached: { key: string; capabilities: TranscodingCapabilities } | null = null
let inflight: {
  key: string
  promise: Promise<TranscodingCapabilities>
} | null = null

/** Detect, or return what the last detection for these devices found. */
export function transcodingCapabilities(
  devices: CapabilityDevices,
  refresh = false,
): Promise<TranscodingCapabilities> {
  const key = [
    env.MATINEE_FFMPEG_PATH,
    devices.vaapiDevice,
    devices.qsvDevice,
  ].join("\0")
  if (cached?.key === key && !refresh)
    return Promise.resolve(cached.capabilities)
  if (inflight?.key === key) return inflight.promise
  const promise = detect(devices)
    .then((capabilities) => {
      cached = { key, capabilities }
      return capabilities
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null
    })
  inflight = { key, promise }
  return promise
}

/**
 * The settings in use and what this server can do with them: what a
 * transcode passes to `buildVideoPipeline`.
 */
export async function currentTranscoding(): Promise<{
  settings: TranscodingSettings
  capabilities: TranscodingCapabilities
}> {
  const settings = await transcodingSettings()
  return { settings, capabilities: await transcodingCapabilities(settings) }
}

async function detect(
  devices: CapabilityDevices,
): Promise<TranscodingCapabilities> {
  const started = Date.now()
  const ffmpegPath = env.MATINEE_FFMPEG_PATH
  const versionRun = await ffmpeg(["-hide_banner", "-version"])
  if (!versionRun.ok) {
    const capabilities = emptyCapabilities(
      versionRun.error ?? "ffmpeg didn't run.",
    )
    log.warn(`Couldn't run ${ffmpegPath}: ${capabilities.error}`)
    return capabilities
  }
  const capabilities = await detectBuild(ffmpegPath, versionRun.stdout)
  // One GPU at a time: parallel test encodes would fight over it.
  for (const device of HARDWARE_DEVICES) {
    capabilities.hardware.push(
      await detectHardware(device, devices, capabilities),
    )
  }
  const usable = capabilities.hardware
    .filter((entry) => entry.device.status === "ok")
    .map((entry) => entry.acceleration)
  log.info(
    `Detected ffmpeg ${capabilities.version ?? "of unknown version"}${capabilities.jellyfin ? " (Jellyfin)" : ""}, ` +
      `GPUs: ${usable.join(", ") || "none"}, in ${Math.round((Date.now() - started) / 100) / 10} s`,
  )
  return capabilities
}
