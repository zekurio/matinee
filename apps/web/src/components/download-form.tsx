import {
  type AudioTrack,
  audioFormatName,
  canCopyAudio,
  canCopyVideo,
  DOWNLOAD_AUDIO_CHANNELS,
  DOWNLOAD_VIDEO_PRESETS,
  type DownloadAudio,
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
import { trackLabel } from "@/lib/languages"
import { channelLayout } from "@/lib/media"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { subtitleLabel, trackDetail } from "@/lib/subtitles"
import { browserVideoCodecs, decodesVideo } from "@/lib/video-support"

import { FormAlert } from "./form-alert"

/*
 * The form of `DownloadDialog`, apart so it loads when the dialog first
 * opens. The file as it is comes straight from the stream route; a
 * version for this device is a spec the server plans, then makes while
 * the browser saves it. Only what this browser plays and the server
 * makes is offered, the way the playback settings do it.
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
  /** `copy`, or a preset as `height:bitrate`. */
  video: string
  codec: TranscodeVideoCodec
  keepHdr: boolean
  /** In the order they go into the download. */
  audio: TrackValue[]
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

/** Codecs the server encodes and this browser plays, best first. */
function videoCodecs(options: PlaybackOptions): TranscodeVideoCodec[] {
  const codecs = browserVideoCodecs().filter((codec) =>
    options.videoCodecs.includes(codec),
  )
  return codecs.includes("h264") ? codecs : [...codecs, "h264"]
}

/** Codecs audio converts to: AAC first, since everything plays it. */
const CONVERSION_ORDER: readonly TranscodeAudioCodec[] = ["aac", "opus"]

function audioCodecs(options: PlaybackOptions): TranscodeAudioCodec[] {
  const plays = browserAudioCodecs()
  const codecs = CONVERSION_ORDER.filter(
    (codec) => options.audioCodecs.includes(codec) && plays.includes(codec),
  )
  return codecs.length > 0 ? codecs : ["aac"]
}

/** Whether a track can stay as it is: MP4 holds it and this browser plays it. */
function keepsAudio(track: AudioTrack): boolean {
  return (
    canCopyAudio(track.codec) &&
    browserAudioCodecs().some((codec) => codec === track.codec)
  )
}

function audioChoices(
  track: AudioTrack,
  codecs: readonly TranscodeAudioCodec[],
): { value: string; label: string }[] {
  const choices = []
  if (keepsAudio(track)) {
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
  for (const codec of codecs) {
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

/** Kept when this browser plays it, else the first conversion, in stereo. */
function defaultChoice(
  track: AudioTrack,
  codecs: readonly TranscodeAudioCodec[],
): string {
  if (keepsAudio(track)) return COPY
  const channels = (track.channels ?? 2) === 1 ? 1 : 2
  return `${codecs[0] ?? "aac"}:${channels}`
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
    burnIn: encode && values.burnIn !== NONE ? values.burnIn : null,
  }
}

/** Where the form starts: the original, with the video and audio this browser plays kept. */
function initialValues({
  video,
  presets,
  codecs,
  conversions,
  tracks,
}: {
  video: VideoStream | null
  presets: readonly DownloadVideoPreset[]
  codecs: readonly TranscodeVideoCodec[]
  conversions: readonly TranscodeAudioCodec[]
  tracks: readonly AudioTrack[]
}): DownloadValues {
  const keep =
    video !== null && canCopyVideo(video.codec) && decodesVideo(video)
  const preset = presets.find((entry) => entry.height <= 1080) ?? presets[0]
  return {
    version: "original",
    video: keep || !preset ? COPY : presetValue(preset),
    codec: codecs[0] ?? "h264",
    keepHdr: window.matchMedia("(dynamic-range: high)").matches,
    audio: tracks.map((track) => ({
      index: track.index,
      on: track.primary,
      choice: defaultChoice(track, conversions),
    })),
    burnIn: NONE,
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
  const codecs: readonly TranscodeVideoCodec[] = options
    ? videoCodecs(options)
    : ["h264"]
  const conversions: readonly TranscodeAudioCodec[] = options
    ? audioCodecs(options)
    : ["aac"]
  // Only what this browser plays: the original file keeps everything else.
  const keepVideo =
    video !== null && canCopyVideo(video.codec) && decodesVideo(video)
  // The primary track first: it's the one that plays by default.
  const ordered = [
    ...tracks.filter((track) => track.primary),
    ...tracks.filter((track) => !track.primary),
  ]

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
      video,
      presets,
      codecs,
      conversions,
      tracks: ordered,
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
  const pictures = subtitles.filter(
    (track) => track.delivery === "pgs" || track.delivery === "burn-in",
  )
  // The original holds its own streams; only files beside it are missing.
  const files = subtitles.filter(
    (track) =>
      (track.delivery === "webvtt" || track.delivery === "pgs") &&
      (custom || track.source === "sidecar"),
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
          <DialogDescription>{tr("downloads.description")}</DialogDescription>
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
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <form.Field name="video">
                  {(field) => (
                    <ChoiceField
                      label={tr("downloads.video")}
                      value={field.state.value}
                      onChange={field.handleChange}
                      items={[
                        ...(keepVideo
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
                        const codec = codecs.find((entry) => entry === value)
                        if (codec) field.handleChange(codec)
                      }}
                      disabled={!encode}
                      items={codecs.map((codec) => ({
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
                      description={tr("downloads.keepHdr.description")}
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
                      conversions={conversions}
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
                      description={tr("downloads.burnIn.description")}
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

/** The file as it is, or a version for this device, as two cards. */
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
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <Field orientation="horizontal">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </Field>
  )
}

/** A switch per track, and what each becomes. */
function AudioTracks({
  values,
  tracks,
  conversions,
  onChange,
}: {
  values: TrackValue[]
  tracks: AudioTrack[]
  conversions: readonly TranscodeAudioCodec[]
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
      <FieldDescription>{tr("downloads.audio.description")}</FieldDescription>
      <ul className="flex flex-col gap-3">
        {values.map((value) => {
          const track = tracks.find((entry) => entry.index === value.index)
          if (!track) return null
          const label = audioName(track, tracks)
          const choices = audioChoices(track, conversions)
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
