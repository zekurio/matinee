import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TranscodingSettings.kt: what the server's ffmpeg and GPUs can do, and
 * how it encodes, as the web's transcoding panel. The draft, the number
 * fields' limits, and the decoders each acceleration has are MatineeCore's
 * (Admin/TranscodingForm.swift).
 */

/// How the server transcodes video: what its ffmpeg and GPUs can do, the
/// acceleration and its decoders, what encodes produce, tone mapping,
/// deinterlacing, audio, and throttling. The fields save together, from
/// the save bar; a number out of its range holds the save and says why.
struct TranscodingSettings: View {
  var body: some View { TranscodingPage().adminTheme() }
}

private struct TranscodingPage: View {
  @State private var loader = Loader<AdminTranscodingSettings>()
  @State private var form: TranscodingDraft?
  @State private var saver = Saver()
  @Environment(\.api) private var api
  // TODO(shell): the kit's toasts, once the shell hosts them.
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SaveBarPage(
      Str.settingsAdminTranscoding, dirty: form?.dirty == true, canSave: form?.invalid.isEmpty == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let settings = form?.draft else { return }
        loader.show(try await api.admin.transcoding.update(transcodingSettings: settings))
      }
    ) {
      AdminLoaded(loader) { _ in
        if let binding = Binding($form) {
          TranscodingForm(form: binding, detecting: saver.saving, onDetect: detect)
        }
      }
    }
    .loads(loader) { api in try await api.admin.transcoding.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: loader.state.value, initial: true) { _, saved in
      form = saved.map(TranscodingDraft.init)
      if adminDemo("invalid") { form?.type(.h264Crf, "99") }
    }
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
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let acceleration = form.draft.hardwareAcceleration
    let hardware = acceleration != HardwareAcceleration.none
    let capabilities = form.saved.capabilities
    VStack(alignment: .leading, spacing: Space.section) {
      FfmpegSection(capabilities: capabilities, detecting: detecting, onDetect: onDetect)

      VStack(alignment: .leading, spacing: Space.s3) {
        ListSection(Str.webTranscodingHardwareTitle) {
          SelectRow(
            Str.webTranscodingHardwareAcceleration, selection: $form.draft.hardwareAcceleration,
            options: HardwareAcceleration.knownValues.map { ($0, accelerationName($0)) })
          if acceleration == HardwareAcceleration.vaapi {
            InputRow(
              Str.webTranscodingFieldVaapiDevice, text: $form.draft.vaapiDevice,
              placeholder: nonBlank(form.saved.defaults.vaapiDevice) ?? "/dev/dri/renderD128")
          }
          if acceleration == HardwareAcceleration.qsv {
            InputRow(
              Str.webTranscodingFieldQsvDevice, text: $form.draft.qsvDevice,
              placeholder: nonBlank(form.saved.defaults.qsvDevice) ?? "")
          }
          if hardware {
            MatineeKit.SwitchRow(Str.webTranscodingHardwareEncoding, isOn: $form.draft.enableHardwareEncoding)
          }
          // Intel's low-power encoders, on QSV and on VAAPI.
          if isIntel(acceleration) {
            MatineeKit.SwitchRow(
              Str.webTranscodingHardwareLowPower("H.264"), isOn: $form.draft.enableIntelLowPowerH264HwEncoder)
            MatineeKit.SwitchRow(
              Str.webTranscodingHardwareLowPower("HEVC"), isOn: $form.draft.enableIntelLowPowerHevcHwEncoder)
          }
        }
        if let problem = deviceProblem(capabilities, acceleration) {
          Note(
            problem == .notInBuild ? Str.webTranscodingHardwareNotInBuild : Str.webTranscodingHardwareDeviceFailed,
            color: palette.destructive)
        }
      }

      if hardware {
        ListSection(Str.webTranscodingDecodingTitle) {
          ForEach(DECODE_SUPPORT[acceleration] ?? [], id: \.self) { codec in
            MatineeKit.SwitchRow(
              videoCodecName(codec),
              isOn: Binding(get: { form.draft.hardwareDecodingCodecs.contains(codec) }, set: { form.decode(codec, $0) }))
          }
          MatineeKit.SwitchRow(Str.webTranscodingDecodingHevc10, isOn: $form.draft.enableDecodingColorDepth10Hevc)
          MatineeKit.SwitchRow(Str.webTranscodingDecodingVp910, isOn: $form.draft.enableDecodingColorDepth10Vp9)
          MatineeKit.SwitchRow(Str.webTranscodingDecodingHevcRext, isOn: $form.draft.enableDecodingColorDepth10HevcRext)
          MatineeKit.SwitchRow(Str.webTranscodingDecodingHevcRext12, isOn: $form.draft.enableDecodingColorDepth12HevcRext)
        }
      }

      ListSection(Str.webTranscodingEncodingTitle) {
        MatineeKit.SwitchRow(Str.webTranscodingEncodingHevc, isOn: $form.draft.allowHevcEncoding)
        MatineeKit.SwitchRow(Str.webTranscodingEncodingAv1, isOn: $form.draft.allowAv1Encoding)
        SelectRow(
          Str.webTranscodingEncodingPreset, selection: $form.draft.encoderPreset,
          options: EncoderPreset.knownValues.map { ($0, $0 == EncoderPreset.auto ? Str.webTranscodingAuto : $0) })
        number(.h264Crf, Str.webTranscodingFieldH264Crf, Str.webTranscodingNumberH264Crf)
        number(.hevcCrf, Str.webTranscodingFieldHevcCrf, Str.webTranscodingNumberHevcCrf)
      }

      ListSection(Str.webTranscodingToneMappingTitle) {
        MatineeKit.SwitchRow(Str.webTranscodingToneMappingHardware, isOn: $form.draft.enableTonemapping)
        if isIntel(acceleration) {
          MatineeKit.SwitchRow(Str.webTranscodingToneMappingVpp, isOn: $form.draft.enableVppTonemapping)
        }
        if acceleration == HardwareAcceleration.videotoolbox {
          MatineeKit.SwitchRow(
            Str.webTranscodingToneMappingVideoToolbox, isOn: $form.draft.enableVideoToolboxTonemapping)
        }
        SelectRow(
          Str.webTranscodingToneMappingAlgorithm, selection: $form.draft.tonemappingAlgorithm,
          options: TonemapAlgorithm.knownValues.map { ($0, algorithmName($0)) })
        SelectRow(
          Str.webTranscodingToneMappingMode, selection: $form.draft.tonemappingMode,
          options: TonemapMode.knownValues.map { ($0, autoOrUpper($0)) })
        SelectRow(
          Str.webTranscodingToneMappingRange, selection: $form.draft.tonemappingRange,
          options: TonemapRange.knownValues.map { ($0, autoOrUpper($0)) })
        number(.tonemappingDesat, Str.webTranscodingFieldTonemappingDesat, Str.webTranscodingNumberTonemappingDesat)
        number(.tonemappingPeak, Str.webTranscodingFieldTonemappingPeak, Str.webTranscodingNumberTonemappingPeak)
        number(.tonemappingParam, Str.webTranscodingFieldTonemappingParam, Str.webTranscodingNumberTonemappingParam)
        if form.draft.enableVppTonemapping && isIntel(acceleration) {
          number(
            .vppTonemappingBrightness, Str.webTranscodingFieldVppTonemappingBrightness,
            Str.webTranscodingNumberVppTonemappingBrightness)
          number(
            .vppTonemappingContrast, Str.webTranscodingFieldVppTonemappingContrast,
            Str.webTranscodingNumberVppTonemappingContrast)
        }
      }

      ListSection(Str.webTranscodingDeinterlacingTitle) {
        SelectRow(
          Str.webTranscodingDeinterlacingMethod, selection: $form.draft.deinterlaceMethod,
          options: DeinterlaceMethod.knownValues.map { ($0, $0) })
        MatineeKit.SwitchRow(Str.webTranscodingDeinterlacingDoubleRate, isOn: $form.draft.deinterlaceDoubleRate)
      }

      ListSection(Str.webTranscodingAudioTitle) {
        SelectRow(
          Str.webTranscodingAudioDownmix, selection: $form.draft.downMixStereoAlgorithm,
          options: DownmixAlgorithm.knownValues.map { ($0, downmixName($0)) })
        number(.downMixAudioBoost, Str.webTranscodingFieldDownMixAudioBoost, Str.webTranscodingNumberDownMixAudioBoost)
        MatineeKit.SwitchRow(Str.webTranscodingAudioVbr, isOn: $form.draft.enableAudioVbr)
      }

      ListSection(Str.webTranscodingSegmentsTitle) {
        MatineeKit.SwitchRow(Str.webTranscodingSegmentsThrottle, isOn: $form.draft.enableThrottling)
        if form.draft.enableThrottling {
          number(
            .throttleDelaySeconds, Str.webTranscodingFieldThrottleDelaySeconds,
            Str.webTranscodingNumberThrottleDelaySeconds)
        }
        MatineeKit.SwitchRow(Str.webTranscodingSegmentsDelete, isOn: $form.draft.enableSegmentDeletion)
        if form.draft.enableSegmentDeletion {
          number(
            .segmentKeepSeconds, Str.webTranscodingFieldSegmentKeepSeconds, Str.webTranscodingNumberSegmentKeepSeconds)
        }
      }
    }
    // Rows that come and go with a switch open and close rather than jump.
    .adminMotion(MatineeKit.Motion.enter, value: form.draft.hardwareAcceleration)
    .adminMotion(MatineeKit.Motion.enter, value: form.draft.enableThrottling)
    .adminMotion(MatineeKit.Motion.enter, value: form.draft.enableSegmentDeletion)
    .adminMotion(MatineeKit.Motion.enter, value: form.draft.enableVppTonemapping)
    .textInputAutocapitalization(.never)
    .autocorrectionDisabled()
    .submitLabel(.done)
  }

  /// A number's field: what's typed stays until it's a number in range, and
  /// the field says when it isn't, with the range it takes.
  private func number(_ field: TranscodingNumber, _ label: String, _ range: String) -> some View {
    InputRow(
      label, text: Binding(get: { form.text(field) }, set: { form.type(field, $0) }),
      error: form.invalid.contains(field) ? Str.webTranscodingCheckFieldIssue(Str.webTranscodingCheckField(label), range) : nil
    )
    .keyboardType(field.limits.whole ? .numberPad : .decimalPad)
  }
}

/// What the server's ffmpeg is, when it was looked at, and looking again.
private struct FfmpegSection: View {
  let capabilities: TranscodingCapabilities
  let detecting: Bool
  let onDetect: () -> Void
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let version = capabilities.version.flatMap(nonBlank) ?? Str.webTranscodingFfmpegUnknownVersion
    let error = capabilities.error.flatMap(nonBlank)
    VStack(alignment: .leading, spacing: Space.s3) {
      Text(verbatim: "FFmpeg").textStyle(.base, weight: .semibold, tracking: .tight).accessibilityAddTraits(.isHeader)
      MatineeKit.MatineeButton(
        detecting ? Str.webTranscodingFfmpegDetecting : Str.webTranscodingFfmpegDetect, icon: .refreshCw,
        look: .outline, pending: detecting, fullWidth: true, action: onDetect)
      if let error {
        Note(Str.webTranscodingFfmpegFailed, color: palette.destructive)
        Note(error)
      } else {
        // The time as the web shows it: a relative one reads wrong in German's "erkannt am …".
        Note(Str.webTranscodingFfmpegDetected(version, detectedAt(capabilities.detectedAt)))
      }
    }
  }
}

/// When ffmpeg was looked at, as a date and time in the app's language.
private func detectedAt(_ at: String) -> String {
  parseInstant(at).map { $0.formatted(Date.FormatStyle(date: .abbreviated, time: .shortened).locale(.app)) } ?? at
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
