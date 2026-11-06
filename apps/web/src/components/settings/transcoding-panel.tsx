import {
  type AdminTranscodingSettings,
  type CapabilityCheck,
  DEINTERLACE_METHODS,
  ENCODER_PRESETS,
  HARDWARE_ACCELERATIONS,
  HARDWARE_DECODE_SUPPORT,
  type HardwareAcceleration,
  type HardwareCapability,
  type HardwareDecodeCodec,
  type TranscodeVideoCodec,
  type TranscodingCapabilities,
  type TranscodingSettings,
  TranscodingSettingsInput,
  TONEMAP_ALGORITHMS,
  TONEMAP_MODES,
  TONEMAP_RANGES,
} from "@matinee/contracts"
import { Alert, AlertDescription } from "@matinee/ui/components/alert"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { Switch } from "@matinee/ui/components/switch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { type ChangeEvent, type ReactNode, useState } from "react"

import { client, errorMessage, orpc } from "@/lib/rpc"

import {
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

const ACCELERATION_LABELS = new Map<HardwareAcceleration, string>([
  ["none", "None (software)"],
  ["vaapi", "VAAPI (Intel, AMD)"],
  ["qsv", "Intel Quick Sync"],
  ["nvenc", "NVIDIA NVENC"],
  ["videotoolbox", "Apple VideoToolbox"],
])

const CODEC_LABELS = new Map<string, string>([
  ["h264", "H.264"],
  ["hevc", "HEVC"],
  ["mpeg2video", "MPEG-2"],
  ["mpeg4", "MPEG-4"],
  ["vc1", "VC-1"],
  ["vp8", "VP8"],
  ["vp9", "VP9"],
  ["av1", "AV1"],
])

const ALGORITHM_LABELS = new Map<string, string>([
  ["none", "None"],
  ["clip", "Clip"],
  ["linear", "Linear"],
  ["gamma", "Gamma"],
  ["reinhard", "Reinhard"],
  ["hable", "Hable"],
  ["mobius", "Möbius"],
  ["bt2390", "BT.2390"],
])

const label = (labels: Map<string, string>, value: string) =>
  labels.get(value) ?? value

const NUMBER_FIELDS = [
  "h264Crf",
  "hevcCrf",
  "tonemappingDesat",
  "tonemappingPeak",
  "tonemappingParam",
  "vppTonemappingBrightness",
  "vppTonemappingContrast",
  "throttleDelaySeconds",
  "segmentKeepSeconds",
] as const
type NumberField = (typeof NUMBER_FIELDS)[number]

/**
 * The form. Numbers stay text while typed; device fields hold only a saved
 * value, and an empty one falls back to the environment's placeholder.
 */
type Draft = Omit<TranscodingSettings, NumberField> &
  Record<NumberField, string>

function draftFrom({ settings, defaults }: AdminTranscodingSettings): Draft {
  return {
    ...settings,
    vaapiDevice:
      settings.vaapiDevice === defaults.vaapiDevice ? "" : settings.vaapiDevice,
    qsvDevice:
      settings.qsvDevice === defaults.qsvDevice ? "" : settings.qsvDevice,
    h264Crf: String(settings.h264Crf),
    hevcCrf: String(settings.hevcCrf),
    tonemappingDesat: String(settings.tonemappingDesat),
    tonemappingPeak: String(settings.tonemappingPeak),
    tonemappingParam: String(settings.tonemappingParam),
    vppTonemappingBrightness: String(settings.vppTonemappingBrightness),
    vppTonemappingContrast: String(settings.vppTonemappingContrast),
    throttleDelaySeconds: String(settings.throttleDelaySeconds),
    segmentKeepSeconds: String(settings.segmentKeepSeconds),
  }
}

/** The save, checked by the contract's schema before it's sent. */
function inputFrom(draft: Draft) {
  const number = (value: string) =>
    value.trim() === "" ? Number.NaN : Number(value)
  return TranscodingSettingsInput.safeParse({
    ...draft,
    vaapiDevice: draft.vaapiDevice.trim(),
    qsvDevice: draft.qsvDevice.trim(),
    h264Crf: number(draft.h264Crf),
    hevcCrf: number(draft.hevcCrf),
    tonemappingDesat: number(draft.tonemappingDesat),
    tonemappingPeak: number(draft.tonemappingPeak),
    tonemappingParam: number(draft.tonemappingParam),
    vppTonemappingBrightness: number(draft.vppTonemappingBrightness),
    vppTonemappingContrast: number(draft.vppTonemappingContrast),
    throttleDelaySeconds: number(draft.throttleDelaySeconds),
    segmentKeepSeconds: number(draft.segmentKeepSeconds),
  })
}

const FIELD_NAMES = new Map<string, string>([
  ["vaapiDevice", "VAAPI device"],
  ["qsvDevice", "QSV device"],
  ["h264Crf", "H.264 CRF"],
  ["hevcCrf", "HEVC CRF"],
  ["tonemappingDesat", "Desaturation"],
  ["tonemappingPeak", "Peak"],
  ["tonemappingParam", "Parameter"],
  ["vppTonemappingBrightness", "VPP brightness"],
  ["vppTonemappingContrast", "VPP contrast"],
  ["throttleDelaySeconds", "Throttle after"],
  ["segmentKeepSeconds", "Keep segments for"],
])

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function TranscodingPanel() {
  const settings = useQuery(orpc.admin.transcoding.get.queryOptions())

  return (
    <SettingsSections>
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-muted-foreground text-sm">
          Couldn't load the transcoding settings. {errorMessage(settings.error)}
        </p>
      ) : (
        <TranscodingForm settings={settings.data} />
      )}
    </SettingsSections>
  )
}

/** The first line of what ffmpeg said, for a reason under a disabled option. */
function firstLine(check: CapabilityCheck): string | null {
  return check.error?.split("\n").find(Boolean) ?? null
}

/** Why an acceleration can't be picked, or null when it can. */
function accelerationProblem(
  capabilities: TranscodingCapabilities,
  acceleration: HardwareAcceleration,
): string | null {
  if (acceleration === "none") return null
  const hardware = hardwareOf(capabilities, acceleration)
  if (!hardware || hardware.device.status === "missing") {
    return "This ffmpeg build can't use it."
  }
  return null
}

function hardwareOf(
  capabilities: TranscodingCapabilities,
  acceleration: HardwareAcceleration,
): HardwareCapability | null {
  return (
    capabilities.hardware.find(
      (entry) => entry.acceleration === acceleration,
    ) ?? null
  )
}

function TranscodingForm({ settings }: { settings: AdminTranscodingSettings }) {
  const queryClient = useQueryClient()
  const initial = draftFrom(settings)
  // Null while untouched, so a refetch shows through until the first edit.
  const [edits, setEdits] = useState<Draft | null>(null)
  const draft = edits ?? initial
  const dirty = edits !== null && !sameDraft(edits, initial)
  const update = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch })
  const [invalid, setInvalid] = useState<string | null>(null)

  const apply = (next: AdminTranscodingSettings) =>
    queryClient.setQueryData(orpc.admin.transcoding.get.queryKey(), next)
  const save = useMutation({
    mutationFn: (input: TranscodingSettingsInput) =>
      client.admin.transcoding.update(input),
    onSuccess: (next) => {
      apply(next)
      setEdits(null)
      toast.success("Saved transcoding settings")
    },
  })
  const detect = useMutation({
    mutationFn: () => client.admin.transcoding.detect(),
    onSuccess: apply,
  })

  const { capabilities, defaults } = settings
  const accel = draft.hardwareAcceleration
  const hardware = accel === "none" ? null : hardwareOf(capabilities, accel)
  const decodable =
    accel === "none" ? [] : (HARDWARE_DECODE_SUPPORT.get(accel) ?? [])
  const { features } = capabilities
  const toggleCodec = (codec: HardwareDecodeCodec, on: boolean) =>
    update({
      hardwareDecodingCodecs: on
        ? [...draft.hardwareDecodingCodecs, codec]
        : draft.hardwareDecodingCodecs.filter((entry) => entry !== codec),
    })
  const encodes = (codec: TranscodeVideoCodec) =>
    capabilities.encoders.includes(
      codec === "h264" ? "libx264" : codec === "hevc" ? "libx265" : "libsvtav1",
    ) ||
    (hardware?.encoders.some(
      (entry) => entry.codec === codec && entry.status === "ok",
    ) ??
      false)
  const number = (key: NumberField) => ({
    value: draft[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      update({ [key]: event.target.value }),
  })

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <FfmpegSection
        capabilities={capabilities}
        detecting={detect.isPending}
        detectError={detect.error ? errorMessage(detect.error) : null}
        onDetect={() => detect.mutate()}
      />

      <SettingsSubsection
        id="hardware"
        title="Hardware acceleration"
        description="Decode, scale, tone map, and encode on a GPU. Anything the GPU can't do runs in software."
      >
        <SettingRows>
          <SettingRow
            title="Acceleration"
            description="Each one was tried with a short encode when the server started."
            layout="split"
            footer={
              hardware && hardware.device.status === "failed" ? (
                <Warning>
                  The device didn't open, so transcodes run in software.{" "}
                  {firstLine(hardware.device)} Check the device below and save
                  to try again.
                </Warning>
              ) : null
            }
          >
            {(ids) => (
              <Select
                items={HARDWARE_ACCELERATIONS.map((value) => ({
                  value,
                  label: label(ACCELERATION_LABELS, value),
                }))}
                value={accel}
                onValueChange={(value) =>
                  value && update({ hardwareAcceleration: value })
                }
              >
                <SelectTrigger
                  id={ids.controlId}
                  aria-describedby={ids.descriptionId}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HARDWARE_ACCELERATIONS.map((value) => {
                    const problem = accelerationProblem(capabilities, value)
                    return (
                      <SelectItem
                        key={value}
                        value={value}
                        disabled={problem !== null && value !== accel}
                      >
                        {label(ACCELERATION_LABELS, value)}
                        {problem && (
                          <span className="text-muted-foreground">
                            {problem}
                          </span>
                        )}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </SettingRow>
          {(accel === "vaapi" || accel === "qsv") && (
            <DeviceRow
              title={accel === "vaapi" ? "VAAPI device" : "QSV device"}
              description={
                accel === "vaapi"
                  ? "The render node to use."
                  : "The render node of the Intel GPU on a machine with several. Empty picks the Intel one."
              }
              value={accel === "vaapi" ? draft.vaapiDevice : draft.qsvDevice}
              placeholder={
                (accel === "vaapi"
                  ? defaults.vaapiDevice
                  : defaults.qsvDevice) || "Automatic"
              }
              onChange={(value) =>
                update(
                  accel === "vaapi"
                    ? { vaapiDevice: value }
                    : { qsvDevice: value },
                )
              }
            />
          )}
          {hardware && (
            <SettingRow
              title="Hardware encoding"
              description={<EncoderStatus hardware={hardware} />}
            >
              {(ids) => (
                <Switch
                  id={ids.controlId}
                  aria-labelledby={ids.labelId}
                  aria-describedby={ids.descriptionId}
                  checked={draft.enableHardwareEncoding}
                  onCheckedChange={(enableHardwareEncoding) =>
                    update({ enableHardwareEncoding })
                  }
                />
              )}
            </SettingRow>
          )}
        </SettingRows>
      </SettingsSubsection>

      {accel !== "none" && (
        <SettingsSubsection
          id="hardware-decoding"
          title="Hardware decoding"
          description="Source codecs the GPU decodes. The rest decode in software."
        >
          <SettingRows>
            {decodable.map((codec) => (
              <SwitchRow
                key={codec}
                title={label(CODEC_LABELS, codec)}
                checked={draft.hardwareDecodingCodecs.includes(codec)}
                onChange={(on) => toggleCodec(codec, on)}
              />
            ))}
            {accel !== "videotoolbox" && (
              <>
                <SwitchRow
                  title="HEVC 10-bit"
                  description="Most HDR. Needs Intel 7th generation, AMD Polaris, NVIDIA Pascal, or newer."
                  checked={draft.enableDecodingColorDepth10Hevc}
                  onChange={(enableDecodingColorDepth10Hevc) =>
                    update({ enableDecodingColorDepth10Hevc })
                  }
                />
                <SwitchRow
                  title="VP9 10-bit"
                  checked={draft.enableDecodingColorDepth10Vp9}
                  onChange={(enableDecodingColorDepth10Vp9) =>
                    update({ enableDecodingColorDepth10Vp9 })
                  }
                />
                <SwitchRow
                  title="HEVC RExt 8/10-bit"
                  description="4:2:2 and 4:4:4, from cameras. Intel 11th generation and newer; VAAPI on Intel only."
                  checked={draft.enableDecodingColorDepth10HevcRext}
                  onChange={(enableDecodingColorDepth10HevcRext) =>
                    update({ enableDecodingColorDepth10HevcRext })
                  }
                />
                <SwitchRow
                  title="HEVC RExt 12-bit"
                  checked={draft.enableDecodingColorDepth12HevcRext}
                  onChange={(enableDecodingColorDepth12HevcRext) =>
                    update({ enableDecodingColorDepth12HevcRext })
                  }
                />
              </>
            )}
          </SettingRows>
        </SettingsSubsection>
      )}

      <SettingsSubsection
        id="encoding"
        title="Encoding"
        description="H.264 is always allowed. Transcodes use HEVC or AV1 only for players that take them, on the GPU when it can."
      >
        <SettingRows>
          <SwitchRow
            title="Allow HEVC encoding"
            description={
              encodes("hevc")
                ? undefined
                : "No HEVC encoder works on this server."
            }
            checked={draft.allowHevcEncoding}
            disabled={!encodes("hevc") && !draft.allowHevcEncoding}
            onChange={(allowHevcEncoding) => update({ allowHevcEncoding })}
          />
          <SwitchRow
            title="Allow AV1 encoding"
            description={
              encodes("av1")
                ? undefined
                : "No AV1 encoder works on this server."
            }
            checked={draft.allowAv1Encoding}
            disabled={!encodes("av1") && !draft.allowAv1Encoding}
            onChange={(allowAv1Encoding) => update({ allowAv1Encoding })}
          />
          <SelectRow
            title="Encoder preset"
            description="Faster presets keep up on slower machines; slower ones look better. Auto is veryfast for x264 and x265."
            value={draft.encoderPreset}
            options={ENCODER_PRESETS}
            labelOf={(value) => (value === "auto" ? "Auto" : value)}
            onChange={(encoderPreset) => update({ encoderPreset })}
          />
          <NumberRow
            title="H.264 CRF"
            description="x264's quality, 0 to 51; lower is better. Only software encoding uses it."
            {...number("h264Crf")}
          />
          <NumberRow
            title="HEVC CRF"
            description="x265's quality, 0 to 51; lower is better. AV1 encodes to a bitrate instead."
            {...number("hevcCrf")}
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="tone-mapping"
        title="Tone mapping"
        description={
          features.tonemapx
            ? "HDR10, HLG, and Dolby Vision become SDR for players without HDR. tonemapx does it in software, including Dolby Vision profile 5, whenever the GPU doesn't."
            : "This ffmpeg has no tonemapx, so without GPU tone mapping HDR comes out washed out. Install jellyfin-ffmpeg."
        }
      >
        <SettingRows>
          {(accel === "vaapi" || accel === "qsv") && (
            <>
              <SwitchRow
                title="VPP tone mapping"
                description={checkNote(
                  hardware?.vppTonemap,
                  "Intel's own tone mapping, ahead of OpenCL. HDR10 and Dolby Vision over HDR10, with the GPU decoding.",
                )}
                checked={draft.enableVppTonemapping}
                disabled={
                  hardware?.vppTonemap.status !== "ok" &&
                  !draft.enableVppTonemapping
                }
                onChange={(enableVppTonemapping) =>
                  update({ enableVppTonemapping })
                }
              />
              <NumberRow
                title="VPP brightness"
                description="Brightness gain, 0 to 100. Jellyfin recommends 16."
                {...number("vppTonemappingBrightness")}
              />
              <NumberRow
                title="VPP contrast"
                description="Contrast gain, 1 to 2. Jellyfin recommends 1."
                {...number("vppTonemappingContrast")}
              />
            </>
          )}
          {accel === "videotoolbox" && (
            <SwitchRow
              title="VideoToolbox tone mapping"
              description={checkNote(
                hardware?.videoToolboxTonemap,
                "Apple's own tone mapping, ahead of Metal. Everything but Dolby Vision profile 5.",
              )}
              checked={draft.enableVideoToolboxTonemapping}
              disabled={
                hardware?.videoToolboxTonemap.status !== "ok" &&
                !draft.enableVideoToolboxTonemapping
              }
              onChange={(enableVideoToolboxTonemapping) =>
                update({ enableVideoToolboxTonemapping })
              }
            />
          )}
          {accel !== "none" && (
            <SwitchRow
              title="Hardware tone mapping"
              description={checkNote(
                hardware?.tonemap,
                accel === "nvenc"
                  ? "CUDA tone mapping on the GPU."
                  : accel === "videotoolbox"
                    ? "Metal tone mapping on the GPU."
                    : "OpenCL tone mapping on the GPU. Needs the OpenCL runtime of its driver, such as intel-compute-runtime.",
              )}
              checked={draft.enableTonemapping}
              disabled={
                hardware?.tonemap.status !== "ok" && !draft.enableTonemapping
              }
              onChange={(enableTonemapping) => update({ enableTonemapping })}
            />
          )}
          <SelectRow
            title="Algorithm"
            description="BT.2390 is Jellyfin's recommendation."
            value={draft.tonemappingAlgorithm}
            options={TONEMAP_ALGORITHMS}
            labelOf={(value) => label(ALGORITHM_LABELS, value)}
            onChange={(tonemappingAlgorithm) =>
              update({ tonemappingAlgorithm })
            }
          />
          {accel !== "none" && (
            <SelectRow
              title="Mode"
              description="GPU tone mapping only. Try RGB if highlights blow out."
              value={draft.tonemappingMode}
              options={TONEMAP_MODES}
              labelOf={(value) =>
                value === "auto" ? "Auto" : value.toUpperCase()
              }
              onChange={(tonemappingMode) => update({ tonemappingMode })}
            />
          )}
          <SelectRow
            title="Range"
            description="The output's range. Auto keeps the source's."
            value={draft.tonemappingRange}
            options={TONEMAP_RANGES}
            labelOf={(value) =>
              value === "auto" ? "Auto" : value.toUpperCase()
            }
            onChange={(tonemappingRange) => update({ tonemappingRange })}
          />
          <NumberRow
            title="Desaturation"
            description="Desaturate highlights brighter than this. 0 turns it off, as recommended."
            {...number("tonemappingDesat")}
          />
          <NumberRow
            title="Peak"
            description="The source's peak brightness when its metadata doesn't say, in units of 10 nits. 100 is 1000 nits."
            {...number("tonemappingPeak")}
          />
          <NumberRow
            title="Parameter"
            description="Tunes the algorithm. Leave it at 0."
            {...number("tonemappingParam")}
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="deinterlacing"
        title="Deinterlacing"
        description="Interlaced sources, like DVDs and TV recordings, are deinterlaced whenever they're transcoded."
      >
        <SettingRows>
          <SelectRow
            title="Method"
            value={draft.deinterlaceMethod}
            options={DEINTERLACE_METHODS}
            labelOf={(value) => (value === "yadif" ? "Yadif" : "Bwdif")}
            onChange={(deinterlaceMethod) => update({ deinterlaceMethod })}
          />
          <SwitchRow
            title="Double the frame rate"
            description="One frame per field, so 25 and 30 fps sources play at 50 and 60, as smooth as on a TV."
            checked={draft.deinterlaceDoubleRate}
            onChange={(deinterlaceDoubleRate) =>
              update({ deinterlaceDoubleRate })
            }
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="segments"
        title="Throttling and segments"
        description="Turn these off if playback stalls."
      >
        <SettingRows>
          <SwitchRow
            title="Throttle transcodes"
            description={
              features.pauseKeys
                ? "Pause ffmpeg once it is far enough ahead of the player, so it uses less while you watch."
                : "Needs jellyfin-ffmpeg, which can pause and resume."
            }
            checked={draft.enableThrottling}
            disabled={!features.pauseKeys && !draft.enableThrottling}
            onChange={(enableThrottling) => update({ enableThrottling })}
          />
          <NumberRow
            title="Throttle after"
            description="Seconds of video ahead of the player before ffmpeg pauses."
            {...number("throttleDelaySeconds")}
          />
          <SwitchRow
            title="Delete segments"
            description="Delete segments the player has fetched, so a transcode doesn't keep the whole file on disk."
            checked={draft.enableSegmentDeletion}
            onChange={(enableSegmentDeletion) =>
              update({ enableSegmentDeletion })
            }
          />
          <NumberRow
            title="Keep segments for"
            description="Seconds a fetched segment stays, for seeking back."
            {...number("segmentKeepSeconds")}
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={invalid ?? (save.error ? errorMessage(save.error) : null)}
        onReset={() => {
          setEdits(null)
          setInvalid(null)
          save.reset()
        }}
        onSave={() => {
          const parsed = inputFrom(draft)
          if (!parsed.success) {
            const issue = parsed.error.issues[0]
            const field = FIELD_NAMES.get(String(issue?.path[0] ?? ""))
            setInvalid(
              field
                ? `${field}: ${issue?.message}`
                : (issue?.message ?? "Check the fields."),
            )
            return
          }
          setInvalid(null)
          save.mutate(parsed.data)
        }}
      />
    </form>
  )
}

/** A check's reason under its switch when it didn't run here. */
function checkNote(
  check: CapabilityCheck | undefined,
  text: string,
): ReactNode {
  if (!check || check.status === "ok") return text
  const reason =
    check.status === "missing"
      ? "This ffmpeg build or GPU doesn't have it."
      : `It failed on this server: ${firstLine(check)}`
  return (
    <>
      {text} <span className="text-destructive">{reason}</span>
    </>
  )
}

function FfmpegSection({
  capabilities,
  detecting,
  detectError,
  onDetect,
}: {
  capabilities: TranscodingCapabilities
  detecting: boolean
  detectError: string | null
  onDetect: () => void
}) {
  const { features } = capabilities
  const missing = [
    !features.tonemapx && "tonemapx",
    !features.pauseKeys && "pause keys",
    !features.hevcRemoveDovi && "Dolby Vision removal",
  ].filter(Boolean)
  return (
    <SettingsSubsection
      id="ffmpeg"
      title="FFmpeg"
      description={
        capabilities.error
          ? "ffmpeg didn't run, so nothing can be transcoded."
          : `${capabilities.ffmpegPath}, detected ${capabilities.detectedAt.toLocaleString()}.`
      }
      action={
        <Button
          type="button"
          variant="outline"
          disabled={detecting}
          onClick={onDetect}
        >
          {detecting ? <Spinner /> : <RefreshCwIcon />}
          {detecting ? "Detecting…" : "Detect again"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={capabilities.jellyfin ? "default" : "secondary"}>
          {capabilities.jellyfin ? "jellyfin-ffmpeg" : "FFmpeg"}{" "}
          {capabilities.version?.replace(/-Jellyfin$/i, "") ?? "unknown"}
        </Badge>
        {capabilities.hardware
          .filter((entry) => entry.device.status === "ok")
          .map((entry) => (
            <Badge key={entry.acceleration} variant="outline">
              {label(ACCELERATION_LABELS, entry.acceleration)}
            </Badge>
          ))}
      </div>
      {capabilities.error && <Warning>{capabilities.error}</Warning>}
      {detectError && <Warning>{detectError}</Warning>}
      {!capabilities.error && missing.length > 0 && (
        <Warning>
          This build lacks {missing.join(", ")}. jellyfin-ffmpeg has them; see
          the README.
        </Warning>
      )}
    </SettingsSubsection>
  )
}

function EncoderStatus({ hardware }: { hardware: HardwareCapability }) {
  return (
    <>
      Encode on the GPU. Off still decodes and filters there.{" "}
      {hardware.encoders.map((encoder, index) => (
        <span key={encoder.encoder}>
          {index > 0 && ", "}
          <span
            className={encoder.status === "ok" ? "text-foreground" : undefined}
            title={encoder.error ?? undefined}
          >
            {encoder.encoder}{" "}
            {encoder.status === "ok"
              ? encoder.tenBit === "ok"
                ? "works, 10-bit too"
                : "works"
              : encoder.status === "missing"
                ? "isn't in this build"
                : "failed"}
          </span>
        </span>
      ))}
      .
    </>
  )
}

function SwitchRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string
  description?: ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <SettingRow title={title} description={description}>
      {(ids) => (
        <Switch
          id={ids.controlId}
          aria-labelledby={ids.labelId}
          aria-describedby={ids.descriptionId}
          checked={checked}
          disabled={disabled}
          onCheckedChange={onChange}
        />
      )}
    </SettingRow>
  )
}

function SelectRow<T extends string>({
  title,
  description,
  value,
  options,
  labelOf,
  onChange,
}: {
  title: string
  description?: ReactNode
  value: T
  options: readonly T[]
  labelOf: (value: T) => string
  onChange: (value: T) => void
}) {
  return (
    <SettingRow title={title} description={description} layout="split">
      {(ids) => (
        <Select
          items={options.map((option) => ({
            value: option,
            label: labelOf(option),
          }))}
          value={value}
          onValueChange={(next) => next && onChange(next)}
        >
          <SelectTrigger
            id={ids.controlId}
            aria-describedby={ids.descriptionId}
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {labelOf(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  )
}

function NumberRow({
  title,
  description,
  value,
  onChange,
}: {
  title: string
  description?: ReactNode
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <SettingRow title={title} description={description} layout="split">
      {(ids) => (
        <Input
          id={ids.controlId}
          aria-describedby={ids.descriptionId}
          inputMode="decimal"
          value={value}
          onChange={onChange}
        />
      )}
    </SettingRow>
  )
}

function DeviceRow({
  title,
  description,
  value,
  placeholder,
  onChange,
}: {
  title: string
  description: string
  value: string
  placeholder: string
  onChange: (value: string) => void
}) {
  return (
    <SettingRow title={title} description={description} layout="split">
      {(ids) => (
        <Input
          id={ids.controlId}
          aria-describedby={ids.descriptionId}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-[13px]"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </SettingRow>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription className="text-foreground">
        {children}
      </AlertDescription>
    </Alert>
  )
}
