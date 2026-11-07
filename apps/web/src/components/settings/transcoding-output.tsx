import {
  DEINTERLACE_METHODS,
  DOWNMIX_ALGORITHMS,
  ENCODER_PRESETS,
  type HardwareCapability,
  type TranscodeVideoCodec,
  type TranscodingCapabilities,
  TONEMAP_ALGORITHMS,
  TONEMAP_MODES,
  TONEMAP_RANGES,
} from "@matinee/contracts"
import { useSelector } from "@tanstack/react-form"

import { withForm } from "@/lib/form"

import { SelectField, SwitchField, typeOnly } from "./setting-controls"
import { SettingRows, SettingsSubsection } from "./settings-panel"
import {
  CapabilitySwitchField,
  checkNote,
  label,
  NumberRows,
} from "./transcoding-controls"
import { draftForm } from "./transcoding-draft"

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

const DOWNMIX_LABELS = new Map<string, string>([
  ["none", "None"],
  ["dave750", "Dave750"],
  ["nightmode-dialogue", "Nightmode dialogue"],
  ["rfc7845", "RFC 7845"],
  ["ac4", "AC-4"],
])

/** The AAC encoders with a VBR mode, in the order the server picks them. */
const VBR_ENCODERS = ["aac_at", "libfdk_aac"]

interface SectionProps {
  capabilities: TranscodingCapabilities
  /** What the draft's acceleration detected as; null for software. */
  hardware: HardwareCapability | null
}

const upperOrAuto = (value: string) =>
  value === "auto" ? "Auto" : value.toUpperCase()

export const EncodingSection = withForm({
  ...draftForm,
  props: typeOnly<SectionProps>(),
  render: function Render({ form, capabilities, hardware }) {
    const encodes = (codec: TranscodeVideoCodec) =>
      capabilities.encoders.includes(
        codec === "h264"
          ? "libx264"
          : codec === "hevc"
            ? "libx265"
            : "libsvtav1",
      ) ||
      (hardware?.encoders.some(
        (entry) => entry.codec === codec && entry.status === "ok",
      ) ??
        false)

    return (
      <SettingsSubsection
        id="encoding"
        title="Encoding"
        description="H.264 is always on. HEVC and AV1 go only to players that support them."
      >
        <SettingRows>
          <form.AppField name="allowHevcEncoding">
            {() => (
              <CapabilitySwitchField
                title="Allow HEVC encoding"
                unavailable="No HEVC encoder works on this server."
                available={encodes("hevc")}
              />
            )}
          </form.AppField>
          <form.AppField name="allowAv1Encoding">
            {() => (
              <CapabilitySwitchField
                title="Allow AV1 encoding"
                unavailable="No AV1 encoder works on this server."
                available={encodes("av1")}
              />
            )}
          </form.AppField>
          <form.AppField name="encoderPreset">
            {() => (
              <SelectField
                title="Encoder preset"
                description="Slower looks better. Auto is veryfast."
                options={ENCODER_PRESETS}
                labelOf={(value) => (value === "auto" ? "Auto" : value)}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["h264Crf", "hevcCrf"]} />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

export const ToneMappingSection = withForm({
  ...draftForm,
  props: typeOnly<SectionProps>(),
  render: function Render({ form, capabilities, hardware }) {
    const accel = useSelector(
      form.store,
      (state) => state.values.hardwareAcceleration,
    )

    return (
      <SettingsSubsection
        id="tone-mapping"
        title="Tone mapping"
        description={
          capabilities.features.tonemapx
            ? "Converts HDR to SDR for players without HDR."
            : "This ffmpeg lacks tonemapx, so HDR looks washed out without GPU tone mapping. Install jellyfin-ffmpeg."
        }
      >
        <SettingRows>
          {(accel === "vaapi" || accel === "qsv") && (
            <>
              <form.AppField name="enableVppTonemapping">
                {() => (
                  <CapabilitySwitchField
                    title="VPP tone mapping"
                    description={checkNote(
                      hardware?.vppTonemap,
                      "Intel's tone mapping, used before OpenCL. Needs hardware decoding.",
                    )}
                    available={hardware?.vppTonemap.status === "ok"}
                  />
                )}
              </form.AppField>
              <NumberRows
                form={form}
                fields={["vppTonemappingBrightness", "vppTonemappingContrast"]}
              />
            </>
          )}
          {accel === "videotoolbox" && (
            <form.AppField name="enableVideoToolboxTonemapping">
              {() => (
                <CapabilitySwitchField
                  title="VideoToolbox tone mapping"
                  description={checkNote(
                    hardware?.videoToolboxTonemap,
                    "Apple's tone mapping, used before Metal.",
                  )}
                  available={hardware?.videoToolboxTonemap.status === "ok"}
                />
              )}
            </form.AppField>
          )}
          {accel !== "none" && (
            <form.AppField name="enableTonemapping">
              {() => (
                <CapabilitySwitchField
                  title="Hardware tone mapping"
                  description={checkNote(
                    hardware?.tonemap,
                    accel === "nvenc"
                      ? "Runs on CUDA."
                      : accel === "videotoolbox"
                        ? "Runs on Metal."
                        : "Runs on OpenCL. Needs the driver's OpenCL runtime.",
                  )}
                  available={hardware?.tonemap.status === "ok"}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="tonemappingAlgorithm">
            {() => (
              <SelectField
                title="Algorithm"
                description="BT.2390 is recommended."
                options={TONEMAP_ALGORITHMS}
                labelOf={(value) => label(ALGORITHM_LABELS, value)}
              />
            )}
          </form.AppField>
          {accel !== "none" && (
            <form.AppField name="tonemappingMode">
              {() => (
                <SelectField
                  title="Mode"
                  description="GPU only. Try RGB if highlights blow out."
                  options={TONEMAP_MODES}
                  labelOf={upperOrAuto}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="tonemappingRange">
            {() => (
              <SelectField
                title="Range"
                description="Auto keeps the source's range."
                options={TONEMAP_RANGES}
                labelOf={upperOrAuto}
              />
            )}
          </form.AppField>
          <NumberRows
            form={form}
            fields={["tonemappingDesat", "tonemappingPeak", "tonemappingParam"]}
          />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

export const DeinterlacingSection = withForm({
  ...draftForm,
  render: function Render({ form }) {
    return (
      <SettingsSubsection id="deinterlacing" title="Deinterlacing">
        <SettingRows>
          <form.AppField name="deinterlaceMethod">
            {() => (
              <SelectField
                title="Method"
                options={DEINTERLACE_METHODS}
                labelOf={(value) => (value === "yadif" ? "Yadif" : "Bwdif")}
              />
            )}
          </form.AppField>
          <form.AppField name="deinterlaceDoubleRate">
            {() => (
              <SwitchField
                title="Double the frame rate"
                description="25 and 30 fps play at 50 and 60."
              />
            )}
          </form.AppField>
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

export const AudioSection = withForm({
  ...draftForm,
  props: typeOnly<{ capabilities: TranscodingCapabilities }>(),
  render: function Render({ form, capabilities }) {
    const opus = capabilities.encoders.includes("libopus")
    const vbrEncoder = VBR_ENCODERS.find((name) =>
      capabilities.encoders.includes(name),
    )

    return (
      <SettingsSubsection
        id="audio"
        title="Audio"
        description={
          opus
            ? "Players get a track as it is when they decode it. The rest becomes Opus, or AAC for players without Opus."
            : "Players get a track as it is when they decode it. The rest becomes AAC, since this ffmpeg lacks libopus."
        }
      >
        <SettingRows>
          <form.AppField name="downMixStereoAlgorithm">
            {() => (
              <SelectField
                title="Stereo downmix"
                description="How surround becomes stereo. None drops the LFE channel; Nightmode dialogue favors speech."
                options={DOWNMIX_ALGORITHMS}
                labelOf={(value) => label(DOWNMIX_LABELS, value)}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["downMixAudioBoost"]} />
          <form.AppField name="enableAudioVbr">
            {() => (
              <CapabilitySwitchField
                title="Variable bit rate AAC"
                description={`Uses ${vbrEncoder}'s VBR mode. Opus is always variable.`}
                unavailable="Needs aac_at or libfdk_aac, which this ffmpeg lacks."
                available={vbrEncoder !== undefined}
              />
            )}
          </form.AppField>
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

export const SegmentsSection = withForm({
  ...draftForm,
  props: typeOnly<{ capabilities: TranscodingCapabilities }>(),
  render: function Render({ form, capabilities }) {
    return (
      <SettingsSubsection
        id="segments"
        title="Throttling and segments"
        description="Turn these off if playback stalls."
      >
        <SettingRows>
          <form.AppField name="enableThrottling">
            {() => (
              <CapabilitySwitchField
                title="Throttle transcodes"
                description="Pause ffmpeg when it's far ahead of the player."
                unavailable="Needs jellyfin-ffmpeg."
                available={capabilities.features.pauseKeys}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["throttleDelaySeconds"]} />
          <form.AppField name="enableSegmentDeletion">
            {() => (
              <SwitchField
                title="Delete segments"
                description="Free disk space once the player has fetched them."
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["segmentKeepSeconds"]} />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})
