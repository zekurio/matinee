import type { MediaItem, MediaSegment, SubtitleTrack } from "@matinee/contracts"
import { trickplayTilePath } from "@matinee/contracts/paths"
import {
  AudioLines,
  Captions,
  type IconNode,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
} from "lucide"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"

import { usePicture } from "@/api/images"
import { Page } from "@/app/page"
import { useApp, useLoader } from "@/app/scope"
import { type StringKey, tr } from "@/i18n"
import { focused, focusOn } from "@/input/focus"
import { type RemoteKey } from "@/input/keys"
import { useBack, useKeyTap, useRefocus } from "@/input/navigation"
import { cx, Icon, Spinner, Tap } from "@/kit/base"
import {
  Button,
  IconButton,
  ListHeading,
  ListItem,
  RoundButton,
} from "@/kit/buttons"
import { SidePanel } from "@/kit/panel"
import { useObserved } from "@/lib/observable"
import {
  formatClock,
  itemLabel,
  languageName,
  qualityLabel,
} from "@/model/format"
import { holdScreenSaver } from "@/platform/tizen"
import {
  type Notice,
  openPlayer,
  ORIGINAL_QUALITY,
  PlayerController,
  type PlayerData,
} from "@/player/controller"
import type { Cue } from "@/player/cues"
import { hasAvplay, playbackDevice } from "@/player/device"
import { AvplayEngine, type Engine, VideoEngine } from "@/player/engine"
import { playerPrefs } from "@/player/prefs"

/* The player on a TV: the video, drawn for a remote. */

/** How long the controls stay once nothing is pressed. */
const HIDE_AFTER_MS = 3500
/** How long the skip button shows by itself once its segment starts. */
const SKIP_SHOWN_MS = 8000
/** Seconds the next episode waits once the file ended. */
const UP_NEXT_SECONDS = 10
const NOTICE_MS = 5000

type Menu = "audio" | "subtitles" | "settings"

/** Why nothing plays, with Try again focused and Back beside it. Without `retry`, only Back. */
function Failure(props: {
  title: string
  message: string | null
  retry: (() => void) | null
}) {
  const { nav } = useApp()
  return (
    <Page
      class="fill player-failure"
      start={() => ["failure", props.retry ? "retry" : "back"]}
    >
      <div class="t-headline">{props.title}</div>
      {props.message && (
        <div
          class="t-body muted"
          style={{ marginTop: "8rem", maxWidth: "560rem" }}
        >
          {props.message}
        </div>
      )}
      <div class="player-failure-buttons" data-fg="failure" data-fk="row">
        {props.retry && (
          <Button
            fid="retry"
            label={tr("commonRetry")}
            icon={RefreshCw}
            onPress={props.retry}
          />
        )}
        <Button
          fid="back"
          label={tr("playerBack")}
          onPress={() => nav.back()}
        />
      </div>
    </Page>
  )
}

function refusalTitle(refusal: "restricted" | "busy"): string {
  return tr(refusal === "restricted" ? "playerRestricted" : "playerBusy")
}

/** The player's page: it asks the server how the file plays, then plays it. */
export function PlayerPage(props: { itemId: string; start?: number }) {
  const prefs = playerPrefs.value
  // Each time the player opens is a sitting of its own, which asks anew.
  const data = useLoader<PlayerData>(
    "player",
    () =>
      openPlayer(
        props.itemId,
        playbackDevice(prefs.videoCodec),
        prefs.quality === ORIGINAL_QUALITY
          ? undefined
          : qualityOf(prefs.quality),
        props.start,
      ),
    { pinned: true },
  )
  // The video's plane is behind the page, which lets it through while the player shows.
  useLayoutEffect(() => {
    document.body.classList.add("playing")
    holdScreenSaver(true)
    return () => {
      document.body.classList.remove("playing")
      holdScreenSaver(false)
    }
  }, [])
  const { state } = data
  if (state.kind === "loading") {
    return (
      <Page class="fill center player-black">
        <Spinner size={56} class="accent" />
      </Page>
    )
  }
  if (state.kind === "failed") {
    return (
      <div class="fill player-black">
        <Failure
          title={tr("playerLoadFailed")}
          message={state.message}
          retry={() => data.reload()}
        />
      </div>
    )
  }
  const value = state.value
  if (value.kind === "unplayable") {
    return (
      <div class="fill player-black">
        <Failure
          title={tr("playerErrorLost")}
          message={tr("playerUnplayable")}
          retry={() => data.reload()}
        />
      </div>
    )
  }
  if (value.kind === "refused") {
    // Asking again gets the same answer, so there's nothing to try.
    return (
      <div class="fill player-black">
        <Failure
          title={refusalTitle(value.refusal)}
          message={value.message}
          retry={null}
        />
      </div>
    )
  }
  return <Playback data={value} />
}

/** A saved quality as the contract's, which the server narrows to one it offers. */
function qualityOf(saved: string): Parameters<typeof openPlayer>[2] {
  // SAFETY: Only ids from the server's own ladder are ever saved, and the
  // server turns down one it no longer knows.
  return saved as Parameters<typeof openPlayer>[2]
}

/**
 * Where left and right on a remote have taken the seek bar. A press steps
 * by the skip length; a held key glides on from there, faster the longer
 * it's held, up to a tenth of the video a second. The player seeks once,
 * to the target, when the key comes up.
 */
class KeySeek {
  target: number | null = null
  private heldSince = 0
  private last = 0

  press(
    from: number,
    direction: number,
    step: number,
    duration: number,
    repeat: boolean,
    at: number,
  ): number | null {
    if (!(duration > 0) || direction === 0) return null
    const start = this.target
    const sign = direction < 0 ? -1 : 1
    let next: number
    if (start === null || !repeat) {
      this.heldSince = at
      next = (start ?? from) + sign * step
    } else {
      const held = (at - this.heldSince) / 1000
      const base = step * 3
      const rate = Math.min(
        base * 2 ** (held / 1.5),
        Math.max(duration * 0.1, base),
      )
      next =
        start +
        (sign * rate * Math.max(0, Math.min(at - this.last, 250))) / 1000
    }
    this.last = at
    this.target = Math.max(0, Math.min(next, duration))
    return this.target
  }

  /** The key came up: where to seek, if the keys moved. */
  release(): number | null {
    const target = this.target
    this.target = null
    return target
  }
}

/** A track's language, plus its own title when that adds something. */
function trackLabel(
  language: string | null,
  title: string | null,
  unnamed: string,
): string {
  const name = language ? languageName(language) : null
  if (!title || title.trim() === "") return name ?? unnamed
  if (!name || title.toLowerCase().includes(name.toLowerCase())) return title
  return tr("playerTrackWithTitle", name, title)
}

function subtitleLabel(
  track: SubtitleTrack,
  tracks: readonly SubtitleTrack[],
): string {
  if (track.source !== "embedded") {
    return trackLabel(
      track.language,
      track.title,
      tr("playerTrackUnknownLanguage"),
    )
  }
  const position =
    tracks.filter((each) => each.source === "embedded").indexOf(track) + 1
  return trackLabel(
    track.language,
    track.title,
    tr("playerTrackUnnamed", position),
  )
}

/** One line of a player menu: a heading, a note, or a choice. */
type MenuEntry =
  | { kind: "heading"; key: string; text: string }
  | { kind: "note"; key: string; text: string }
  | {
      kind: "choice"
      key: string
      title: string
      detail?: string | null
      selected: boolean
      disabled?: boolean
      pick: () => void
    }

/**
 * What a menu offers: the tracks and qualities the server answered, the
 * speeds, and how the picture fills the screen, each marked when it's the
 * current one.
 */
function menuEntries(menu: Menu, controller: PlayerController): MenuEntry[] {
  if (menu === "audio") {
    return controller.audioTracks.length === 0
      ? [{ kind: "note", key: "none", text: tr("playerAudioNoTracks") }]
      : controller.audioTracks.map((track) => ({
          kind: "choice",
          key: `audio-${track.index}`,
          title: trackLabel(
            track.language,
            track.title,
            tr("playerTrackUnnamed", track.index),
          ),
          detail: [track.format, track.layout].filter(Boolean).join(" · "),
          selected: track.index === controller.audio?.index,
          pick: () => controller.pickAudio(track),
        }))
  }
  if (menu === "subtitles") {
    return [
      {
        kind: "choice",
        key: "off",
        title: tr("playerSubtitlesOff"),
        selected: controller.subtitle === null,
        pick: () => controller.pickSubtitle(null),
      },
      ...controller.subtitles.map((track): MenuEntry => ({
        kind: "choice",
        key: `subtitle-${track.id}`,
        title: subtitleLabel(track, controller.subtitles),
        detail: [
          track.forced ? tr("playerSubtitlesForced") : null,
          track.sdh ? "SDH" : null,
          track.format,
          track.delivery !== null && controller.burnsIn(track)
            ? tr("playerSubtitlesBurnedIn")
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        selected: track.id === controller.subtitle?.id,
        disabled: track.delivery === null,
        pick: () => controller.pickSubtitle(track),
      })),
      ...(controller.subtitleError
        ? [
            {
              kind: "note" as const,
              key: "error",
              text: tr("playerErrorSubtitles"),
            },
          ]
        : []),
    ]
  }
  const fill = playerPrefs.value.fillScreen
  return [
    { kind: "heading", key: "quality", text: tr("playerQuality") },
    // A file over the account's bit rate limit plays only as an encode.
    ...(controller.offersOriginal
      ? [
          {
            kind: "choice" as const,
            key: "quality-original",
            title: tr("playerQualityOriginal"),
            selected: controller.quality === ORIGINAL_QUALITY,
            pick: () => controller.pickQuality(ORIGINAL_QUALITY),
          },
        ]
      : []),
    ...controller.qualities.map((quality): MenuEntry => ({
      kind: "choice",
      key: `quality-${quality.id}`,
      title: qualityLabel(quality),
      selected: controller.quality === quality.id,
      pick: () => controller.pickQuality(quality.id),
    })),
    // An engine with one speed has none to pick.
    ...(controller.speeds.length > 1
      ? [
          { kind: "heading" as const, key: "speed", text: tr("playerSpeed") },
          ...controller.speeds.map((rate): MenuEntry => ({
            kind: "choice",
            key: `speed-${rate}`,
            title:
              rate === 1
                ? tr("playerSpeedNormal")
                : tr("playerSpeedRate", String(rate)),
            selected: controller.speed === rate,
            pick: () => controller.pickSpeed(rate),
          })),
        ]
      : []),
    { kind: "heading", key: "picture", text: tr("playerPicture") },
    {
      kind: "choice",
      key: "picture-fit",
      title: tr("playerFit"),
      selected: !fill,
      pick: () => playerPrefs.set({ fillScreen: false }),
    },
    {
      kind: "choice",
      key: "picture-fill",
      title: tr("playerFill"),
      selected: fill,
      pick: () => playerPrefs.set({ fillScreen: true }),
    },
  ]
}

const MENU_NAMES = {
  audio: "playerMenuAudio",
  subtitles: "playerMenuSubtitles",
  settings: "playerMenuSettings",
} satisfies Record<Menu, StringKey>

/** A menu as the TV's right-edge panel, over the dimmed picture, focus on the current choice. */
function MenuPanel(props: {
  open: Menu | null
  controller: PlayerController
  onDismiss: () => void
}) {
  // The menu that was open stays drawn while the panel slides away.
  const last = useRef<Menu | null>(null)
  if (props.open) last.current = props.open
  const menu = last.current
  const entries = menu ? menuEntries(menu, props.controller) : []
  const picked = entries.find(
    (entry) => entry.kind === "choice" && entry.selected && !entry.disabled,
  )
  return (
    <SidePanel
      open={props.open !== null}
      title={menu ? tr(MENU_NAMES[menu]) : null}
      onBack={props.onDismiss}
      initial={picked?.key}
      focusKey={menu ?? undefined}
    >
      {entries.map((entry, index) =>
        entry.kind === "heading" ? (
          <ListHeading
            key={entry.key}
            text={entry.text}
            top={index > 0 ? 20 : 0}
          />
        ) : entry.kind === "note" ? (
          <div
            key={entry.key}
            class="t-body muted"
            style={{ padding: "8rem 20rem" }}
          >
            {entry.text}
          </div>
        ) : (
          <ListItem
            key={entry.key}
            fid={entry.key}
            title={entry.title}
            subtitle={entry.detail || null}
            quiet
            disabled={entry.disabled}
            checked={entry.selected}
            onPress={() => {
              entry.pick()
              props.onDismiss()
            }}
          />
        ),
      )}
    </SidePanel>
  )
}

/** The frame at `seconds` from the server's trickplay tiles, `width` units wide. */
function TrickplayFrame(props: {
  controller: PlayerController
  seconds: number
  width: number
}) {
  const images = props.controller.trickplay
  const perTile = images ? images.columns * images.rows : 1
  const index = images
    ? Math.max(
        0,
        Math.min(
          Math.floor(props.seconds / images.intervalSeconds),
          images.count - 1,
        ),
      )
    : 0
  const tile = Math.floor(index / perTile)
  const picture = usePicture(
    images
      ? trickplayTilePath(props.controller.item.id, images.key, tile)
      : null,
  )
  if (!images) return null
  const cell = index % perTile
  const height = (props.width * images.height) / images.width
  return (
    <div
      class="trickplay"
      style={{
        width: `${props.width}rem`,
        height: `${height}rem`,
        backgroundImage: picture.src ? `url("${picture.src}")` : undefined,
        backgroundSize: `${images.columns * 100}% ${images.rows * 100}%`,
        backgroundPosition: `${(cell % images.columns) * -props.width}rem ${Math.floor(cell / images.columns) * -height}rem`,
      }}
    />
  )
}

/** One line of a skip arrow's icon, with how far it skips in its middle. */
function SkipIcon(props: { icon: IconNode; seconds: number }) {
  return (
    <span class="skip-icon center">
      <Icon icon={props.icon} size={28} />
      <b>{props.seconds}</b>
    </span>
  )
}

/** The cues showing now, drawn over the video, raised above the controls while they show. */
function Subtitles(props: { cues: readonly Cue[]; lifted: boolean }) {
  const prefs = useObserved(playerPrefs).value
  if (props.cues.length === 0) return null
  return (
    <div
      class={cx(
        "subtitles",
        props.lifted && "lifted",
        `sub-${prefs.subtitleColor}`,
        `sub-bg-${prefs.subtitleBackground}`,
        `sub-edge-${prefs.subtitleEdge}`,
      )}
      style={{ fontSize: `${20 * prefs.subtitleScale}rem` }}
    >
      {props.cues.map((cue) => (
        <div key={`${cue.start}-${cue.end}`} class="subtitle-line">
          <span>
            {cue.spans.map((span, index) => (
              <span
                key={index}
                style={{
                  fontStyle: span.italic ? "italic" : undefined,
                  fontWeight: span.bold ? 700 : undefined,
                  textDecoration: span.underline ? "underline" : undefined,
                }}
              >
                {span.text}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

/** A note over the picture about the last answer, for a few seconds. */
function NoticeNote(props: { notice: Notice | null; onDone: () => void }) {
  const { notice } = props
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(props.onDone, NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])
  if (!notice) return null
  const detail =
    notice.kind === "burnInFailed"
      ? tr("playerNoticeBurnInFailedDetail")
      : notice.kind === "qualityFailed"
        ? tr("playerNoticeQualityFailedDetail")
        : notice.detail
  return (
    <div class="player-notice">
      <div class="t-facts">
        {tr(
          notice.kind === "burnInFailed"
            ? "playerNoticeBurnInFailed"
            : "playerNoticeSwitchFailed",
        )}
      </div>
      {detail && <div class="t-caption dim85">{detail}</div>}
    </div>
  )
}

function skipLabel(kind: MediaSegment["kind"]): string {
  switch (kind) {
    case "recap":
      return tr("playerSkipRecap")
    case "credits":
      return tr("playerSkipCredits")
    case "preview":
      return tr("playerSkipPreview")
    case "intro":
      return tr("playerSkipIntro")
  }
}

/** The one thing to do now that the player offers by itself, like the next episode or Skip intro. */
type PictureAction = {
  label: string
  countdown: number | null
  run: () => void
}

/**
 * Plays for a remote.
 *
 * With the controls away, left and right skip and glide while held,
 * Select, up, and down bring the controls with focus on play, and the
 * media keys work at any time. With them showing, the arrows move focus.
 * Back closes a menu, then the controls, then the player. Every key press
 * keeps the controls up a while longer; a menu or a seek keeps them up.
 */
function Playback(props: { data: Extract<PlayerData, { kind: "ready" }> }) {
  const { user, nav, viewer } = useApp()
  const host = useRef<HTMLDivElement>(null)
  const [controller, setController] = useState<PlayerController | null>(null)
  const prefs = useObserved(playerPrefs).value

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return
    let made: PlayerController | null = null
    const listener = {
      onChange: () => made?.sync(),
      onError: (failure: Parameters<PlayerController["fallBack"]>[0]) =>
        made?.fallBack(failure),
      onLost: () => made?.reopen(),
    }
    const avplay = window.webapis?.avplay
    const engine: Engine =
      hasAvplay() && avplay
        ? new AvplayEngine(element, avplay, listener)
        : new VideoEngine(element, listener)
    engine.setFill(playerPrefs.value.fillScreen)
    made = new PlayerController(props.data.opening, props.data.device, engine)
    made.start()
    setController(made)
    // A TV has no picture in picture: leaving pauses.
    const playing = made
    const onVisibility = () => {
      if (document.hidden) playing.suspend()
      else playing.resume()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      playing.release()
      // What was watched moved: pages fetch again.
      viewer.touch()
    }
  }, [])

  return (
    <div class="fill">
      <div ref={host} class="fill" />
      {controller && (
        <Controls
          controller={controller}
          back={user.playback?.skipBackSeconds ?? 10}
          ahead={user.playback?.skipForwardSeconds ?? 10}
          autoplay={prefs.autoplayNext}
          fill={prefs.fillScreen}
          onClose={() => nav.back()}
          onEpisode={(item) => nav.playInstead(item.id)}
        />
      )}
    </div>
  )
}

function Controls(props: {
  controller: PlayerController
  back: number
  ahead: number
  autoplay: boolean
  fill: boolean
  onClose: () => void
  onEpisode: (item: MediaItem) => void
}) {
  const controller = useObserved(props.controller)
  const { back, ahead } = props
  const root = useRef<HTMLDivElement>(null)
  const [controls, setControls] = useState(true)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [touched, setTouched] = useState(0)
  const keySeek = useRef(new KeySeek())
  // Keys held across events: the arrow gliding the seek bar, and a key
  // whose release the screen already answered.
  const held = useRef<{ seeking: RemoteKey | null; swallow: RemoteKey | null }>(
    {
      seeking: null,
      swallow: null,
    },
  )
  // The controls came up for a held arrow, so focus goes to the seek bar.
  const focusSeek = useRef(false)

  useEffect(() => {
    controller.showFilled(props.fill)
  }, [props.fill])

  // An episode's neighbours, for the buttons beside the skips and the media keys.
  const show = controller.item.title?.kind === "show"
  const previous = show ? controller.previous : null
  const following = show ? controller.next : null

  // Once the credits start or the file ends: the next episode, counting down.
  const upcoming = controller.offersNext ? controller.next : null
  const [cancelled, setCancelled] = useState(!props.autoplay)
  const [left, setLeft] = useState(UP_NEXT_SECONDS)
  // Offered before the file ended, it counts down to the end and starts there.
  const early = useRef(false)
  useEffect(() => {
    if (upcoming) early.current = !controller.ended
  }, [upcoming?.id])
  useEffect(() => {
    if (!upcoming || cancelled || !controller.ended) return
    if (early.current || left <= 0) {
      props.onEpisode(upcoming)
      return
    }
    const timer = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [upcoming?.id, cancelled, controller.ended, left])
  // Back took its button off the picture. It stays with the controls.
  const [nextAway, setNextAway] = useState(false)

  // Otherwise Skip intro, or the like, while the video is in a segment the server found.
  const segment = controller.segment
  const segmentKey = segment ? `${segment.kind}-${segment.start}` : null
  const [fresh, setFresh] = useState(true)
  const [skipAway, setSkipAway] = useState(false)
  useEffect(() => {
    setFresh(true)
    setSkipAway(false)
    if (!segmentKey) return
    const timer = window.setTimeout(() => setFresh(false), SKIP_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [segmentKey])

  const action: PictureAction | null = upcoming
    ? {
        label: tr("playerNextEpisode"),
        countdown: cancelled
          ? null
          : controller.ended
            ? left
            : Math.max(0, Math.ceil(controller.duration - controller.position)),
        run: () => props.onEpisode(upcoming),
      }
    : segment && (fresh || controls)
      ? {
          label: skipLabel(segment.kind),
          countdown: null,
          run: () => controller.skipSegment(segment),
        }
      : null
  const away = upcoming ? nextAway : skipAway
  // The button shows alone on the picture, and takes focus there.
  const onPicture = action !== null && !away && !controls
  // A file that ended with nothing after it brings the controls.
  const visible = controls || (controller.ended && !upcoming)

  useEffect(() => {
    if (!controls || !controller.playing || menu !== null || scrub !== null)
      return
    const timer = window.setTimeout(() => setControls(false), HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [controls, controller.playing, menu, scrub, touched])

  const leaf = (name: string) =>
    root.current?.querySelector<HTMLElement>(`[data-f="${name}"]`) ?? null

  // Focus follows the controls: on play, the seek bar after a held arrow,
  // or the button for the next episode, as they come; on that button or
  // the screen itself, which takes the keys, as they go.
  const hasAction = action !== null && !away
  useEffect(() => {
    if (menu !== null) return
    if (!visible) {
      focusOn(leaf(onPicture ? "corner" : "screen"))
      return
    }
    const target = focusSeek.current ? "seek" : hasAction ? "action" : "play"
    focusSeek.current = false
    if (!focusOn(leaf(target))) focusOn(leaf("play"))
  }, [visible, onPicture, menu === null])
  // A file that ends with the controls up hands focus to the button.
  useEffect(() => {
    if (upcoming && controls && menu === null) focusOn(leaf("action"))
  }, [upcoming?.id])
  useRefocus(() => {
    focusOn(leaf(visible ? "play" : onPicture ? "corner" : "screen"))
  }, menu === null)

  const press = (direction: number, repeat: boolean, at: number) => {
    const target = keySeek.current.press(
      scrub ?? controller.position,
      direction,
      direction < 0 ? back : ahead,
      controller.duration,
      repeat,
      at,
    )
    if (target !== null) setScrub(target)
  }
  const release = () => {
    const target = keySeek.current.release()
    if (target !== null) controller.seekTo(target)
    setScrub(null)
  }
  const openMenu = (which: Menu) => {
    setControls(true)
    setMenu(which)
  }

  useKeyTap((key, phase, event) => {
    const down = phase === "down"
    if (down) setTouched((count) => count + 1)
    if (!down && held.current.swallow === key) {
      held.current.swallow = null
      return true
    }
    const media: (() => void) | null =
      key === "playPause"
        ? () => controller.togglePlay()
        : key === "play"
          ? () => controller.play()
          : key === "pause"
            ? () => controller.pause()
            : key === "stop"
              ? props.onClose
              : key === "fastForward"
                ? () => controller.skip(ahead)
                : key === "rewind"
                  ? () => controller.skip(-back)
                  : key === "previous" && previous
                    ? () => props.onEpisode(previous)
                    : key === "next" && following
                      ? () => props.onEpisode(following)
                      : key === "captions"
                        ? () => openMenu("subtitles")
                        : null
    if (media) {
      if (down) media()
      return true
    }
    if (menu !== null) return false
    const direction = key === "left" ? -1 : key === "right" ? 1 : 0
    const onSeekBar = focused()?.getAttribute("data-f") === "seek"
    // Left and right skip while the controls are away, or on the seek
    // bar, and glide on while held, which brings the controls to show
    // where to.
    if (
      direction !== 0 &&
      (held.current.seeking === key || !visible || onSeekBar)
    ) {
      if (down) {
        held.current.seeking = key
        press(direction, event.repeat, event.timeStamp)
        if (event.repeat && !controls) {
          focusSeek.current = true
          setControls(true)
        }
      } else {
        held.current.seeking = null
        release()
      }
      return true
    }
    // Select on the seek bar plays or pauses.
    if (onSeekBar && key === "select") {
      if (!down) controller.togglePlay()
      return true
    }
    // Select presses the button on the picture, rather than bringing the controls.
    if (onPicture && key === "select") return false
    if (
      !visible &&
      down &&
      (key === "select" || key === "up" || key === "down")
    ) {
      held.current.swallow = key
      setControls(true)
      return true
    }
    return false
  })

  // Back hides the controls before it leaves; a menu's Back comes first.
  useBack(() => {
    if (onPicture) {
      // Back cancels the countdown and takes the button away; the controls still have it.
      if (upcoming) {
        setCancelled(true)
        setNextAway(true)
      } else setSkipAway(true)
    } else if (controls && !controller.error) setControls(false)
    else props.onClose()
  })

  const label = itemLabel(controller.item)
  const duration = Math.max(0, controller.duration)
  const shown = scrub ?? controller.position
  const fraction = duration > 0 ? Math.max(0, Math.min(1, shown / duration)) : 0
  const loaded =
    duration > 0 ? Math.max(0, Math.min(1, controller.buffered / duration)) : 0
  const cues = controller.cues?.at(controller.position) ?? []
  const actionButton = (fid: string) =>
    action && (
      <Button
        fid={fid}
        label={action.label}
        detail={action.countdown === null ? null : `· ${action.countdown}`}
        onPicture
        onPress={action.run}
      />
    )

  return (
    <div ref={root} class="fill" data-ft="" data-page="">
      <Tap
        fid="screen"
        class="fill player-screen"
        onPress={() => setControls(true)}
      />
      <NoticeNote
        notice={controller.notice}
        onDone={() => controller.dismissNotice()}
      />
      {controller.loading && !controller.error && (
        <div class="fill center player-wait">
          <Spinner size={56} />
        </div>
      )}
      <div
        class={cx("player-overlay fill", visible && "shown")}
        data-foff={visible ? undefined : ""}
      >
        <div class="player-scrim" />
        <div class="player-controls">
          {label.code && (
            <div class="t-label one-line on-picture dim75">
              {`${label.code} · ${label.showName}`}
            </div>
          )}
          <div class="t-headline one-line on-picture">{label.title}</div>
          <div class="seek-row">
            <span class="seek-clock t-facts on-picture">
              {formatClock(shown)}
            </span>
            <Tap
              fid="seek"
              class="seek-bar"
              label={tr("a11yPlayerSeek")}
              onBlur={release}
            >
              <span class="seek-track" />
              <span class="seek-loaded" style={{ width: `${loaded * 100}%` }} />
              <span
                class="seek-played"
                style={{ width: `${fraction * 100}%` }}
              />
              <span class="seek-thumb" style={{ left: `${fraction * 100}%` }} />
              <span
                class={cx("seek-bubble", scrub !== null && "scrubbing")}
                style={{ left: `${fraction * 100}%` }}
              >
                {scrub !== null && controller.trickplay && (
                  <TrickplayFrame
                    controller={controller}
                    seconds={shown}
                    width={240}
                  />
                )}
                <b class="t-title">{formatClock(shown)}</b>
              </span>
            </Tap>
            <span class="seek-clock end t-facts on-picture dim75">
              {formatClock(duration)}
            </span>
          </div>
          <div class="player-buttons" data-fg="buttons" data-fk="row">
            {previous && (
              <RoundButton
                fid="previous"
                label={tr("playerPreviousEpisode")}
                size={40}
                onPress={() => props.onEpisode(previous)}
              >
                <Icon icon={SkipBack} size={20} />
              </RoundButton>
            )}
            <RoundButton
              fid="back"
              label={tr("playerSkipBack", back)}
              size={40}
              onPress={() => controller.skip(-back)}
            >
              <SkipIcon icon={RotateCcw} seconds={back} />
            </RoundButton>
            <RoundButton
              fid="play"
              label={tr(controller.playing ? "playerPause" : "playerPlay")}
              size={48}
              onPress={() => controller.togglePlay()}
            >
              <Icon icon={controller.playing ? Pause : Play} size={22} />
            </RoundButton>
            <RoundButton
              fid="ahead"
              label={tr("playerSkipForward", ahead)}
              size={40}
              onPress={() => controller.skip(ahead)}
            >
              <SkipIcon icon={RotateCw} seconds={ahead} />
            </RoundButton>
            {following && (
              <RoundButton
                fid="next"
                label={tr("playerNextEpisode")}
                size={40}
                onPress={() => props.onEpisode(following)}
              >
                <Icon icon={SkipForward} size={20} />
              </RoundButton>
            )}
            <span class="player-space" />
            {hasAction && actionButton("action")}
            <IconButton
              fid="audio"
              icon={AudioLines}
              label={tr("playerMenuAudio")}
              small
              onPress={() => openMenu("audio")}
            />
            <IconButton
              fid="subtitles"
              icon={Captions}
              label={tr("playerMenuSubtitles")}
              small
              onPress={() => openMenu("subtitles")}
            >
              {/* A line under the icon while subtitles are on, as on the phone. */}
              {controller.subtitle !== null && <i class="menu-on" />}
            </IconButton>
            <IconButton
              fid="settings"
              icon={Settings}
              label={tr("playerMenuSettings")}
              small
              onPress={() => openMenu("settings")}
            />
          </div>
        </div>
      </div>
      <Subtitles cues={cues} lifted={visible} />
      {controller.error && (
        <div class="fill player-error">
          <Failure
            title={
              controller.refusal
                ? refusalTitle(controller.refusal)
                : tr("playerErrorLost")
            }
            message={controller.error}
            // The server won't play it for this account, and says why.
            retry={controller.refusal ? null : () => controller.retry()}
          />
        </div>
      )}
      {/* In the corner while the controls are away. They have it in their row, beside the menus. */}
      <div
        class={cx("player-corner", onPicture && "shown")}
        data-foff={onPicture ? undefined : ""}
      >
        {actionButton("corner")}
      </div>
      <MenuPanel
        open={menu}
        controller={controller}
        onDismiss={() => setMenu(null)}
      />
    </div>
  )
}
