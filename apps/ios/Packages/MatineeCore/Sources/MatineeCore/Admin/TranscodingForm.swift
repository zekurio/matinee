import Foundation

/*
 * TranscodingSettings.kt's form: the number fields and their limits, the
 * decoders each acceleration has, and the draft the page edits.
 */

/// A number field's limits, as the contract has them, and whether it takes only whole numbers.
public struct NumberLimits: Hashable, Sendable {
  public let min: Double
  public let max: Double
  public let whole: Bool

  public init(_ min: Double, _ max: Double, whole: Bool) {
    self.min = min
    self.max = max
    self.whole = whole
  }

  /// The number `text` holds when it's one in range, a comma read as the
  /// decimal point, as a German keyboard types it.
  public func parse(_ text: String) -> Double? {
    let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
    guard !cleaned.isEmpty, let value = Double(cleaned), value.isFinite else { return nil }
    guard value >= min, value <= max else { return nil }
    if whole, value.rounded() != value { return nil }
    return value
  }
}

/// The transcoding settings that are numbers, each a field of its own.
public enum TranscodingNumber: String, CaseIterable, Sendable {
  case h264Crf, hevcCrf
  case tonemappingDesat, tonemappingPeak, tonemappingParam
  case vppTonemappingBrightness, vppTonemappingContrast
  case downMixAudioBoost
  case throttleDelaySeconds, segmentKeepSeconds

  public var limits: NumberLimits {
    switch self {
    case .h264Crf, .hevcCrf: NumberLimits(0, 51, whole: true)
    case .tonemappingDesat: NumberLimits(0, 100, whole: false)
    case .tonemappingPeak: NumberLimits(0, 10_000, whole: false)
    case .tonemappingParam: NumberLimits(0, 1000, whole: false)
    case .vppTonemappingBrightness: NumberLimits(0, 100, whole: false)
    case .vppTonemappingContrast: NumberLimits(1, 2, whole: false)
    case .downMixAudioBoost: NumberLimits(0.5, 3, whole: false)
    case .throttleDelaySeconds: NumberLimits(10, 3600, whole: true)
    case .segmentKeepSeconds: NumberLimits(60, 86_400, whole: true)
    }
  }

  public func value(in settings: TranscodingSettings) -> Double {
    switch self {
    case .h264Crf: Double(settings.h264Crf)
    case .hevcCrf: Double(settings.hevcCrf)
    case .tonemappingDesat: settings.tonemappingDesat
    case .tonemappingPeak: settings.tonemappingPeak
    case .tonemappingParam: settings.tonemappingParam
    case .vppTonemappingBrightness: settings.vppTonemappingBrightness
    case .vppTonemappingContrast: settings.vppTonemappingContrast
    case .downMixAudioBoost: settings.downMixAudioBoost
    case .throttleDelaySeconds: Double(settings.throttleDelaySeconds)
    case .segmentKeepSeconds: Double(settings.segmentKeepSeconds)
    }
  }

  public func set(_ value: Double, in settings: inout TranscodingSettings) {
    switch self {
    case .h264Crf: settings.h264Crf = Int(value)
    case .hevcCrf: settings.hevcCrf = Int(value)
    case .tonemappingDesat: settings.tonemappingDesat = value
    case .tonemappingPeak: settings.tonemappingPeak = value
    case .tonemappingParam: settings.tonemappingParam = value
    case .vppTonemappingBrightness: settings.vppTonemappingBrightness = value
    case .vppTonemappingContrast: settings.vppTonemappingContrast = value
    case .downMixAudioBoost: settings.downMixAudioBoost = value
    case .throttleDelaySeconds: settings.throttleDelaySeconds = Int(value)
    case .segmentKeepSeconds: settings.segmentKeepSeconds = Int(value)
    }
  }
}

/// "12" for 12.0, "0.5" for 0.5, as a field shows a number.
public func showNumber(_ number: Double) -> String {
  if number.rounded() == number, abs(number) < 1e15 { return String(Int64(number)) }
  return String(number)
}

/// The codecs each acceleration decodes, in the web's order.
public let DECODE_SUPPORT: [String: [String]] = [
  HardwareAcceleration.vaapi: ["h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"],
  HardwareAcceleration.qsv: ["h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"],
  HardwareAcceleration.nvenc: ["h264", "hevc", "mpeg2video", "mpeg4", "vc1", "vp8", "vp9", "av1"],
  HardwareAcceleration.videotoolbox: ["h264", "hevc", "vp8", "vp9"],
]

/// Intel's low-power encoders and VPP tone mapping, on QSV and on VAAPI.
public func isIntel(_ acceleration: String) -> Bool {
  acceleration == HardwareAcceleration.qsv || acceleration == HardwareAcceleration.vaapi
}

/// Why the chosen GPU won't be used, when detection says so.
public enum DeviceProblem: Equatable, Sendable {
  /// This ffmpeg wasn't built with the acceleration.
  case notInBuild
  /// Its device didn't open.
  case deviceFailed
}

public func deviceProblem(_ capabilities: TranscodingCapabilities, _ acceleration: String) -> DeviceProblem? {
  guard acceleration != HardwareAcceleration.none else { return nil }
  guard let entry = capabilities.hardware.first(where: { $0.acceleration == acceleration }) else { return .notInBuild }
  return entry.device.status == CheckStatus.ok ? nil : .deviceFailed
}

/// The form's edits to `saved`: the settings as edited, and what each number
/// field holds while it's typed, kept apart until it's a number in range.
public struct TranscodingDraft: Equatable, Sendable {
  public let saved: AdminTranscodingSettings
  public var draft: TranscodingSettings
  public private(set) var typed: [TranscodingNumber: String] = [:]

  public init(_ saved: AdminTranscodingSettings) {
    self.saved = saved
    draft = saved.settings
  }

  public var original: TranscodingSettings { saved.settings }

  /// The fields holding something that isn't a number in their range.
  public var invalid: Set<TranscodingNumber> {
    Set(typed.filter { field, text in field.limits.parse(text) == nil }.keys)
  }

  public var dirty: Bool { draft != original || !typed.isEmpty }

  /// What `field` shows: what's typed, else the setting.
  public func text(_ field: TranscodingNumber) -> String { typed[field] ?? showNumber(field.value(in: draft)) }

  /// `text` typed into `field`: the setting takes it once it's a number in range.
  public mutating func type(_ field: TranscodingNumber, _ text: String) {
    if let value = field.limits.parse(text) {
      field.set(value, in: &draft)
      typed[field] = nil
    } else {
      typed[field] = text
    }
  }

  /// A decoder on or off, the list kept without repeats.
  public mutating func decode(_ codec: String, _ on: Bool) {
    let codecs = on ? draft.hardwareDecodingCodecs + [codec] : draft.hardwareDecodingCodecs.filter { $0 != codec }
    var seen = Set<String>()
    draft.hardwareDecodingCodecs = codecs.filter { seen.insert($0).inserted }
  }

  public mutating func reset() {
    draft = original
    typed = [:]
  }
}
