import {
  type AdminTranscodingSettings,
  HARDWARE_ACCELERATIONS,
  HARDWARE_DECODE_SUPPORT,
  type HardwareCapability,
  type TranscodeVideoCodec,
} from "@matinee/contracts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { useSelector } from "@tanstack/react-form"

import { tr } from "@/i18n"
import { withForm } from "@/lib/form"

import {
  InputField,
  SettingWarning,
  SwitchField,
  SwitchRow,
  typeOnly,
} from "./setting-controls"
import { SettingRow, SettingRows, SettingsSubsection } from "./settings-panel"
import {
  accelerationAvailable,
  accelerationLabel,
  CapabilitySwitchField,
  checkNote,
  firstLine,
  label,
} from "./transcoding-controls"
import { draftForm } from "./transcoding-draft"

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

const LOW_POWER_FIELDS = [
  ["h264", "enableIntelLowPowerH264HwEncoder", "H.264"],
  ["hevc", "enableIntelLowPowerHevcHwEncoder", "HEVC"],
] as const

/** QSV, or VAAPI on an Intel driver: Jellyfin's Intel low-power encoders. */
function hasLowPower(hardware: HardwareCapability): boolean {
  return (
    hardware.acceleration === "qsv" ||
    (hardware.acceleration === "vaapi" &&
      (hardware.vendor === "intel-ihd" || hardware.vendor === "intel-i965"))
  )
}

const lowPowerCheck = (
  hardware: HardwareCapability,
  codec: TranscodeVideoCodec,
) => hardware.encoders.find((entry) => entry.codec === codec)?.lowPower

export const HardwareSection = withForm({
  ...draftForm,
  props: typeOnly<{
    settings: AdminTranscodingSettings
    /** What the draft's acceleration detected as; null for software. */
    hardware: HardwareCapability | null
  }>(),
  render: function Render({ form, settings, hardware }) {
    const { capabilities } = settings
    const accel = useSelector(
      form.store,
      (state) => state.values.hardwareAcceleration,
    )
    // A saved acceleration this build lacks stays listed so the select can
    // still show it.
    const accelerations = HARDWARE_ACCELERATIONS.filter(
      (value) =>
        value === accel ||
        value === settings.settings.hardwareAcceleration ||
        accelerationAvailable(capabilities, value),
    )
    const device = accel === "vaapi" ? "vaapiDevice" : "qsvDevice"

    return (
      <SettingsSubsection
        id="hardware"
        title={tr("transcoding.hardware.title")}
      >
        <SettingRows>
          <SettingRow
            title={tr("transcoding.hardware.acceleration")}
            layout="split"
            footer={
              hardware && hardware.device.status === "failed" ? (
                <SettingWarning>
                  {tr("transcoding.hardware.deviceFailed")}{" "}
                  {firstLine(hardware.device)}
                </SettingWarning>
              ) : null
            }
          >
            {(ids) => (
              <form.Field name="hardwareAcceleration">
                {(field) => (
                  <Select
                    items={accelerations.map((value) => ({
                      value,
                      label: accelerationLabel(value),
                    }))}
                    value={field.state.value}
                    onValueChange={(value) =>
                      value && field.handleChange(value)
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
                      {accelerations.map((value) => (
                        <SelectItem key={value} value={value}>
                          {accelerationLabel(value)}
                          {!accelerationAvailable(capabilities, value) && (
                            <span className="text-muted-foreground text-xs font-normal">
                              {tr("transcoding.hardware.notInBuild")}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </form.Field>
            )}
          </SettingRow>
          {(accel === "vaapi" || accel === "qsv") && (
            // Keyed, so switching between the two binds the other field.
            <form.AppField key={device} name={device}>
              {() => (
                <InputField
                  title={tr(`transcoding.field.${device}`)}
                  description={
                    accel === "vaapi"
                      ? tr("transcoding.hardware.vaapiDevice")
                      : tr("transcoding.hardware.qsvDevice")
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-[13px]"
                  placeholder={
                    settings.defaults[device] ||
                    // Detection ran with the saved device, so its node is the
                    // default only while nothing is saved.
                    (settings.settings[device] === ""
                      ? hardware?.devicePath
                      : null) ||
                    "/dev/dri/renderD128"
                  }
                />
              )}
            </form.AppField>
          )}
          {hardware && (
            <form.AppField name="enableHardwareEncoding">
              {() => (
                <SwitchField title={tr("transcoding.hardware.encoding")} />
              )}
            </form.AppField>
          )}
          {hardware &&
            hasLowPower(hardware) &&
            LOW_POWER_FIELDS.map(([codec, name, codecLabel]) => (
              <form.AppField key={name} name={name}>
                {() => (
                  <CapabilitySwitchField
                    title={tr("transcoding.hardware.lowPower", {
                      codec: codecLabel,
                    })}
                    description={checkNote(
                      lowPowerCheck(hardware, codec),
                      tr("transcoding.hardware.lowPower.description"),
                    )}
                    available={lowPowerCheck(hardware, codec)?.status === "ok"}
                  />
                )}
              </form.AppField>
            ))}
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

export const HardwareDecodingSection = withForm({
  ...draftForm,
  render: function Render({ form }) {
    const accel = useSelector(
      form.store,
      (state) => state.values.hardwareAcceleration,
    )
    if (accel === "none") return null
    const decodable = HARDWARE_DECODE_SUPPORT.get(accel) ?? []

    return (
      <SettingsSubsection
        id="hardware-decoding"
        title={tr("transcoding.decoding.title")}
      >
        <SettingRows>
          <form.Field name="hardwareDecodingCodecs">
            {(field) =>
              decodable.map((codec) => (
                <SwitchRow
                  key={codec}
                  title={label(CODEC_LABELS, codec)}
                  checked={field.state.value.includes(codec)}
                  onChange={(on) =>
                    field.handleChange((codecs) =>
                      on
                        ? [...codecs, codec]
                        : codecs.filter((entry) => entry !== codec),
                    )
                  }
                />
              ))
            }
          </form.Field>
          {accel !== "videotoolbox" && (
            <>
              <form.AppField name="enableDecodingColorDepth10Hevc">
                {() => (
                  <SwitchField
                    title={tr("transcoding.decoding.hevc10")}
                    description={tr("transcoding.decoding.hevc10.description")}
                  />
                )}
              </form.AppField>
              <form.AppField name="enableDecodingColorDepth10Vp9">
                {() => <SwitchField title={tr("transcoding.decoding.vp910")} />}
              </form.AppField>
              <form.AppField name="enableDecodingColorDepth10HevcRext">
                {() => (
                  <SwitchField
                    title={tr("transcoding.decoding.hevcRext")}
                    description={tr(
                      "transcoding.decoding.hevcRext.description",
                    )}
                  />
                )}
              </form.AppField>
              <form.AppField name="enableDecodingColorDepth12HevcRext">
                {() => (
                  <SwitchField title={tr("transcoding.decoding.hevcRext12")} />
                )}
              </form.AppField>
            </>
          )}
        </SettingRows>
      </SettingsSubsection>
    )
  },
})
