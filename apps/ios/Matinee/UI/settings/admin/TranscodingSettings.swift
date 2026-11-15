import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TranscodingSettings.kt: what the server's ffmpeg and GPUs can do, and
 * how it encodes. The draft, the number fields' limits, and the decoders
 * each acceleration has are MatineeCore's (Admin/TranscodingForm.swift).
 */

/// How the server transcodes video, as the web's transcoding panel: what
/// its ffmpeg and GPUs can do, the acceleration and its decoders, what
/// encodes produce, tone mapping, deinterlacing, audio, and throttling.
/// The fields save together, from the save bar.
struct TranscodingSettings: View {
  @State private var loader = Loader<AdminTranscodingSettings>()
  @State private var form: TranscodingDraft?
  @State private var saver = Saver()
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SaveBarScaffold(
      Str.settingsAdminTranscoding, dirty: form?.dirty == true, canSave: form?.invalid.isEmpty == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let settings = form?.draft else { return }
        loader.show(try await api.admin.transcoding.update(transcodingSettings: settings))
      }
    ) {
      AdminLoaded(loader, failed: Str.webTranscodingLoadFailed) { _ in
        if let binding = Binding($form) {
          TranscodingForm(form: binding, detecting: saver.saving, onDetect: detect)
        }
      }
    }
    .loads(loader) { api in try await api.admin.transcoding.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: loader.state.value, initial: true) { _, saved in form = saved.map(TranscodingDraft.init) }
  }

  private func detect() {
    guard let api else { return }
    saver(snackbar) { loader.show(try await api.admin.transcoding.detect()) }
  }
}

private struct TranscodingForm: View {
  @Binding var form: TranscodingDraft
  let detecting: Bool
  let onDetect: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let acceleration = form.draft.hardwareAcceleration
    let hardware = acceleration != HardwareAcceleration.none
    let capabilities = form.saved.capabilities
    VStack(alignment: .leading, spacing: 28) {
      FfmpegSection(capabilities: capabilities, detecting: detecting, onDetect: onDetect)

      SettingsSection(Str.webTranscodingHardwareTitle) {
        VStack(alignment: .leading, spacing: 8) {
          Panel {
            PickerRow(
              Str.webTranscodingHardwareAcceleration,
              options: HardwareAcceleration.knownValues.map { ($0, accelerationName($0)) }, current: acceleration
            ) { form.draft.hardwareAcceleration = $0 }
            if acceleration == HardwareAcceleration.vaapi {
              RowDivider()
              TextRow(
                Str.webTranscodingFieldVaapiDevice, text: $form.draft.vaapiDevice,
                placeholder: blank(form.saved.defaults.vaapiDevice) ?? "/dev/dri/renderD128", keyboard: .URL)
            }
            if acceleration == HardwareAcceleration.qsv {
              RowDivider()
              TextRow(
                Str.webTranscodingFieldQsvDevice, text: $form.draft.qsvDevice,
                placeholder: blank(form.saved.defaults.qsvDevice), keyboard: .URL)
            }
            Reveal(hardware) {
              RowDivider()
              LegacySwitchRow(Str.webTranscodingHardwareEncoding, isOn: $form.draft.enableHardwareEncoding)
            }
            // Intel's low-power encoders, on QSV and on VAAPI.
            if isIntel(acceleration) {
              RowDivider()
              LegacySwitchRow(Str.webTranscodingHardwareLowPower("H.264"), isOn: $form.draft.enableIntelLowPowerH264HwEncoder)
              RowDivider()
              LegacySwitchRow(Str.webTranscodingHardwareLowPower("HEVC"), isOn: $form.draft.enableIntelLowPowerHevcHwEncoder)
            }
          }
          if let problem = deviceProblem(capabilities, acceleration) {
            Note(
              problem == .notInBuild ? Str.webTranscodingHardwareNotInBuild : Str.webTranscodingHardwareDeviceFailed,
              color: palette.destructive)
          }
        }
      }

      if hardware {
        SettingsSection(Str.webTranscodingDecodingTitle) {
          VStack(spacing: 12) {
            Panel {
              let codecs = DECODE_SUPPORT[acceleration] ?? []
              ForEach(Array(codecs.enumerated()), id: \.element) { index, codec in
                if index > 0 { RowDivider() }
                LegacySwitchRow(
                  videoCodecName(codec),
                  isOn: Binding(
                    get: { form.draft.hardwareDecodingCodecs.contains(codec) }, set: { form.decode(codec, $0) }))
              }
            }
            Panel {
              LegacySwitchRow(Str.webTranscodingDecodingHevc10, isOn: $form.draft.enableDecodingColorDepth10Hevc)
              RowDivider()
              LegacySwitchRow(Str.webTranscodingDecodingVp910, isOn: $form.draft.enableDecodingColorDepth10Vp9)
              RowDivider()
              LegacySwitchRow(Str.webTranscodingDecodingHevcRext, isOn: $form.draft.enableDecodingColorDepth10HevcRext)
              RowDivider()
              LegacySwitchRow(Str.webTranscodingDecodingHevcRext12, isOn: $form.draft.enableDecodingColorDepth12HevcRext)
            }
          }
        }
      }

      SettingsSection(Str.webTranscodingEncodingTitle) {
        Panel {
          LegacySwitchRow(Str.webTranscodingEncodingHevc, isOn: $form.draft.allowHevcEncoding)
          RowDivider()
          LegacySwitchRow(Str.webTranscodingEncodingAv1, isOn: $form.draft.allowAv1Encoding)
          RowDivider()
          ListPickerRow(
            Str.webTranscodingEncodingPreset,
            options: EncoderPreset.knownValues.map { ($0, $0 == EncoderPreset.auto ? Str.webTranscodingAuto : $0) },
            current: form.draft.encoderPreset
          ) { form.draft.encoderPreset = $0 }
          RowDivider()
          number(.h264Crf, Str.webTranscodingFieldH264Crf)
          RowDivider()
          number(.hevcCrf, Str.webTranscodingFieldHevcCrf)
        }
      }

      SettingsSection(Str.webTranscodingToneMappingTitle) {
        Panel {
          LegacySwitchRow(Str.webTranscodingToneMappingHardware, isOn: $form.draft.enableTonemapping)
          if isIntel(acceleration) {
            RowDivider()
            LegacySwitchRow(Str.webTranscodingToneMappingVpp, isOn: $form.draft.enableVppTonemapping)
          }
          if acceleration == HardwareAcceleration.videotoolbox {
            RowDivider()
            LegacySwitchRow(Str.webTranscodingToneMappingVideoToolbox, isOn: $form.draft.enableVideoToolboxTonemapping)
          }
          RowDivider()
          ListPickerRow(
            Str.webTranscodingToneMappingAlgorithm,
            options: TonemapAlgorithm.knownValues.map { ($0, algorithmName($0)) },
            current: form.draft.tonemappingAlgorithm
          ) { form.draft.tonemappingAlgorithm = $0 }
          RowDivider()
          PickerRow(
            Str.webTranscodingToneMappingMode, options: TonemapMode.knownValues.map { ($0, autoOrUpper($0)) },
            current: form.draft.tonemappingMode
          ) { form.draft.tonemappingMode = $0 }
          RowDivider()
          PickerRow(
            Str.webTranscodingToneMappingRange, options: TonemapRange.knownValues.map { ($0, autoOrUpper($0)) },
            current: form.draft.tonemappingRange
          ) { form.draft.tonemappingRange = $0 }
          RowDivider()
          number(.tonemappingDesat, Str.webTranscodingFieldTonemappingDesat)
          RowDivider()
          number(.tonemappingPeak, Str.webTranscodingFieldTonemappingPeak)
          RowDivider()
          number(.tonemappingParam, Str.webTranscodingFieldTonemappingParam)
          Reveal(form.draft.enableVppTonemapping && isIntel(acceleration)) {
            RowDivider()
            number(.vppTonemappingBrightness, Str.webTranscodingFieldVppTonemappingBrightness)
            RowDivider()
            number(.vppTonemappingContrast, Str.webTranscodingFieldVppTonemappingContrast)
          }
        }
      }

      SettingsSection(Str.webTranscodingDeinterlacingTitle) {
        Panel {
          PickerRow(
            Str.webTranscodingDeinterlacingMethod, options: DeinterlaceMethod.knownValues.map { ($0, $0) },
            current: form.draft.deinterlaceMethod
          ) { form.draft.deinterlaceMethod = $0 }
          RowDivider()
          LegacySwitchRow(Str.webTranscodingDeinterlacingDoubleRate, isOn: $form.draft.deinterlaceDoubleRate)
        }
      }

      SettingsSection(Str.webTranscodingAudioTitle) {
        Panel {
          PickerRow(
            Str.webTranscodingAudioDownmix, options: DownmixAlgorithm.knownValues.map { ($0, downmixName($0)) },
            current: form.draft.downMixStereoAlgorithm
          ) { form.draft.downMixStereoAlgorithm = $0 }
          RowDivider()
          number(.downMixAudioBoost, Str.webTranscodingFieldDownMixAudioBoost)
          RowDivider()
          LegacySwitchRow(Str.webTranscodingAudioVbr, isOn: $form.draft.enableAudioVbr)
        }
      }

      SettingsSection(Str.webTranscodingSegmentsTitle) {
        Panel {
          LegacySwitchRow(Str.webTranscodingSegmentsThrottle, isOn: $form.draft.enableThrottling)
          Reveal(form.draft.enableThrottling) {
            RowDivider()
            number(.throttleDelaySeconds, Str.webTranscodingFieldThrottleDelaySeconds)
          }
          RowDivider()
          LegacySwitchRow(Str.webTranscodingSegmentsDelete, isOn: $form.draft.enableSegmentDeletion)
          Reveal(form.draft.enableSegmentDeletion) {
            RowDivider()
            number(.segmentKeepSeconds, Str.webTranscodingFieldSegmentKeepSeconds)
          }
        }
      }
    }
  }

  /// A number's field: what's typed stays until it's a number in range, and the field says when it isn't.
  private func number(_ field: TranscodingNumber, _ label: String) -> some View {
    TextRow(
      label, text: Binding(get: { form.text(field) }, set: { form.type(field, $0) }),
      keyboard: field.limits.whole ? .numberPad : .decimalPad,
      error: form.invalid.contains(field) ? Str.webTranscodingCheckField(label) : nil)
  }
}

/// What the server's ffmpeg is, when it was looked at, and looking again.
private struct FfmpegSection: View {
  let capabilities: TranscodingCapabilities
  let detecting: Bool
  let onDetect: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let version = capabilities.version.flatMap(blank) ?? Str.webTranscodingFfmpegUnknownVersion
    let error = capabilities.error.flatMap(blank)
    VStack(alignment: .leading, spacing: 8) {
      Panel {
        // What runs, and when the server last looked; not a link.
        HStack(spacing: 14) {
          LucideIcon(.film, size: 20, tint: palette.mutedForeground)
          VStack(alignment: .leading, spacing: 0) {
            Text(verbatim: "ffmpeg").textStyle(.base)
            if error == nil {
              // The time as the web shows it: a relative one reads wrong in German's "erkannt am …".
              Text(Str.webTranscodingFfmpegDetected(version, detectedAt(capabilities.detectedAt)))
                .textStyle(.px13).foregroundStyle(palette.mutedForeground)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .accessibilityElement(children: .combine)
        RowDivider()
        LinkRow(detecting ? Str.webTranscodingFfmpegDetecting : Str.webTranscodingFfmpegDetect, icon: .refreshCw, action: onDetect)
          .disabled(detecting)
      }
      if let error {
        VStack(alignment: .leading, spacing: 0) {
          Note(Str.webTranscodingFfmpegFailed, color: palette.destructive)
          Note(error)
        }
      }
    }
  }
}

/// When ffmpeg was looked at, as a date and time in the app's language.
private func detectedAt(_ at: String) -> String {
  parseInstant(at).map { $0.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(.app)) } ?? at
}

private func blank(_ text: String) -> String? {
  text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : text
}

private func autoOrUpper(_ id: String) -> String { id == "auto" ? Str.webTranscodingAuto : id.uppercased() }

private func accelerationName(_ id: String) -> String {
  switch id {
  case HardwareAcceleration.vaapi: Str.webTranscodingAccelerationVaapi
  case HardwareAcceleration.qsv: Str.webTranscodingAccelerationQsv
  case HardwareAcceleration.nvenc: Str.webTranscodingAccelerationNvenc
  case HardwareAcceleration.videotoolbox: Str.webTranscodingAccelerationVideotoolbox
  default: Str.webTranscodingAccelerationNone
  }
}

private func algorithmName(_ id: String) -> String {
  switch id {
  case TonemapAlgorithm.clip: Str.webTranscodingAlgorithmClip
  case TonemapAlgorithm.linear: Str.webTranscodingAlgorithmLinear
  case TonemapAlgorithm.gamma: Str.webTranscodingAlgorithmGamma
  case TonemapAlgorithm.reinhard: Str.webTranscodingAlgorithmReinhard
  case TonemapAlgorithm.hable: Str.webTranscodingAlgorithmHable
  case TonemapAlgorithm.mobius: Str.webTranscodingAlgorithmMobius
  case TonemapAlgorithm.bt2390: Str.webTranscodingAlgorithmBt2390
  default: Str.webTranscodingAlgorithmNone
  }
}

private func downmixName(_ id: String) -> String {
  switch id {
  case DownmixAlgorithm.dave750: Str.webTranscodingDownmixDave750
  case DownmixAlgorithm.nightmode_dialogue: Str.webTranscodingDownmixNightmodeDialogue
  case DownmixAlgorithm.rfc7845: Str.webTranscodingDownmixRfc7845
  case DownmixAlgorithm.ac4: Str.webTranscodingDownmixAc4
  default: Str.webTranscodingDownmixNone
  }
}
