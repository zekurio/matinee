import {
  audioFormatName,
  ORIGINAL_LANGUAGE,
  PLAYBACK_QUALITIES,
  PLAYBACK_QUALITY_IDS,
  type PlaybackAudioCodec,
  type PlaybackOptions,
  type PlaybackQuality,
  SUBTITLE_MODES,
  type SubtitleMode,
  videoCodecName,
} from "@matinee/contracts"
import { useQuery } from "@tanstack/react-query"
import { useShallow } from "zustand/shallow"

import { formatBitrate } from "@/components/player-format"
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

const MODE_LABELS = new Map<SubtitleMode, string>([
  ["default", "As the file says"],
  ["always", "Always"],
  ["foreign", "With foreign audio"],
  ["forced", "Forced only"],
  ["off", "Off"],
])

const MODE_DESCRIPTIONS = new Map<SubtitleMode, string>([
  ["default", "The file's default track."],
  ["always", "Full subtitles."],
  ["foreign", "Full subtitles when the audio is in another language."],
  ["forced", "Signs and foreign dialogue only."],
  ["off", "Until you pick a track in the player."],
])

const PASSTHROUGH_NOTES = new Map<PlaybackAudioCodec, string>([
  ["ac3", "Dolby Digital surround."],
  ["eac3", "Dolby Digital Plus, including Atmos."],
  ["flac", "Lossless. Uses far more bandwidth."],
  ["alac", "Apple Lossless. Uses far more bandwidth."],
])

/**
 * How videos play: the languages, which the account syncs, and the
 * quality and codecs, which stay with this browser. Only what this browser
 * and the server both support is offered.
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
  if (value === UNSET) return "The file's default"
  if (value === ORIGINAL_LANGUAGE) return "Original language"
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
      title="Languages"
      description="Synced to your account."
    >
      <SettingRows>
        <SelectRow
          title="Audio"
          description="Falls back to the file's default."
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
          title="Subtitles"
          description={MODE_DESCRIPTIONS.get(mode)}
          value={mode}
          options={SUBTITLE_MODES}
          labelOf={(value) => MODE_LABELS.get(value) ?? value}
          onChange={(subtitleMode) =>
            updatePlaybackPreferences({ subtitleMode })
          }
        />
        {mode !== "off" && (
          <SelectRow
            title="Subtitle language"
            value={preferences.subtitleLanguage ?? UNSET}
            options={languageOptions(
              [UNSET],
              options?.subtitleLanguages,
              preferences.subtitleLanguage,
            )}
            labelOf={(tag) =>
              tag === UNSET ? `This device's (${device})` : languageName(tag)
            }
            onChange={(tag) =>
              updatePlaybackPreferences({
                subtitleLanguage: tag === UNSET ? null : tag,
              })
            }
          />
        )}
        <SwitchRow
          title="Remember my picks"
          description="Subtitles you pick in the player carry over to the next video."
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
    ? `${preset.height}p, ${formatBitrate(preset.bitrate)}`
    : "Original"
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
      title="This device"
      description="Saved on this browser only."
    >
      <SettingRows>
        <SelectRow
          title="Quality"
          description="What videos start in."
          value={device.quality}
          options={PLAYBACK_QUALITY_IDS}
          labelOf={qualityLabel}
          onChange={(quality) => device.setDevicePlayback({ quality })}
        />
        {videoCodecs.length > 1 ? (
          <SelectRow
            title="Video codec"
            description="For transcodes. AV1 and HEVC look better but load the server more."
            value={
              videoChoices.includes(device.videoCodec)
                ? device.videoCodec
                : "auto"
            }
            options={videoChoices}
            labelOf={(codec) =>
              codec === "auto"
                ? `Automatic (${videoCodecName(autoVideo)})`
                : videoCodecName(codec)
            }
            onChange={(videoCodec) => device.setDevicePlayback({ videoCodec })}
          />
        ) : (
          <FixedRow
            title="Video codec"
            description="The only codec this browser and the server share."
            value="H.264"
          />
        )}
        {audioCodecs.length > 1 ? (
          <SelectRow
            title="Audio codec"
            description="Stereo, for audio this browser can't play."
            value={
              audioChoices.includes(device.audioCodec)
                ? device.audioCodec
                : "auto"
            }
            options={audioChoices}
            labelOf={(codec) =>
              codec === "auto"
                ? `Automatic (${audioFormatName(autoAudio)})`
                : audioFormatName(codec)
            }
            onChange={(audioCodec) => device.setDevicePlayback({ audioCodec })}
          />
        ) : (
          <FixedRow
            title="Audio codec"
            description="Stereo, for audio this browser can't play."
            value="AAC"
          />
        )}
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
      title="Audio passthrough"
      description="Formats this browser plays directly. Turn one off to have the server convert it."
    >
      <SettingRows>
        {codecs.map((codec) => (
          <SwitchRow
            key={codec}
            title={audioFormatName(codec)}
            description={PASSTHROUGH_NOTES.get(codec)}
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
