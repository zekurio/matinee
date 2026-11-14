import {
  audioFormatName,
  ORIGINAL_LANGUAGE,
  PLAYBACK_QUALITIES,
  PLAYBACK_QUALITY_IDS,
  type PlaybackOptions,
  type PlaybackQuality,
  SKIP_STEPS,
  SUBTITLE_MODES,
  videoCodecName,
} from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useShallow } from "zustand/shallow"

import { formatBitrate } from "@/components/player-format"
import { tr } from "@/i18n"
import { browserAudioCodecs, OPTIONAL_PASSTHROUGH } from "@/lib/audio-support"
import { deviceLanguage, languageName } from "@/lib/languages"
import {
  updatePlaybackPreferences,
  usePlaybackPreferences,
} from "@/lib/playback-sync"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { browserVideoCodecs } from "@/lib/video-support"
import {
  type AudioCodecChoice,
  usePlayerPreferencesStore,
  type VideoCodecChoice,
} from "@/stores/player-preferences"

import { SelectRow, SwitchRow } from "./setting-controls"
import {
  SettingNote,
  SettingRow,
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

/** Stands in for null in a select, which only takes strings. */
const UNSET = ""

/**
 * How videos play: the languages, skips, and specials, which the account
 * syncs, and
 * the quality, codecs, and the next episode, which stay with this browser.
 * Only what this browser and the server both support is offered.
 */
export function PlaybackPanel() {
  const options = useQuery(orpc.playback.options.queryOptions()).data
  return (
    <SettingsSections>
      <LanguagesSection options={options} />
      <SkipsSection />
      <ShowsSection />
      <DeviceSection options={options} />
      <PassthroughSection />
    </SettingsSections>
  )
}

/**
 * The library's languages, after `fixed` choices like the file's default,
 * with `current` too when it isn't among them.
 */
function languageOptions(
  fixed: readonly string[],
  available: readonly string[] | undefined,
  current: string | null,
): string[] {
  const tags = [...(available ?? [])]
  if (current !== null && !fixed.includes(current) && !tags.includes(current)) {
    tags.unshift(current)
  }
  return [...fixed, ...tags]
}

function audioLabel(value: string): string {
  if (value === UNSET) return tr("playback.audio.fileDefault")
  if (value === ORIGINAL_LANGUAGE) return tr("playback.audio.original")
  return languageName(value)
}

function LanguagesSection({
  options,
}: {
  options: PlaybackOptions | undefined
}) {
  const preferences = usePlaybackPreferences()
  const mode = preferences.subtitleMode
  const device = languageName(deviceLanguage())

  return (
    <SettingsSubsection id="languages" title={tr("playback.languages.title")}>
      <SettingRows>
        <SelectRow
          title={tr("playback.audio.title")}
          value={preferences.audioLanguage ?? UNSET}
          options={languageOptions(
            [UNSET, ORIGINAL_LANGUAGE],
            options?.audioLanguages,
            preferences.audioLanguage,
          )}
          labelOf={audioLabel}
          onChange={(value) =>
            updatePlaybackPreferences({
              audioLanguage: value === UNSET ? null : value,
            })
          }
        />
        <SelectRow
          title={tr("playback.subtitles.title")}
          value={mode}
          options={SUBTITLE_MODES}
          labelOf={(value) => tr(`playback.subtitles.mode.${value}.label`)}
          onChange={(subtitleMode) =>
            updatePlaybackPreferences({ subtitleMode })
          }
        />
        {mode !== "off" && (
          <SelectRow
            title={tr("playback.subtitles.language")}
            value={preferences.subtitleLanguage ?? UNSET}
            options={languageOptions(
              [UNSET],
              options?.subtitleLanguages,
              preferences.subtitleLanguage,
            )}
            labelOf={(tag) =>
              tag === UNSET
                ? tr("playback.subtitles.deviceLanguage", { language: device })
                : languageName(tag)
            }
            onChange={(tag) =>
              updatePlaybackPreferences({
                subtitleLanguage: tag === UNSET ? null : tag,
              })
            }
          />
        )}
        <SwitchRow
          title={tr("playback.audio.remember")}
          checked={preferences.rememberAudio}
          onChange={(rememberAudio) =>
            updatePlaybackPreferences({ rememberAudio })
          }
        />
        <SwitchRow
          title={tr("playback.subtitles.remember")}
          checked={preferences.rememberSubtitles}
          onChange={(rememberSubtitles) =>
            updatePlaybackPreferences({ rememberSubtitles })
          }
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

/** The skip lengths to offer, with `current` too when it isn't a step. */
function skipOptions(current: number): string[] {
  const steps: number[] = [...SKIP_STEPS]
  if (!steps.includes(current)) steps.push(current)
  return steps.toSorted((a, b) => a - b).map(String)
}

/** How far the skip buttons and keys go each way, which the account syncs. */
function SkipsSection() {
  const { skipBackSeconds, skipForwardSeconds } = usePlaybackPreferences()
  const labelOf = (value: string) =>
    tr("playback.skip.seconds", { count: Number(value) })
  return (
    <SettingsSubsection id="skips" title={tr("playback.skip.title")}>
      <SettingRows>
        <SelectRow
          title={tr("playback.skip.back")}
          value={String(skipBackSeconds)}
          options={skipOptions(skipBackSeconds)}
          labelOf={labelOf}
          onChange={(value) =>
            updatePlaybackPreferences({ skipBackSeconds: Number(value) })
          }
        />
        <SelectRow
          title={tr("playback.skip.forward")}
          value={String(skipForwardSeconds)}
          options={skipOptions(skipForwardSeconds)}
          labelOf={labelOf}
          onChange={(value) =>
            updatePlaybackPreferences({ skipForwardSeconds: Number(value) })
          }
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

/**
 * Whether a show's specials list with its seasons, which the account
 * syncs and the server applies. Everything listed loads again after it.
 */
function ShowsSection() {
  const session = useQuery(orpc.auth.session.queryOptions())
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (showSpecials: boolean) =>
      client.account.library.setPreferences({ showSpecials }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user: saved })
      await queryClient.invalidateQueries()
    },
    onError: (error) =>
      toast.error(tr("playback.specials.failed"), {
        description: errorMessage(error),
      }),
  })
  // The switch moves at once; a failure puts it back.
  const checked = update.isPending
    ? update.variables
    : (session.data?.user?.library.showSpecials ?? true)
  return (
    <SettingsSubsection id="shows" title={tr("playback.shows.title")}>
      <SettingRows>
        <SwitchRow
          title={tr("playback.specials.title")}
          checked={checked}
          onChange={(value) => update.mutate(value)}
          footer={<SettingNote>{tr("playback.specials.note")}</SettingNote>}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

function qualityLabel(id: PlaybackQuality): string {
  const preset = PLAYBACK_QUALITIES.find((entry) => entry.id === id)
  return preset
    ? tr("playback.quality.preset", {
        height: String(preset.height),
        bitrate: formatBitrate(preset.bitrate),
      })
    : tr("playback.quality.original")
}

/** A row whose setting has a single possible value here, shown as text. */
function FixedRow({
  title,
  footer,
  value,
}: {
  title: string
  footer?: ReactNode
  value: string
}) {
  return (
    <SettingRow title={title} layout="split" footer={footer}>
      {(ids) => (
        <span
          id={ids.controlId}
          className="text-muted-foreground text-sm @lg:ml-auto"
        >
          {value}
        </span>
      )}
    </SettingRow>
  )
}

function DeviceSection({ options }: { options: PlaybackOptions | undefined }) {
  const device = usePlayerPreferencesStore(
    useShallow((state) => ({
      quality: state.quality,
      videoCodec: state.videoCodec,
      audioCodec: state.audioCodec,
      autoplayNext: state.autoplayNext,
      setDevicePlayback: state.setDevicePlayback,
    })),
  )
  // What both ends have, best first. Until the server answers, what this
  // browser plays.
  const videoCodecs = browserVideoCodecs().filter(
    (codec) => !options || options.videoCodecs.includes(codec),
  )
  const audioCodecs = browserAudioCodecs().flatMap((codec) =>
    (codec === "opus" || codec === "aac") &&
    (!options || options.audioCodecs.includes(codec))
      ? [codec]
      : [],
  )
  const autoVideo = videoCodecs[0] ?? "h264"
  const autoAudio = audioCodecs[0] ?? "aac"
  const videoChoices: VideoCodecChoice[] = ["auto", ...videoCodecs]
  const audioChoices: AudioCodecChoice[] = ["auto", ...audioCodecs]
  // The qualities this account may stream. Until the server answers, all.
  const qualities: PlaybackQuality[] = options
    ? ["original", ...options.qualities.map((preset) => preset.id)]
    : [...PLAYBACK_QUALITY_IDS]
  const limitNote =
    options && options.maxBitrate !== null ? (
      <SettingNote>
        {tr("playback.quality.limit", {
          rate: formatBitrate(options.maxBitrate),
        })}
      </SettingNote>
    ) : undefined

  return (
    <SettingsSubsection id="device" title={tr("playback.device.title")}>
      <SettingRows>
        {qualities.length > 1 ? (
          <SelectRow
            title={tr("playback.quality.title")}
            footer={limitNote}
            value={
              qualities.includes(device.quality) ? device.quality : "original"
            }
            options={qualities}
            labelOf={qualityLabel}
            onChange={(quality) => device.setDevicePlayback({ quality })}
          />
        ) : (
          <FixedRow
            title={tr("playback.quality.title")}
            footer={limitNote}
            value={qualityLabel("original")}
          />
        )}
        {videoCodecs.length > 1 ? (
          <SelectRow
            title={tr("playback.videoCodec.title")}
            value={
              videoChoices.includes(device.videoCodec)
                ? device.videoCodec
                : "auto"
            }
            options={videoChoices}
            labelOf={(codec) =>
              codec === "auto"
                ? tr("playback.codec.automatic", {
                    codec: videoCodecName(autoVideo),
                  })
                : videoCodecName(codec)
            }
            onChange={(videoCodec) => device.setDevicePlayback({ videoCodec })}
          />
        ) : (
          <FixedRow title={tr("playback.videoCodec.title")} value="H.264" />
        )}
        {audioCodecs.length > 1 ? (
          <SelectRow
            title={tr("playback.audioCodec.title")}
            value={
              audioChoices.includes(device.audioCodec)
                ? device.audioCodec
                : "auto"
            }
            options={audioChoices}
            labelOf={(codec) =>
              codec === "auto"
                ? tr("playback.codec.automatic", {
                    codec: audioFormatName(autoAudio),
                  })
                : audioFormatName(codec)
            }
            onChange={(audioCodec) => device.setDevicePlayback({ audioCodec })}
          />
        ) : (
          <FixedRow title={tr("playback.audioCodec.title")} value="AAC" />
        )}
        <SwitchRow
          title={tr("playback.autoplay.title")}
          checked={device.autoplayNext}
          onChange={(autoplayNext) =>
            device.setDevicePlayback({ autoplayNext })
          }
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

/** A switch per format this browser plays that the server could convert. */
function PassthroughSection() {
  const { convertAudio, setDevicePlayback } = usePlayerPreferencesStore(
    useShallow((state) => ({
      convertAudio: state.convertAudio,
      setDevicePlayback: state.setDevicePlayback,
    })),
  )
  const codecs = browserAudioCodecs().filter((codec) =>
    OPTIONAL_PASSTHROUGH.includes(codec),
  )
  if (codecs.length === 0) return null

  return (
    <SettingsSubsection
      id="passthrough"
      title={tr("playback.passthrough.title")}
    >
      <SettingRows>
        {codecs.map((codec) => (
          <SwitchRow
            key={codec}
            title={audioFormatName(codec)}
            checked={!convertAudio.includes(codec)}
            onChange={(on) =>
              setDevicePlayback({
                convertAudio: on
                  ? convertAudio.filter((entry) => entry !== codec)
                  : [...convertAudio, codec],
              })
            }
          />
        ))}
      </SettingRows>
    </SettingsSubsection>
  )
}
