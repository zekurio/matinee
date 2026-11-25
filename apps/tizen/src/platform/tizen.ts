import {
  type Engine,
  type EngineListener,
  type Platform,
  VideoEngine,
} from "@matinee/tv"

import { AvplayEngine } from "../player/engine"

/*
 * The parts of Tizen's and Samsung's TV APIs the app uses, typed as their
 * references describe them. `window.tizen` is there in any Tizen web app;
 * `window.webapis` once index.html has loaded `$WEBAPIS/webapis/webapis.js`.
 * Neither is there in a browser, where the app runs for development.
 */

/** The state of the one player `webapis.avplay` drives. */
export type AVPlayState = "NONE" | "IDLE" | "READY" | "PLAYING" | "PAUSED"

/** A track as `getTotalTrackInfo` lists it. `extra_info` is JSON text. */
export type AVPlayTrack = {
  index: number
  type: "VIDEO" | "AUDIO" | "TEXT"
  extra_info: string
}

export type AVPlayListener = {
  onbufferingstart?: () => void
  onbufferingprogress?: (percent: number) => void
  onbufferingcomplete?: () => void
  oncurrentplaytime?: (milliseconds: number) => void
  onstreamcompleted?: () => void
  onevent?: (type: string, data: string) => void
  onerror?: (type: string) => void
}

export type AVPlay = {
  open(url: string): void
  close(): void
  prepareAsync(done?: () => void, failed?: (cause: Error) => void): void
  setDisplayRect(x: number, y: number, width: number, height: number): void
  setDisplayMethod(method: string): void
  play(): void
  pause(): void
  stop(): void
  seekTo(
    milliseconds: number,
    done?: () => void,
    failed?: (cause: Error) => void,
  ): void
  getState(): AVPlayState
  getDuration(): number
  getCurrentTime(): number
  setListener(listener: AVPlayListener): void
  setStreamingProperty(type: string, value: string): void
  setBufferingParam(option: string, unit: string, amount: number): void
  setTimeoutForBuffering(seconds: number): void
  getTotalTrackInfo(): AVPlayTrack[]
  getCurrentStreamInfo(): AVPlayTrack[]
  setSelectTrack(type: "AUDIO" | "TEXT", index: number): void
  setSilentSubtitle(silent: boolean): void
  setSpeed(rate: number): void
  suspend(): void
  restore(url?: string, resumeMilliseconds?: number, prepare?: boolean): void
}

type SystemInfo = {
  getCapability(key: string): string | number | boolean
}

type TizenApi = {
  application: {
    getCurrentApplication(): {
      exit(): void
      appInfo: { version: string }
    }
  }
  tvinputdevice: {
    registerKey(name: string): void
  }
  systeminfo: SystemInfo
}

type WebApis = {
  avplay?: AVPlay
  productinfo?: {
    getModel?(): string
    getFirmware?(): string
    isUdPanelSupported?(): boolean
    is8KPanelSupported?(): boolean
  }
  avinfo?: {
    isHdrTvSupport?(): boolean
  }
  network?: {
    getTVName?(): string
  }
  appcommon?: {
    setScreenSaver(state: number, done?: () => void, failed?: () => void): void
    AppCommonScreenSaverState: {
      SCREEN_SAVER_OFF: number
      SCREEN_SAVER_ON: number
    }
  }
}

declare global {
  interface Window {
    tizen?: TizenApi
    webapis?: WebApis
  }
}

/**
 * The remote's keys a web app gets only when it asks. The arrows, Select,
 * and Back come without asking. Volume and the channel keys stay the TV's.
 */
const REMOTE_KEYS = [
  "MediaPlay",
  "MediaPause",
  "MediaPlayPause",
  "MediaStop",
  "MediaRewind",
  "MediaFastForward",
  "MediaTrackPrevious",
  "MediaTrackNext",
  "Caption",
  "Info",
  "Tools",
]

/** Whatever `call` returns, or undefined when the TV has no such API or it throws. */
function attempt<Result>(call: () => Result): Result | undefined {
  try {
    return call()
  } catch {
    // TVs differ in what they have, by year and by model.
    return undefined
  }
}

/** The app runs on a Tizen TV, rather than in a browser. */
export const onTizen = window.tizen !== undefined

/** Asks for the remote's media keys. Once, as the app starts. */
export function registerRemoteKeys() {
  const input = window.tizen?.tvinputdevice
  if (!input) return
  for (const key of REMOTE_KEYS) attempt(() => input.registerKey(key))
}

/** Closes the app, as Back on its first screen does. */
export function exitApp() {
  attempt(() => window.tizen?.application.getCurrentApplication().exit())
}

/** `5.5` for Tizen 5.5. Null in a browser, or when the TV won't say. */
function readTizenVersion(): number | null {
  const stated = attempt(() =>
    window.tizen?.systeminfo.getCapability(
      "http://tizen.org/feature/platform.version",
    ),
  )
  const fromAgent = /Tizen (\d+(?:\.\d+)?)/.exec(navigator.userAgent)?.[1]
  const version = Number.parseFloat(String(stated ?? fromAgent ?? ""))
  return Number.isFinite(version) ? version : null
}

export const tizenVersion = readTizenVersion()

function readModel(): string | null {
  const model =
    attempt(() => window.webapis?.productinfo?.getModel?.()) ??
    attempt(() =>
      window.tizen?.systeminfo.getCapability(
        "http://tizen.org/system/model_name",
      ),
    )
  return model === undefined || model === "" ? null : String(model)
}

/** The TV's model, like `QE55Q80T`. Null in a browser. */
export const tvModel = readModel()

/** What the person named the TV, like `Living room`. Null when it has no name. */
export function tvName(): string | null {
  const name = attempt(() => window.webapis?.network?.getTVName?.())
  return name ? name : null
}

/** The panel's pixels across: 7680, 3840, or 1920. */
export function panelWidth(): number {
  const info = window.webapis?.productinfo
  if (attempt(() => info?.is8KPanelSupported?.())) return 7680
  const uhd = attempt(() => info?.isUdPanelSupported?.())
  // A TV that won't say is taken for 4K, as nearly all since 2017 are.
  return uhd === false ? 1920 : 3840
}

/** The TV shows HDR. One that won't say does when its panel is 4K. */
export function showsHdr(): boolean {
  const stated = attempt(() => window.webapis?.avinfo?.isHdrTvSupport?.())
  return stated ?? panelWidth() >= 3840
}

/** Keeps the TV's screen saver away while a video plays, and lets it back after. */
export function holdScreenSaver(hold: boolean) {
  const common = window.webapis?.appcommon
  if (!common) return
  const states = common.AppCommonScreenSaverState
  attempt(() =>
    common.setScreenSaver(
      hold ? states.SCREEN_SAVER_OFF : states.SCREEN_SAVER_ON,
    ),
  )
}

/** The app's version, from its package. Null in a browser. */
export function appVersion(): string | null {
  return (
    attempt(
      () => window.tizen?.application.getCurrentApplication().appInfo.version,
    ) ?? null
  )
}

/**
 * Samsung's host: AVPlay where the TV has it, its own keys, and the
 * package's version and model. A packaged app is loaded by file path, so
 * it has no server to fall back to; one served by address during
 * development uses that address, as the Solid web app does.
 */
export const tizenPlatform: Platform = {
  onTv: true,
  model: tvModel,
  tizenVersion,
  panelWidth,
  showsHdr,
  get hasNativePlayer() {
    // The TV loads `webapis.js` in the page's head, but ask again each
    // time: a model that loads it late still plays with AVPlay.
    return window.webapis?.avplay !== undefined
  },
  devicePlatform: "tizen",
  appVersion,
  tvName,
  registerRemoteKeys,
  exitApp,
  holdScreenSaver,
  createEngine(host: HTMLElement, listener: EngineListener): Engine {
    const avplay = window.webapis?.avplay
    if (!avplay) {
      // The browser stand-in a dev shell uses.
      return new VideoEngine(host, listener)
    }
    return new AvplayEngine(host, avplay, listener)
  },
  defaultServer(): string | null {
    const { protocol, origin } = window.location
    return protocol === "http:" || protocol === "https:" ? origin : null
  },
}
