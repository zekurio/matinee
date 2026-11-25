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
import { Show } from "solid-js"

import { tr } from "@/i18n"
import type { Form } from "@/lib/form"

import { SelectField, SettingWarning, SwitchField } from "./setting-controls"
import { SettingRows, SettingsSubsection } from "./settings-panel"
import {
  CapabilitySwitchField,
  checkNote,
  NumberRows,
} from "./transcoding-controls"
import type { Draft } from "./transcoding-draft"

/** The AAC encoders with a VBR mode, in the order the server picks them. */
const VBR_ENCODERS = ["aac_at", "libfdk_aac"]

interface SectionProps {
  form: Form<Draft>
  capabilities: TranscodingCapabilities
  /** What the draft's acceleration detected as; null for software. */
  hardware: HardwareCapability | null
}

const upperOrAuto = (value: string) =>
  value === "auto" ? tr("transcoding.auto") : value.toUpperCase()

export function EncodingSection(props: SectionProps) {
  const encodes = (codec: TranscodeVideoCodec) =>
    props.capabilities.encoders.includes(
      codec === "h264" ? "libx264" : codec === "hevc" ? "libx265" : "libsvtav1",
    ) ||
    (props.hardware?.encoders.some(
      (entry) => entry.codec === codec && entry.status === "ok",
    ) ??
      false)

  return (
    <SettingsSubsection id="encoding" title={tr("transcoding.encoding.title")}>
      <SettingRows>
        <CapabilitySwitchField
          form={props.form}
          name="allowHevcEncoding"
          title={tr("transcoding.encoding.hevc")}
          unavailable={tr("transcoding.encoding.hevc.unavailable")}
          available={encodes("hevc")}
        />
        <CapabilitySwitchField
          form={props.form}
          name="allowAv1Encoding"
          title={tr("transcoding.encoding.av1")}
          unavailable={tr("transcoding.encoding.av1.unavailable")}
          available={encodes("av1")}
        />
        <SelectField
          form={props.form}
          name="encoderPreset"
          title={tr("transcoding.encoding.preset")}
          options={ENCODER_PRESETS}
          labelOf={(value) =>
            value === "auto" ? tr("transcoding.auto") : value
          }
        />
        <NumberRows form={props.form} fields={["h264Crf", "hevcCrf"]} />
      </SettingRows>
    </SettingsSubsection>
  )
}

export function ToneMappingSection(props: SectionProps) {
  const accel = () => props.form.values().hardwareAcceleration

  return (
    <SettingsSubsection
      id="tone-mapping"
      title={tr("transcoding.toneMapping.title")}
    >
      <Show when={!props.capabilities.features.tonemapx}>
        <SettingWarning>
          {tr("transcoding.toneMapping.noTonemapx")}
        </SettingWarning>
      </Show>
      <SettingRows>
        <Show when={accel() === "vaapi" || accel() === "qsv"}>
          <CapabilitySwitchField
            form={props.form}
            name="enableVppTonemapping"
            title={tr("transcoding.toneMapping.vpp")}
            unavailable={checkNote(props.hardware?.vppTonemap)}
            available={props.hardware?.vppTonemap.status === "ok"}
          />
          <NumberRows
            form={props.form}
            fields={["vppTonemappingBrightness", "vppTonemappingContrast"]}
          />
        </Show>
        <Show when={accel() === "videotoolbox"}>
          <CapabilitySwitchField
            form={props.form}
            name="enableVideoToolboxTonemapping"
            title={tr("transcoding.toneMapping.videoToolbox")}
            unavailable={checkNote(props.hardware?.videoToolboxTonemap)}
            available={props.hardware?.videoToolboxTonemap.status === "ok"}
          />
        </Show>
        <Show when={accel() !== "none"}>
          <CapabilitySwitchField
            form={props.form}
            name="enableTonemapping"
            title={tr("transcoding.toneMapping.hardware")}
            unavailable={checkNote(props.hardware?.tonemap)}
            available={props.hardware?.tonemap.status === "ok"}
          />
        </Show>
        <SelectField
          form={props.form}
          name="tonemappingAlgorithm"
          title={tr("transcoding.toneMapping.algorithm")}
          options={TONEMAP_ALGORITHMS}
          labelOf={(value) => tr(`transcoding.algorithm.${value}`)}
        />
        <Show when={accel() !== "none"}>
          <SelectField
            form={props.form}
            name="tonemappingMode"
            title={tr("transcoding.toneMapping.mode")}
            options={TONEMAP_MODES}
            labelOf={upperOrAuto}
          />
        </Show>
        <SelectField
          form={props.form}
          name="tonemappingRange"
          title={tr("transcoding.toneMapping.range")}
          options={TONEMAP_RANGES}
          labelOf={upperOrAuto}
        />
        <NumberRows
          form={props.form}
          fields={["tonemappingDesat", "tonemappingPeak", "tonemappingParam"]}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

export function DeinterlacingSection(props: { form: Form<Draft> }) {
  return (
    <SettingsSubsection
      id="deinterlacing"
      title={tr("transcoding.deinterlacing.title")}
    >
      <SettingRows>
        <SelectField
          form={props.form}
          name="deinterlaceMethod"
          title={tr("transcoding.deinterlacing.method")}
          options={DEINTERLACE_METHODS}
          labelOf={(value) => (value === "yadif" ? "Yadif" : "Bwdif")}
        />
        <SwitchField
          form={props.form}
          name="deinterlaceDoubleRate"
          title={tr("transcoding.deinterlacing.doubleRate")}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

export function AudioSection(props: {
  form: Form<Draft>
  capabilities: TranscodingCapabilities
}) {
  const opus = () => props.capabilities.encoders.includes("libopus")
  const vbrEncoder = () =>
    VBR_ENCODERS.find((name) => props.capabilities.encoders.includes(name))

  return (
    <SettingsSubsection id="audio" title={tr("transcoding.audio.title")}>
      <Show when={!opus()}>
        <SettingWarning>{tr("transcoding.audio.noOpus")}</SettingWarning>
      </Show>
      <SettingRows>
        <SelectField
          form={props.form}
          name="downMixStereoAlgorithm"
          title={tr("transcoding.audio.downmix")}
          options={DOWNMIX_ALGORITHMS}
          labelOf={(value) => tr(`transcoding.downmix.${value}`)}
        />
        <NumberRows form={props.form} fields={["downMixAudioBoost"]} />
        <CapabilitySwitchField
          form={props.form}
          name="enableAudioVbr"
          title={tr("transcoding.audio.vbr")}
          unavailable={tr("transcoding.audio.vbr.unavailable")}
          available={vbrEncoder() !== undefined}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

export function SegmentsSection(props: {
  form: Form<Draft>
  capabilities: TranscodingCapabilities
}) {
  return (
    <SettingsSubsection id="segments" title={tr("transcoding.segments.title")}>
      <SettingRows>
        <CapabilitySwitchField
          form={props.form}
          name="enableThrottling"
          title={tr("transcoding.segments.throttle")}
          unavailable={tr("transcoding.segments.throttle.unavailable")}
          available={props.capabilities.features.pauseKeys}
        />
        <NumberRows form={props.form} fields={["throttleDelaySeconds"]} />
        <SwitchField
          form={props.form}
          name="enableSegmentDeletion"
          title={tr("transcoding.segments.delete")}
        />
        <NumberRows form={props.form} fields={["segmentKeepSeconds"]} />
      </SettingRows>
    </SettingsSubsection>
  )
}
