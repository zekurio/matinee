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

import { SelectField, SwitchField, typeOnly } from "./setting-controls"
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
        description={tr("transcoding.encoding.description")}
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
                description={tr("transcoding.encoding.preset.description")}
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
        description={
          capabilities.features.tonemapx
            ? tr("transcoding.toneMapping.description")
            : tr("transcoding.toneMapping.noTonemapx")
        }
      >
        <SettingRows>
          {(accel === "vaapi" || accel === "qsv") && (
            <>
              <form.AppField name="enableVppTonemapping">
                {() => (
                  <CapabilitySwitchField
                    title={tr("transcoding.toneMapping.vpp")}
                    description={checkNote(
                      hardware?.vppTonemap,
                      tr("transcoding.toneMapping.vpp.description"),
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
                  title={tr("transcoding.toneMapping.videoToolbox")}
                  description={checkNote(
                    hardware?.videoToolboxTonemap,
                    tr("transcoding.toneMapping.videoToolbox.description"),
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
                  title={tr("transcoding.toneMapping.hardware")}
                  description={checkNote(
                    hardware?.tonemap,
                    accel === "nvenc"
                      ? tr("transcoding.toneMapping.cuda")
                      : accel === "videotoolbox"
                        ? tr("transcoding.toneMapping.metal")
                        : tr("transcoding.toneMapping.openCl"),
                  )}
                  available={hardware?.tonemap.status === "ok"}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name="tonemappingAlgorithm">
            {() => (
              <SelectField
                title={tr("transcoding.toneMapping.algorithm")}
                description={tr(
                  "transcoding.toneMapping.algorithm.description",
                )}
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
                  description={tr("transcoding.toneMapping.mode.description")}
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
                description={tr("transcoding.toneMapping.range.description")}
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
              <SwitchField
                title={tr("transcoding.deinterlacing.doubleRate")}
                description={tr(
                  "transcoding.deinterlacing.doubleRate.description",
                )}
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
        title={tr("transcoding.audio.title")}
        description={
          opus
            ? tr("transcoding.audio.description")
            : tr("transcoding.audio.noOpus")
        }
      >
        <SettingRows>
          <form.AppField name="downMixStereoAlgorithm">
            {() => (
              <SelectField
                title={tr("transcoding.audio.downmix")}
                description={tr("transcoding.audio.downmix.description")}
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
                description={
                  vbrEncoder
                    ? tr("transcoding.audio.vbr.description", {
                        encoder: vbrEncoder,
                      })
                    : undefined
                }
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
        description={tr("transcoding.segments.description")}
      >
        <SettingRows>
          <form.AppField name="enableThrottling">
            {() => (
              <CapabilitySwitchField
                title={tr("transcoding.segments.throttle")}
                description={tr("transcoding.segments.throttle.description")}
                unavailable={tr("transcoding.segments.throttle.unavailable")}
                available={capabilities.features.pauseKeys}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["throttleDelaySeconds"]} />
          <form.AppField name="enableSegmentDeletion">
            {() => (
              <SwitchField
                title={tr("transcoding.segments.delete")}
                description={tr("transcoding.segments.delete.description")}
              />
            )}
          </form.AppField>
          <NumberRows form={form} fields={["segmentKeepSeconds"]} />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})
