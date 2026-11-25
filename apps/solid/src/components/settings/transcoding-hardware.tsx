import {
  type AdminTranscodingSettings,
  type CapabilityCheck,
  HARDWARE_ACCELERATIONS,
  type HardwareAcceleration,
  type HardwareCapability,
  type TranscodeVideoCodec,
} from "@matinee/contracts"
import { For, Show } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/kit/select"
import type { Form } from "@/lib/form"

import { RichSelectItem } from "./select-item-content"
import {
  InputField,
  SettingWarning,
  SwitchField,
  SwitchRow,
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
import type { Draft } from "./transcoding-draft"

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

/** Why the device didn't open, with ffmpeg's first line of it if it said any. */
function deviceFailure(device: CapabilityCheck): string {
  const detail = firstLine(device)
  return detail
    ? tr("transcoding.hardware.deviceFailedDetail", {
        error: translateKnown(detail),
      })
    : tr("transcoding.hardware.deviceFailed")
}

const lowPowerCheck = (
  hardware: HardwareCapability,
  codec: TranscodeVideoCodec,
) => hardware.encoders.find((entry) => entry.codec === codec)?.lowPower

export function HardwareSection(props: {
  form: Form<Draft>
  settings: AdminTranscodingSettings
  /** What the draft's acceleration detected as; null for software. */
  hardware: HardwareCapability | null
}) {
  const accel = () => props.form.values().hardwareAcceleration
  // A saved acceleration this build lacks stays listed so the select can
  // still show it.
  const accelerations = () =>
    HARDWARE_ACCELERATIONS.filter(
      (value) =>
        value === accel() ||
        value === props.settings.settings.hardwareAcceleration ||
        accelerationAvailable(props.settings.capabilities, value),
    )
  const device = () => (accel() === "vaapi" ? "vaapiDevice" : "qsvDevice")

  return (
    <SettingsSubsection id="hardware" title={tr("transcoding.hardware.title")}>
      <SettingRows>
        <SettingRow
          title={tr("transcoding.hardware.acceleration")}
          layout="split"
          footer={
            <Show
              when={
                props.hardware?.device.status === "failed" &&
                props.hardware.device
              }
            >
              {(failed) => (
                <SettingWarning>{deviceFailure(failed())}</SettingWarning>
              )}
            </Show>
          }
        >
          {(ids) => (
            <Select<HardwareAcceleration>
              items={accelerations().map((value) => ({
                value,
                label: accelerationLabel(value),
              }))}
              value={accel()}
              onValueChange={(value) => {
                if (value) props.form.set("hardwareAcceleration", value)
              }}
            >
              <SelectTrigger id={ids.controlId} class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <For each={accelerations()}>
                  {(value) => (
                    <RichSelectItem
                      value={value}
                      label={accelerationLabel(value)}
                    >
                      <>
                        {accelerationLabel(value)}
                        <Show
                          when={
                            !accelerationAvailable(
                              props.settings.capabilities,
                              value,
                            )
                          }
                        >
                          <span class="text-muted-foreground text-xs font-normal">
                            {tr("transcoding.hardware.notInBuild")}
                          </span>
                        </Show>
                      </>
                    </RichSelectItem>
                  )}
                </For>
              </SelectContent>
            </Select>
          )}
        </SettingRow>
        <Show when={accel() === "vaapi" || accel() === "qsv"}>
          <InputField
            form={props.form}
            name={device()}
            title={tr(`transcoding.field.${device()}`)}
            autocomplete="off"
            spellcheck={false}
            class="text-13px font-mono"
            placeholder={
              props.settings.defaults[device()] ||
              // Detection ran with the saved device, so its node is the
              // default only while nothing is saved.
              (props.settings.settings[device()] === ""
                ? props.hardware?.devicePath
                : null) ||
              "/dev/dri/renderD128"
            }
          />
        </Show>
        <Show when={props.hardware}>
          {(hardware) => (
            <>
              <SwitchField
                form={props.form}
                name="enableHardwareEncoding"
                title={tr("transcoding.hardware.encoding")}
              />
              <Show when={hasLowPower(hardware())}>
                <For each={LOW_POWER_FIELDS}>
                  {([codec, name, codecLabel]) => (
                    <CapabilitySwitchField
                      form={props.form}
                      name={name}
                      title={tr("transcoding.hardware.lowPower", {
                        codec: codecLabel,
                      })}
                      unavailable={checkNote(lowPowerCheck(hardware(), codec))}
                      available={
                        lowPowerCheck(hardware(), codec)?.status === "ok"
                      }
                    />
                  )}
                </For>
              </Show>
            </>
          )}
        </Show>
      </SettingRows>
    </SettingsSubsection>
  )
}

export function HardwareDecodingSection(props: {
  form: Form<Draft>
  settings: AdminTranscodingSettings
}) {
  const accel = () => props.form.values().hardwareAcceleration
  const decodable = () =>
    props.settings.hardwareDecodeSupport.find(
      (entry) => entry.acceleration === accel(),
    )?.codecs ?? []
  const codecs = () => props.form.values().hardwareDecodingCodecs

  return (
    <Show when={accel() !== "none"}>
      <SettingsSubsection
        id="hardware-decoding"
        title={tr("transcoding.decoding.title")}
      >
        <SettingRows>
          <For each={decodable()}>
            {(codec) => (
              <SwitchRow
                title={label(CODEC_LABELS, codec)}
                checked={codecs().includes(codec)}
                onChange={(on) =>
                  props.form.set(
                    "hardwareDecodingCodecs",
                    on
                      ? [...codecs(), codec]
                      : codecs().filter((entry) => entry !== codec),
                  )
                }
              />
            )}
          </For>
          <Show when={accel() !== "videotoolbox"}>
            <SwitchField
              form={props.form}
              name="enableDecodingColorDepth10Hevc"
              title={tr("transcoding.decoding.hevc10")}
            />
            <SwitchField
              form={props.form}
              name="enableDecodingColorDepth10Vp9"
              title={tr("transcoding.decoding.vp910")}
            />
            <SwitchField
              form={props.form}
              name="enableDecodingColorDepth10HevcRext"
              title={tr("transcoding.decoding.hevcRext")}
            />
            <SwitchField
              form={props.form}
              name="enableDecodingColorDepth12HevcRext"
              title={tr("transcoding.decoding.hevcRext12")}
            />
          </Show>
        </SettingRows>
      </SettingsSubsection>
    </Show>
  )
}
