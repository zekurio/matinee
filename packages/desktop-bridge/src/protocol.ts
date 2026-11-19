import { t } from "@matinee/contracts/schema"

/*
 * What the desktop app's shell and the pages it shows say to each other.
 * The shell is native (apps/desktop/native): a window with mpv under a
 * web view. It shows two kinds of pages, its own (apps/desktop, for
 * picking a server and signing in) and the server's web app, and both
 * talk to it through this.
 *
 * The web app comes from the server, so its version and the shell's
 * differ. A change here that an older side can't read needs a new
 * `BRIDGE_PROTOCOL`, and both sides must keep working against the one
 * before: a page that finds an older shell plays in the web view as a
 * browser would, and a shell that loads an older page is only a browser.
 * Adding a method, an event, or an optional field needs no new number;
 * `AppInfo.features` says what a shell has.
 *
 * The native half of this is apps/desktop/native/src/bridge. Change both.
 */

export const BRIDGE_PROTOCOL = 1

/**
 * What the shell puts on `window.matineeDesktop` before a page's scripts
 * run. Messages are JSON: a `BridgeRequest` out, and a `BridgeResponse`
 * or `BridgeEvent` in. `connectDesktop()` wraps it; nothing else should
 * touch it.
 */
export type BridgeTransport = {
  /** The newest `BRIDGE_PROTOCOL` the shell speaks. */
  protocol: number
  /** Sends a message to the shell. */
  send: (message: string) => void
  /** Set by the page: the shell calls it with each message for it. */
  receive: ((message: string) => void) | null
}

export const BridgeResponse = t.object({
  id: t.number().int(),
  /** Left out for a method that answers nothing. */
  result: t.unknown().optional(),
  error: t.object({ code: t.string(), message: t.string() }).optional(),
})

export const BridgeEvent = t.object({
  event: t.string(),
  data: t.unknown().optional(),
})

/**
 * The codes a request fails with. `forbidden`: the page may not call the
 * method, as the web app may not read servers. `invalid`: the shell
 * couldn't read the parameters. `unknown-method`: the shell is older than
 * the page. `failed`: the method ran and didn't work; the message says
 * why, in English, for a log.
 */
export const BRIDGE_ERROR_CODES = [
  "forbidden",
  "invalid",
  "unknown-method",
  "failed",
] as const
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number]

export const DESKTOP_PLATFORMS = ["linux", "macos", "windows"] as const
export const DesktopPlatform = t.enum(DESKTOP_PLATFORMS)
export type DesktopPlatform = t.infer<typeof DesktopPlatform>

/** What the shell is, for a page to adapt to and for About. */
export const AppInfo = t.object({
  /** The app's version, the one in the root package.json. */
  version: t.string(),
  protocol: t.number().int(),
  platform: DesktopPlatform,
  /** mpv's own version, like `v0.41.0`. */
  mpv: t.string(),
  /** Qt's and its Chromium's versions, for About and bug reports. */
  qt: t.string(),
  chromium: t.string(),
  /**
   * What this shell does beyond protocol 1's first release, named as the
   * features get added. Empty for now.
   */
  features: t.array(t.string()),
})
export type AppInfo = t.infer<typeof AppInfo>

// ---------------------------------------------------------------------
// The player. mpv draws the picture under the page, which shows through
// wherever the page is transparent. Only the server's web app may call
// these.
// ---------------------------------------------------------------------

/**
 * A subtitle mpv draws itself: a stream of the file that plays, by its
 * index in the file (`SubtitleTrack`'s stream index, ffmpeg's), or a
 * file from `subtitlePath()`, as a path on the server.
 */
export const PlayerSubtitle = t.union([
  t.object({
    kind: t.literal("stream"),
    index: t.number().int().nonnegative(),
  }),
  t.object({ kind: t.literal("external"), url: t.string() }),
])
export type PlayerSubtitle = t.infer<typeof PlayerSubtitle>

export const PlayerLoad = t.object({
  /**
   * What to play: a path on the server the shell is connected to, as
   * `playback.start` answers it. The shell sends the session's token
   * with it. Anything but a path on that server is refused.
   */
  url: t.string(),
  /** Seconds into the source to start at. */
  start: t.number().nonnegative(),
  /** Open it paused, showing the frame at `start`. */
  paused: t.boolean(),
  /**
   * The audio stream to play, by its index in the file (`AudioTrack.index`),
   * when the source is the file itself. Null for a stream, which has one.
   */
  audio: t.number().int().nonnegative().nullable(),
  subtitle: PlayerSubtitle.nullable(),
  /** Seconds the subtitles show later by; negative for earlier. */
  subtitleDelay: t.number(),
})
export type PlayerLoad = t.infer<typeof PlayerLoad>

export const PLAYER_PHASES = [
  "idle",
  "loading",
  "ready",
  "ended",
  "failed",
] as const
/**
 * Where the player is with its source. `idle`: nothing is open.
 * `loading`: a source is opening; its length and size aren't known yet.
 * `ready`: it's open, and plays or is paused. `ended`: it played to its
 * end and holds the last frame; a seek makes it `ready` again. `failed`:
 * it didn't open or broke off, and `error` says how mpv put it.
 */
export const PlayerPhase = t.enum(PLAYER_PHASES)
export type PlayerPhase = t.infer<typeof PlayerPhase>

/** A stretch of the source, in seconds of its own time. */
export const TimeRange = t.object({ start: t.number(), end: t.number() })
export type TimeRange = t.infer<typeof TimeRange>

/**
 * mpv's state, as the shell mirrors it to the page. mpv is the one that
 * knows: a page reads this rather than keeping its own idea of whether it
 * plays. Times are seconds in the source's own time, so a stream that
 * starts partway into a file is at 0 where it starts.
 */
export const PlayerState = t.object({
  phase: PlayerPhase,
  /**
   * Counts `player.load` calls, from 1. State from before a load carries
   * the number before it, so a page can tell them apart.
   */
  load: t.number().int(),
  /** Paused by the viewer or the page. Not waiting, which is `buffering`. */
  paused: t.boolean(),
  /**
   * Not showing new frames though it isn't paused: waiting for data, or
   * for the first frame after opening or a seek.
   */
  buffering: t.boolean(),
  /** A seek is on its way. `time` is where it's headed. */
  seeking: t.boolean(),
  /**
   * Where it plays. Sent a few times a second while playing; a page
   * counts on from it by `speed` in between.
   */
  time: t.number(),
  /** Null until the source says, and for one that never does. */
  duration: t.number().nullable(),
  speed: t.number(),
  /** 0 to 1. */
  volume: t.number(),
  muted: t.boolean(),
  /** How far the source is read, past `time`. */
  bufferedTo: t.number(),
  /**
   * mpv is reading the source now. False once it has read to the end, or
   * holds as much ahead as it keeps and waits to read more, as mpv's
   * `demuxer-cache-idle` says. Left out, the page takes `bufferedTo`
   * reaching `duration` for the end.
   */
  reading: t.boolean().optional(),
  /**
   * The source seeks anywhere by itself, as a file with byte ranges and
   * an HLS playlist do. When false, a seek only reaches `seekable`.
   */
  seeks: t.boolean(),
  /** What a seek reaches without a new source: what mpv holds in memory. */
  seekable: t.array(TimeRange),
  /** The picture's size as shown, after its aspect ratio. Null without video. */
  video: t.object({ width: t.number(), height: t.number() }).nullable(),
  /** mpv's last error line, for the `failed` phase. */
  error: t.string().nullable(),
})
export type PlayerState = t.infer<typeof PlayerState>

/** The fields of `PlayerState` that changed. */
export const PlayerStatePatch = PlayerState.partial()
export type PlayerStatePatch = t.infer<typeof PlayerStatePatch>

/**
 * What mpv does with the source right now, for the player's stats. Null
 * where mpv doesn't say, as for a source without video.
 */
export const PlayerStats = t.object({
  /** ffmpeg's codec name, like `hevc`. */
  videoCodec: t.string().nullable(),
  /** The decoder's pixel format, like `yuv420p10`. */
  pixelFormat: t.string().nullable(),
  /** The hardware decoder in use, like `vaapi`. Null for software. */
  hardwareDecoder: t.string().nullable(),
  /** The source's frame size. */
  width: t.number().nullable(),
  height: t.number().nullable(),
  /** The size it's drawn at on screen, in device pixels. */
  shownWidth: t.number().nullable(),
  shownHeight: t.number().nullable(),
  /** Frames per second: the source's, and the display's. */
  frameRate: t.number().nullable(),
  displayFrameRate: t.number().nullable(),
  /** Frames the output dropped because it was late. */
  droppedFrames: t.number(),
  /** Frames the decoder skipped to catch up. */
  decoderDroppedFrames: t.number(),
  /** Frames shown later than they should have been. */
  delayedFrames: t.number(),
  /** Such as `bt.2020` and `pq`, mpv's names. */
  colorPrimaries: t.string().nullable(),
  colorTransfer: t.string().nullable(),
  /** Bits per second, measured over the last seconds. */
  videoBitRate: t.number().nullable(),
  audioBitRate: t.number().nullable(),
  audioCodec: t.string().nullable(),
  /** Channels in the source, and as sent to the speakers. */
  audioChannels: t.number().nullable(),
  audioOutputChannels: t.number().nullable(),
  audioSampleRate: t.number().nullable(),
  /** The audio goes to the receiver undecoded. */
  audioPassthrough: t.boolean(),
  /** Seconds the audio is ahead of the video; near 0 when in sync. */
  avSync: t.number().nullable(),
  /** Seconds and bytes read ahead of where it plays. */
  cacheSeconds: t.number().nullable(),
  cacheBytes: t.number().nullable(),
  /** Bytes per second arriving from the server. */
  downloadSpeed: t.number().nullable(),
})
export type PlayerStats = t.infer<typeof PlayerStats>

/**
 * What plays, for the system's media controls: MPRIS on Linux, and the
 * like elsewhere. The shell fills in the position and whether it plays
 * from mpv.
 */
export const MediaMetadata = t.object({
  title: t.string(),
  /** The line under it, like a show's name. */
  subtitle: t.string().nullable(),
  /** Artwork, as a path on the server. */
  artwork: t.string().nullable(),
  /** The file's length in seconds, when the source's own isn't it. */
  duration: t.number().nullable(),
  /**
   * Where in the file the source's time 0 is, so the controls show the
   * file's time.
   */
  offset: t.number(),
  hasPrevious: t.boolean(),
  hasNext: t.boolean(),
})
export type MediaMetadata = t.infer<typeof MediaMetadata>

export const MEDIA_ACTIONS = [
  "play",
  "pause",
  "toggle",
  "stop",
  "previous",
  "next",
  "seek",
  "skip",
] as const
/**
 * Something the system's media controls or a media key asked for. The
 * shell doesn't act on it; the page does, as for its own buttons, so a
 * watch party hears of it too. `seek` carries `position`, seconds into
 * the file. `skip` carries `by`, seconds forward, or back when negative.
 */
export const MediaAction = t.object({
  action: t.enum(MEDIA_ACTIONS),
  position: t.number().optional(),
  by: t.number().optional(),
})
export type MediaAction = t.infer<typeof MediaAction>

// ---------------------------------------------------------------------
// This device's settings, kept by the shell. Both kinds of pages read and
// change them.
// ---------------------------------------------------------------------

export const AUDIO_CHANNEL_LAYOUTS = ["auto", "stereo", "5.1", "7.1"] as const
export const AudioChannelLayout = t.enum(AUDIO_CHANNEL_LAYOUTS)
export type AudioChannelLayout = t.infer<typeof AudioChannelLayout>

export const PASSTHROUGH_CODECS = [
  "ac3",
  "eac3",
  "dts",
  "dts-hd",
  "truehd",
] as const
/** Audio a receiver decodes itself, mpv's `audio-spdif` names. */
export const PassthroughCodec = t.enum(PASSTHROUGH_CODECS)
export type PassthroughCodec = t.infer<typeof PassthroughCodec>

export const DesktopSettings = t.object({
  /** Decode video on the GPU where it can. */
  hardwareDecoding: t.boolean(),
  /** mpv's name for the output, from `settings.audioDevices`, or `auto`. */
  audioDevice: t.string(),
  /** The speakers to mix for. `auto` asks the output. */
  audioChannels: AudioChannelLayout,
  /** The codecs sent to the receiver as they are. */
  passthrough: t.array(PassthroughCodec),
  /** Take the audio device alone, which passthrough often needs. */
  exclusiveAudio: t.boolean(),
  /** How large the interface draws: 1 is the system's size. 0.5 to 3. */
  scale: t.number(),
  /** Open full screen. */
  startFullscreen: t.boolean(),
})
export type DesktopSettings = t.infer<typeof DesktopSettings>

export const DesktopSettingsPatch = DesktopSettings.partial()
export type DesktopSettingsPatch = t.infer<typeof DesktopSettingsPatch>

export const AudioDevice = t.object({
  /** What `DesktopSettings.audioDevice` holds. */
  name: t.string(),
  /** What a person reads, like `HDMI / DisplayPort (Built-in Audio)`. */
  description: t.string(),
})
export type AudioDevice = t.infer<typeof AudioDevice>

// ---------------------------------------------------------------------
// Servers and signing in. Only the shell's own pages may call these, and
// they never see a token: the shell keeps it in the system's keychain and
// sends it with the requests of the web app and of mpv.
// ---------------------------------------------------------------------

/** A server the app is signed in to. */
export const SavedServer = t.object({
  /** The shell's own id for it. */
  id: t.string(),
  /** Its address, without a path: `https://watch.example.com`. */
  url: t.string(),
  /** Who is signed in. */
  username: t.string(),
  displayName: t.string().nullable(),
  /** The user's picture, as a path on the server. Null without one. */
  avatar: t.string().nullable(),
})
export type SavedServer = t.infer<typeof SavedServer>

export const ServerList = t.object({
  servers: t.array(SavedServer),
  /** The one the app opens with. Null when there is none. */
  current: t.string().nullable(),
})
export type ServerList = t.infer<typeof ServerList>

export const SERVER_PROBE_FAILURES = [
  "invalid",
  "unreachable",
  "not-matinee",
] as const
/**
 * Why an address isn't a server. `invalid`: it isn't an address.
 * `unreachable`: nothing answered there. `not-matinee`: something
 * answered that isn't a Matinee server.
 */
export const ServerProbeFailure = t.enum(SERVER_PROBE_FAILURES)
export type ServerProbeFailure = t.infer<typeof ServerProbeFailure>

/**
 * What the shell found at an address. Without a scheme it tries https,
 * then http, and `url` is the one that answered.
 */
export const ServerProbe = t.union([
  t.object({ ok: t.literal(true), url: t.string() }),
  t.object({ ok: t.literal(false), reason: ServerProbeFailure }),
])
export type ServerProbe = t.infer<typeof ServerProbe>

/** A server that answered on the local network, checked to be one. */
export const DiscoveredServer = t.object({
  name: t.string(),
  url: t.string(),
})
export type DiscoveredServer = t.infer<typeof DiscoveredServer>

export const SIGN_IN_METHODS = ["browser", "code"] as const
/**
 * How to sign in. `browser`: the system's browser opens the server's
 * approval page and comes back to the app. `code`: the app shows a code
 * to enter at the server's `/link`, on any device.
 */
export const SignInMethod = t.enum(SIGN_IN_METHODS)
export type SignInMethod = t.infer<typeof SignInMethod>

/** What a sign-in that started shows while it waits. */
export const SignInStarted = t.union([
  t.object({
    method: t.literal("browser"),
    /** The page that opened, to offer as a link when no browser did. */
    url: t.string(),
  }),
  t.object({
    method: t.literal("code"),
    /** Like `BCDF-GHJK`. */
    userCode: t.string(),
    /** The page to enter it on. */
    verificationUri: t.string(),
    /** That page with the code filled in, for a QR code. */
    verificationUriComplete: t.string(),
    /** Seconds until the code stops working. */
    expiresIn: t.number(),
  }),
])
export type SignInStarted = t.infer<typeof SignInStarted>

export const SIGN_IN_FAILURES = [
  "expired",
  "denied",
  "unreachable",
  "failed",
] as const
/**
 * Why a sign-in ended without a session. `expired`: nobody approved in
 * time. `denied`: the answer wasn't for this sign-in. `unreachable`: the
 * server stopped answering. `failed`: anything else; `message` has the
 * server's words where it sent some.
 */
export const SignInFailure = t.enum(SIGN_IN_FAILURES)
export type SignInFailure = t.infer<typeof SignInFailure>

/** How a sign-in ended. After `approved` the shell opens the server. */
export const SignInResult = t.union([
  t.object({ status: t.literal("approved"), server: SavedServer }),
  t.object({
    status: t.literal("failed"),
    reason: SignInFailure,
    message: t.string().nullable(),
  }),
])
export type SignInResult = t.infer<typeof SignInResult>

export const SHELL_REASONS = [
  "welcome",
  "servers",
  "signed-out",
  "unreachable",
] as const
/**
 * Why the shell shows its own page instead of a server. `welcome`: no
 * server is saved. `servers`: the viewer asked for the list.
 * `signed-out`: `server`'s session ended, there or here, so it needs a
 * sign-in. `unreachable`: `server` didn't answer.
 */
export const ShellReason = t.enum(SHELL_REASONS)
export type ShellReason = t.infer<typeof ShellReason>

export const ShellState = t.object({
  reason: ShellReason,
  /** The server the reason is about. */
  server: SavedServer.nullable(),
})
export type ShellState = t.infer<typeof ShellState>

const nothing = t.object({})

/**
 * Every method a page can call, with what it takes and what it answers.
 * `scope` says which pages may: `web` is the server's web app, `shell`
 * the app's own pages.
 */
export const methods = {
  // Both kinds of pages.
  "app.info": { params: nothing, result: AppInfo },
  /** Closes the app. */
  "app.quit": { params: nothing, result: t.void() },
  "settings.get": { params: nothing, result: DesktopSettings },
  /** Changes the settings named and answers with all of them. */
  "settings.set": { params: DesktopSettingsPatch, result: DesktopSettings },
  "settings.audioDevices": {
    params: nothing,
    result: t.array(AudioDevice),
  },

  // The server's web app.
  /** Opens a source, in place of the one that plays. */
  "player.load": { params: PlayerLoad, result: t.void() },
  /** Closes the source and hides the picture. */
  "player.stop": { params: nothing, result: t.void() },
  "player.state": { params: nothing, result: PlayerState },
  "player.setPaused": {
    params: t.object({ paused: t.boolean() }),
    result: t.void(),
  },
  /** Seeks to `time`, seconds in the source's own time, to the frame. */
  "player.seek": { params: t.object({ time: t.number() }), result: t.void() },
  "player.setSpeed": {
    params: t.object({ speed: t.number().positive() }),
    result: t.void(),
  },
  "player.setVolume": {
    params: t.object({ volume: t.number().min(0).max(1), muted: t.boolean() }),
    result: t.void(),
  },
  /** Plays another audio stream of the file, by its index in it. */
  "player.setAudio": {
    params: t.object({ index: t.number().int().nonnegative() }),
    result: t.void(),
  },
  "player.setSubtitle": {
    params: t.object({ subtitle: PlayerSubtitle.nullable() }),
    result: t.void(),
  },
  "player.setSubtitleDelay": {
    params: t.object({ seconds: t.number() }),
    result: t.void(),
  },
  /**
   * Keeps subtitles clear of the page's controls: `bottom` is how much
   * of the window's height, from its bottom edge, they stay out of. 0
   * puts them back.
   */
  "player.setSubtitleInset": {
    params: t.object({ bottom: t.number().min(0).max(1) }),
    result: t.void(),
  },
  "player.stats": { params: nothing, result: PlayerStats },
  /** What the system's media controls show. Null clears them. */
  "media.setMetadata": {
    params: t.object({ metadata: MediaMetadata.nullable() }),
    result: t.void(),
  },
  /** Shows the app's server list. */
  "shell.showServers": { params: nothing, result: t.void() },
  /**
   * The web app signed out, or found its session gone. The shell forgets
   * the token and asks for a sign-in.
   */
  "shell.signedOut": { params: nothing, result: t.void() },

  // The app's own pages.
  "shell.state": { params: nothing, result: ShellState },
  "servers.list": { params: nothing, result: ServerList },
  /** Checks that `address` is a server. */
  "servers.probe": {
    params: t.object({ address: t.string() }),
    result: ServerProbe,
  },
  /** Looks for servers on the local network, for about three seconds. */
  "servers.discover": { params: nothing, result: t.array(DiscoveredServer) },
  /** Opens a saved server's web app. */
  "servers.open": { params: t.object({ id: t.string() }), result: t.void() },
  /** Signs out of a saved server and forgets it. */
  "servers.remove": { params: t.object({ id: t.string() }), result: t.void() },
  /**
   * Starts signing in to the server at `url`, from `servers.probe`. One
   * sign-in runs at a time: starting another ends the one before. It
   * ends with a `signIn.result` event.
   */
  "signIn.start": {
    params: t.object({ url: t.string(), method: SignInMethod }),
    result: SignInStarted,
  },
  "signIn.cancel": { params: nothing, result: t.void() },
} as const

export type MethodName = keyof typeof methods
export type MethodParams<Name extends MethodName> = t.infer<
  (typeof methods)[Name]["params"]
>
export type MethodResult<Name extends MethodName> = t.infer<
  (typeof methods)[Name]["result"]
>

/** Every event the shell sends, with what it carries. */
export const events = {
  /** mpv's state changed. To the server's web app. */
  "player.state": PlayerStatePatch,
  /** The system's media controls asked for something. To the web app. */
  "media.action": MediaAction,
  /** A setting changed, here or in another page. */
  "settings.changed": DesktopSettings,
  /** A sign-in ended. To the app's own pages. */
  "signIn.result": SignInResult,
} as const

export type EventName = keyof typeof events
export type EventData<Name extends EventName> = t.infer<(typeof events)[Name]>
