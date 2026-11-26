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
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from "solid-js"

import { usePicture } from "../api/images"
import { Page } from "../app/page"
import { useApp, useLoader } from "../app/scope"
import { type StringKey, tr } from "../i18n"
import { focused, focusOn } from "../input/focus"
import { type RemoteKey } from "../input/keys"
import { useBack, useKeyTap, useRefocus } from "../input/navigation"
import { cx, Icon, Spinner, Tap } from "../kit/base"
import {
  Button,
  IconButton,
  ListHeading,
  ListItem,
  RoundButton,
} from "../kit/buttons"
import { SidePanel } from "../kit/panel"
import { useObserved } from "../lib/observable"
import {
  formatClock,
  itemLabel,
  languageName,
  qualityLabel,
} from "../model/format"
import { platform } from "../platform/runtime"
import {
  type Notice,
  openPlayer,
  ORIGINAL_QUALITY,
  PlayerController,
  type PlayerData,
} from "../player/controller"
import type { Cue } from "../player/cues"
import { playbackDevice } from "../player/device"
import { playerPrefs } from "../player/prefs"

/* The player on a TV: the video, drawn for a remote. */

/** How long the controls stay once nothing is pressed. */
const HIDE_AFTER_MS = 3500
/** How long the skip button shows by itself once its segment starts. */
const SKIPPED_SHOWN_MS = 8000
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
          style={{ "margin-top": "8rem", "max-width": "560rem" }}
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
            onPress={() => props.retry?.()}
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
  const prefs = useObserved(playerPrefs)
  // Each time the player opens is a sitting of its own, which asks anew.
  const data = useLoader<PlayerData>(
    "player",
    () =>
      openPlayer(
        props.itemId,
        playbackDevice(prefs().value.videoCodec),
        prefs().value.quality === ORIGINAL_QUALITY
          ? undefined
          : qualityOf(prefs().value.quality),
        props.start,
      ),
    { pinned: true },
  )
  // The video's plane is behind the page, which lets it through while the player shows.
  onSettled(() => {
    document.body.classList.add("playing")
    platform().holdScreenSaver(true)
    return () => {
      document.body.classList.remove("playing")
      platform().holdScreenSaver(false)
    }
  })
  const state = () => data().state
  return (
    <Show
      when={state().kind === "loading" ? null : state()}
      fallback={
        <Page class="fill center player-black">
          <Spinner size={56} class="accent" />
        </Page>
      }
      keyed
    >
      {(load) => (
        <Show
          when={load.kind === "failed" ? load : null}
          fallback={
            <Show
              when={load.kind === "ready" ? load.value : null}
              keyed
              fallback={<div class="fill player-black" />}
            >
              {(value) => (
                <Show
                  when={value.kind === "ready" ? value : null}
                  fallback={
                    <div class="fill player-black">
                      <Failure
                        title={
                          value.kind === "refused"
                            ? refusalTitle(value.refusal)
                            : tr("playerErrorLost")
                        }
                        message={
                          value.kind === "refused"
                            ? value.message
                            : tr("playerUnplayable")
                        }
                        retry={
                          value.kind === "refused"
                            ? null
                            : () => data().reload()
                        }
                      />
                    </div>
                  }
                >
                  {(ready) => <Playback data={ready()} />}
                </Show>
              )}
            </Show>
          }
        >
          {(failed) => (
            <div class="fill player-black">
              <Failure
                title={tr("playerLoadFailed")}
                message={failed().message}
                retry={() => data().reload()}
              />
            </div>
          )}
        </Show>
      )}
    </Show>
  )
}

/** A saved quality as the contract's, which the server narrows to one it offers. */
function qualityOf(saved: string): Parameters<typeof openPlayer>[2] {
  // SAFETY: Only ids from the server's own ladder are ever saved, and the
  // server turns down one it no longer knows.
  return saved as Parameters<typeof openPlayer>[2]
}

/** A held key's first glide, in skips a second. */
const GLIDE_SKIPS = 4
/** Nor slower at first than this share of the video a second. */
const GLIDE_MIN_SHARE = 1 / 120
/** How long a held key takes to glide twice as fast, in seconds. */
const GLIDE_DOUBLING = 0.75
/** The fastest glide, as a share of the video a second. */
const GLIDE_MAX_SHARE = 1 / 5

/**
 * Where left and right on a remote have taken the seek bar. A press steps
 * by the skip length; a held key glides on from there, faster the longer
 * it's held, up to a fifth of the video a second. In a film of 110
 * minutes, that's the hour mark after about five seconds held, and an
 * episode's middle after about three. The player seeks once, to the
 * target, when the key comes up.
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
      const base = Math.max(step * GLIDE_SKIPS, duration * GLIDE_MIN_SHARE)
      const rate = Math.min(
        base * 2 ** (held / GLIDE_DOUBLING),
        Math.max(duration * GLIDE_MAX_SHARE, base),
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

/** Whether two menus read the same: the same rows, the same marks. */
function sameEntries(
  previous: readonly MenuEntry[],
  next: readonly MenuEntry[],
): boolean {
  return (
    previous.length === next.length &&
    previous.every((entry, index) => {
      const other = next[index]
      if (!other || other.kind !== entry.kind || other.key !== entry.key) {
        return false
      }
      if (entry.kind !== "choice" || other.kind !== "choice") {
        return entry.kind === "choice" || other.kind === "choice"
          ? false
          : entry.text === other.text
      }
      return (
        entry.title === other.title &&
        (entry.detail ?? null) === (other.detail ?? null) &&
        entry.selected === other.selected &&
        (entry.disabled ?? false) === (other.disabled ?? false)
      )
    })
  )
}

/** A menu as the TV's right-edge panel, over the dimmed picture, focus on the current choice. */
function MenuPanel(props: {
  open: Menu | null
  controller: PlayerController
  onDismiss: () => void
}) {
  // The menu that was open stays drawn while the panel slides away.
  const [last, setLast] = createSignal<Menu | null>(null)
  createEffect(
    () => props.open,
    (open) => {
      if (open) setLast(open)
    },
  )
  const menu = () => props.open ?? last()
  // The controller changes with every tick of the position, and the
  // entries with it, so they're kept until one reads differently: drawn
  // again each tick, the rows would flicker and focus would go back to
  // the current choice before an arrow could move it.
  const entries = createMemo(
    () => {
      const current = menu()
      return current ? menuEntries(current, props.controller) : []
    },
    { equals: sameEntries },
  )
  const picked = createMemo(
    () =>
      entries().find(
        (entry) => entry.kind === "choice" && entry.selected && !entry.disabled,
      )?.key,
  )
  return (
    <SidePanel
      open={props.open !== null}
      title={(() => {
        const current = menu()
        return current ? tr(MENU_NAMES[current]) : null
      })()}
      onBack={props.onDismiss}
      initial={picked()}
      focusKey={menu() ?? undefined}
    >
      <For each={entries()}>
        {(entry, index) =>
          entry.kind === "heading" ? (
            <ListHeading text={entry.text} top={index() > 0 ? 20 : 0} />
          ) : entry.kind === "note" ? (
            <div class="t-body muted" style={{ padding: "8rem 20rem" }}>
              {entry.text}
            </div>
          ) : (
            <ListItem
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
          )
        }
      </For>
    </SidePanel>
  )
}

/** The frame at `seconds` from the server's trickplay tiles, `width` units wide. */
function TrickplayFrame(props: {
  controller: PlayerController
  seconds: number
  width: number
}) {
  const images = () => props.controller.trickplay
  const perTile = () => (images() ? images()!.columns * images()!.rows : 1)
  const index = () => {
    const current = images()
    return current
      ? Math.max(
          0,
          Math.min(
            Math.floor(props.seconds / current.intervalSeconds),
            current.count - 1,
          ),
        )
      : 0
  }
  const tile = () => Math.floor(index() / perTile())
  const picture = usePicture(() =>
    images()
      ? trickplayTilePath(props.controller.item.id, images()!.key, tile())
      : null,
  )
  const height = () => {
    const current = images()
    return current ? (props.width * current.height) / current.width : 0
  }
  const cell = () => index() % perTile()
  return (
    <Show when={images()}>
      {(current) => (
        <div
          class="trickplay"
          style={{
            width: `${props.width}rem`,
            height: `${height()}rem`,
            "background-image": picture().src
              ? `url("${picture().src}")`
              : undefined,
            "background-size": `${current().columns * 100}% ${current().rows * 100}%`,
            "background-position": `${(cell() % current().columns) * -props.width}rem ${Math.floor(cell() / current().columns) * -height()}rem`,
          }}
        />
      )}
    </Show>
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
  const prefs = useObserved(playerPrefs)
  return (
    <Show when={props.cues.length > 0}>
      <div
        class={cx(
          "subtitles",
          props.lifted && "lifted",
          `sub-${prefs().value.subtitleColor}`,
          `sub-bg-${prefs().value.subtitleBackground}`,
          `sub-edge-${prefs().value.subtitleEdge}`,
        )}
        style={{ "font-size": `${20 * prefs().value.subtitleScale}rem` }}
      >
        <For each={props.cues}>
          {(cue) => (
            <div class="subtitle-line">
              <span>
                <For each={cue.spans}>
                  {(span) => (
                    <span
                      style={{
                        "font-style": span.italic ? "italic" : undefined,
                        "font-weight": span.bold ? 700 : undefined,
                        "text-decoration": span.underline
                          ? "underline"
                          : undefined,
                      }}
                    >
                      {span.text}
                    </span>
                  )}
                </For>
              </span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

/** A note over the picture about the last answer, for a few seconds. */
function NoticeNote(props: { notice: Notice | null; onDone: () => void }) {
  createEffect(
    () => props.notice,
    (notice) => {
      if (!notice) return
      const timer = window.setTimeout(() => props.onDone(), NOTICE_MS)
      return () => window.clearTimeout(timer)
    },
  )
  const detail = () => {
    const notice = props.notice
    if (!notice) return null
    return notice.kind === "burnInFailed"
      ? tr("playerNoticeBurnInFailedDetail")
      : notice.kind === "qualityFailed"
        ? tr("playerNoticeQualityFailedDetail")
        : notice.detail
  }
  return (
    <Show when={props.notice}>
      {(notice) => (
        <div class="player-notice">
          <div class="t-facts">
            {tr(
              notice().kind === "burnInFailed"
                ? "playerNoticeBurnInFailed"
                : "playerNoticeSwitchFailed",
            )}
          </div>
          {detail() && <div class="t-caption dim85">{detail()}</div>}
        </div>
      )}
    </Show>
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
  let host: HTMLDivElement | undefined
  const [controller, setController] = createSignal<PlayerController | null>(
    null,
  )
  const prefs = useObserved(playerPrefs)

  onSettled(() => {
    const element = host
    if (!element) return
    let made: PlayerController | null = null
    const listener = {
      onChange: () => made?.sync(),
      onError: (failure: Parameters<PlayerController["fallBack"]>[0]) =>
        made?.fallBack(failure),
      onLost: () => made?.reopen(),
    }
    const engine = platform().createEngine(element, listener)
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
  })

  return (
    <div class="fill">
      <div ref={(node) => (host = node)} class="fill" />
      <Show when={controller()}>
        {(current) => (
          <Controls
            controller={current()}
            back={user.playback?.skipBackSeconds ?? 10}
            ahead={user.playback?.skipForwardSeconds ?? 10}
            autoplay={prefs().value.autoplayNext}
            fill={prefs().value.fillScreen}
            onClose={() => nav.back()}
            onEpisode={(item) => nav.playInstead(item.id)}
          />
        )}
      </Show>
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
  // `controller()` changes with every tick of the position, and an
  // effect runs its apply each time its compute does, so effects read
  // memos, which pass a change on only when the value is new, and take
  // what they need from their compute.
  const controller = useObserved(props.controller)
  const playing = createMemo(() => controller().playing)
  const ended = createMemo(() => controller().ended)
  let root: HTMLDivElement | undefined
  const [controls, setControls] = createSignal(true)
  const [menu, setMenu] = createSignal<Menu | null>(null)
  const [scrub, setScrub] = createSignal<number | null>(null)
  const [touched, setTouched] = createSignal(0)
  const keySeek = new KeySeek()
  // Keys held across events: the arrow gliding the seek bar, and a key
  // whose release the screen already answered.
  let seeking: RemoteKey | null = null
  let swallow: RemoteKey | null = null
  // The controls came up for a held arrow, so focus goes to the seek bar.
  let focusSeek = false

  createEffect(
    () => props.fill,
    (fill) => controller().showFilled(fill),
  )

  // An episode's neighbours, for the buttons beside the skips and the media keys.
  const show = () => controller().item.title?.kind === "show"
  const previous = () => (show() ? controller().previous : null)
  const following = () => (show() ? controller().next : null)

  // Once the credits start or the file ends: the next episode, counting down.
  const upcoming = () => (controller().offersNext ? controller().next : null)
  // The episode on offer, and whether it came before the file ended, as
  // it was when offered: the memo holds its first value until the episode
  // changes. Offered early, it counts down to the end and starts there.
  const offer = createMemo(
    () => {
      const item = upcoming()
      return item ? { item, early: !ended() } : null
    },
    { equals: (a, b) => a?.item.id === b?.item.id },
  )
  const upcomingId = () => offer()?.item.id ?? null
  const [cancelled, setCancelled] = createSignal(!props.autoplay)
  const [left, setLeft] = createSignal(UP_NEXT_SECONDS)
  createEffect(
    () => [offer(), cancelled(), ended(), left()] as const,
    ([current, isCancelled, isEnded, remaining]) => {
      if (!current || isCancelled || !isEnded) return
      if (current.early || remaining <= 0) {
        props.onEpisode(current.item)
        return
      }
      const timer = window.setTimeout(() => setLeft(remaining - 1), 1000)
      return () => window.clearTimeout(timer)
    },
  )
  // Back took its button off the picture. It stays with the controls.
  const [nextAway, setNextAway] = createSignal(false)

  // Otherwise Skip intro, or the like, while the video is in a segment the server found.
  const segment = () => controller().segment
  const segmentKey = createMemo(() => {
    const current = segment()
    return current ? `${current.kind}-${current.start}` : null
  })
  const [fresh, setFresh] = createSignal(true)
  const [skipAway, setSkipAway] = createSignal(false)
  createEffect(
    () => segmentKey(),
    (key) => {
      setFresh(true)
      setSkipAway(false)
      if (!key) return
      const timer = window.setTimeout(() => setFresh(false), SKIPPED_SHOWN_MS)
      return () => window.clearTimeout(timer)
    },
  )

  const action = (): PictureAction | null => {
    const item = upcoming()
    const current = segment()
    if (item) {
      return {
        label: tr("playerNextEpisode"),
        countdown: cancelled()
          ? null
          : controller().ended
            ? left()
            : Math.max(
                0,
                Math.ceil(controller().duration - controller().position),
              ),
        run: () => props.onEpisode(item),
      }
    }
    if (current && (fresh() || controls())) {
      return {
        label: skipLabel(current.kind),
        countdown: null,
        run: () => controller().skipSegment(current),
      }
    }
    return null
  }
  const away = () => (upcoming() ? nextAway() : skipAway())
  // The button shows alone on the picture, and takes focus there.
  const hasAction = createMemo(() => action() !== null && !away())
  const onPicture = createMemo(() => hasAction() && !controls())
  // A file that ended with nothing after it brings the controls.
  const visible = createMemo(
    () => controls() || (ended() && upcomingId() === null),
  )

  createEffect(
    () => [controls(), playing(), menu(), scrub(), touched()] as const,
    ([shown, playing, open, seeking]) => {
      if (!shown || !playing || open !== null || seeking !== null) return
      const timer = window.setTimeout(() => setControls(false), HIDE_AFTER_MS)
      return () => window.clearTimeout(timer)
    },
  )

  const leaf = (name: string) =>
    root?.querySelector<HTMLElement>(`[data-f="${name}"]`) ?? null

  // Focus follows the controls: on play, the seek bar after a held arrow,
  // or the button for the next episode, as they come; on that button or
  // the screen itself, which takes the keys, as they go. A file that ends
  // with the controls up hands focus to the button for the next one.
  createEffect(
    () => [visible(), onPicture(), menu(), hasAction(), upcomingId()] as const,
    ([shown, picture, open, offering]) => {
      if (open !== null) return
      if (!shown) {
        focusOn(leaf(picture ? "corner" : "screen"))
        return
      }
      const target = focusSeek ? "seek" : offering ? "action" : "play"
      focusSeek = false
      if (!focusOn(leaf(target))) focusOn(leaf("play"))
    },
  )
  useRefocus(
    () => {
      focusOn(leaf(visible() ? "play" : onPicture() ? "corner" : "screen"))
    },
    () => menu() === null,
  )

  const press = (direction: number, repeat: boolean, at: number) => {
    const target = keySeek.press(
      scrub() ?? controller().position,
      direction,
      direction < 0 ? props.back : props.ahead,
      controller().duration,
      repeat,
      at,
    )
    if (target !== null) setScrub(target)
  }
  const release = () => {
    const target = keySeek.release()
    if (target !== null) controller().seekTo(target)
    setScrub(null)
  }
  const openMenu = (which: Menu) => {
    setControls(true)
    setMenu(which)
  }

  useKeyTap((key, phase, keyPress) => {
    const down = phase === "down"
    if (down) setTouched((count) => count + 1)
    if (!down && swallow === key) {
      swallow = null
      return true
    }
    const previousItem = previous()
    const followingItem = following()
    const media: (() => void) | null =
      key === "playPause"
        ? () => controller().togglePlay()
        : key === "play"
          ? () => controller().play()
          : key === "pause"
            ? () => controller().pause()
            : key === "stop"
              ? props.onClose
              : key === "fastForward"
                ? () => controller().skip(props.ahead)
                : key === "rewind"
                  ? () => controller().skip(-props.back)
                  : key === "previous" && previousItem
                    ? () => props.onEpisode(previousItem)
                    : key === "next" && followingItem
                      ? () => props.onEpisode(followingItem)
                      : key === "captions"
                        ? () => openMenu("subtitles")
                        : null
    if (media) {
      if (down) media()
      return true
    }
    if (menu() !== null) return false
    const direction = key === "left" ? -1 : key === "right" ? 1 : 0
    const onSeekBar = focused()?.getAttribute("data-f") === "seek"
    // Left and right skip while the controls are away, or on the seek
    // bar, and glide on while held, which brings the controls to show
    // where to.
    if (direction !== 0 && (seeking === key || !visible() || onSeekBar)) {
      if (down) {
        seeking = key
        press(direction, keyPress.repeat, keyPress.timeStamp)
        if (keyPress.repeat && !controls()) {
          focusSeek = true
          setControls(true)
        }
      } else {
        seeking = null
        release()
      }
      return true
    }
    // Select on the seek bar plays or pauses.
    if (onSeekBar && key === "select") {
      if (!down) controller().togglePlay()
      return true
    }
    // Select presses the button on the picture, rather than bringing the controls.
    if (onPicture() && key === "select") return false
    if (
      !visible() &&
      down &&
      (key === "select" || key === "up" || key === "down")
    ) {
      swallow = key
      setControls(true)
      return true
    }
    return false
  })

  // Back hides the controls before it leaves; a menu's Back comes first.
  useBack(() => {
    if (onPicture()) {
      // Back cancels the countdown and takes the button away; the controls still have it.
      if (upcoming()) {
        setCancelled(true)
        setNextAway(true)
      } else setSkipAway(true)
    } else if (controls() && !controller().error) setControls(false)
    else props.onClose()
  })

  const label = () => itemLabel(controller().item)
  const duration = () => Math.max(0, controller().duration)
  const shown = () => scrub() ?? controller().position
  const fraction = () =>
    duration() > 0 ? Math.max(0, Math.min(1, shown() / duration())) : 0
  const loaded = () =>
    duration() > 0
      ? Math.max(0, Math.min(1, controller().buffered / duration()))
      : 0
  const cues = () => controller().cues?.at(controller().position) ?? []
  const actionButton = (fid: string) => {
    const current = action()
    return current ? (
      <Button
        fid={fid}
        label={current.label}
        detail={current.countdown === null ? null : `· ${current.countdown}`}
        onPicture
        onPress={current.run}
      />
    ) : null
  }

  return (
    <div ref={(node) => (root = node)} class="fill" data-ft="" data-page="">
      <Tap
        fid="screen"
        class="fill player-screen"
        onPress={() => setControls(true)}
      />
      <NoticeNote
        notice={controller().notice}
        onDone={() => controller().dismissNotice()}
      />
      {controller().loading && !controller().error && (
        <div class="fill center player-wait">
          <Spinner size={56} />
        </div>
      )}
      <div
        class={cx("player-overlay fill", visible() && "shown")}
        data-foff={visible() ? undefined : ""}
      >
        <div class="player-scrim" />
        <div class="player-controls">
          {label().code && (
            <div class="t-label one-line on-picture dim75">
              {`${label().code} · ${label().showName}`}
            </div>
          )}
          <div class="t-headline one-line on-picture">{label().title}</div>
          <div class="seek-row">
            <span class="seek-clock t-facts on-picture">
              {formatClock(shown())}
            </span>
            <Tap
              fid="seek"
              class="seek-bar"
              label={tr("a11yPlayerSeek")}
              onBlur={release}
            >
              <span class="seek-track" />
              <span
                class="seek-loaded"
                style={{ width: `${loaded() * 100}%` }}
              />
              <span
                class="seek-played"
                style={{ width: `${fraction() * 100}%` }}
              />
              <span
                class="seek-thumb"
                style={{ left: `${fraction() * 100}%` }}
              />
              <span
                class={cx("seek-bubble", scrub() !== null && "scrubbing")}
                style={{ left: `${fraction() * 100}%` }}
              >
                {scrub() !== null && controller().trickplay && (
                  <TrickplayFrame
                    controller={controller()}
                    seconds={shown()}
                    width={240}
                  />
                )}
                <b class="t-title">{formatClock(shown())}</b>
              </span>
            </Tap>
            <span class="seek-clock end t-facts on-picture dim75">
              {formatClock(duration())}
            </span>
          </div>
          <div class="player-buttons" data-fg="buttons" data-fk="row">
            {previous() && (
              <RoundButton
                fid="previous"
                label={tr("playerPreviousEpisode")}
                size={40}
                onPress={() => {
                  const item = previous()
                  if (item) props.onEpisode(item)
                }}
              >
                <Icon icon={SkipBack} size={20} />
              </RoundButton>
            )}
            <RoundButton
              fid="back"
              label={tr("playerSkipBack", props.back)}
              size={40}
              onPress={() => controller().skip(-props.back)}
            >
              <SkipIcon icon={RotateCcw} seconds={props.back} />
            </RoundButton>
            <RoundButton
              fid="play"
              label={tr(controller().playing ? "playerPause" : "playerPlay")}
              size={48}
              onPress={() => controller().togglePlay()}
            >
              <Icon icon={controller().playing ? Pause : Play} size={22} />
            </RoundButton>
            <RoundButton
              fid="ahead"
              label={tr("playerSkipForward", props.ahead)}
              size={40}
              onPress={() => controller().skip(props.ahead)}
            >
              <SkipIcon icon={RotateCw} seconds={props.ahead} />
            </RoundButton>
            {following() && (
              <RoundButton
                fid="next"
                label={tr("playerNextEpisode")}
                size={40}
                onPress={() => {
                  const item = following()
                  if (item) props.onEpisode(item)
                }}
              >
                <Icon icon={SkipForward} size={20} />
              </RoundButton>
            )}
            <span class="player-space" />
            {hasAction() && actionButton("action")}
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
              {controller().subtitle !== null && <i class="menu-on" />}
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
      <Subtitles cues={cues()} lifted={visible()} />
      {controller().error && (
        <div class="fill player-error">
          <Failure
            title={(() => {
              const refusal = controller().refusal
              return refusal ? refusalTitle(refusal) : tr("playerErrorLost")
            })()}
            message={controller().error}
            // The server won't play it for this account, and says why.
            retry={controller().refusal ? null : () => controller().retry()}
          />
        </div>
      )}
      {/* In the corner while the controls are away. They have it in their row, beside the menus. */}
      <div
        class={cx("player-corner", onPicture() && "shown")}
        data-foff={onPicture() ? undefined : ""}
      >
        {actionButton("corner")}
      </div>
      <MenuPanel
        open={menu()}
        controller={controller()}
        onDismiss={() => setMenu(null)}
      />
    </div>
  )
}
