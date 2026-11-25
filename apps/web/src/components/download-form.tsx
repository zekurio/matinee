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
import {
  hashKey,
  keepPreviousData,
  skipToken,
  useMutation,
  useQuery,
} from "@tanstack/solid-query"
import { Download } from "lucide"
import {
  createMemo,
  createUniqueId,
  For,
  Show,
  snapshot,
  untrack,
} from "solid-js"

import { audioDetail, formatBitrate } from "@/components/player-format"
import { tr, translateKnown } from "@/i18n"
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/kit/field"
import { Icon } from "@/kit/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { Spinner } from "@/kit/spinner"
import { Switch } from "@/kit/switch"
import { toast } from "@/kit/toast"
import { downloadOriginal, downloadUrl } from "@/lib/download"
import { createForm } from "@/lib/form"
import { SubmitButton } from "@/lib/form-fields"
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
    subtitles: [...values.subtitles],
    // Only an encode can have a subtitle drawn in.
    burnIn: codec && values.burnIn !== NONE ? values.burnIn : null,
  }
}

export function DownloadForm(props: {
  item: MediaItem
  name: string
  onDone: () => void
}) {
  const probed = () => props.item.probe?.video != null
  // The server may probe the file first. Until it answers, the dialog
  // spins, as it does while the form itself loads.
  const resolved = useQuery(() => ({
    ...resolveOptions(props.item.id, STARTING_CONTAINER),
    enabled: probed(),
  }))
  const subtitles = useQuery(() =>
    orpc.media.subtitles.queryOptions({ input: { id: props.item.id } }),
  )
  return (
    <Show
      when={!(probed() && resolved.isPending)}
      fallback={<Spinner class="mx-auto my-16 size-6 opacity-60" />}
    >
      <DownloadFields
        item={props.item}
        name={props.name}
        initial={resolved.isSuccess ? readyOf(resolved.data) : null}
        subtitles={subtitles.isSuccess ? subtitles.data.tracks : []}
        onDone={props.onDone}
      />
    </Show>
  )
}

function DownloadFields(props: {
  item: MediaItem
  name: string
  /** The server's answer the form starts from, null when it had none. */
  initial: Ready | null
  /** Every subtitle track of the file. */
  subtitles: SubtitleTrack[]
  onDone: () => void
}) {
  const video = () => props.item.probe?.video ?? null

  const start = useMutation(() => ({
    mutationFn: (spec: DownloadSpec) =>
      client.downloads.start({ id: props.item.id, spec }),
    onSuccess: (download: { id: string; fileName: string }) => {
      downloadUrl(downloadFilePath(download.id), download.fileName)
      toast.success(tr("downloads.started"), {
        description: tr("downloads.started.description"),
      })
      props.onDone()
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))

  // The server's first answer seeds the form once, as a form's defaults
  // do. Query data is reactive, so the form gets a plain copy of it.
  const defaultValues = untrack((): DownloadValues => {
    const answer = props.initial ? snapshot(props.initial) : null
    return {
      version: "original",
      container: STARTING_CONTAINER,
      keepHdr: hdrScreen(),
      answered: answer !== null,
      ...(answer
        ? startingValues(answer)
        : { video: COPY, codec: null, audio: [], subtitles: [], burnIn: NONE }),
    }
  })
  const form = createForm<DownloadValues>({
    defaultValues,
    onSubmit: (value) => {
      if (value.version === "original") {
        downloadOriginal(props.item)
        props.onDone()
        return
      }
      if (value.audio.length > 0 && !value.audio.some((track) => track.on)) {
        toast.error(tr("downloads.audio.none"))
        return
      }
      const ready = cachedReady(props.item.id, value.container)
      if (ready) start.mutate(specOf(value, ready.choices))
    },
  })

  const values = () => form.values()
  const custom = () => values().version === "custom"

  // Cached by the first answer or by the container switch below.
  const current = useQuery(() => ({
    ...resolveOptions(props.item.id, values().container),
    enabled: video() !== null,
  }))
  const ready = () => (current.isSuccess ? readyOf(current.data) : null)
  const unavailable = () =>
    unavailableOf(current.isSuccess ? current.data : undefined, current.error)

  // A container changes what the download can hold, so the server is
  // asked again before the form moves to it.
  const switchContainer = useMutation(() => ({
    mutationFn: (container: DownloadContainer) =>
      queryClient.fetchQuery(resolveOptions(props.item.id, container)),
    onSuccess: (data: DownloadResolution[], container: DownloadContainer) => {
      const next = readyOf(data)
      if (next) {
        const now = snapshot(form.values())
        // Edits only carry over once the server has given choices.
        const picks = now.answered ? adapted(now, next) : startingValues(next)
        form.set("answered", true)
        form.set("video", picks.video)
        form.set("codec", picks.codec)
        form.set("audio", picks.audio)
        form.set("subtitles", picks.subtitles)
        form.set("burnIn", picks.burnIn)
      }
      form.set("container", container)
    },
    onError: (error: Error) => toast.error(errorMessage(error)),
  }))
  const switching = () => switchContainer.isPending

  const spec = createMemo(() => {
    const answer = ready()
    return custom() && answer ? specOf(values(), answer.choices) : null
  })
  // The server already planned its own spec.
  const unchanged = createMemo(() => {
    const planned = spec()
    const answer = ready()
    return (
      planned !== null &&
      answer !== null &&
      hashKey([planned]) === hashKey([answer.spec])
    )
  })
  const sized = () => {
    const planned = spec()
    return (
      planned !== null &&
      (planned.audio.length > 0 || values().audio.length === 0)
    )
  }
  const planned = () => sized() && !unchanged() && !switching()
  const plan = useQuery(() => {
    const wanted = spec()
    return {
      ...orpc.downloads.plan.queryOptions({
        input:
          planned() && wanted ? { id: props.item.id, spec: wanted } : skipToken,
      }),
      placeholderData: keepPreviousData,
      retry: false,
    }
  })
  const estimate = () =>
    switching()
      ? undefined
      : unchanged()
        ? ready()?.plan
        : plan.isSuccess || plan.isPlaceholderData
          ? plan.data
          : undefined

  const estimateText = () => {
    const known = estimate()
    if (!known) return tr("downloads.estimating")
    return tr(
      known.video.toneMapped
        ? "downloads.estimateToneMapped"
        : "downloads.estimate",
      { size: formatBytes(known.estimatedBytes) },
    )
  }

  const encode = () => values().video !== COPY
  const choices = () => ready()?.choices
  // The original holds its own streams; only files beside it are missing.
  // A custom version holds the ones it's given.
  const files = createMemo(() =>
    custom()
      ? []
      : props.subtitles.filter(
          (track) =>
            (track.delivery === "webvtt" || track.delivery === "pgs") &&
            track.source === "sidecar",
        ),
  )
  // Why the custom version can't be made, which holds the submit back, so
  // it stays in the form rather than going to a toast.
  const failed = () =>
    custom() && !switching()
      ? (unavailable() ??
        (planned() && plan.error ? errorMessage(plan.error) : null))
      : null

  return (
    <form
      class="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        void form.submit()
      }}
    >
      <DialogHeader>
        <DialogTitle class="text-lg leading-7 font-semibold">
          {tr("downloads.title", { name: props.name })}
        </DialogTitle>
        <DialogDescription class="sr-only">
          {tr("downloads.description")}
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <VersionChoice
          value={values().version}
          onChange={(version) => form.set("version", version)}
          item={props.item}
          customAvailable={video() !== null}
        />

        <Show when={custom() && video()}>
          {(probe) => (
            <>
              <div class="grid gap-4 sm:grid-cols-[6rem_1fr_8rem]">
                <ChoiceField
                  label={tr("downloads.container")}
                  value={
                    switching()
                      ? (switchContainer.variables ?? values().container)
                      : values().container
                  }
                  disabled={switching()}
                  onChange={(value) => {
                    const container = DOWNLOAD_CONTAINERS.find(
                      (entry) => entry === value,
                    )
                    if (container && container !== values().container)
                      switchContainer.mutate(container)
                  }}
                  items={DOWNLOAD_CONTAINERS.map((container) => ({
                    value: container,
                    label: container.toUpperCase(),
                  }))}
                />
                <Show when={choices()}>
                  {(offered) => (
                    <>
                      <ChoiceField
                        label={tr("downloads.video")}
                        value={values().video}
                        onChange={(value) => form.set("video", value)}
                        items={[
                          ...(offered().keepsVideo
                            ? [
                                {
                                  value: COPY,
                                  label: tr("downloads.video.keep", {
                                    codec: probe().format,
                                    resolution: probe().resolution,
                                  }),
                                },
                              ]
                            : []),
                          ...offered().presets.map((preset) => ({
                            value: presetValue(preset),
                            label: tr("downloads.video.preset", {
                              resolution: `${preset.height}p`,
                              bitrate: formatBitrate(preset.bitrate),
                            }),
                          })),
                        ]}
                      />
                      <ChoiceField
                        label={tr("downloads.codec")}
                        value={values().codec ?? NONE}
                        onChange={(value) => {
                          const codec = offered().codecs.find(
                            (entry) => entry === value,
                          )
                          if (codec) form.set("codec", codec)
                        }}
                        disabled={!encode()}
                        items={offered().codecs.map((codec) => ({
                          value: codec,
                          label: videoCodecName(codec),
                        }))}
                      />
                    </>
                  )}
                </Show>
              </div>

              <Show when={choices()}>
                {(offered) => (
                  <>
                    <Show
                      when={
                        encode() &&
                        values().codec !== null &&
                        offered().hdrCodecs.some(
                          (codec) => codec === values().codec,
                        )
                      }
                    >
                      <SwitchField
                        label={tr("downloads.keepHdr")}
                        checked={values().keepHdr}
                        onChange={(checked) => form.set("keepHdr", checked)}
                      />
                    </Show>

                    <Show when={offered().audio.length > 0}>
                      <AudioTracks
                        values={values().audio}
                        entries={offered().audio}
                        onChange={(audio) => form.set("audio", audio)}
                      />
                    </Show>

                    <Show when={offered().subtitles.length > 0}>
                      <SubtitleTracks
                        values={values().subtitles}
                        tracks={offered().subtitles}
                        all={props.subtitles}
                        onChange={(ids) => form.set("subtitles", ids)}
                      />
                    </Show>

                    <Show when={encode() && offered().burnIn.length > 0}>
                      <ChoiceField
                        label={tr("downloads.burnIn")}
                        value={values().burnIn}
                        onChange={(value) => form.set("burnIn", value)}
                        items={[
                          { value: NONE, label: tr("downloads.burnIn.none") },
                          ...offered().burnIn.map((track) => ({
                            value: track.id,
                            label: subtitleLabel(track, props.subtitles),
                          })),
                        ]}
                      />
                    </Show>
                  </>
                )}
              </Show>
            </>
          )}
        </Show>

        <Show when={files().length > 0}>
          <SubtitleFiles
            item={props.item}
            files={files()}
            all={props.subtitles}
          />
        </Show>
      </FieldGroup>

      <Show when={sized() && !failed()}>
        <p class="text-muted-foreground text-sm" aria-live="polite">
          {estimateText()}
        </p>
      </Show>
      <Show when={failed()}>
        {(message) => <FormAlert message={message()} />}
      </Show>

      <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6 py-4">
        <SubmitButton
          form={form}
          icon={<Icon icon={Download} />}
          pending={start.isPending}
          disabled={custom() && (switching() || failed() !== null)}
        >
          {tr("downloads.submit")}
        </SubmitButton>
      </DialogFooter>
    </form>
  )
}

/** The file as it is, or a custom version, as two cards. */
function VersionChoice(props: {
  value: Version
  onChange: (version: Version) => void
  item: MediaItem
  customAvailable: boolean
}) {
  const name = createUniqueId()
  const description = (version: Version) =>
    version === "original"
      ? tr("downloads.original.description", {
          format: props.item.container.toUpperCase(),
          size: formatBytes(props.item.sizeBytes),
        })
      : props.customAvailable
        ? tr("downloads.custom.description")
        : tr("downloads.custom.unavailable")
  return (
    <div
      role="radiogroup"
      aria-label={tr("downloads.version")}
      class="grid gap-2 sm:grid-cols-2"
    >
      <For each={VERSIONS}>
        {(version) => (
          <label class="has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-ring hover:bg-muted/50 flex cursor-pointer flex-col gap-1 rounded-lg border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent has-[:focus-visible]:ring-2">
            <input
              type="radio"
              name={name}
              value={version}
              checked={props.value === version}
              disabled={version === "custom" && !props.customAvailable}
              onChange={() => props.onChange(version)}
              class="sr-only"
            />
            <span class="text-sm font-medium">
              {tr(
                version === "original"
                  ? "downloads.original"
                  : "downloads.custom",
              )}
            </span>
            <span class="text-muted-foreground text-13px leading-5">
              {description(version)}
            </span>
          </label>
        )}
      </For>
    </div>
  )
}

function ChoiceField(props: {
  label: string
  description?: string
  value: string
  onChange: (value: string) => void
  items: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
}) {
  const id = createUniqueId()
  return (
    <Field>
      <FieldLabel for={id}>{props.label}</FieldLabel>
      <Select
        items={[...props.items]}
        value={props.value}
        disabled={props.disabled}
        onValueChange={(next) => {
          if (next !== null) props.onChange(next)
        }}
      >
        <SelectTrigger id={id} class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <For each={props.items}>
            {(option) => (
              <SelectItem value={option.value}>{option.label}</SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
      <Show when={props.description}>
        <FieldDescription>{props.description}</FieldDescription>
      </Show>
    </Field>
  )
}

function SwitchField(props: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = createUniqueId()
  return (
    <Field orientation="horizontal">
      <FieldLabel for={id}>{props.label}</FieldLabel>
      <Switch
        id={id}
        checked={props.checked}
        onCheckedChange={(checked) => props.onChange(checked)}
      />
    </Field>
  )
}

/** A switch per track, and what each becomes. */
function AudioTracks(props: {
  values: TrackValue[]
  /** The file's tracks, with the server's choices for each. */
  entries: AudioChoice[]
  onChange: (values: TrackValue[]) => void
}) {
  const update = (index: number, change: Partial<TrackValue>) =>
    props.onChange(
      props.values.map((value) =>
        value.index === index ? { ...value, ...change } : value,
      ),
    )
  return (
    <FieldSet>
      <FieldLegend variant="label">{tr("downloads.audio")}</FieldLegend>
      <ul class="flex flex-col gap-3">
        <For each={props.values} keyed={(value) => value.index}>
          {(value) => {
            const entry = createMemo(() =>
              props.entries.find(
                (choice) => choice.track.index === value().index,
              ),
            )
            return (
              <Show when={entry()}>
                {(found) => {
                  const label = () => audioName(found().track, props.entries)
                  const choices = createMemo(() => audioChoices(found()))
                  const detail = () => audioDetail(found().track)
                  return (
                    <li class="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Switch
                        checked={value().on}
                        disabled={choices().length === 0}
                        onCheckedChange={(on) => update(value().index, { on })}
                        aria-label={tr("downloads.audio.include", {
                          track: label(),
                        })}
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm">{label()}</p>
                        <Show when={detail()}>
                          <p class="text-muted-foreground text-xs">
                            {detail()}
                          </p>
                        </Show>
                      </div>
                      <Show
                        when={choices().length > 0}
                        fallback={
                          <p class="text-muted-foreground w-44 text-sm max-sm:w-full">
                            {tr("downloads.audio.unavailable")}
                          </p>
                        }
                      >
                        <Select
                          items={choices()}
                          value={value().choice}
                          disabled={!value().on}
                          onValueChange={(choice) => {
                            if (choice !== null)
                              update(value().index, { choice })
                          }}
                        >
                          <SelectTrigger
                            aria-label={tr("downloads.audio.format", {
                              track: label(),
                            })}
                            class="w-44 max-sm:w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <For each={choices()}>
                              {(choice) => (
                                <SelectItem value={choice.value}>
                                  {choice.label}
                                </SelectItem>
                              )}
                            </For>
                          </SelectContent>
                        </Select>
                      </Show>
                    </li>
                  )
                }}
              </Show>
            )
          }}
        </For>
      </ul>
    </FieldSet>
  )
}

/** A switch per subtitle, for whether it goes in the file. */
function SubtitleTracks(props: {
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
      <ul class="flex flex-col gap-3">
        <For each={props.tracks}>
          {(track) => {
            const label = () => subtitleLabel(track, props.all)
            return (
              <li class="flex items-center gap-3">
                <Switch
                  checked={props.values.includes(track.id)}
                  onCheckedChange={(checked) =>
                    // In the file's order, whichever is switched on first.
                    props.onChange(
                      props.tracks
                        .filter((entry) =>
                          entry.id === track.id
                            ? checked
                            : props.values.includes(entry.id),
                        )
                        .map((entry) => entry.id),
                    )
                  }
                  aria-label={tr("downloads.subtitles.include", {
                    track: label(),
                  })}
                />
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm">{label()}</p>
                  <p class="text-muted-foreground text-xs">
                    {trackDetail(track)}
                  </p>
                </div>
              </li>
            )
          }}
        </For>
      </ul>
    </FieldSet>
  )
}

/** Links that save subtitle tracks as files next to the video. */
function SubtitleFiles(props: {
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
      <ul class="flex flex-col gap-1">
        <For each={props.files}>
          {(track) => {
            const label = () => subtitleLabel(track, props.all)
            return (
              <li>
                <a
                  href={subtitlePath(props.item.id, track.id)}
                  download={subtitleFileName(props.item, track)}
                  aria-label={tr("downloads.subtitles.save", {
                    track: label(),
                  })}
                  class="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-2"
                >
                  <Icon
                    icon={Download}
                    class="text-muted-foreground size-4 shrink-0"
                  />
                  <span class="min-w-0 flex-1 truncate">{label()}</span>
                  <span class="text-muted-foreground shrink-0 text-xs">
                    {trackDetail(track)}
                  </span>
                </a>
              </li>
            )
          }}
        </For>
      </ul>
    </FieldSet>
  )
}
