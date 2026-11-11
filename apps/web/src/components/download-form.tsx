import {
  audioFormatName,
  DOWNLOAD_CONTAINERS,
  type DownloadAudio,
  type DownloadChoices,
  type DownloadContainer,
  type DownloadResolution,
  type DownloadSpec,
  type DownloadVideoPreset,
  downloadFilePath,
  type MediaItem,
  subtitlePath,
  type SubtitleTrack,
  TRANSCODE_AUDIO_CODECS,
  type TranscodeVideoCodec,
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
  hashKey,
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { DownloadIcon } from "lucide-react"
import { useId } from "react"

import { audioDetail, formatBitrate } from "@/components/player-format"
import { tr, translateKnown } from "@/i18n"
import { downloadOriginal, downloadUrl } from "@/lib/download"
import { firstError, useAppForm } from "@/lib/form"
import { formatBytes } from "@/lib/format"
import { trackLabel } from "@/lib/languages"
import { outputChannelLayout } from "@/lib/media"
import { downloadDevice } from "@/lib/playback-device"
import { client, errorMessage, orpc, queryClient } from "@/lib/rpc"
import { subtitleLabel, trackDetail } from "@/lib/subtitles"

import { FormAlert } from "./form-alert"

/*
 * The form of `DownloadDialog`, apart so it loads when the dialog first
 * opens. The file as it is comes straight from the stream route; a
 * custom version is a spec the server plans, then makes while the
 * browser saves it. What a custom version can hold, and what it starts
 * with, is the server's answer from `downloads.resolve` for this
 * browser. The form only shows those choices and turns the viewer's
 * picks into a spec.
 */

type Version = "original" | "custom"

type TrackValue = {
  index: number
  on: boolean
  /** `copy`, the codec and channels to convert to, like `aac:2`, or empty for none. */
  choice: string
}

/** The parts of the form a container's choices decide. */
type TrackValues = {
  /** `copy`, or a preset as `height:bitrate`. */
  video: string
  /** Null when the server encodes nothing this browser plays. */
  codec: TranscodeVideoCodec | null
  /** In the order they go into the download. */
  audio: TrackValue[]
  /** Subtitles that go in the file, by id. */
  subtitles: string[]
  /** A picture subtitle's id, or empty for none. */
  burnIn: string
}

type DownloadValues = TrackValues & {
  version: Version
  container: DownloadContainer
  keepHdr: boolean
  /** The track values come from a server answer, not the blank start. */
  answered: boolean
}

type Ready = Extract<DownloadResolution, { status: "ready" }>
type AudioChoice = DownloadChoices["audio"][number]

const COPY = "copy"
const NONE = ""
const VERSIONS: readonly Version[] = ["original", "custom"]
/** A Matroska file keeps anything, so the form starts on one. */
const STARTING_CONTAINER: DownloadContainer = "mkv"

/** Whether this screen shows HDR, so an encode keeps it by default. */
function hdrScreen(): boolean {
  return window.matchMedia("(dynamic-range: high)").matches
}

/** What the server would make of this file in `container` for this browser. */
function resolveOptions(id: string, container: DownloadContainer) {
  return orpc.downloads.resolve.queryOptions({
    input: {
      ids: [id],
      device: downloadDevice(),
      wishes: {
        container,
        preset: null,
        codec: null,
        keepHdr: hdrScreen(),
        audio: "preferred",
        audioIndices: [],
        subtitles: "used",
      },
    },
  })
}

/** The server's default for the file, when it can make one. */
function readyOf(data: DownloadResolution[] | undefined): Ready | null {
  const answer = data?.[0]
  return answer?.status === "ready" ? answer : null
}

/** Why the server can't make the file, or null when it can or hasn't said. */
function unavailableOf(
  data: DownloadResolution[] | undefined,
  error: Error | null,
): string | null {
  const answer = data?.[0]
  if (answer?.status === "unavailable") return translateKnown(answer.message)
  if (answer) return null
  if (error) return errorMessage(error)
  return data ? tr("common.error.unknown") : null
}

/** The answer for `container` once it's in the cache. */
function cachedReady(id: string, container: DownloadContainer): Ready | null {
  return readyOf(
    queryClient.getQueryData(resolveOptions(id, container).queryKey),
  )
}

function presetValue(preset: DownloadVideoPreset): string {
  return `${preset.height}:${preset.bitrate}`
}

function audioValue(audio: DownloadAudio): string {
  return audio.mode === "copy" ? COPY : `${audio.codec}:${audio.channels}`
}

/** The ways a track can go into the download, as the server offers them. */
function audioChoices(entry: AudioChoice): { value: string; label: string }[] {
  return [
    ...(entry.keep
      ? [
          {
            value: COPY,
            label: tr("downloads.audio.keep", { format: entry.track.format }),
          },
        ]
      : []),
    ...entry.conversions.map((conversion) => ({
      value: `${conversion.codec}:${conversion.channels}`,
      label: tr("downloads.audio.convert", {
        codec: audioFormatName(conversion.codec),
        layout:
          outputChannelLayout(conversion.channels) ??
          String(conversion.channels),
      }),
    })),
  ]
}

/** Kept when the server allows it, else its first conversion. */
function defaultChoice(entry: AudioChoice): string {
  const first = entry.conversions[0]
  if (entry.keep) return COPY
  return first ? `${first.codec}:${first.channels}` : NONE
}

/**
 * Where the server's default spec puts the form: its audio first, in its
 * order, and the file's other tracks after them, off.
 */
function startingValues({ spec, choices }: Ready): TrackValues {
  const picked = spec.audio.map((audio) => ({
    index: audio.index,
    on: true,
    choice: audioValue(audio),
  }))
  const rest = choices.audio
    .filter((entry) =>
      spec.audio.every((audio) => audio.index !== entry.track.index),
    )
    .map((entry) => ({
      index: entry.track.index,
      on: false,
      choice: defaultChoice(entry),
    }))
  return {
    video:
      spec.video.mode === "copy"
        ? COPY
        : presetValue({
            height: spec.video.maxHeight,
            bitrate: spec.video.bitrate,
          }),
    codec:
      spec.video.mode === "encode"
        ? spec.video.codec
        : (choices.codecs[0] ?? null),
    audio: [...picked, ...rest],
    subtitles: spec.subtitles,
    burnIn: spec.burnIn ?? NONE,
  }
}

/**
 * `values` in another container: what the viewer picked where the
 * server still offers it, and the server's default where it doesn't.
 */
function adapted(values: DownloadValues, next: Ready): TrackValues {
  const fresh = startingValues(next)
  const { choices } = next
  const video =
    values.video === COPY
      ? choices.keepsVideo
      : choices.presets.some((preset) => presetValue(preset) === values.video)
  return {
    video: video ? values.video : fresh.video,
    codec:
      values.codec && choices.codecs.includes(values.codec)
        ? values.codec
        : fresh.codec,
    audio: values.audio.map((value) => {
      const entry = choices.audio.find(
        (choice) => choice.track.index === value.index,
      )
      if (!entry) return value
      if (audioChoices(entry).some((choice) => choice.value === value.choice))
        return value
      const choice = defaultChoice(entry)
      return { ...value, on: value.on && choice !== NONE, choice }
    }),
    subtitles: values.subtitles.filter((id) =>
      choices.subtitles.some((track) => track.id === id),
    ),
    burnIn: choices.burnIn.some((track) => track.id === values.burnIn)
      ? values.burnIn
      : NONE,
  }
}

function audioName(track: AudioChoice["track"], entries: AudioChoice[]) {
  return trackLabel(
    track.language,
    track.title,
    tr("player.track.unnamed", {
      number: entries.findIndex((entry) => entry.track === track) + 1,
    }),
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

function audioSpec(track: TrackValue): DownloadAudio {
  if (track.choice === COPY) return { index: track.index, mode: "copy" }
  const [name, channels] = track.choice.split(":")
  return {
    index: track.index,
    mode: "encode",
    codec: TRANSCODE_AUDIO_CODECS.find((codec) => codec === name) ?? "aac",
    channels: Number(channels) || 2,
  }
}

/** What the server should make of the viewer's picks. */
function specOf(
  values: DownloadValues,
  choices: DownloadChoices,
): DownloadSpec {
  const [height = 0, bitrate = 0] = values.video.split(":").map(Number)
  const codec = values.video === COPY ? null : values.codec
  return {
    container: values.container,
    video: codec
      ? {
          mode: "encode",
          codec,
          maxHeight: height,
          bitrate,
          keepHdr: values.keepHdr && choices.hdrCodecs.includes(codec),
        }
      : { mode: "copy" },
    audio: values.audio
      .filter((track) => track.on && track.choice !== NONE)
      .map(audioSpec),
    subtitles: values.subtitles,
    // Only an encode can have a subtitle drawn in.
    burnIn: codec && values.burnIn !== NONE ? values.burnIn : null,
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
  // The server may probe the file first. Until it answers, the dialog
  // spins, as it does while the form itself loads.
  const resolved = useQuery({
    ...resolveOptions(item.id, STARTING_CONTAINER),
    enabled: video !== null,
  })
  const subtitles = useQuery(
    orpc.media.subtitles.queryOptions({ input: { id: item.id } }),
  )
  if (video !== null && resolved.isPending) {
    return <Spinner className="mx-auto my-16 size-6 opacity-60" />
  }
  return (
    <DownloadFields
      item={item}
      name={name}
      initial={readyOf(resolved.data)}
      subtitles={subtitles.data?.tracks ?? []}
      onDone={onDone}
    />
  )
}

function DownloadFields({
  item,
  name,
  initial,
  subtitles,
  onDone,
}: {
  item: MediaItem
  name: string
  /** The server's answer the form starts from, null when it had none. */
  initial: Ready | null
  /** Every subtitle track of the file. */
  subtitles: SubtitleTrack[]
  onDone: () => void
}) {
  const video = item.probe?.video ?? null

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
    onError: (error) => toast.error(errorMessage(error)),
  })

  const defaultValues: DownloadValues = {
    version: "original",
    container: STARTING_CONTAINER,
    keepHdr: hdrScreen(),
    answered: initial !== null,
    ...(initial
      ? startingValues(initial)
      : { video: COPY, codec: null, audio: [], subtitles: [], burnIn: NONE }),
  }
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: ({ value }) =>
        value.version === "custom" &&
        value.audio.length > 0 &&
        !value.audio.some((track) => track.on)
          ? { message: tr("downloads.audio.none") }
          : undefined,
    },
    onSubmit: ({ value }) => {
      if (value.version === "original") {
        downloadOriginal(item)
        onDone()
        return
      }
      const ready = cachedReady(item.id, value.container)
      if (ready) start.mutate(specOf(value, ready.choices))
    },
    onSubmitInvalid: ({ formApi }) => {
      const message = firstError(formApi.state.errors)
      if (message) toast.error(message)
    },
  })

  const values = useSelector(form.store, (state) => state.values)
  const custom = values.version === "custom"

  // Cached by the first answer or by the container switch below.
  const current = useQuery({
    ...resolveOptions(item.id, values.container),
    enabled: video !== null,
  })
  const ready = readyOf(current.data)
  const unavailable = unavailableOf(current.data, current.error)

  // A container changes what the download can hold, so the server is
  // asked again before the form moves to it.
  const switchContainer = useMutation({
    mutationFn: (container: DownloadContainer) =>
      queryClient.fetchQuery(resolveOptions(item.id, container)),
    onSuccess: (data, container) => {
      const next = readyOf(data)
      if (next) {
        // Edits only carry over once the server has given choices.
        const picks = form.state.values.answered
          ? adapted(form.state.values, next)
          : startingValues(next)
        form.setFieldValue("answered", true)
        form.setFieldValue("video", picks.video)
        form.setFieldValue("codec", picks.codec)
        form.setFieldValue("audio", picks.audio)
        form.setFieldValue("subtitles", picks.subtitles)
        form.setFieldValue("burnIn", picks.burnIn)
      }
      form.setFieldValue("container", container)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const switching = switchContainer.isPending

  const spec = custom && ready ? specOf(values, ready.choices) : null
  // The server already planned its own spec.
  const unchanged =
    spec !== null && ready !== null && hashKey([spec]) === hashKey([ready.spec])
  const sized =
    spec !== null && (spec.audio.length > 0 || values.audio.length === 0)
  const planned = sized && !unchanged && !switching
  const plan = useQuery({
    ...orpc.downloads.plan.queryOptions({
      input: planned ? { id: item.id, spec } : skipToken,
    }),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const estimate = switching ? undefined : unchanged ? ready?.plan : plan.data

  const encode = values.video !== COPY
  const choices = ready?.choices
  // The original holds its own streams; only files beside it are missing.
  // A custom version holds the ones it's given.
  const files = custom
    ? []
    : subtitles.filter(
        (track) =>
          (track.delivery === "webvtt" || track.delivery === "pgs") &&
          track.source === "sidecar",
      )
  // Why the custom version can't be made, which holds the submit back, so
  // it stays in the form rather than going to a toast.
  const failed =
    custom && !switching
      ? (unavailable ??
        (planned && plan.error ? errorMessage(plan.error) : null))
      : null

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
                      value={
                        switching
                          ? switchContainer.variables
                          : field.state.value
                      }
                      disabled={switching}
                      onChange={(value) => {
                        const container = DOWNLOAD_CONTAINERS.find(
                          (entry) => entry === value,
                        )
                        if (container && container !== field.state.value)
                          switchContainer.mutate(container)
                      }}
                      items={DOWNLOAD_CONTAINERS.map((container) => ({
                        value: container,
                        label: container.toUpperCase(),
                      }))}
                    />
                  )}
                </form.Field>
                {choices && (
                  <>
                    <form.Field name="video">
                      {(field) => (
                        <ChoiceField
                          label={tr("downloads.video")}
                          value={field.state.value}
                          onChange={field.handleChange}
                          items={[
                            ...(choices.keepsVideo
                              ? [
                                  {
                                    value: COPY,
                                    label: tr("downloads.video.keep", {
                                      codec: video.format,
                                      resolution: video.resolution,
                                    }),
                                  },
                                ]
                              : []),
                            ...choices.presets.map((preset) => ({
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
                          value={field.state.value ?? NONE}
                          onChange={(value) => {
                            const codec = choices.codecs.find(
                              (entry) => entry === value,
                            )
                            if (codec) field.handleChange(codec)
                          }}
                          disabled={!encode}
                          items={choices.codecs.map((codec) => ({
                            value: codec,
                            label: videoCodecName(codec),
                          }))}
                        />
                      )}
                    </form.Field>
                  </>
                )}
              </div>

              {choices && (
                <>
                  {encode &&
                    values.codec &&
                    choices.hdrCodecs.includes(values.codec) && (
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

                  {choices.audio.length > 0 && (
                    <form.Field name="audio">
                      {(field) => (
                        <AudioTracks
                          values={field.state.value}
                          entries={choices.audio}
                          onChange={field.handleChange}
                        />
                      )}
                    </form.Field>
                  )}

                  {choices.subtitles.length > 0 && (
                    <form.Field name="subtitles">
                      {(field) => (
                        <SubtitleTracks
                          values={field.state.value}
                          tracks={choices.subtitles}
                          all={subtitles}
                          onChange={field.handleChange}
                        />
                      )}
                    </form.Field>
                  )}

                  {encode && choices.burnIn.length > 0 && (
                    <form.Field name="burnIn">
                      {(field) => (
                        <ChoiceField
                          label={tr("downloads.burnIn")}
                          value={field.state.value}
                          onChange={field.handleChange}
                          items={[
                            {
                              value: NONE,
                              label: tr("downloads.burnIn.none"),
                            },
                            ...choices.burnIn.map((track) => ({
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
            </>
          )}

          {files.length > 0 && (
            <SubtitleFiles item={item} files={files} all={subtitles} />
          )}
        </FieldGroup>

        {sized && !failed && (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {estimate
              ? [
                  tr("downloads.estimate", {
                    size: formatBytes(estimate.estimatedBytes),
                  }),
                  estimate.video.toneMapped && tr("downloads.toneMapped"),
                ]
                  .filter(Boolean)
                  .join(" ")
              : tr("downloads.estimating")}
          </p>
        )}
        {failed && <FormAlert message={failed} />}

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onDone}>
            {tr("downloads.cancel")}
          </Button>
          <form.SubmitButton
            icon={<DownloadIcon />}
            pending={start.isPending}
            disabled={custom && (switching || failed !== null)}
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
  entries,
  onChange,
}: {
  values: TrackValue[]
  /** The file's tracks, with the server's choices for each. */
  entries: AudioChoice[]
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
          const entry = entries.find(
            (choice) => choice.track.index === value.index,
          )
          if (!entry) return null
          const { track } = entry
          const label = audioName(track, entries)
          const choices = audioChoices(entry)
          return (
            <li
              key={value.index}
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <Switch
                checked={value.on}
                disabled={choices.length === 0}
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
              {choices.length === 0 ? (
                <p className="text-muted-foreground w-44 text-sm max-sm:w-full">
                  {tr("downloads.audio.unavailable")}
                </p>
              ) : (
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
              )}
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
