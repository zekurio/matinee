/*
 * What plays the video. A TV's AVPlay decodes on its hardware and reads
 * nearly every file as it is; the browser's video element does what the
 * browser plays. The controller drives either through `Engine`.
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
