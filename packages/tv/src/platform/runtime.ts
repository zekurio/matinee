import type { DevicePlatform } from "@matinee/contracts"

import type { Engine, EngineListener } from "../player/engine"
import { VideoEngine } from "../player/engine"

/**
 * What differs between the TV UI's hosts: the Solid web app, where the
 * browser's own player and a same-origin server do, and a Samsung TV,
 * where AVPlay and the Tizen APIs do. Everything else in this package is
 * the same on both.
 */
export type Platform = {
  /** The app runs on a TV, with the TV's remote and its own player. */
  readonly onTv: boolean
  /** The TV's model, like `QE55Q80T`, or null in a browser. */
  readonly model: string | null
  /** Tizen's version, like 5.5, or null in a browser. */
  readonly tizenVersion: number | null
  /** The panel's pixels across. */
  panelWidth(): number
  /** The TV shows HDR. */
  showsHdr(): boolean
  /** Samsung's AVPlay is there to play with. */
  readonly hasNativePlayer: boolean
  /** What the server's sessions list calls the device's kind. */
  readonly devicePlatform: DevicePlatform
  /** The app's version, from its package, or null in a browser. */
  appVersion(): string | null
  /** What the person named the TV, or null when it has no name. */
  tvName(): string | null
  /** Asks for the remote's media keys, where a web app must. */
  registerRemoteKeys(): void
  /** Closes the app, as Back on Home's drawer does. */
  exitApp(): void
  /** Keeps the TV's screen saver away while a video plays, and lets it back after. */
  holdScreenSaver(hold: boolean): void
  /** The engine that plays the video: AVPlay on a TV, the video element otherwise. */
  createEngine(host: HTMLElement, listener: EngineListener): Engine
  /** The server a page at a web address came from, or null in a packaged app. */
  defaultServer(): string | null
}

/** What the browser's system calls itself, for the server's sessions list. */
function browserDevicePlatform(): DevicePlatform {
  const agent = navigator.userAgent
  if (/Android/i.test(agent)) return "android"
  if (/iPhone|iPad|iPod/i.test(agent)) return "ios"
  if (/Mac OS X|Macintosh/i.test(agent)) return "macos"
  if (/Windows/i.test(agent)) return "windows"
  return "linux"
}

/** The Solid web app's host: the browser's player, and the page's own origin. */
export const browserPlatform: Platform = {
  onTv: false,
  model: null,
  tizenVersion: null,
  panelWidth: () => window.screen.width || 1920,
  showsHdr: () => false,
  hasNativePlayer: false,
  devicePlatform: browserDevicePlatform(),
  appVersion: () => null,
  tvName: () => null,
  registerRemoteKeys: () => {},
  exitApp: () => {},
  holdScreenSaver: () => {},
  createEngine: (host, listener) => new VideoEngine(host, listener),
  defaultServer: () =>
    window.location.protocol === "http:" ||
    window.location.protocol === "https:"
      ? window.location.origin
      : null,
}

let active: Platform = browserPlatform

/** Sets the host, once, before the TV UI mounts. */
export function setPlatform(next: Platform): void {
  active = next
}

/** The host the TV UI runs in. */
export function platform(): Platform {
  return active
}
