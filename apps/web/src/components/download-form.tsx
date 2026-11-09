import {
  type AudioTrack,
  audioFormatName,
  canCopyAudio,
  canCopyVideo,
  DOWNLOAD_AUDIO_CHANNELS,
  DOWNLOAD_CONTAINERS,
  DOWNLOAD_VIDEO_PRESETS,
  type DownloadAudio,
  type DownloadContainer,
  type DownloadSpec,
  type DownloadVideoPreset,
  downloadFilePath,
  type MediaItem,
  type PlaybackOptions,
  subtitlePath,
  type SubtitleTrack,
  type TranscodeAudioCodec,
  type TranscodeVideoCodec,
  type VideoStream,
  videoCodecName,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@matinee/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { useSelector } from "@tanstack/react-form"
import {
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"
import { useId } from "react"

import {
  audioDetail,
  formatBitrate,
  resolutionName,
} from "@/components/player-format"
import { tr } from "@/i18n"
import { browserAudioCodecs } from "@/lib/audio-support"
import { downloadOriginal, downloadUrl } from "@/lib/download"
import { firstError, useAppForm } from "@/lib/form"
import { formatBytes } from "@/lib/format"
import { baseLanguage, deviceLanguage, trackLabel } from "@/lib/languages"
import { channelLayout } from "@/lib/media"
import { usePlaybackPreferences } from "@/lib/playback-sync"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { subtitleLabel, trackDetail } from "@/lib/subtitles"
import { browserVideoCodecs, decodesVideo } from "@/lib/video-support"

import { FormAlert } from "./form-alert"

/*
 * The form of `DownloadDialog`, apart so it loads when the dialog first
 * opens. The file as it is comes straight from the stream route; a
 * custom version is a spec the server plans, then makes while the
 * browser saves it. A Matroska file, the default, keeps anything as it
 * is, for players that take everything. An MP4 offers only what this
 * browser plays, the way the playback settings do it.
 */

type Version = "original" | "custom"

type TrackValue = {
  index: number
  on: boolean
  /** `copy`, or the codec and channels to convert to, like `aac:2`. */
  choice: string
}

type DownloadValues = {
  version: Version
  container: DownloadContainer
  /** `copy`, or a preset as `height:bitrate`. */
  video: string
  codec: TranscodeVideoCodec
  keepHdr: boolean
  /** In the order they go into the download. */
  audio: TrackValue[]
  /** Subtitles that go in the file, by id. */
  subtitles: string[]
  /** A picture subtitle's id, or empty for none. */
  burnIn: string
}

const COPY = "copy"
const NONE = ""
const VERSIONS: readonly Version[] = ["original", "custom"]

function presetValue(preset: DownloadVideoPreset): string {
  return `${preset.height}:${preset.bitrate}`
}

/**
 * The presets that don't scale the video up: their frame fits the
 * source's width or height, so a 1920×800 movie still gets 1080p. The
 * smallest is always there.
 */
function presetsFor(video: VideoStream): DownloadVideoPreset[] {
  const fits = DOWNLOAD_VIDEO_PRESETS.filter(
    (preset) =>
      preset.height <= video.height ||
      Math.round((preset.height * 16) / 9) <= video.width,
  )
  const smallest = DOWNLOAD_VIDEO_PRESETS.at(-1)
  return fits.length > 0 || !smallest ? fits : [smallest]
}

/** Codecs audio converts to: AAC first, since everything plays it. */
const CONVERSION_ORDER: readonly TranscodeAudioCodec[] = ["aac", "opus"]

/** What a custom version in a container can hold, for the form's choices. */
type Rules = {
  container: DownloadContainer
  /** The video can stay as it is. */
  keepsVideo: boolean
  keepsAudio: (track: AudioTrack) => boolean
  /** Codecs the video can be encoded to, best first. */
  codecs: TranscodeVideoCodec[]
  /** Codecs audio converts to. */
  conversions: TranscodeAudioCodec[]
  /** The subtitle tracks that can go in the file. */
  subtitles: SubtitleTrack[]
}

/**
 * Matroska keeps anything, and takes every codec the server encodes. MP4
 * keeps what it holds and this browser plays, and encodes to what this
 * browser plays.
 */
function rulesFor(
  container: DownloadContainer,
  video: VideoStream | null,
  subtitles: readonly SubtitleTrack[],
  options: PlaybackOptions | null,
): Rules {
  const server: Pick<PlaybackOptions, "videoCodecs" | "audioCodecs"> =
    options ?? { videoCodecs: ["h264"], audioCodecs: ["aac"] }
  if (container === "mkv") {
    const codecs = server.videoCodecs
    const conversions = CONVERSION_ORDER.filter((codec) =>
      server.audioCodecs.includes(codec),
    )
    return {
      container,
      keepsVideo: video !== null,
      keepsAudio: () => true,
      codecs: codecs.length > 0 ? codecs : ["h264"],
      conversions: conversions.length > 0 ? conversions : ["aac"],
      subtitles: subtitles.filter((track) => track.delivery !== null),
    }
  }
  const plays = browserAudioCodecs()
  const codecs = browserVideoCodecs().filter((codec) =>
    server.videoCodecs.includes(codec),
  )
  const conversions = CONVERSION_ORDER.filter(
    (codec) => server.audioCodecs.includes(codec) && plays.includes(codec),
  )
  return {
    container,
    keepsVideo:
      video !== null && canCopyVideo(video.codec) && decodesVideo(video),
    keepsAudio: (track) =>
      canCopyAudio(track.codec) && plays.some((codec) => codec === track.codec),
    codecs: codecs.includes("h264") ? codecs : [...codecs, "h264"],
    conversions: conversions.length > 0 ? conversions : ["aac"],
    subtitles: subtitles.filter((track) => track.delivery === "webvtt"),
  }
}

function audioChoices(
  track: AudioTrack,
  rules: Rules,
): { value: string; label: string }[] {
  const choices = []
  if (rules.keepsAudio(track)) {
    choices.push({
      value: COPY,
      label: tr("downloads.audio.keep", { format: track.format }),
    })
  }
  // Never more channels than the track has; mono only from mono.
  const most = track.channels ?? 2
  const counts = DOWNLOAD_AUDIO_CHANNELS.filter(
    (count) => count <= Math.max(most, 1) && (count > 1 || most === 1),
  )
  for (const codec of rules.conversions) {
    for (const count of counts) {
      choices.push({
        value: `${codec}:${count}`,
        label: tr("downloads.audio.convert", {
          codec: audioFormatName(codec),
          layout: channelLayout(null, count) ?? String(count),
        }),
      })
    }
  }
  return choices
}

/** Kept when the container allows it, else the first conversion, in stereo. */
function defaultChoice(track: AudioTrack, rules: Rules): string {
  if (rules.keepsAudio(track)) return COPY
  const channels = (track.channels ?? 2) === 1 ? 1 : 2
  return `${rules.conversions[0] ?? "aac"}:${channels}`
}

function audioName(track: AudioTrack, tracks: readonly AudioTrack[]): string {
  return trackLabel(
    track.language,
    track.title,
    tr("player.track.unnamed", { number: tracks.indexOf(track) + 1 }),
  )
}

/** The file's name without its folder and extension. */
function baseName(item: MediaItem): string {
  const name = item.relativePath.split("/").at(-1) ?? item.relativePath
  return name.replace(/\.[^.]+$/, "") || "video"
}

/** The file name a subtitle saves under, like `Movie.en.forced.vtt`. */
function subtitleFileName(item: MediaItem, track: SubtitleTrack): string {
  const parts = [baseName(item), track.language ?? "und"]
  if (track.forced) parts.push("forced")
  if (track.sdh) parts.push("sdh")
  return `${parts.join(".")}.${track.delivery === "pgs" ? "sup" : "vtt"}`
}

const hdrCodecs: readonly TranscodeVideoCodec[] = ["hevc", "av1"]

function audioSpec(track: TrackValue): DownloadAudio {
  if (track.choice === COPY) return { index: track.index, mode: "copy" }
  const [codec, channels] = track.choice.split(":")
  return {
    index: track.index,
    mode: "encode",
    codec: codec === "opus" ? "opus" : "aac",
    channels: Number(channels) || 2,
  }
}

/** What the server should make, or null for the file as it is. */
function specOf(values: DownloadValues): DownloadSpec | null {
  if (values.version === "original") return null
  const [height = 0, bitrate = 0] = values.video.split(":").map(Number)
  const encode = values.video !== COPY
  return {
    container: values.container,
    video: encode
      ? {
          mode: "encode",
          codec: values.codec,
          maxHeight: height,
          bitrate,
          keepHdr: values.keepHdr && hdrCodecs.includes(values.codec),
        }
      : { mode: "copy" },
    audio: values.audio.filter((track) => track.on).map(audioSpec),
    subtitles: values.subtitles,
    // Matroska holds picture subtitles as they are.
    burnIn:
      encode && values.container === "mp4" && values.burnIn !== NONE
        ? values.burnIn
        : null,
  }
}

/**
 * The subtitles a download starts with, as the apps pick them: the tracks
 * in the language subtitles show in and in the audio's.
 */
function startingSubtitles(
  subtitles: readonly SubtitleTrack[],
  subtitleLanguage: string | null,
  audio: AudioTrack | undefined,
): string[] {
  const languages = new Set(
    [
      baseLanguage(subtitleLanguage ?? deviceLanguage()),
      baseLanguage(audio?.language ?? null),
    ].filter((language) => language !== null),
  )
  return subtitles
    .filter((track) => {
      const language = baseLanguage(track.language)
      return language !== null && languages.has(language)
    })
    .slice(0, 8)
    .map((track) => track.id)
}

/** The size an encode starts at: 1080p, or the largest below it. */
function startingPreset(
  presets: readonly DownloadVideoPreset[],
): DownloadVideoPreset | undefined {
  return presets.find((entry) => entry.height <= 1080) ?? presets[0]
}

/**
 * Where the form starts: the original, with a Matroska file that keeps
 * the video and the audio.
 */
function initialValues({
  rules,
  presets,
  tracks,
  subtitles,
}: {
  rules: Rules
  presets: readonly DownloadVideoPreset[]
  tracks: readonly AudioTrack[]
  subtitles: string[]
}): DownloadValues {
  const preset = startingPreset(presets)
  return {
    version: "original",
    container: rules.container,
    video: rules.keepsVideo || !preset ? COPY : presetValue(preset),
    codec: rules.codecs[0] ?? "h264",
    keepHdr: window.matchMedia("(dynamic-range: high)").matches,
    audio: tracks.map((track) => ({
      index: track.index,
      on: track.primary,
      choice: defaultChoice(track, rules),
    })),
    subtitles,
    burnIn: NONE,
  }
}

/** `values` with what the container in `rules` can't hold picked again. */
function adapted(
  values: DownloadValues,
  rules: Rules,
  tracks: readonly AudioTrack[],
  presets: readonly DownloadVideoPreset[],
): DownloadValues {
  const preset = startingPreset(presets)
  return {
    ...values,
    container: rules.container,
    video:
      values.video === COPY && !rules.keepsVideo && preset
        ? presetValue(preset)
        : values.video,
    codec: rules.codecs.includes(values.codec)
      ? values.codec
      : (rules.codecs[0] ?? "h264"),
    audio: values.audio.map((value) => {
      const track = tracks.find((entry) => entry.index === value.index)
      if (!track) return value
      const valid = audioChoices(track, rules).some(
        (choice) => choice.value === value.choice,
      )
      return valid ? value : { ...value, choice: defaultChoice(track, rules) }
    }),
    subtitles: values.subtitles.filter((id) =>
      rules.subtitles.some((track) => track.id === id),
    ),
  }
}

export function DownloadForm({
  item,
  name,
  onDone,
}: {
  item: MediaItem
  name: string
  onDone: () => void
}) {
  const video = item.probe?.video ?? null
  const audio = useQuery({
    ...orpc.media.audio.queryOptions({ input: { id: item.id } }),
    enabled: video !== null,
  })
  const subtitles = useQuery(
    orpc.media.subtitles.queryOptions({ input: { id: item.id } }),
  )
  const options = useQuery(orpc.playback.options.queryOptions())
  const loading = video !== null && (audio.isPending || options.isPending)
  if (loading) {
    return <Spinner className="mx-auto my-16 size-6 opacity-60" />
  }
  return (
    <DownloadFields
      item={item}
      name={name}
      video={audio.data && options.data ? video : null}
      tracks={audio.data ?? []}
      subtitles={subtitles.data?.tracks ?? []}
      options={options.data ?? null}
      onDone={onDone}
    />
  )
}

function DownloadFields({
  item,
  name,
  video,
  tracks,
  subtitles,
  options,
  onDone,
}: {
  item: MediaItem
  name: string
  /** Null when only the original can be downloaded. */
  video: VideoStream | null
  tracks: AudioTrack[]
  subtitles: SubtitleTrack[]
  options: PlaybackOptions | null
  onDone: () => void
}) {
  const presets = video ? presetsFor(video) : []
  // The primary track first: it's the one that plays by default.
  const ordered = [
    ...tracks.filter((track) => track.primary),
    ...tracks.filter((track) => !track.primary),
  ]
  const preferences = usePlaybackPreferences()
  const rulesOf = (container: DownloadContainer) =>
    rulesFor(container, video, subtitles, options)

  const start = useMutation({
    mutationFn: (spec: DownloadSpec) =>
      client.downloads.start({ id: item.id, spec }),
    onSuccess: (download) => {
      downloadUrl(downloadFilePath(download.id), download.fileName)
      toast.success(tr("downloads.started"), {
        description: tr("downloads.started.description"),
      })
      onDone()
    },
  })

  const form = useAppForm({
    defaultValues: initialValues({
      rules: rulesOf("mkv"),
      presets,
      tracks: ordered,
      subtitles: startingSubtitles(
        rulesOf("mkv").subtitles,
        preferences.subtitleLanguage,
        ordered[0],
      ),
    }),
    validators: {
      onSubmit: ({ value }) =>
        value.version === "custom" &&
        tracks.length > 0 &&
        !value.audio.some((track) => track.on)
          ? { message: tr("downloads.audio.none") }
          : undefined,
    },
    onSubmit: ({ value }) => {
      const spec = specOf(value)
      if (spec) {
        start.mutate(spec)
        return
      }
      downloadOriginal(item)
      onDone()
    },
  })

  const values = useSelector(form.store, (state) => state.values)
  const validation = useSelector(form.store, (state) =>
    firstError(state.errors),
  )
  const spec = specOf(values)
  const planned =
    spec !== null && (spec.audio.length > 0 || tracks.length === 0)
  const plan = useQuery({
    ...orpc.downloads.plan.queryOptions({
      input: planned ? { id: item.id, spec } : skipToken,
    }),
    placeholderData: keepPreviousData,
    retry: false,
  })

  const custom = values.version === "custom"
  const encode = values.video !== COPY
  const rules = rulesOf(values.container)
  // Only an MP4 needs picture subtitles drawn in.
  const pictures =
    values.container === "mp4"
      ? subtitles.filter(
          (track) => track.delivery === "pgs" || track.delivery === "burn-in",
        )
      : []
  // The original holds its own streams; only files beside it are missing.
  // A custom version holds the ones it's given.
  const files = custom
    ? []
    : subtitles.filter(
        (track) =>
          (track.delivery === "webvtt" || track.delivery === "pgs") &&
          track.source === "sidecar",
      )
  const error =
    validation ??
    (start.error ? errorMessage(start.error) : null) ??
    (custom && plan.error ? errorMessage(plan.error) : null)

  return (
    <form.AppForm>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-lg leading-7 font-semibold">
            {tr("downloads.title", { name })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {tr("downloads.description")}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <form.Field name="version">
            {(field) => (
              <VersionChoice
                value={field.state.value}
                onChange={field.handleChange}
                item={item}
                customAvailable={video !== null}
              />
            )}
          </form.Field>

          {custom && video && (
            <>
              <div className="grid gap-4 sm:grid-cols-[6rem_1fr_8rem]">
                <form.Field name="container">
                  {(field) => (
                    <ChoiceField
                      label={tr("downloads.container")}
                      value={field.state.value}
                      onChange={(value) => {
                        const container = DOWNLOAD_CONTAINERS.find(
                          (entry) => entry === value,
                        )
                        if (!container) return
                        const next = adapted(
                          form.state.values,
                          rulesOf(container),
                          tracks,
                          presets,
                        )
                        form.setFieldValue("video", next.video)
                        form.setFieldValue("codec", next.codec)
                        form.setFieldValue("audio", next.audio)
                        form.setFieldValue("subtitles", next.subtitles)
                        field.handleChange(container)
                      }}
                      items={DOWNLOAD_CONTAINERS.map((container) => ({
                        value: container,
                        label: container.toUpperCase(),
                      }))}
                    />
                  )}
                </form.Field>
                <form.Field name="video">
                  {(field) => (
                    <ChoiceField
                      label={tr("downloads.video")}
                      value={field.state.value}
                      onChange={field.handleChange}
                      items={[
                        ...(rules.keepsVideo
                          ? [
                              {
                                value: COPY,
                                label: tr("downloads.video.keep", {
                                  codec: videoCodecName(video.codec),
                                  resolution: resolutionName(
                                    video.width,
                                    video.height,
                                  ),
                                }),
                              },
                            ]
                          : []),
                        ...presets.map((preset) => ({
                          value: presetValue(preset),
                          label: tr("downloads.video.preset", {
                            resolution: `${preset.height}p`,
                            bitrate: formatBitrate(preset.bitrate),
                          }),
                        })),
                      ]}
                    />
                  )}
                </form.Field>
                <form.Field name="codec">
                  {(field) => (
                    <ChoiceField
                      label={tr("downloads.codec")}
                      value={field.state.value}
                      onChange={(value) => {
                        const codec = rules.codecs.find(
                          (entry) => entry === value,
                        )
                        if (codec) field.handleChange(codec)
                      }}
                      disabled={!encode}
                      items={rules.codecs.map((codec) => ({
                        value: codec,
                        label: videoCodecName(codec),
                      }))}
                    />
                  )}
                </form.Field>
              </div>

              {encode && video.hdr && hdrCodecs.includes(values.codec) && (
                <form.Field name="keepHdr">
                  {(field) => (
                    <SwitchField
                      label={tr("downloads.keepHdr")}
                      checked={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              )}

              {tracks.length > 0 && (
                <form.Field name="audio">
                  {(field) => (
                    <AudioTracks
                      values={field.state.value}
                      tracks={tracks}
                      rules={rules}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              )}

              {rules.subtitles.length > 0 && (
                <form.Field name="subtitles">
                  {(field) => (
                    <SubtitleTracks
                      values={field.state.value}
                      tracks={rules.subtitles}
                      all={subtitles}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              )}

              {encode && pictures.length > 0 && (
                <form.Field name="burnIn">
                  {(field) => (
                    <ChoiceField
                      label={tr("downloads.burnIn")}
                      value={field.state.value}
                      onChange={field.handleChange}
                      items={[
                        { value: NONE, label: tr("downloads.burnIn.none") },
                        ...pictures.map((track) => ({
                          value: track.id,
                          label: subtitleLabel(track, subtitles),
                        })),
                      ]}
                    />
                  )}
                </form.Field>
              )}
            </>
          )}

          {files.length > 0 && (
            <SubtitleFiles item={item} files={files} all={subtitles} />
          )}
        </FieldGroup>

        {custom && planned && !error && (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {plan.data
              ? [
                  tr("downloads.estimate", {
                    size: formatBytes(plan.data.estimatedBytes),
                  }),
                  plan.data.video.toneMapped && tr("downloads.toneMapped"),
                ]
                  .filter(Boolean)
                  .join(" ")
              : tr("downloads.estimating")}
          </p>
        )}
        {error && <FormAlert message={error} />}

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onDone}>
            {tr("downloads.cancel")}
          </Button>
          <form.SubmitButton
            icon={<DownloadIcon />}
            pending={start.isPending}
            disabled={custom && plan.isError}
          >
            {tr("downloads.submit")}
          </form.SubmitButton>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}

/** The file as it is, or a custom version, as two cards. */
function VersionChoice({
  value,
  onChange,
  item,
  customAvailable,
}: {
  value: Version
  onChange: (version: Version) => void
  item: MediaItem
  customAvailable: boolean
}) {
  const name = useId()
  const descriptions = new Map<Version, string>([
    [
      "original",
      tr("downloads.original.description", {
        format: item.container.toUpperCase(),
        size: formatBytes(item.sizeBytes),
      }),
    ],
    [
      "custom",
      customAvailable
        ? tr("downloads.custom.description")
        : tr("downloads.custom.unavailable"),
    ],
  ])
  return (
    <div
      role="radiogroup"
      aria-label={tr("downloads.version")}
      className="grid gap-2 sm:grid-cols-2"
    >
      {VERSIONS.map((version) => (
        <label
          key={version}
          className="has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-ring hover:bg-muted/50 flex cursor-pointer flex-col gap-1 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent has-[:focus-visible]:ring-2"
        >
          <input
            type="radio"
            name={name}
            value={version}
            checked={value === version}
            disabled={version === "custom" && !customAvailable}
            onChange={() => onChange(version)}
            className="sr-only"
          />
          <span className="text-sm font-medium">
            {tr(
              version === "original"
                ? "downloads.original"
                : "downloads.custom",
            )}
          </span>
          <span className="text-muted-foreground text-[13px] leading-5">
            {descriptions.get(version)}
          </span>
        </label>
      ))}
    </div>
  )
}

function ChoiceField({
  label,
  description,
  value,
  onChange,
  items,
  disabled,
}: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  items: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next !== null && onChange(next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

/** A switch per track, and what each becomes. */
function AudioTracks({
  values,
  tracks,
  rules,
  onChange,
}: {
  values: TrackValue[]
  tracks: AudioTrack[]
  rules: Rules
  onChange: (values: TrackValue[]) => void
}) {
  const update = (index: number, change: Partial<TrackValue>) =>
    onChange(
      values.map((value) =>
        value.index === index ? { ...value, ...change } : value,
      ),
    )
  return (
    <FieldSet>
      <FieldLegend variant="label">{tr("downloads.audio")}</FieldLegend>
      <ul className="flex flex-col gap-3">
        {values.map((value) => {
          const track = tracks.find((entry) => entry.index === value.index)
          if (!track) return null
          const label = audioName(track, tracks)
          const choices = audioChoices(track, rules)
          return (
            <li
              key={value.index}
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <Switch
                checked={value.on}
                onCheckedChange={(on) => update(value.index, { on })}
                aria-label={tr("downloads.audio.include", { track: label })}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{label}</p>
                {audioDetail(track) && (
                  <p className="text-muted-foreground text-xs">
                    {audioDetail(track)}
                  </p>
                )}
              </div>
              <Select
                items={choices}
                value={value.choice}
                disabled={!value.on}
                onValueChange={(choice) =>
                  choice !== null && update(value.index, { choice })
                }
              >
                <SelectTrigger
                  aria-label={tr("downloads.audio.format", { track: label })}
                  className="w-44 max-sm:w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          )
        })}
      </ul>
    </FieldSet>
  )
}

/** A switch per subtitle, for whether it goes in the file. */
function SubtitleTracks({
  values,
  tracks,
  all,
  onChange,
}: {
  values: string[]
  tracks: SubtitleTrack[]
  all: SubtitleTrack[]
  onChange: (values: string[]) => void
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">
        {tr("downloads.subtitles.inFile")}
      </FieldLegend>
      <ul className="flex flex-col gap-3">
        {tracks.map((track) => {
          const label = subtitleLabel(track, all)
          const on = values.includes(track.id)
          return (
            <li key={track.id} className="flex items-center gap-3">
              <Switch
                checked={on}
                onCheckedChange={(checked) =>
                  // In the file's order, whichever is switched on first.
                  onChange(
                    tracks
                      .filter((entry) =>
                        entry.id === track.id
                          ? checked
                          : values.includes(entry.id),
                      )
                      .map((entry) => entry.id),
                  )
                }
                aria-label={tr("downloads.subtitles.include", {
                  track: label,
                })}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{label}</p>
                <p className="text-muted-foreground text-xs">
                  {trackDetail(track)}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </FieldSet>
  )
}

/** Links that save subtitle tracks as files next to the video. */
function SubtitleFiles({
  item,
  files,
  all,
}: {
  item: MediaItem
  files: SubtitleTrack[]
  all: SubtitleTrack[]
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{tr("downloads.subtitles")}</FieldLegend>
      <FieldDescription>
        {tr("downloads.subtitles.description")}
      </FieldDescription>
      <ul className="flex flex-col gap-1">
        {files.map((track) => {
          const label = subtitleLabel(track, all)
          return (
            <li key={track.id}>
              <a
                href={subtitlePath(item.id, track.id)}
                download={subtitleFileName(item, track)}
                aria-label={tr("downloads.subtitles.save", { track: label })}
                className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
              >
                <DownloadIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {trackDetail(track)}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </FieldSet>
  )
}
