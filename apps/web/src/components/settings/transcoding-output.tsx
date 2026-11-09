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

import { tr } from "@/i18n"
import { withForm } from "@/lib/form"

import {
  SelectField,
  SettingWarning,
  SwitchField,
  typeOnly,
} from "./setting-controls"
import { SettingRows, SettingsSubsection } from "./settings-panel"
import {
  CapabilitySwitchField,
  checkNote,
  NumberRows,
} from "./transcoding-controls"
import { draftForm } from "./transcoding-draft"

/** The AAC encoders with a VBR mode, in the order the server picks them. */
const VBR_ENCODERS = ["aac_at", "libfdk_aac"]

interface SectionProps {
  capabilities: TranscodingCapabilities
  /** What the draft's acceleration detected as; null for software. */
  hardware: HardwareCapability | null
}

const upperOrAuto = (value: string) =>
  value === "auto" ? tr("transcoding.auto") : value.toUpperCase()

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
        title={tr("transcoding.encoding.title")}
      >
        <SettingRows>
          <form.AppField name="allowHevcEncoding">
            {() => (
              <CapabilitySwitchField
                title={tr("transcoding.encoding.hevc")}
                unavailable={tr("transcoding.encoding.hevc.unavailable")}
                available={encodes("hevc")}
              />
            )}
          </form.AppField>
          <form.AppField name="allowAv1Encoding">
            {() => (
              <CapabilitySwitchField
                title={tr("transcoding.encoding.av1")}
                unavailable={tr("transcoding.encoding.av1.unavailable")}
                available={encodes("av1")}
              />
            )}
          </form.AppField>
          <form.AppField name="encoderPreset">
            {() => (
              <SelectField
                title={tr("transcoding.encoding.preset")}
                options={ENCODER_PRESETS}
                labelOf={(value) =>
                  value === "auto" ? tr("transcoding.auto") : value
                }
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
        title={tr("transcoding.toneMapping.title")}
      >
        {!capabilities.features.tonemapx && (
          <SettingWarning>
            {tr("transcoding.toneMapping.noTonemapx")}
          </SettingWarning>
        )}
        <SettingRows>
          {(accel === "vaapi" || accel === "qsv") && (
            <>
              <form.AppField name="enableVppTonemapping">
                {() => (
                  <CapabilitySwitchField
                    title={tr("transcoding.toneMapping.vpp")}
                    unavailable={checkNote(hardware?.vppTonemap)}
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
                  title={tr("transcoding.toneMapping.videoToolbox")}
                  unavailable={checkNote(hardware?.videoToolboxTonemap)}
                  available={hardware?.videoToolboxTonemap.status === "ok"}
                />
              )}
            </form.AppField>
          )}
          {accel !== "none" && (
            <form.AppField name="enableTonemapping">
              {() => (
                <CapabilitySwitchField
                  title={tr("transcoding.toneMapping.hardware")}
                  unavailable={checkNote(hardware?.tonemap)}
                  available={hardware?.tonemap.status === "ok"}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="tonemappingAlgorithm">
            {() => (
              <SelectField
                title={tr("transcoding.toneMapping.algorithm")}
                options={TONEMAP_ALGORITHMS}
                labelOf={(value) => tr(`transcoding.algorithm.${value}`)}
              />
            )}
          </form.AppField>
          {accel !== "none" && (
            <form.AppField name="tonemappingMode">
              {() => (
                <SelectField
                  title={tr("transcoding.toneMapping.mode")}
                  options={TONEMAP_MODES}
                  labelOf={upperOrAuto}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="tonemappingRange">
            {() => (
              <SelectField
                title={tr("transcoding.toneMapping.range")}
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
      <SettingsSubsection
        id="deinterlacing"
        title={tr("transcoding.deinterlacing.title")}
      >
        <SettingRows>
          <form.AppField name="deinterlaceMethod">
            {() => (
              <SelectField
                title={tr("transcoding.deinterlacing.method")}
                options={DEINTERLACE_METHODS}
                labelOf={(value) => (value === "yadif" ? "Yadif" : "Bwdif")}
              />
            )}
          </form.AppField>
          <form.AppField name="deinterlaceDoubleRate">
            {() => (
              <SwitchField title={tr("transcoding.deinterlacing.doubleRate")} />
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
      <SettingsSubsection id="audio" title={tr("transcoding.audio.title")}>
        {!opus && (
          <SettingWarning>{tr("transcoding.audio.noOpus")}</SettingWarning>
        )}
        <SettingRows>
          <form.AppField name="downMixStereoAlgorithm">
            {() => (
              <SelectField
                title={tr("transcoding.audio.downmix")}
                options={DOWNMIX_ALGORITHMS}
                labelOf={(value) => tr(`transcoding.downmix.${value}`)}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["downMixAudioBoost"]} />
          <form.AppField name="enableAudioVbr">
            {() => (
              <CapabilitySwitchField
                title={tr("transcoding.audio.vbr")}
                unavailable={tr("transcoding.audio.vbr.unavailable")}
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
        title={tr("transcoding.segments.title")}
      >
        <SettingRows>
          <form.AppField name="enableThrottling">
            {() => (
              <CapabilitySwitchField
                title={tr("transcoding.segments.throttle")}
                unavailable={tr("transcoding.segments.throttle.unavailable")}
                available={capabilities.features.pauseKeys}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["throttleDelaySeconds"]} />
          <form.AppField name="enableSegmentDeletion">
            {() => <SwitchField title={tr("transcoding.segments.delete")} />}
          </form.AppField>
          <NumberRows form={form} fields={["segmentKeepSeconds"]} />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})
