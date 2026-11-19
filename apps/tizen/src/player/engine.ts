import type { AVPlay, AVPlayState, AVPlayTrack } from "@/platform/tizen"

/*
 * What plays the video: Samsung's own player, AVPlay, on a TV, which
 * decodes on the TV's hardware and reads nearly every file as it is; or
 * the browser's video element where there's no AVPlay, as in a browser
 * during development. The controller drives either through `Engine`.
 */

/** What an engine is asked to play. */
export type EngineSource = {
  url: string
  /** The file as it is, one MP4 stream, or an HLS playlist. */
  kind: "file" | "mp4" | "hls"
  /** Where to start, in the source's own time. */
  startMs: number
  /**
   * Which of the file's audio tracks plays: its place among the `of`
   * tracks of the file the TV decodes. Null leaves it to the engine, as
   * for a stream, which has one.
   */
  audio: { ordinal: number; of: number } | null
  /** The widest picture the TV shows, for a player that has to be told. */
  maxWidth: number
  /** The session's token, for an engine that asks the server itself. */
  token: string | null
}

export type EngineFailure = {
  /** The server couldn't be reached, which says nothing of the format. */
  network: boolean
  /** What the engine called it, for the log. */
  detail: string
}

export type EngineListener = {
  /** Something an engine's getters answer has changed. */
  onChange: () => void
  onError: (failure: EngineFailure) => void
  /** The TV gave the player away while the app was out of sight: the source has to open again. */
  onLost: () => void
}

export type Engine = {
  /** The speeds it plays at. One that only plays at 1 offers no speed menu. */
  readonly speeds: readonly number[]
  load(source: EngineSource): void
  play(): void
  pause(): void
  seekTo(milliseconds: number): void
  setSpeed(rate: number): void
  selectAudio(audio: { ordinal: number; of: number }): void
  /** Fills the screen with the picture, or shows it whole. */
  setFill(fill: boolean): void
  /** Where it is, in the source's own time. */
  positionMs(): number
  /** The source's length, or null while unknown, as for a stream. */
  durationMs(): number | null
  bufferedMs(): number
  /** It plays, rather than being paused or ended. */
  playing(): boolean
  /** It waits for data, or for a source to open. */
  loading(): boolean
  ended(): boolean
  /** The app went to the background and came back. */
  suspend(): void
  resume(): void
  destroy(): void
}

/** The cookie the server reads a session from when a request has no token. */
const SESSION_COOKIE = "matinee_session"

/** How long a source may take to open before it counts as failed. */
const OPEN_TIMEOUT_MS = 30_000

/**
 * The browser's video element. The page must be on the server's own
 * origin, so the element's requests carry the session's cookie.
 */
export class VideoEngine implements Engine {
  readonly speeds = [0.5, 0.75, 1, 1.25, 1.5, 2]
  private readonly video: HTMLVideoElement
  private startMs = 0
  private failed = false
  /** The viewer means it to play, so a new source plays once it's loaded. */
  private wantsPlay = true

  constructor(host: HTMLElement, listener: EngineListener) {
    const video = document.createElement("video")
    video.className = "player-video"
    video.playsInline = true
    this.video = video
    host.append(video)
    const changed = () => listener.onChange()
    for (const event of [
      "playing",
      "pause",
      "waiting",
      "canplay",
      "seeked",
      "ended",
      "timeupdate",
      "progress",
      "durationchange",
    ]) {
      video.addEventListener(event, changed)
    }
    video.addEventListener("loadedmetadata", () => {
      if (this.startMs > 0) video.currentTime = this.startMs / 1000
      if (this.wantsPlay) this.play()
      changed()
    })
    video.addEventListener("error", () => {
      const code = video.error?.code
      if (code === undefined || code === MediaError.MEDIA_ERR_ABORTED) return
      this.failed = true
      listener.onError({
        network: code === MediaError.MEDIA_ERR_NETWORK,
        detail: `MediaError ${code}`,
      })
    })
  }

  load(source: EngineSource) {
    this.failed = false
    this.startMs = source.startMs
    this.video.src = source.url
    this.video.load()
  }

  play() {
    this.wantsPlay = true
    this.video.play().catch(() => {
      // Autoplay is held until the person presses something; they press play.
    })
  }

  pause() {
    this.wantsPlay = false
    this.video.pause()
  }

  seekTo(milliseconds: number) {
    this.video.currentTime = milliseconds / 1000
  }

  setSpeed(rate: number) {
    this.video.playbackRate = rate
  }

  selectAudio() {
    // A browser plays only a file's default track; the server never asks for another.
  }

  setFill(fill: boolean) {
    this.video.style.objectFit = fill ? "cover" : "contain"
  }

  positionMs(): number {
    return this.video.currentTime * 1000
  }

  durationMs(): number | null {
    const { duration } = this.video
    return Number.isFinite(duration) && duration > 0 ? duration * 1000 : null
  }

  bufferedMs(): number {
    const { buffered, currentTime } = this.video
    for (let index = 0; index < buffered.length; index += 1) {
      if (
        buffered.start(index) <= currentTime &&
        buffered.end(index) >= currentTime
      ) {
        return buffered.end(index) * 1000
      }
    }
    return currentTime * 1000
  }

  playing(): boolean {
    return !this.video.paused && !this.video.ended
  }

  loading(): boolean {
    return (
      !this.failed &&
      !this.video.ended &&
      this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA
    )
  }

  ended(): boolean {
    return this.video.ended
  }

  suspend() {
    this.pause()
  }

  resume() {
    // It stays paused, as on leaving.
  }

  destroy() {
    this.video.removeAttribute("src")
    this.video.load()
    this.video.remove()
  }
}

/** How far before where it was asked to start a source may be and still count as there. */
const START_SLACK_MS = 2_000

/** How long a seek may take before the player counts as free again. */
const SEEK_TIMEOUT_MS = 6_000

/** How often the audio track is looked for while AVPlay hasn't listed any yet. */
const AUDIO_TRIES = 40

/**
 * Samsung's AVPlay. There's one player for the whole TV, driven through
 * `webapis.avplay`: opened on an address, prepared, and then played,
 * paused, and sought. It draws on a plane behind the page, which shows
 * through wherever the page is see-through.
 *
 * AVPlay throws on a call its state doesn't allow, and some TVs do worse,
 * so the order of the calls follows Samsung's reference and what the
 * Litefin client learned across model years:
 *
 * - Properties and the display go in after `open` and before
 *   `prepareAsync`.
 * - Nothing else is called between `seekTo` and its answer.
 * - A seek goes out only while AVPlay plays or is paused, which Litefin
 *   found to be the only states every model seeks in. So a source that
 *   starts partway in plays first and goes there with its first frame,
 *   behind a black cover; in any other state the source opens again.
 * - An audio track is picked only while it plays, and again after every
 *   seek, which can put the first track back.
 */
export class AvplayEngine implements Engine {
  // AVPlay's other speeds are trick modes without sound, so it offers none.
  readonly speeds = [1]
  private readonly plane: HTMLElement
  /** Black over the picture while a source finds the place it starts at. */
  private readonly cover: HTMLElement
  /** Counts the sources, so an answer for an older one is dropped. */
  private generation = 0
  private source: EngineSource | null = null
  private prepared = false
  private wantsPlay = true
  private isPlaying = false
  private isLoading = false
  private isEnded = false
  private position = 0
  private duration: number | null = null
  private fill = false
  /** A seek is out: `to` is where the newest one asked to go. */
  private seeking: { to: number; again: boolean } | null = null
  /** Where the source should have started, until the first time it says where it is. */
  private startCheck: number | null = null
  /** The audio track to pick once it plays, and how often it was looked for. */
  private audio: { ordinal: number; of: number; tries: number } | null = null
  private audioWanted: { ordinal: number; of: number } | null = null
  /** AVPlay was told, while playing, not to draw subtitles of its own. */
  private silenced = false
  private suspendedAt: number | null = null
  /** The app left while the source was still opening, so nothing is open. */
  private lost = false
  /** A source has opened on this TV, so the way the session is sent works. */
  private everOpened = false
  private failures = 0
  private watchdog = 0
  private seekTimer = 0

  constructor(
    host: HTMLElement,
    private readonly avplay: AVPlay,
    private readonly listener: EngineListener,
  ) {
    // The element AVPlay's plane shows through.
    const plane = document.createElement("object")
    plane.type = "application/avplayer"
    plane.className = "player-video"
    this.plane = plane
    const cover = document.createElement("div")
    cover.className = "player-cover"
    this.cover = cover
    host.append(plane, cover)
  }

  private covered(on: boolean) {
    this.cover.style.display = on ? "block" : "none"
  }

  /** Calls AVPlay, which throws on a call its state doesn't allow. False when it did. */
  private attempt(call: () => void): boolean {
    try {
      call()
      return true
    } catch {
      // The state moved on under the call, as when a source failed meanwhile.
      return false
    }
  }

  /** AVPlay's state, or NONE when it won't say. */
  private state(): AVPlayState {
    try {
      return this.avplay.getState()
    } catch {
      return "NONE"
    }
  }

  private fail(detail: string, network = false) {
    window.clearTimeout(this.watchdog)
    window.clearTimeout(this.seekTimer)
    this.seeking = null
    this.isLoading = false
    this.isPlaying = false
    this.covered(false)
    if (!this.everOpened) this.failures += 1
    this.listener.onError({ network, detail })
  }

  /**
   * Hands AVPlay the session. It asks the server itself, and takes no
   * token the way the app's own calls send one, so the session goes in
   * the cookie the server also reads. Until a source has opened on this
   * TV, a second try sends the token as a header too, through the
   * property Samsung keeps for what a streaming engine needs, in case
   * this model drops the cookie.
   */
  private sendSession(token: string) {
    const { avplay } = this
    this.attempt(() =>
      avplay.setStreamingProperty("COOKIE", `${SESSION_COOKIE}=${token}`),
    )
    if (!this.everOpened && this.failures > 0) {
      this.attempt(() =>
        avplay.setStreamingProperty(
          "CUSTOM_MESSAGE",
          `Authorization: Bearer ${token}\r\n`,
        ),
      )
    }
  }

  load(source: EngineSource) {
    this.generation += 1
    const mine = this.generation
    this.source = source
    this.prepared = false
    this.isPlaying = false
    this.isEnded = false
    this.isLoading = true
    this.seeking = null
    this.suspendedAt = null
    this.lost = false
    this.silenced = false
    this.position = source.startMs
    this.duration = null
    this.startCheck = source.startMs > START_SLACK_MS ? source.startMs : null
    this.covered(this.startCheck !== null)
    this.audioWanted = source.audio
    this.audio = source.audio && { ...source.audio, tries: 0 }
    window.clearTimeout(this.seekTimer)
    const { avplay } = this
    this.attempt(() => avplay.stop())
    this.attempt(() => avplay.close())
    try {
      avplay.open(source.url)
      avplay.setListener({
        onbufferingstart: () => {
          if (mine !== this.generation) return
          this.isLoading = true
          this.listener.onChange()
        },
        onbufferingcomplete: () => {
          if (mine !== this.generation) return
          this.isLoading = false
          this.listener.onChange()
        },
        oncurrentplaytime: (milliseconds) => {
          if (mine !== this.generation || this.seeking) return
          this.onTime(milliseconds)
        },
        onstreamcompleted: () => {
          if (mine !== this.generation) return
          this.isEnded = true
          this.isPlaying = false
          this.attempt(() => avplay.stop())
          this.listener.onChange()
        },
        onerror: (type) => {
          if (mine !== this.generation) return
          this.fail(type, type === "PLAYER_ERROR_CONNECTION_FAILED")
        },
      })
      if (source.token) this.sendSession(source.token)
      // AVPlay would draw a file's default subtitle itself; the app draws its own.
      this.attempt(() => avplay.setSilentSubtitle(true))
      if (source.kind === "hls" && source.maxWidth > 1920) {
        // An adaptive stream stays at full HD unless AVPlay is told the
        // most it may be, before it sets its decoder up.
        // Never more than 4K: Litefin found 8K to stop some models' HLS.
        this.attempt(() =>
          avplay.setStreamingProperty(
            "ADAPTIVE_INFO",
            "FIXED_MAX_RESOLUTION=3840x2160|STARTBITRATE=HIGHEST",
          ),
        )
      }
      this.applyDisplay()
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : "open failed")
      return
    }
    // A file AVPlay can't make sense of can leave it preparing for good.
    window.clearTimeout(this.watchdog)
    this.watchdog = window.setTimeout(() => {
      if (mine === this.generation && !this.prepared) {
        this.fail("prepare timed out")
      }
    }, OPEN_TIMEOUT_MS)
    const onPrepared = () => {
      if (mine !== this.generation) return
      window.clearTimeout(this.watchdog)
      this.prepared = true
      this.everOpened = true
      const length = this.avplay.getDuration()
      this.duration = length > 0 ? length : null
      // Some models forget the display once prepared.
      this.applyDisplay()
      if (this.wantsPlay) this.play()
      else this.isLoading = false
      this.listener.onChange()
    }
    try {
      avplay.prepareAsync(onPrepared, (cause) => {
        if (mine === this.generation) {
          this.fail(cause.message || "prepare failed")
        }
      })
    } catch (cause) {
      this.fail(cause instanceof Error ? cause.message : "prepare failed")
    }
  }

  /** AVPlay says where it is, which it only does while it plays. */
  private onTime(milliseconds: number) {
    const wanted = this.startCheck
    this.startCheck = null
    // Its first frame: now that it plays, it goes where it should start.
    if (wanted !== null && milliseconds + START_SLACK_MS < wanted) {
      this.seekTo(wanted)
      return
    }
    if (!this.silenced) {
      // Again now that it plays, for a model that only listens then.
      this.silenced = this.attempt(() => this.avplay.setSilentSubtitle(true))
    }
    this.covered(false)
    this.position = milliseconds
    this.isLoading = false
    this.pickAudio()
    this.listener.onChange()
  }

  /**
   * Picks the audio track asked for, among those AVPlay lists, which are
   * the ones it decodes, in the file's order. When what it lists isn't
   * what the file should have, there's no telling which is which, and the
   * source counts as failed, so the server sends a stream with the track
   * in it.
   */
  private pickAudio() {
    const wanted = this.audio
    if (!wanted || this.seeking || this.state() !== "PLAYING") return
    const { avplay } = this
    let tracks: AVPlayTrack[] = []
    this.attempt(() => {
      tracks = avplay
        .getTotalTrackInfo()
        .filter((info) => info.type === "AUDIO")
    })
    if (tracks.length === 0) {
      // Not read yet, on some models. A file that never lists any plays its own choice.
      wanted.tries += 1
      if (wanted.tries >= AUDIO_TRIES) this.audio = null
      return
    }
    this.audio = null
    const track = tracks[wanted.ordinal]
    if (tracks.length !== wanted.of || !track) {
      this.fail("audio tracks don't match the file's")
      return
    }
    let current: number | null = null
    this.attempt(() => {
      const playing = avplay
        .getCurrentStreamInfo()
        .find((info) => info.type === "AUDIO")
      current = playing ? Number(playing.index) : null
    })
    if (current === Number(track.index)) return
    this.attempt(() => avplay.setSelectTrack("AUDIO", Number(track.index)))
  }

  /** The whole screen, in AVPlay's own 1920 by 1080, whatever the page's size. */
  private applyDisplay() {
    const { avplay } = this
    this.attempt(() => avplay.setDisplayRect(0, 0, 1920, 1080))
    this.attempt(() =>
      avplay.setDisplayMethod(
        this.fill
          ? "PLAYER_DISPLAY_MODE_FULL_SCREEN"
          : "PLAYER_DISPLAY_MODE_LETTER_BOX",
      ),
    )
  }

  play() {
    this.wantsPlay = true
    if (!this.prepared || this.seeking) return
    const { avplay } = this
    if (this.isEnded) {
      // It was stopped at its end, so it opens again from the start.
      const source = this.source
      if (source) this.load({ ...source, startMs: 0 })
      return
    }
    if (this.attempt(() => avplay.play())) this.isPlaying = true
    this.listener.onChange()
  }

  pause() {
    this.wantsPlay = false
    // A seek that's out pauses when it answers.
    if (!this.prepared || this.seeking) return
    const { avplay } = this
    if (this.isPlaying && this.attempt(() => avplay.pause())) {
      this.isPlaying = false
    }
    this.listener.onChange()
  }

  seekTo(milliseconds: number) {
    const source = this.source
    if (!this.prepared || !source) return
    const to = Math.max(0, Math.round(milliseconds))
    this.position = to
    this.startCheck = null
    // A seek while one is out waits for it, and only the newest goes.
    if (this.seeking) {
      this.seeking = { to, again: true }
      return
    }
    const state = this.state()
    if (state !== "PLAYING" && state !== "PAUSED") {
      // Stopped at its end, or prepared and never played: it opens there.
      this.load({ ...source, startMs: to })
      return
    }
    this.isEnded = false
    this.seeking = { to, again: false }
    this.isLoading = true
    const mine = this.generation
    const { avplay } = this
    const settled = () => {
      window.clearTimeout(this.seekTimer)
      if (mine !== this.generation) return
      const asked = this.seeking
      if (!asked) return
      this.seeking = null
      if (asked.again) {
        this.seekTo(asked.to)
        return
      }
      this.isLoading = false
      this.covered(false)
      // A seek can put the file's first audio track back.
      if (this.audioWanted) this.audio = { ...this.audioWanted, tries: 0 }
      if (this.wantsPlay) this.play()
      else if (this.isPlaying && this.attempt(() => avplay.pause())) {
        this.isPlaying = false
      }
      this.listener.onChange()
    }
    // Some models never answer a seek, which would leave the player deaf to every key.
    window.clearTimeout(this.seekTimer)
    this.seekTimer = window.setTimeout(settled, SEEK_TIMEOUT_MS)
    if (!this.attempt(() => avplay.seekTo(to, settled, settled))) settled()
    this.listener.onChange()
  }

  setSpeed() {
    // One speed; see `speeds`.
  }

  selectAudio(audio: { ordinal: number; of: number }) {
    this.audioWanted = audio
    this.audio = { ...audio, tries: 0 }
    // It's picked the next time AVPlay says where it is, which is while it plays.
  }

  setFill(fill: boolean) {
    this.fill = fill
    if (this.source) this.applyDisplay()
  }

  positionMs(): number {
    return this.position
  }

  durationMs(): number | null {
    return this.duration
  }

  bufferedMs(): number {
    // AVPlay doesn't say how far it has read.
    return this.position
  }

  playing(): boolean {
    return this.isPlaying
  }

  loading(): boolean {
    return this.isLoading
  }

  ended(): boolean {
    return this.isEnded
  }

  /**
   * The app leaves the screen. Samsung asks that AVPlay is suspended
   * then, which frees the TV's decoder for whatever shows next. It's
   * paused first, so it comes back paused.
   */
  suspend() {
    if (this.suspendedAt !== null || this.lost || !this.source) return
    this.wantsPlay = false
    const { avplay } = this
    if (this.isEnded) {
      // Stopped at its end already. Playing it again opens it again.
      this.attempt(() => avplay.close())
      return
    }
    if (!this.prepared || this.seeking) {
      // Nothing to come back to as it is: it opens again on return.
      this.generation += 1
      window.clearTimeout(this.watchdog)
      window.clearTimeout(this.seekTimer)
      this.seeking = null
      this.attempt(() => avplay.stop())
      this.attempt(() => avplay.close())
      this.prepared = false
      this.lost = true
      this.isPlaying = false
      this.isLoading = false
      this.listener.onChange()
      return
    }
    if (this.isPlaying) this.attempt(() => avplay.pause())
    this.isPlaying = false
    this.suspendedAt = this.position
    this.attempt(() => avplay.suspend())
    this.listener.onChange()
  }

  /** The app is back. A TV that gave the player away meanwhile says so, and the source opens again. */
  resume() {
    if (this.lost) {
      this.lost = false
      this.listener.onLost()
      return
    }
    const at = this.suspendedAt
    const source = this.source
    if (at === null || !source) return
    this.suspendedAt = null
    const { avplay } = this
    // Not preparing it again is what puts the picture back; see Litefin's notes.
    const restored = this.attempt(() => avplay.restore(source.url, at, false))
    const state = this.state()
    if (!restored || (state !== "PAUSED" && state !== "PLAYING")) {
      this.prepared = false
      this.listener.onLost()
      return
    }
    // It comes back as it left, which was paused, unless this model plays on.
    this.isPlaying = state === "PLAYING"
    if (this.isPlaying && this.attempt(() => avplay.pause())) {
      this.isPlaying = false
    }
    this.applyDisplay()
    this.listener.onChange()
  }

  destroy() {
    this.generation += 1
    window.clearTimeout(this.watchdog)
    window.clearTimeout(this.seekTimer)
    const { avplay } = this
    this.attempt(() => avplay.stop())
    this.attempt(() => avplay.close())
    this.plane.remove()
  }
}
