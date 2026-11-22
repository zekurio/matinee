import type {
  AudioTrack,
  MediaItem,
  MediaSegment,
  PlaybackDevice,
  PlaybackMethod,
  PlaybackQualityPreset,
  PlaybackStart,
  PlaybackStartInput,
  SubtitleTrack,
  Trickplay,
} from "@matinee/contracts"

import { isServerError } from "@/api/errors"
import { followStream } from "@/api/events"
import { session } from "@/auth/session"
import { tr } from "@/i18n"
import { isRecord, textAt } from "@/lib/decode"
import { Observable } from "@/lib/observable"
import { panelWidth } from "@/platform/tizen"

import { CueTrack } from "./cues"
import type { Engine, EngineFailure } from "./engine"

/*
 * The player's side of `playback.start`. The server picks the source, the
 * audio, and the subtitle; the player keeps what the viewer picked and
 * which methods failed, sends all of it with every call, since the server
 * keeps nothing between calls, and loads what comes back.
 */

/** The file as it is, the quality every other one is an encode of. */
export const ORIGINAL_QUALITY = "original"

/** The codes `playback.start` fails with when asking again won't help. */
const UNPLAYABLE = "UNPLAYABLE"
const RESTRICTED = "PLAYBACK_RESTRICTED"
const BUSY = "TOO_MANY_STREAMS"

/** The last second of a segment, which has nothing left worth skipping. */
const SEGMENT_END_SECONDS = 1

/** What the viewer picked in this sitting. What's left out, the server picks. */
type Picks = {
  audio?: number
  subtitle?: { trackId: string | null }
  quality?: PlaybackStartInput["quality"]
}

/** A `playback.start` with what changed since the last one. */
type Ask = {
  /** Seconds into the file to start from. */
  at: number
  /** The viewer's picks that change. */
  picks?: Picks
  /** The method of the source that just failed. */
  failed?: PlaybackMethod
  /** The answer whose source failed. */
  lost?: PlaybackStart
  snap?: "before" | "nearest"
  /** Load the answer even when it's what plays, as a retry does. */
  reload?: boolean
}

/** What the player loads: an answer's source, or a stream from `playback.seek` in its place. */
type Source = {
  method: PlaybackMethod
  url: string
  hls: boolean
  /** Where in the file its time 0 is, above 0 only for a stream that starts partway in. */
  offset: number
  /** Where it begins playing, in its own time. */
  start: number
}

/**
 * Why the server won't play the file for this account now: its access
 * rules out every way left, or it plays on as many devices as it may.
 */
export type Refusal = "restricted" | "busy"

export type Notice = {
  kind: "burnInFailed" | "qualityFailed" | "switchFailed"
  detail?: string
}

/** How a sitting begins: the server's first answer, and what was asked for. */
export type Opening = {
  plan: PlaybackStart
  sessionId: string
  quality: PlaybackStartInput["quality"]
}

/** What opening the player came to: something to play, or why not. */
export type PlayerData =
  | { kind: "ready"; opening: Opening; device: PlaybackDevice }
  | { kind: "unplayable" }
  | { kind: "refused"; refusal: Refusal; message: string }

export function refusalOf(cause: unknown): Refusal | null {
  if (!isServerError(cause)) return null
  if (cause.code === RESTRICTED) return "restricted"
  return cause.code === BUSY ? "busy" : null
}

/**
 * What the player says under a refusal's heading: why, in the app's
 * language for a reason it knows; else the server's words.
 */
export function refusalMessage(cause: unknown): string {
  if (!isServerError(cause)) return session.describe(cause)
  const data = isRecord(cause.data) ? cause.data : undefined
  switch (textAt(data, "reason")) {
    case "bitrate-original":
      return tr("playerRestrictedOriginal")
    case "bitrate-transcode":
      return tr("playerRestrictedNoTranscode")
    case "bitrate-failed":
      return tr("playerRestrictedFailed")
    case "bitrate":
      return tr("playerRestrictedBitrate")
    case "transcode":
      return tr("playerRestrictedTranscode")
    default:
      break
  }
  if (cause.message) return cause.message
  return tr(
    cause.code === BUSY ? "playerBusyGeneric" : "playerRestrictedGeneric",
  )
}

/** A UUID for a sitting with a file, which reports and streams carry. */
export function newSessionId(): string {
  const bytes = new Uint8Array(16)
  window.crypto.getRandomValues(bytes)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Asks the server how `itemId` plays on `device`, to open the player with. */
export async function openPlayer(
  itemId: string,
  device: PlaybackDevice,
  quality: PlaybackStartInput["quality"],
  start: number | undefined,
): Promise<PlayerData> {
  const sessionId = newSessionId()
  try {
    const plan = await session.api.playback.start({
      itemId,
      sessionId,
      device,
      quality,
      position: start,
    })
    return { kind: "ready", opening: { plan, sessionId, quality }, device }
  } catch (cause) {
    if (isServerError(cause) && cause.code === UNPLAYABLE)
      return { kind: "unplayable" }
    const refusal = refusalOf(cause)
    if (!refusal) throw cause
    return { kind: "refused", refusal, message: refusalMessage(cause) }
  }
}

/**
 * Whether `next` plays from what `current` loaded, so the player keeps
 * it: the file, whose audio the player picks inside it, or a stream of
 * the same audio, quality, and picture.
 */
function sameSource(current: PlaybackStart, next: PlaybackStart): boolean {
  if (current.method !== next.method || current.hls !== next.hls) return false
  if (next.method === "direct") return true
  const burned = (plan: PlaybackStart) =>
    plan.subtitleMode === "burn-in" ? plan.subtitle?.id : undefined
  return (
    current.audio?.index === next.audio?.index &&
    current.quality === next.quality &&
    current.convertedAudio === next.convertedAudio &&
    burned(current) === burned(next)
  )
}

/**
 * Plays one file as the server says: loads the source of each
 * `playback.start` answer into the engine, asks again with the viewer's
 * picks and with the methods that failed, seeks in a copied stream with
 * `playback.seek`, draws the subtitles the answer gives the player, and
 * reports progress for Continue watching and the statistics.
 */
export class PlayerController extends Observable {
  readonly item: MediaItem
  /** The audio in the menu: the viewer's pick, else the one that plays. */
  audio: AudioTrack | null
  /** The subtitle in the menu: the viewer's pick, else the one that shows. */
  subtitle: SubtitleTrack | null
  /** The quality in the menu: the one that plays, or the one on its way. */
  quality: string
  cues: CueTrack | null = null
  subtitleError = false
  speed = 1
  /** Seconds into the file. */
  position = 0
  /** How far the file is buffered, in its own time. */
  buffered = 0
  playing = false
  loading = true
  ended = false
  /** Why nothing plays, once nothing is left to try. */
  error: string | null = null
  /** The server refused to play the file for this account. Trying again won't help. */
  refusal: Refusal | null = null
  notice: Notice | null = null
  trickplay: Trickplay | null = null

  private plan: PlaybackStart
  private source: Source | null = null
  private picks: Picks
  private failed: PlaybackMethod[] = []
  /** The track `cues` are for, or loading for. */
  private cuesFor: string | null = null
  /** Where a switch or seek is headed, shown until the source for it loads. */
  private pendingAt: number | null = null
  /** The source failed, so nothing plays until another loads. */
  private sourceFailed = false
  private playedSeconds = 0
  private lastReport = 0
  private lastTick = performance.now()
  /** Counts the calls to the server. Only the newest one's answer is taken. */
  private asked = 0
  /** The `playback.start` on its way, and the picks to put back if it fails. */
  private inFlight: {
    ask: Ask
    undo: { picks: Picks; failed: PlaybackMethod[] }
  } | null = null
  /** Where the viewer sought while an answer was on its way. */
  private seekOnAnswer: number | null = null
  /**
   * The segment the viewer skipped, whose button stays away until they
   * seek. A copied stream lands on the keyframe nearest its end, which
   * can be a little short of it.
   */
  private skipped: MediaSegment | null = null
  private timer = 0
  private released = false

  constructor(
    private readonly opening: Opening,
    private readonly device: PlaybackDevice,
    private readonly engine: Engine,
  ) {
    super()
    const { plan } = opening
    this.plan = plan
    this.item = plan.item
    this.audio = plan.audio
    this.subtitle = plan.subtitle
    this.quality = plan.quality
    this.picks = { quality: opening.quality }
    this.position = plan.position
  }

  get audioTracks(): readonly AudioTrack[] {
    return this.plan.audioTracks
  }

  get subtitles(): readonly SubtitleTrack[] {
    return this.plan.subtitleTracks
  }

  /** The encodes the quality menu offers for this file. */
  get qualities(): readonly PlaybackQualityPreset[] {
    return this.plan.qualities
  }

  /** The quality menu offers the original: not for a file over the account's bit rate limit. */
  get offersOriginal(): boolean {
    return this.plan.original
  }

  get speeds(): readonly number[] {
    return this.engine.speeds
  }

  /** The file before this one in its show. */
  get previous(): MediaItem | null {
    return this.plan.previous
  }

  /** The file after this one in its show. */
  get next(): MediaItem | null {
    return this.plan.next
  }

  /** Whether the player offers the next episode now: the credits started, or the file ended. */
  get offersNext(): boolean {
    const at = this.plan.upNextAt
    return this.ended || (at !== null && this.position >= at)
  }

  /** The part the server offers to skip that plays now, like the intro. */
  get segment(): MediaSegment | null {
    const skipped = this.skipped
    return (
      this.plan.segments.find(
        (segment) =>
          !(
            skipped !== null &&
            segment.kind === skipped.kind &&
            segment.start === skipped.start
          ) &&
          this.position >= segment.start &&
          this.position < segment.end - SEGMENT_END_SECONDS,
      ) ?? null
    )
  }

  get duration(): number {
    const known = this.item.durationSeconds
    if (known) return known
    const length = this.engine.durationMs()
    return length === null ? 0 : (this.source?.offset ?? 0) + length / 1000
  }

  /** Whether `track` in the menu is burned into the picture. */
  burnsIn(track: SubtitleTrack): boolean {
    if (this.plan.subtitle?.id === track.id)
      return this.plan.subtitleMode === "burn-in"
    return track.delivery !== "webvtt"
  }

  /** Loads the first answer's source and plays. */
  start() {
    this.take(this.plan, { at: this.plan.position, reload: true })
    this.engine.play()
    this.timer = window.setInterval(() => this.tick(), 250)
    void this.loadTrickplay()
  }

  /** The engine's state moved: follow it. */
  sync() {
    if (this.released) return
    const playing = this.engine.playing()
    if (playing !== this.playing) {
      this.playing = playing
      // What plays again didn't fail for good.
      if (playing && this.error !== null && this.refusal === null) {
        this.error = null
        this.sourceFailed = false
      }
      this.report()
    }
    this.loading = this.engine.loading()
    if (this.engine.ended() && !this.ended) {
      this.ended = true
      this.report()
    }
    this.follow()
    this.changed()
  }

  private follow() {
    const { source } = this
    if (!source) return
    this.position =
      this.pendingAt ?? source.offset + this.engine.positionMs() / 1000
    this.buffered = source.offset + this.engine.bufferedMs() / 1000
  }

  /** Follows the position and counts the time spent playing. */
  private tick() {
    const now = performance.now()
    if (this.engine.playing()) {
      // A longer gap is a stall or a sleeping TV, not watching.
      this.playedSeconds +=
        (Math.min(now - this.lastTick, 15_000) / 1000) * this.speed
    }
    this.lastTick = now
    this.follow()
    const every = this.engine.playing() ? 10_000 : 30_000
    if (Date.now() - this.lastReport >= every) this.report()
    this.changed()
  }

  /** Where the viewer is: where a switch or seek is headed, else where the video plays. */
  private now(): number {
    return this.pendingAt ?? this.position
  }

  /** Takes an answer: loads its source unless the one that plays is the same, and shows its tracks. */
  private take(next: PlaybackStart, change: Ask) {
    const previous = this.plan
    const sought = this.seekOnAnswer
    this.seekOnAnswer = null
    const said = this.settle(change.lost, next)
    this.plan = next
    this.audio = next.audio
    this.subtitle = next.subtitle
    this.quality = next.quality
    const current = this.source
    if (change.reload || !current || !sameSource(previous, next)) {
      this.load({
        method: next.method,
        url: next.url,
        hls: next.hls,
        offset: next.offset,
        start: next.start,
      })
    } else {
      // The same source plays on, with the audio and subtitle answered.
      this.pendingAt = null
      if (current.method === "direct") this.selectAudioInFile()
      this.showSubtitle()
      if (sought !== null) this.moveTo(sought)
    }
    if (said) this.notice = { kind: said }
    this.changed()
  }

  /**
   * What an answer to a failure leaves of the picks. An encode that
   * burned a subtitle in failed, and the server played on without it, so
   * the subtitle is off. An encode at a picked quality failed, and the
   * original plays, so that's the pick.
   */
  private settle(
    lost: PlaybackStart | undefined,
    plan: PlaybackStart,
  ): Notice["kind"] | null {
    if (!lost) return null
    if (lost.subtitleMode === "burn-in" && plan.subtitleMode !== "burn-in") {
      this.picks = { ...this.picks, subtitle: { trackId: null } }
      return "burnInFailed"
    }
    const picked = this.picks.quality
    if (
      picked !== undefined &&
      picked !== ORIGINAL_QUALITY &&
      lost.quality !== ORIGINAL_QUALITY &&
      plan.quality === ORIGINAL_QUALITY
    ) {
      this.picks = { ...this.picks, quality: ORIGINAL_QUALITY }
      return "qualityFailed"
    }
    return null
  }

  /**
   * The place of the audio that plays among the file's tracks the TV
   * decodes, as the engine counts them. Null for a file with one track,
   * which plays without picking.
   */
  private audioPlace(): { ordinal: number; of: number } | null {
    const wanted = this.audio
    if (!wanted) return null
    const decodes = (codec: string) =>
      this.device.audio.includes("*") ||
      this.device.audio.includes(codec) ||
      (codec.startsWith("pcm_") && this.device.audio.includes("pcm_*"))
    const decoded = this.audioTracks.filter((track) => decodes(track.codec))
    const ordinal = decoded.findIndex((track) => track.index === wanted.index)
    return ordinal < 0 || this.audioTracks.length < 2
      ? null
      : { ordinal, of: decoded.length }
  }

  private load(next: Source) {
    this.error = null
    this.refusal = null
    this.ended = false
    this.sourceFailed = false
    this.pendingAt = null
    this.source = next
    this.position = next.offset + next.start
    this.loading = true
    this.engine.load({
      url: session.url(next.url),
      kind: next.method === "direct" ? "file" : next.hls ? "hls" : "mp4",
      startMs: Math.round(next.start * 1000),
      audio: next.method === "direct" ? this.audioPlace() : null,
      maxWidth: panelWidth(),
      token: session.token,
    })
    this.showSubtitle()
  }

  private selectAudioInFile() {
    const place = this.audioPlace()
    if (place !== null) this.engine.selectAudio(place)
  }

  /** Shows the subtitle the answer gives: the player draws WebVTT, and an encode brings a burned-in one along. */
  private showSubtitle() {
    const { subtitle, subtitleMode, subtitleUrl } = this.plan
    const drawn =
      subtitle && subtitleMode === "client" && subtitle.delivery === "webvtt"
        ? subtitleUrl
        : null
    if (!subtitle || !drawn) {
      this.cues = null
      this.cuesFor = null
      return
    }
    if (this.cuesFor === subtitle.id) return
    this.cues = null
    this.cuesFor = subtitle.id
    void this.loadCues(subtitle.id, drawn)
  }

  private async loadCues(trackId: string, path: string) {
    try {
      const token = session.token
      const response = await fetch(session.url(path), {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const parsed = CueTrack.parse(await response.text())
      if (this.cuesFor === trackId) this.cues = parsed
    } catch {
      if (this.cuesFor === trackId) this.subtitleError = true
    }
    this.changed()
  }

  private async loadTrickplay() {
    try {
      await followStream(
        session.url(
          `/api/v1/media/${encodeURIComponent(this.item.id)}/trickplay`,
        ),
        session.token,
        (status) => {
          if (textAt(status, "status") === "pending") return false
          // SAFETY: A `ready` status carries the images, as the contract's
          // TrickplayStatus has it, and the server made it.
          const images = isRecord(status)
            ? (status.images as Trickplay | undefined)
            : undefined
          if (images && !this.released) {
            this.trickplay = images
            this.changed()
          }
          return true
        },
      )
    } catch {
      // The seek bar does without previews.
    }
  }

  /**
   * What didn't play asks the server again with its method among the
   * failed, and the server falls back: from the file to a stream, from a
   * stream to an encode.
   */
  fallBack(failure: EngineFailure) {
    const current = this.source
    if (!current || this.released) return
    this.sourceFailed = true
    this.asked += 1
    if (failure.network) {
      // The server may have gone away, as while it restarts. Falling back
      // past the method would blame it, so ask the server first.
      const mine = this.asked
      void session.api.auth.session().then(
        () => {
          if (mine === this.asked) this.fallBackPast(current)
        },
        () => {
          if (mine !== this.asked) return
          this.error = tr("errorUnreachable")
          this.changed()
        },
      )
      return
    }
    this.fallBackPast(current)
  }

  private fallBackPast(current: Source) {
    this.ask({ at: this.now(), failed: current.method, lost: this.plan })
  }

  /** Asks the server how the file plays with `change`, and takes its answer. */
  private ask(change: Ask) {
    const undo = { picks: this.picks, failed: this.failed }
    if (change.picks) {
      // A pick that may take an encode, a quality or a subtitle in
      // pictures, tries encodes again after one failed, since the viewer
      // asked for it.
      const subtitle = this.subtitles.find(
        (track) => track.id === change.picks?.subtitle?.trackId,
      )
      const encodes =
        (change.picks.quality !== undefined &&
          change.picks.quality !== ORIGINAL_QUALITY) ||
        (subtitle !== undefined && subtitle.delivery !== "webvtt")
      this.picks = { ...this.picks, ...change.picks }
      if (encodes)
        this.failed = this.failed.filter((method) => method !== "transcode")
    }
    const { failed } = change
    if (failed && !this.failed.includes(failed))
      this.failed = [...this.failed, failed]
    this.request(change, undo)
  }

  /** Sends the call for `change`, in place of any still on its way. */
  private request(
    change: Ask,
    undo: { picks: Picks; failed: PlaybackMethod[] },
  ) {
    this.asked += 1
    const mine = this.asked
    this.inFlight = { ask: change, undo }
    this.pendingAt = change.at
    this.changed()
    session.api.playback
      .start({
        itemId: this.item.id,
        sessionId: this.opening.sessionId,
        device: this.device,
        ...this.picks,
        position: Math.max(0, change.at),
        snap: change.snap ?? "before",
        failed: this.failed,
      })
      .then(
        (answer) => {
          if (mine !== this.asked || this.released) return
          this.inFlight = null
          this.take(answer, change)
        },
        (cause: unknown) => {
          if (mine !== this.asked || this.released) return
          this.refused(change, undo, cause)
        },
      )
  }

  /**
   * A call that failed. When the source failed too, nothing plays, so the
   * player says why. A switch that didn't go through leaves what plays,
   * and says so. A refusal stops the player either way, saying why.
   */
  private refused(
    change: Ask,
    undo: { picks: Picks; failed: PlaybackMethod[] },
    cause: unknown,
  ) {
    this.inFlight = null
    this.pendingAt = null
    const unplayable = isServerError(cause) && cause.code === UNPLAYABLE
    const refusal = refusalOf(cause)
    const message = unplayable
      ? tr("playerUnplayable")
      : refusal
        ? refusalMessage(cause)
        : session.describe(cause)
    const sought = this.seekOnAnswer
    this.seekOnAnswer = null
    if (refusal) {
      this.refusal = refusal
      this.error = message
      this.engine.pause()
    } else if (this.sourceFailed || change.failed) {
      this.error = message
      if (this.engine.playing()) this.engine.pause()
    } else {
      this.picks = undo.picks
      this.failed = undo.failed
      this.audio = this.plan.audio
      this.subtitle = this.plan.subtitle
      this.quality = this.plan.quality
      this.notice = { kind: "switchFailed", detail: message }
      // What plays stays, so a seek made meanwhile goes to it.
      if (sought !== null) this.moveTo(sought)
    }
    this.changed()
  }

  /**
   * Opens what played again where it was, paused, after the TV gave the
   * player away while the app was out of sight.
   */
  reopen() {
    if (this.released || !this.source || this.refusal !== null) return
    this.ask({ at: this.now(), reload: true })
  }

  /** The app left the screen, or came back. A TV has no picture in picture: leaving pauses. */
  suspend() {
    this.engine.suspend()
  }

  resume() {
    this.engine.resume()
  }

  /** Tries again from where it stopped, every method with it. */
  retry() {
    this.error = null
    this.refusal = null
    this.failed = []
    this.ask({ at: this.now(), reload: true })
    this.engine.play()
  }

  togglePlay() {
    if (this.ended) {
      this.seekTo(0)
      this.engine.play()
    } else if (this.engine.playing()) this.engine.pause()
    else this.engine.play()
  }

  play() {
    this.engine.play()
  }

  pause() {
    this.engine.pause()
  }

  /** The viewer's seek, which brings back the button of a segment they skipped. */
  seekTo(seconds: number) {
    this.skipped = null
    this.moveTo(seconds)
  }

  /** Skips `segment` to its end, and keeps its button away. */
  skipSegment(segment: MediaSegment) {
    this.moveTo(segment.end)
    this.skipped = segment
    this.changed()
  }

  private moveTo(seconds: number) {
    const current = this.source
    if (!current) return
    const target = Math.max(
      0,
      Math.min(seconds, Math.max(this.duration - 1, 0)),
    )
    this.ended = false
    const flight = this.inFlight
    if (flight) {
      // An answer on its way would start where the viewer was, so ask again.
      this.seekOnAnswer = target
      this.request({ ...flight.ask, at: target, snap: "nearest" }, flight.undo)
    } else if (current.method === "direct" || current.hls) {
      // The file and HLS seek by themselves.
      this.engine.seekTo((target - current.offset) * 1000)
      this.position = target
    } else if (current.method === "remux") {
      this.seekStream(current, target)
    } else {
      // An encode that isn't HLS starts anywhere, from a new answer,
      // which loads though it's the same encode: it starts elsewhere.
      this.ask({ at: target, snap: "nearest", reload: true })
    }
    this.report()
    this.changed()
  }

  /** A copied stream can't seek, so a new one starts from the keyframe nearest `target`. */
  private seekStream(current: Source, target: number) {
    this.asked += 1
    const mine = this.asked
    this.pendingAt = target
    this.position = target
    session.api.playback
      .seek({
        itemId: this.item.id,
        sessionId: this.opening.sessionId,
        audio: this.plan.audio?.index ?? 0,
        position: target,
        snap: "nearest",
        audioCodecs: this.device.streamAudio,
      })
      .then(
        (answer) => {
          if (mine !== this.asked || this.released) return
          this.load({
            ...current,
            url: answer.url,
            offset: answer.offset,
            start: 0,
          })
          this.changed()
        },
        (cause: unknown) => {
          if (mine !== this.asked || this.released) return
          this.pendingAt = null
          this.notice = {
            kind: "switchFailed",
            detail: refusalOf(cause)
              ? refusalMessage(cause)
              : session.describe(cause),
          }
          this.changed()
        },
      )
  }

  skip(seconds: number) {
    this.seekTo(this.now() + seconds)
  }

  /** Plays another audio track, which the server remembers for the next time. */
  pickAudio(track: AudioTrack) {
    if (track.index === this.audio?.index) return
    this.audio = track
    // A pick that doesn't reach the server is only for this sitting.
    void session.api.playback
      .pickTracks({ itemId: this.item.id, audio: track.index })
      .catch(() => {})
    this.ask({ at: this.now(), picks: { audio: track.index } })
  }

  /** Shows a subtitle track, or none for null, which the server remembers for the next time. */
  pickSubtitle(track: SubtitleTrack | null) {
    if ((track?.id ?? null) === (this.subtitle?.id ?? null)) return
    this.subtitle = track
    this.subtitleError = false
    const subtitle = { trackId: track?.id ?? null }
    void session.api.playback
      .pickTracks({ itemId: this.item.id, subtitle })
      .catch(() => {})
    this.ask({ at: this.now(), picks: { subtitle } })
  }

  pickQuality(id: PlaybackStartInput["quality"] & string) {
    if (id === this.quality) return
    this.quality = id
    this.ask({ at: this.now(), picks: { quality: id } })
  }

  pickSpeed(rate: number) {
    this.speed = rate
    this.engine.setSpeed(rate)
    this.changed()
  }

  /** Fills the screen with the picture, or shows it whole. */
  showFilled(fill: boolean) {
    this.engine.setFill(fill)
  }

  dismissNotice() {
    this.notice = null
    this.changed()
  }

  /** Tell the server where the viewer is; on play, pause, seek, close, and every so often. */
  report(closed = false) {
    if (!this.source) return
    this.lastReport = Date.now()
    const length =
      this.item.durationSeconds ?? (this.duration > 0 ? this.duration : null)
    void session.api.playback
      .report({
        itemId: this.item.id,
        positionSeconds: Math.max(
          0,
          this.ended && length ? length : this.now(),
        ),
        durationSeconds: length && length > 0 ? length : undefined,
        sessionId: this.opening.sessionId,
        playedSeconds: Math.max(0, this.playedSeconds),
        paused: !this.engine.playing(),
        closed: closed || undefined,
      })
      .catch(() => {
        // The next report says where the viewer is by then.
      })
  }

  release() {
    if (this.released) return
    this.report(true)
    this.released = true
    window.clearInterval(this.timer)
    this.engine.destroy()
  }
}
