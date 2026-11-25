import type {
  DevicePlatform,
  PlaybackOptions,
  PlaybackPreferences,
  Session as AccountSession,
} from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import {
  AudioLines,
  Captions,
  type IconNode,
  Info,
  LogOut,
  Monitor,
  RefreshCw,
  Server,
  Smartphone,
  Tv,
  TvMinimalPlay,
  UserRound,
  X,
} from "lucide"
import { For, Show, Switch, Match, createEffect, createSignal } from "solid-js"

import { Page } from "../app/page"
import { useApp, useKept, useLoader } from "../app/scope"
import { hostOf, nameOf, session } from "../auth/session"
import { language, locale, plural, type StringKey, tr } from "../i18n"
import { focusOn } from "../input/focus"
import { useBack } from "../input/navigation"
import { Spinner } from "../kit/base"
import { ListHeading, ListItem, ListSwitch, ListValue } from "../kit/buttons"
import { Avatar } from "../kit/cards"
import { OptionsPanel, type PanelOption, SidePanel } from "../kit/panel"
import { useObserved } from "../lib/observable"
import {
  encodeCodecName,
  formatBitrate,
  formatInstant,
  languageName,
  qualityLabel,
} from "../model/format"
import { platform } from "../platform/runtime"
import { ORIGINAL_QUALITY } from "../player/controller"
import { encodeVideoChoices } from "../player/device"
import {
  AUTOMATIC,
  playerPrefs,
  SUBTITLE_BACKGROUNDS,
  SUBTITLE_COLORS,
  SUBTITLE_EDGES,
  SUBTITLE_SCALES,
} from "../player/prefs"
import { ServerPanel } from "./auth"

/*
 * Settings on a TV, as Google TV's own: the categories on the left, the
 * focused one's rows on the right. Downloads, appearance, the admin
 * pages, and linking a device by camera have none here.
 */

type Category = { key: string; icon: IconNode; title: StringKey }

const CATEGORIES: readonly Category[] = [
  { key: "playback", icon: TvMinimalPlay, title: "settingsPagePlayback" },
  { key: "subtitles", icon: Captions, title: "settingsSubtitlesTitle" },
  { key: "languages", icon: AudioLines, title: "playbackLanguagesTitle" },
  { key: "devices", icon: Monitor, title: "tvSettingsDevices" },
  { key: "account", icon: UserRound, title: "tvSettingsAccount" },
  { key: "about", icon: Info, title: "aboutTitle" },
]

/** A row's panel: a choice among options, opened from the row named `from`. */
type Picker = {
  from: string
  title: string
  description?: string | null
  options: readonly PanelOption[]
  current: string | null
  onPick: (key: string) => void
}

type Open = (picker: Picker) => void

/** A choice among `options`, its value at the row's end, picked in a panel at the right edge. */
function PickRow(props: {
  fid: string
  title: string
  options: readonly PanelOption[]
  current: string | null
  description?: string | null
  open: Open
  onPick: (key: string) => void
}) {
  const value = () =>
    props.options.find((option) => option.key === props.current)?.label ??
    tr("settingsUnknownValue")
  return (
    <ListItem
      fid={props.fid}
      title={props.title}
      subtitle={props.description}
      quiet
      trailing={<ListValue value={value()} />}
      onPress={() =>
        props.open({
          from: props.fid,
          title: props.title,
          description: props.description,
          options: props.options,
          current: props.current,
          onPick: props.onPick,
        })
      }
    />
  )
}

/** On or off, flipped in place by Select. */
function SwitchRow(props: {
  fid: string
  title: string
  checked: boolean
  description?: string
  onChange: (checked: boolean) => void
}) {
  return (
    <ListItem
      fid={props.fid}
      title={props.title}
      subtitle={props.description}
      quiet
      trailing={<ListSwitch checked={props.checked} />}
      onPress={() => props.onChange(!props.checked)}
    />
  )
}

/** A note under a group of rows, such as what a setting is used for. */
function RowNote(props: { text: string }) {
  return (
    <div class="t-caption muted" style={{ padding: "4rem 20rem 8rem" }}>
      {props.text}
    </div>
  )
}

function usePlaybackOptions(): () => PlaybackOptions | undefined {
  const options = useLoader("playbackOptions", () =>
    session.api.playback.options(),
  )
  return () => options().value
}

/** The account's playback preferences, and how to save a change to them. */
function usePlaybackPreferences(): [
  () => PlaybackPreferences,
  (next: PlaybackPreferences) => void,
] {
  const { user, toasts } = useApp()
  const current = (): PlaybackPreferences =>
    user.playback ?? {
      audioLanguage: null,
      subtitleMode: "default",
      subtitleLanguage: null,
      rememberSubtitles: true,
      rememberAudio: true,
      skipBackSeconds: 10,
      skipForwardSeconds: 10,
    }
  const save = (next: PlaybackPreferences) =>
    void toasts.showing(tr("playerErrorSavePreferences"), async () => {
      session.updateUser(
        await session.api.account.playback.setPreferences(next),
      )
    })
  return [current, save]
}

/** What this TV plays and how, then the account's skip lengths, and the codec for encodes. */
function PlaybackRows(props: { open: Open }) {
  const prefs = useObserved(playerPrefs)
  const options = usePlaybackOptions()
  const [playback, save] = usePlaybackPreferences()
  // The qualities this account may stream, once `playback.options` answers.
  const qualities = (): PanelOption[] => [
    { key: ORIGINAL_QUALITY, label: tr("playerQualityOriginal") },
    ...(options()?.qualities ?? []).map((quality) => ({
      key: quality.id,
      label: qualityLabel(quality),
    })),
  ]
  const skips = (current: number): PanelOption[] =>
    [...new Set([...(options()?.skipSteps ?? []), current])]
      .toSorted((a, b) => a - b)
      .map((seconds) => ({
        key: String(seconds),
        label: plural("playbackSkipSeconds", seconds),
      }))
  // A codec shows only when there's a choice: what the server encodes and this TV decodes.
  const codecs = () => encodeVideoChoices(options()?.videoCodecs ?? ["h264"])
  return (
    <>
      <ListHeading text={tr("tvSettingsThisTv")} />
      <PickRow
        fid="quality"
        title={tr("playbackQualityTitle")}
        options={qualities()}
        // One the account may no longer use shows as the original; it stays
        // saved, so a lifted limit brings it back.
        current={
          !options() ||
          qualities().some((quality) => quality.key === prefs().value.quality)
            ? prefs().value.quality
            : ORIGINAL_QUALITY
        }
        description={
          options()?.maxBitrate
            ? tr(
                "playbackQualityLimit",
                formatBitrate(options()?.maxBitrate ?? 0),
              )
            : null
        }
        open={props.open}
        onPick={(quality) => playerPrefs.set({ quality })}
      />
      <SwitchRow
        fid="autoplay"
        title={tr("playbackAutoplayTitle")}
        checked={prefs().value.autoplayNext}
        onChange={(autoplayNext) => playerPrefs.set({ autoplayNext })}
      />
      <SwitchRow
        fid="fill"
        title={tr("tizen_settings_fill")}
        description={tr("tizen_settings_fill_description")}
        checked={prefs().value.fillScreen}
        onChange={(fillScreen) => playerPrefs.set({ fillScreen })}
      />
      <ListHeading text={tr("playbackSkipTitle")} top={28} />
      <PickRow
        fid="skipBack"
        title={tr("playbackSkipBack")}
        options={skips(playback().skipBackSeconds)}
        current={String(playback().skipBackSeconds)}
        open={props.open}
        onPick={(seconds) =>
          save({ ...playback(), skipBackSeconds: Number(seconds) })
        }
      />
      <PickRow
        fid="skipForward"
        title={tr("playbackSkipForward")}
        options={skips(playback().skipForwardSeconds)}
        current={String(playback().skipForwardSeconds)}
        open={props.open}
        onPick={(seconds) =>
          save({ ...playback(), skipForwardSeconds: Number(seconds) })
        }
      />
      {codecs().length > 1 && (
        <>
          <ListHeading text={tr("playbackTranscodingTitle")} top={28} />
          <PickRow
            fid="videoCodec"
            title={tr("playbackVideoCodecTitle")}
            options={[
              {
                key: AUTOMATIC,
                label: tr("playbackCodecAutomatic", encodeCodecName("h264")),
              },
              ...codecs().map((codec) => ({
                key: codec,
                label: encodeCodecName(codec),
              })),
            ]}
            current={
              codecs().includes(prefs().value.videoCodec)
                ? prefs().value.videoCodec
                : AUTOMATIC
            }
            open={props.open}
            onPick={(videoCodec) => playerPrefs.set({ videoCodec })}
          />
          <RowNote text={tr("tvSettingsTranscodingNote")} />
        </>
      )}
    </>
  )
}

const COLOR_NAMES = {
  white: "settingsSubtitlesColorWhite",
  yellow: "settingsSubtitlesColorYellow",
  cyan: "settingsSubtitlesColorCyan",
  green: "settingsSubtitlesColorGreen",
} satisfies Record<(typeof SUBTITLE_COLORS)[number], StringKey>

const BACKGROUND_NAMES = {
  none: "settingsSubtitlesBackgroundNone",
  shaded: "settingsSubtitlesBackgroundShaded",
  black: "settingsSubtitlesBackgroundBlack",
} satisfies Record<(typeof SUBTITLE_BACKGROUNDS)[number], StringKey>

const EDGE_NAMES = {
  shadow: "settingsSubtitlesEdgeShadow",
  outline: "settingsSubtitlesEdgeOutline",
  none: "settingsSubtitlesEdgeNone",
} satisfies Record<(typeof SUBTITLE_EDGES)[number], StringKey>

/** How subtitles look on this TV, over a sample drawn as the player draws them. */
function SubtitleRows(props: { open: Open }) {
  const prefs = useObserved(playerPrefs)
  const percent = (scale: number) =>
    scale.toLocaleString(locale, { style: "percent" })
  return (
    <>
      <div class="subtitle-preview">
        <div
          class={`subtitles sub-${prefs().value.subtitleColor} sub-bg-${prefs().value.subtitleBackground} sub-edge-${prefs().value.subtitleEdge}`}
          style={{ "font-size": `${18 * prefs().value.subtitleScale}rem` }}
        >
          <div class="subtitle-line">
            <span>{tr("settingsSubtitlesPreview")}</span>
          </div>
        </div>
      </div>
      <PickRow
        fid="size"
        title={tr("settingsSubtitlesSize")}
        options={SUBTITLE_SCALES.map((scale) => ({
          key: String(scale),
          label: percent(scale),
        }))}
        current={String(prefs().value.subtitleScale)}
        open={props.open}
        onPick={(scale) => playerPrefs.set({ subtitleScale: Number(scale) })}
      />
      <PickRow
        fid="color"
        title={tr("settingsSubtitlesColor")}
        options={SUBTITLE_COLORS.map((color) => ({
          key: color,
          label: tr(COLOR_NAMES[color]),
        }))}
        current={prefs().value.subtitleColor}
        open={props.open}
        onPick={(picked) =>
          playerPrefs.set({
            subtitleColor:
              SUBTITLE_COLORS.find((color) => color === picked) ?? "white",
          })
        }
      />
      <PickRow
        fid="background"
        title={tr("settingsSubtitlesBackground")}
        options={SUBTITLE_BACKGROUNDS.map((background) => ({
          key: background,
          label: tr(BACKGROUND_NAMES[background]),
        }))}
        current={prefs().value.subtitleBackground}
        open={props.open}
        onPick={(picked) =>
          playerPrefs.set({
            subtitleBackground:
              SUBTITLE_BACKGROUNDS.find(
                (background) => background === picked,
              ) ?? "shaded",
          })
        }
      />
      <PickRow
        fid="edge"
        title={tr("settingsSubtitlesEdge")}
        options={SUBTITLE_EDGES.map((edge) => ({
          key: edge,
          label: tr(EDGE_NAMES[edge]),
        }))}
        current={prefs().value.subtitleEdge}
        open={props.open}
        onPick={(picked) =>
          playerPrefs.set({
            subtitleEdge:
              SUBTITLE_EDGES.find((edge) => edge === picked) ?? "shadow",
          })
        }
      />
    </>
  )
}

const MODE_NAMES = {
  default: "playbackSubtitlesModeDefault",
  always: "playbackSubtitlesModeAlways",
  foreign: "playbackSubtitlesModeForeign",
  forced: "playbackSubtitlesModeForced",
  off: "playbackSubtitlesModeOff",
} satisfies Record<PlaybackPreferences["subtitleMode"], StringKey>

const MODES = ["default", "always", "foreign", "forced", "off"] as const

/** In a panel, the key that stands for "none picked", which no language has. */
const NONE = "none"

/** The account's languages, which every device of the account plays by. */
function LanguageRows(props: { open: Open }) {
  const { user, viewer, toasts } = useApp()
  const options = usePlaybackOptions()
  const [playback, save] = usePlaybackPreferences()
  const named = (tags: readonly string[] | undefined): PanelOption[] =>
    (tags ?? []).map((tag) => ({ key: tag, label: languageName(tag) }))
  return (
    <>
      <PickRow
        fid="audio"
        title={tr("playbackAudioTitle")}
        options={[
          { key: NONE, label: tr("playbackAudioFileDefault") },
          { key: "original", label: tr("playbackAudioOriginal") },
          ...named(options()?.audioLanguages),
        ]}
        current={playback().audioLanguage ?? NONE}
        open={props.open}
        onPick={(tag) =>
          save({
            ...playback(),
            audioLanguage: tag === NONE ? null : tag,
          })
        }
      />
      <PickRow
        fid="mode"
        title={tr("playbackSubtitlesTitle")}
        options={MODES.map((mode) => ({
          key: mode,
          label: tr(MODE_NAMES[mode]),
        }))}
        current={playback().subtitleMode}
        open={props.open}
        onPick={(picked) =>
          save({
            ...playback(),
            subtitleMode: MODES.find((mode) => mode === picked) ?? "default",
          })
        }
      />
      {/* With subtitles off, which language they'd be in doesn't matter. */}
      {playback().subtitleMode !== "off" && (
        <PickRow
          fid="subtitleLanguage"
          title={tr("playbackSubtitlesLanguage")}
          options={[
            {
              key: NONE,
              label: tr(
                "playbackSubtitlesDeviceLanguage",
                languageName(language),
              ),
            },
            ...named(options()?.subtitleLanguages),
          ]}
          current={playback().subtitleLanguage ?? NONE}
          open={props.open}
          onPick={(tag) =>
            save({
              ...playback(),
              subtitleLanguage: tag === NONE ? null : tag,
            })
          }
        />
      )}
      <SwitchRow
        fid="remember"
        title={tr("playbackSubtitlesRemember")}
        checked={playback().rememberSubtitles}
        onChange={(rememberSubtitles) =>
          save({ ...playback(), rememberSubtitles })
        }
      />
      <SwitchRow
        fid="specials"
        title={tr("playbackSpecialsTitle")}
        checked={user.library.showSpecials}
        onChange={(showSpecials) =>
          void toasts.showing(tr("playbackSpecialsFailed"), async () => {
            session.updateUser(
              await session.api.account.library.setPreferences({
                showSpecials,
              }),
            )
            // The server lists shows another way now: pages fetch again.
            viewer.touch()
          })
        }
      />
      <RowNote text={tr("tvSettingsLanguagesNote")} />
    </>
  )
}

const PLATFORM_NAMES = new Map<DevicePlatform, string>([
  ["android", "Android"],
  ["androidtv", "Android TV"],
  ["ios", "iOS"],
  ["linux", "Linux"],
  ["macos", "macOS"],
  ["tizen", "Samsung TV"],
  ["tvos", "Apple TV"],
  ["windows", "Windows"],
])

const TV_PLATFORMS = new Set<DevicePlatform>(["androidtv", "tizen", "tvos"])

function platformIcon(platform: DevicePlatform | null): IconNode {
  if (platform === null) return Monitor
  if (TV_PLATFORMS.has(platform)) return Tv
  return platform === "android" || platform === "ios" ? Smartphone : Monitor
}

/** What a session in the list is called: the device's name, the browser, or the kind of app. */
function sessionName(item: AccountSession): string {
  return (
    item.deviceName ??
    item.browser ??
    (item.platform
      ? tr(
          "accountDeviceApp",
          PLATFORM_NAMES.get(item.platform) ?? item.platform,
        )
      : tr("accountDeviceBrowser"))
  )
}

/** The places the account is signed in; Select on one but this TV asks to sign it out. */
function DeviceRows(props: {
  onSignOut: (item: AccountSession) => void
  reloads: number
}) {
  const sessions = useLoader("sessions", () =>
    session.api.account.sessions.list(),
  )
  // Opening the category asks again, so a device signed in meanwhile shows.
  createEffect(
    () => props.reloads,
    () => sessions().refreshIfStale(0),
  )
  const state = () => sessions().state
  return (
    <Switch>
      <Match when={state().kind === "loading"}>
        <div style={{ padding: "12rem 20rem" }}>
          <Spinner size={28} class="muted" />
        </div>
      </Match>
      <Match when={state().kind === "failed" ? state() : null} keyed>
        {(failed) => (
          <>
            <RowNote
              text={tr(
                "accountSessionsLoadFailed",
                failed.kind === "failed" ? failed.message : "",
              )}
            />
            <ListItem
              fid="retry"
              title={tr("commonRetry")}
              icon={RefreshCw}
              quiet
              onPress={() => sessions().reload()}
            />
          </>
        )}
      </Match>
      <Match when={state().kind === "ready" ? state() : null} keyed>
        {(ready) => (
          <For each={ready.kind === "ready" ? ready.value : []}>
            {(item) => (
              <ListItem
                fid={item.id}
                title={sessionName(item)}
                subtitle={[
                  item.platform
                    ? tr(
                        "accountDeviceApp",
                        PLATFORM_NAMES.get(item.platform) ?? item.platform,
                      )
                    : null,
                  tr("accountSessionsSignedIn", formatInstant(item.createdAt)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                icon={platformIcon(item.platform)}
                quiet
                minHeight={68}
                // This TV stays focusable, so the list scrolls past it, but has nothing to do.
                onPress={() => {
                  if (!item.current) props.onSignOut(item)
                }}
                trailing={
                  item.current ? (
                    <span class="t-label" style={{ opacity: 0.7 }}>
                      {tr("tizen_this_tv")}
                    </span>
                  ) : (
                    <ListValue value={tr("shellSignOut")} />
                  )
                }
              />
            )}
          </For>
        )}
      </Match>
    </Switch>
  )
}

/** Who's signed in and to which server, and the ways out: another server, or signing out. */
function AccountRows(props: { onServers: () => void }) {
  const { user } = useApp()
  const name = nameOf(user)
  return (
    <>
      <ListItem
        fid="user"
        title={name}
        subtitle={
          [
            user.displayName ? `@${user.username}` : null,
            user.role === "admin" ? tr("profileAdmin") : null,
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
        quiet
        minHeight={76}
        leading={<Avatar name={name} url={user.avatarUrl} size={44} />}
        onPress={() => {}}
      />
      <ListItem
        fid="server"
        title={hostOf(session.server ?? "")}
        icon={Server}
        quiet
        onPress={() => {}}
      />
      <div style={{ height: "16rem" }} />
      <ListItem
        fid="change"
        title={tr("connectChangeServer")}
        icon={RefreshCw}
        quiet
        onPress={props.onServers}
      />
      <ListItem
        fid="signOut"
        title={tr("shellSignOut")}
        icon={LogOut}
        quiet
        destructive
        onPress={() => session.signOut()}
      />
    </>
  )
}

/** The engine's version, from what it calls itself. */
function engineVersion(): string {
  return /Chrom(?:e|ium)\/([\d.]+)/.exec(navigator.userAgent)?.[1] ?? "?"
}

/** The app and the TV it runs on, for telling what a problem happened on. */
function AboutRows() {
  const rows = (): [string, string][] => [
    ["Matinee", platform().appVersion() ?? "dev"],
    [tr("tizen_about_model"), platform().model ?? "?"],
    [
      tr("tizen_about_system"),
      platform().tizenVersion === null
        ? "?"
        : `Tizen ${platform().tizenVersion}`,
    ],
    [tr("tizen_about_engine"), `Chromium ${engineVersion()}`],
    [
      tr("tizen_about_player"),
      tr(
        platform().hasNativePlayer ? "tizen_player_tv" : "tizen_player_browser",
      ),
    ],
  ]
  return (
    <For each={rows()}>
      {([title, value]) => (
        <ListItem
          fid={title}
          title={title}
          quiet
          trailing={<ListValue value={value} chevron={false} />}
          onPress={() => {}}
        />
      )}
    </For>
  )
}

/**
 * Settings on a TV. Focusing a category shows its rows; Right, Select, or
 * a click goes into them, Left or Back comes out to the category again.
 * Choices open in a panel at the right edge, switches flip in place.
 */
export function SettingsPage(props: { category?: string }) {
  const [selected, setSelected] = useKept(
    "category",
    CATEGORIES.some((category) => category.key === props.category)
      ? (props.category ?? "playback")
      : "playback",
  )
  const [picker, setPicker] = createSignal<Picker | null>(null)
  const [pickerOpen, setPickerOpen] = createSignal(false)
  const [servers, setServers] = createSignal(false)
  const [signingOut, setSigningOut] = createSignal<AccountSession | null>(null)
  const [signOutOpen, setSignOutOpen] = createSignal(false)
  const [reloads, setReloads] = createSignal(0)
  const [inRows, setInRows] = createSignal(false)
  const { toasts } = useApp()

  const find = (selector: string) =>
    document.querySelector<HTMLElement>(selector)
  const toCategory = () =>
    focusOn(find(`[data-fg="categories"] [data-f="${selected()}"]`))
  const toRows = () => focusOn(find('[data-fg="rows"]'))
  useBack(
    () => {
      toCategory()
    },
    () => inRows(),
  )

  const open: Open = (next) => {
    setPicker(next)
    setPickerOpen(true)
  }
  const rows = (): JSX.Element => {
    switch (selected()) {
      case "subtitles":
        return <SubtitleRows open={open} />
      case "languages":
        return <LanguageRows open={open} />
      case "devices":
        return (
          <DeviceRows
            reloads={reloads()}
            onSignOut={(item) => {
              setSigningOut(item)
              setSignOutOpen(true)
            }}
          />
        )
      case "account":
        return <AccountRows onServers={() => setServers(true)} />
      case "about":
        return <AboutRows />
      default:
        return <PlaybackRows open={open} />
    }
  }

  return (
    <Page class="page fill settings" start={() => ["categories", selected()]}>
      <div class="settings-categories">
        <div class="t-headline" style={{ padding: "0 20rem 28rem" }}>
          {tr("shellSettings")}
        </div>
        <div class="settings-list" data-fg="categories" data-fk="col">
          <For each={CATEGORIES}>
            {(category) => (
              <ListItem
                fid={category.key}
                title={tr(category.title)}
                icon={category.icon}
                quiet
                selected={category.key === selected()}
                onFocus={() => setSelected(category.key)}
                onPress={toRows}
                onKeyDown={(event) => {
                  // Right goes into the rows, whichever is nearest.
                  if (event.keyCode === 39) {
                    event.preventDefault()
                    toRows()
                  }
                }}
              />
            )}
          </For>
        </div>
      </div>
      <div
        class="settings-rows"
        data-scroll="near"
        data-scroll-start="8"
        data-scroll-end="51"
        onFocusIn={() => setInRows(true)}
        onFocusOut={() => setInRows(false)}
        onKeyDown={(event) => {
          if (event.keyCode === 37 && !event.defaultPrevented) {
            event.preventDefault()
            toCategory()
          }
        }}
      >
        {/* A new category starts its rows afresh. */}
        <Show when={selected()} keyed>
          {(_selected) => (
            <div class="settings-list" data-fg="rows" data-fk="col">
              {rows()}
            </div>
          )}
        </Show>
      </div>
      <OptionsPanel
        open={pickerOpen()}
        title={picker()?.title ?? ""}
        description={picker()?.description}
        options={picker()?.options ?? []}
        current={picker()?.current ?? null}
        onPick={(key) => {
          setPickerOpen(false)
          if (key !== picker()?.current) picker()?.onPick(key)
        }}
        onClose={() => setPickerOpen(false)}
      />
      <ServerPanel open={servers()} onClose={() => setServers(false)} />
      <SidePanel
        open={signOutOpen()}
        title={(() => {
          const item = signingOut()
          return item ? tr("tvSettingsSignOutDevice", sessionName(item)) : null
        })()}
        description={tr("tvSettingsSignOutDeviceDescription")}
        onBack={() => setSignOutOpen(false)}
      >
        <ListItem
          fid="signOut"
          title={tr("shellSignOut")}
          icon={LogOut}
          quiet
          destructive
          onPress={() => {
            setSignOutOpen(false)
            const item = signingOut()
            if (!item) return
            void toasts.showing(
              tr("accountSessionsSignOutFailed"),
              async () => {
                await session.api.account.sessions.revoke({ id: item.id })
                setReloads((count) => count + 1)
              },
            )
          }}
        />
        <ListItem
          fid="cancel"
          title={tr("commonCancel")}
          icon={X}
          quiet
          onPress={() => setSignOutOpen(false)}
        />
      </SidePanel>
    </Page>
  )
}
