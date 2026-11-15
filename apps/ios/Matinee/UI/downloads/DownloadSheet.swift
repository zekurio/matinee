import MatineeCore
import SwiftUI

/*
 * DownloadSheet.kt: what to download of one file. The server says what it
 * can make of it for this device (`downloads.resolve`, with the device
 * `downloadDevice` describes), at which sizes and in which codecs, with
 * which audio and subtitles; the sheet shows that and hands the person's
 * pick to `Downloads.enqueue`.
 */

/// What to download: a version the server makes for this device, at the
/// size the person picks, or the file as it is; with the audio tracks and
/// subtitles they pick. The tracks start as the playback and download
/// settings pick them. Shows how big each version is before anything
/// starts, for the audio picked.
struct DownloadSheet: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(Downloads.self) private var downloads
  @Environment(MatineeSession.self) private var session
  @Environment(\.snackbar) private var snackbar
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  @State private var source: DownloadSource?
  @State private var error: String?
  @State private var plans: [DownloadChoice: DownloadPlan] = [:]
  @State private var specs: [DownloadChoice: DownloadSpec] = [:]
  /// The plans are for the audio picked; while new ones come, the old sizes stay.
  @State private var planning = true
  @State private var picked: DownloadChoice = .device(nil)
  /// Audio by stream index, in the file's order; subtitles by id.
  @State private var audio: [Int] = []
  @State private var subtitles: Set<String> = []
  @State private var codec = "h264"

  var body: some View {
    let (primary, secondary) = downloadNames(item)
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.downloadsSheetTitleNamed(primary)).textStyle(.titleLarge).lineLimit(2)
          .accessibilityAddTraits(.isHeader)
        if let secondary {
          Text(secondary).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
        }
      }
      .padding(.horizontal, 20)
      .padding(.bottom, 12)
      if let error {
        Text(error).textStyle(.bodyMedium).foregroundStyle(palette.danger).padding(.horizontal, 20)
        Spacer(minLength: 0)
      } else if let source {
        options(source)
      } else {
        ProgressView().controlSize(.large).tint(palette.accent).padding(24).frame(maxWidth: .infinity)
        Spacer(minLength: 0)
      }
    }
    .padding(.top, 28)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .matineeSheet([.medium, .large])
    .task { await load() }
    .task(id: PlanKey(loaded: source != nil, audio: audio, codec: codec)) { await plan() }
  }

  private struct PlanKey: Hashable {
    let loaded: Bool
    let audio: [Int]
    let codec: String
  }

  /// The primary track first, as the file plays it; the rest as the file has them.
  private func chosenAudio(_ source: DownloadSource) -> [AudioTrack] {
    let chosen = source.audio.filter { audio.contains($0.index) }
    return chosen.filter(\.primary) + chosen.filter { !$0.primary }
  }

  private func options(_ source: DownloadSource) -> some View {
    let device = picked != .original
    let noAudio = device && !source.audio.isEmpty && chosenAudio(source).isEmpty
    let texts = source.subtitles
    // A size the server can't make for this file doesn't show.
    let shown = downloadChoices(source.resolved.choices.presets).filter { $0.preset == nil || plans[$0] != nil }
    return ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        VersionPanel(
          choices: shown, picked: picked, onPick: { picked = $0 }, codecs: source.resolved.choices.codecs,
          codec: codec, onCodec: { codec = $0 }, plan: plans[picked],
          detail: choiceDetail(picked, plan: plans[picked], source: source))
        // The file as it is keeps every track.
        if device && !source.audio.isEmpty {
          SheetHeading(Str.downloadsAudioTitle)
          ForEach(source.audio, id: \.index) { track in
            let detail = [track.format, track.layout].compactMap(\.self).joined(separator: " · ")
            CheckRow(audioLabel(track), detail: detail.isEmpty ? nil : detail, checked: audio.contains(track.index)) {
              if audio.contains(track.index) { audio.removeAll { $0 == track.index } } else { audio.append(track.index) }
            }
          }
          if noAudio {
            Text(Str.downloadsAudioNone).textStyle(.bodySmall).foregroundStyle(palette.danger).padding(.horizontal, 20)
          }
        }
        if !texts.isEmpty {
          SheetHeading(Str.downloadsSubtitlesTitle)
          ForEach(texts, id: \.id) { track in
            CheckRow(
              subtitleLabel(track, texts), detail: subtitleDetail(track), checked: subtitles.contains(track.id)
            ) {
              if subtitles.contains(track.id) { subtitles.remove(track.id) } else { subtitles.insert(track.id) }
            }
          }
        }
      }
      .padding(.bottom, 16)
    }
    .scrollBounceBehavior(.basedOnSize)
    .safeAreaInset(edge: .bottom) {
      MatineeButton(.primary, action: { start(source, texts: texts) }) {
        // As wide as the sheet, as Android's.
        HStack(spacing: 8) {
          LucideIcon(.download, size: 18)
          Text(Str.downloadsStart)
        }
        .frame(maxWidth: .infinity)
      }
      .disabled(!(picked == .original || (!planning && !noAudio && plans[picked] != nil)))
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
      .background(palette.raised)
    }
  }

  private func load() async {
    guard source == nil, error == nil, let api else { return }
    do {
      let result = try await downloads.resolve(
        api: api, items: [item], device: downloadDevice(PlayerPrefs()), wishes: downloads.wishes()
      ).first
      switch result {
      case .unavailable(let refused): error = refused.message
      case .ready(let ready):
        let loaded = DownloadSource(item: item, resolved: ready)
        audio = downloads.defaultAudio(loaded).map(\.index)
        let codecs = ready.choices.codecs
        codec = codecs.contains(downloads.videoCodec) ? downloads.videoCodec : codecs.first ?? "h264"
        subtitles = Set(downloads.defaultSubtitles(loaded).map(\.id))
        picked = startingChoice(downloads.defaultVersion, presets: ready.choices.presets)
        source = loaded
      case nil: error = Str.downloadsFailed
      }
    } catch {
      if Failure(error) != .cancelled { self.error = describeFailure(error) }
    }
  }

  /// What each version comes to with the audio and codec picked, from the server.
  private func plan() async {
    guard let source, let api else { return }
    let chosen = chosenAudio(source)
    if !source.audio.isEmpty && chosen.isEmpty {
      planning = false
      return
    }
    planning = true
    let device = downloadDevice(PlayerPrefs())
    for choice in downloadChoices(source.resolved.choices.presets) where choice != .original {
      let wishes = downloads.wishes(
        preset: choice.preset.map { DownloadWishes.Preset(height: $0.height, bitrate: $0.bitrate) }, codec: codec,
        audio: chosen.map(\.index))
      do {
        switch try await downloads.resolve(api: api, items: [item], device: device, wishes: wishes).first {
        case .ready(let ready):
          specs[choice] = ready.spec
          plans[choice] = ready.plan
        case .unavailable(let refused):
          specs[choice] = nil
          plans[choice] = nil
          if choice == picked { error = refused.message }
        case nil: break
        }
      } catch {
        if Failure(error) == .cancelled { return }
        self.error = describeFailure(error)
      }
    }
    planning = false
    // A preset the server can't make for this file falls back to the version for this device.
    if picked.preset != nil && plans[picked] == nil { picked = .device(nil) }
  }

  private func start(_ source: DownloadSource, texts: [SubtitleTrack]) {
    guard let server = session.activeServer else { return }
    let saved = texts.filter { subtitles.contains($0.id) }
    let original = picked == .original
    let spec = original ? nil : specs[picked]
    let plan = original ? nil : plans[picked]
    if !original && (spec == nil || plan == nil) { return }
    let downloads = downloads
    let snackbar = snackbar
    Task {
      do {
        try await downloads.enqueue(source, server: server, original: original, spec: spec, plan: plan, subtitles: saved)
      } catch {
        AppLog.downloads.error("Could not queue a download")
        snackbar.show(Str.downloadsFailed)
      }
    }
    dismiss()
  }

  /// What the picked version comes to: its size, and how the video is saved.
  private func choiceDetail(_ choice: DownloadChoice, plan: DownloadPlan?, source: DownloadSource) -> String {
    switch choice {
    case .original:
      return [
        formatBytes(source.item.sizeBytes), source.item.container.uppercased(),
        source.resolved.originalPlays ? nil : Str.downloadsOriginalMayNotPlay,
      ].compactMap(\.self).joined(separator: " · ")
    case .device:
      guard let plan else { return Str.downloadsChoiceUnavailable }
      return [Str.downloadsAbout(formatBytes(plan.estimatedBytes)), "\(plan.video.height)p \(videoCodecName(plan.video.codec))"]
        .joined(separator: " · ")
    }
  }
}

/// The show and episode, or the movie, of a file.
func downloadNames(_ item: MediaItem) -> (String, String?) {
  let label = itemLabel(item)
  if let code = episodeCode(item) { return (label.showName, Str.mediaCodeTitle(code, label.title)) }
  return (label.title, nil)
}

/// A choice's name in the sheet: this device's version, at a size, or the original.
func choiceName(_ choice: DownloadChoice) -> String {
  switch choice {
  case .original: Str.downloadsChoiceOriginal
  case .device(let preset?): Str.downloadsChoicePreset(preset.height, mbps(preset.bitrate, locale: .app))
  case .device(nil): Str.downloadsChoiceDevice
  }
}

/// The version to save and its codec, as two menus, with what the version
/// comes to under them. The codec applies only to video that gets encoded:
/// the original keeps its file, and a version that keeps the video says
/// which codec it stays in.
struct VersionPanel: View {
  let choices: [DownloadChoice]
  let picked: DownloadChoice
  let onPick: (DownloadChoice) -> Void
  let codecs: [String]
  let codec: String?
  let onCodec: (String) -> Void
  let plan: DownloadPlan?
  let detail: String?
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Panel {
        PickerRow(Str.downloadsDefaultTitle, options: choices.map { ($0, choiceName($0)) }, current: picked, onPick: onPick)
        if picked != .original, let codec, !codecs.isEmpty {
          RowDivider()
          // Without a preset the server may keep the video, and then there's nothing to encode.
          if picked.preset == nil, let plan, plan.video.mode != "encode" {
            PickerRow(
              Str.downloadsCodec, options: [(0, Str.downloadsCodecKept(videoCodecName(plan.video.codec)))], current: 0,
              enabled: false
            ) { _ in }
          } else {
            PickerRow(
              Str.downloadsCodec, options: codecs.map { ($0, videoCodecName($0)) }, current: codec,
              enabled: codecs.count > 1, onPick: onCodec)
          }
        }
      }
      if let detail, !detail.isEmpty {
        Text(detail).textStyle(.bodySmall).foregroundStyle(palette.muted)
      }
    }
    .padding(.horizontal, 20)
  }
}

/// A group's name in a sheet, like the audio tracks'.
struct SheetHeading: View {
  let text: String

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.titleSmall, weight: .semibold)
      .accessibilityAddTraits(.isHeader)
      .padding(.horizontal, 20)
      .padding(.top, 16)
      .padding(.bottom, 4)
  }
}

/// A choice of several in a sheet: a square mark, its name, and what it is.
private struct CheckRow: View {
  let title: String
  let detail: String?
  let checked: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ title: String, detail: String?, checked: Bool, action: @escaping () -> Void) {
    self.title = title
    self.detail = detail
    self.checked = checked
    self.action = action
  }

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 5, style: .continuous)
    Button(action: action) {
      HStack(spacing: 14) {
        ZStack {
          if checked {
            shape.fill(palette.accent)
            LucideIcon(.check, size: 14, tint: palette.background, scales: false)
          } else {
            shape.strokeBorder(palette.input, lineWidth: 2)
          }
        }
        .frame(width: 20, height: 20)
        VStack(alignment: .leading, spacing: 0) {
          Text(title).textStyle(.bodyLarge).foregroundStyle(palette.foreground).lineLimit(1)
          if let detail, !detail.isEmpty {
            Text(detail).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
      .frame(minHeight: MinTouch)
      .contentShape(Rectangle())
    }
    .buttonStyle(RowPress())
    .accessibilityAddTraits(checked ? .isSelected : [])
  }
}
