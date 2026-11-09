import {
  audioFormatName,
  ORIGINAL_LANGUAGE,
  PLAYBACK_QUALITIES,
  PLAYBACK_QUALITY_IDS,
  type PlaybackAudioCodec,
  type PlaybackOptions,
  type PlaybackQuality,
  SUBTITLE_MODES,
  videoCodecName,
} from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"
import { useShallow } from "zustand/shallow"

import { formatBitrate } from "@/components/player-format"
import { tr } from "@/i18n"
import { browserAudioCodecs, OPTIONAL_PASSTHROUGH } from "@/lib/audio-support"
import { deviceLanguage, languageName } from "@/lib/languages"
import {
  updatePlaybackPreferences,
  usePlaybackPreferences,
} from "@/lib/playback-sync"
import { orpc } from "@/lib/rpc"
import { browserVideoCodecs } from "@/lib/video-support"
import {
  type AudioCodecChoice,
  SKIP_STEPS,
  usePlayerPreferencesStore,
  type VideoCodecChoice,
} from "@/stores/player-preferences"

import { SelectRow, SwitchRow } from "./setting-controls"
import {
  SettingRow,
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

/** Stands in for null in a select, which only takes strings. */
const UNSET = ""

type PassthroughNote =
  `playback.passthrough.${"ac3" | "eac3" | "flac" | "alac"}`

const PASSTHROUGH_NOTES = new Map<PlaybackAudioCodec, PassthroughNote>([
  ["ac3", "playback.passthrough.ac3"],
  ["eac3", "playback.passthrough.eac3"],
  ["flac", "playback.passthrough.flac"],
  ["alac", "playback.passthrough.alac"],
])

function passthroughNote(codec: PlaybackAudioCodec): string | undefined {
  const key = PASSTHROUGH_NOTES.get(codec)
  return key && tr(key)
}

/**
 * How videos play: the languages, which the account syncs, and the
 * quality, codecs, and skips, which stay with this browser. Only what
 * this browser and the server both support is offered.
 */
export function PlaybackPanel() {
  const options = useQuery(orpc.playback.options.queryOptions()).data
  return (
    <SettingsSections>
      <LanguagesSection options={options} />
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
    <SettingsSubsection
      id="languages"
      title={tr("playback.languages.title")}
      description={tr("playback.languages.description")}
    >
      <SettingRows>
        <SelectRow
          title={tr("playback.audio.title")}
          description={tr("playback.audio.description")}
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
          description={tr(`playback.subtitles.mode.${mode}.description`)}
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
          title={tr("playback.subtitles.remember")}
          description={tr("playback.subtitles.remember.description")}
          checked={preferences.rememberSubtitles}
          onChange={(rememberSubtitles) =>
            updatePlaybackPreferences({ rememberSubtitles })
          }
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
  description,
  value,
}: {
  title: string
  description: string
  value: string
}) {
  return (
    <SettingRow title={title} description={description} layout="split">
      {(ids) => (
        <span
          id={ids.controlId}
          aria-describedby={ids.descriptionId}
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
      skipSeconds: state.skipSeconds,
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

  return (
    <SettingsSubsection
      id="device"
      title={tr("playback.device.title")}
      description={tr("playback.device.description")}
    >
      <SettingRows>
        <SelectRow
          title={tr("playback.quality.title")}
          description={tr("playback.quality.description")}
          value={device.quality}
          options={PLAYBACK_QUALITY_IDS}
          labelOf={qualityLabel}
          onChange={(quality) => device.setDevicePlayback({ quality })}
        />
        {videoCodecs.length > 1 ? (
          <SelectRow
            title={tr("playback.videoCodec.title")}
            description={tr("playback.videoCodec.description")}
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
          <FixedRow
            title={tr("playback.videoCodec.title")}
            description={tr("playback.videoCodec.only")}
            value="H.264"
          />
        )}
        {audioCodecs.length > 1 ? (
          <SelectRow
            title={tr("playback.audioCodec.title")}
            description={tr("playback.audioCodec.description")}
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
          <FixedRow
            title={tr("playback.audioCodec.title")}
            description={tr("playback.audioCodec.description")}
            value="AAC"
          />
        )}
        <SelectRow
          title={tr("playback.skip.title")}
          description={tr("playback.skip.description")}
          value={String(device.skipSeconds)}
          options={SKIP_STEPS.map(String)}
          labelOf={(value) =>
            tr("playback.skip.seconds", { count: Number(value) })
          }
          onChange={(value) =>
            device.setDevicePlayback({ skipSeconds: Number(value) })
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
      description={tr("playback.passthrough.description")}
    >
      <SettingRows>
        {codecs.map((codec) => (
          <SwitchRow
            key={codec}
            title={audioFormatName(codec)}
            description={passthroughNote(codec)}
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
