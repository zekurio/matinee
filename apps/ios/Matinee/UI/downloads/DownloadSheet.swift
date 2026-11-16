import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DownloadSheet.kt: what to download of one file, drawn as the web's
 * download dialog. The server says what it can make of the file for this
 * device (`downloads.resolve`, with the device `downloadDevice` describes),
 * at which sizes and in which codecs, with which audio and subtitles; the
 * sheet shows that and hands the person's pick to `Downloads.enqueue`.
 * What it decides from the answers is MatineeCore's
 * (Downloads/DownloadSheetData.swift).
 *
 * Android picks the version from a dropdown and shows the size of the one
 * picked; the web has two cards, the file as it is and a version of one's
 * own. Here every version is a card, the web's, with the size the server
 * estimates for it on it, so they can be weighed against each other
 * before one is picked, and a finger has a big target for each.
 *
 * The actions host (components/Actions.swift) presents both sheets.
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
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.snackbar) private var snackbar
  @Environment(\.sheetDismiss) private var dismiss

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
    VStack(spacing: 0) {
      SheetTitle(Str.downloadsSheetTitleNamed(primary), subtitle: secondary)
      if viewer?.options?.downloads == false {
        DownloadsOff()
      } else if let error {
        ErrorState(Str.downloadsFailed, error)
          .padding(.vertical, Space.s12)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      } else if let source {
        options(source)
      } else {
        SheetSpinner()
      }
    }
    .task { await load() }
    .task(id: PlanKey(loaded: source != nil, audio: audio, codec: codec)) { await plan() }
  }

  private struct PlanKey: Hashable {
    let loaded: Bool
    let audio: [Int]
    let codec: String
  }

  private func options(_ source: DownloadSource) -> some View {
    let device = picked != .original
    let noAudio = missingAudio(source, choice: picked, indices: audio)
    let texts = source.subtitles
    return VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.s6) {
          SheetGroup(Str.downloadsDefaultTitle) {
            VersionCards(
              choices: shownChoices(source.resolved.choices.presets, plans: plans), picked: $picked,
              detail: { choiceDetail($0, source: source) }, waiting: { planning && plans[$0] == nil && $0 != .original })
          }
          CodecField(row: codecRow(picked, plan: plans[picked], codecs: source.resolved.choices.codecs), codec: $codec)
          // The file as it is keeps every track.
          if device && !source.audio.isEmpty {
            SheetGroup(Str.downloadsAudioTitle) {
              ListBlock {
                ForEach(source.audio, id: \.index) { track in
                  let detail = [track.format, track.layout].compactMap(\.self).joined(separator: " · ")
                  MatineeKit.SwitchRow(audioLabel(track), subtitle: detail.isEmpty ? nil : detail, isOn: audioBinding(track.index))
                }
              }
              if noAudio { SheetProblem(Str.downloadsAudioNone) }
            }
          }
          if !texts.isEmpty {
            SheetGroup(Str.downloadsSubtitlesTitle) {
              ListBlock {
                ForEach(texts, id: \.id) { track in
                  let detail = subtitleDetail(track)
                  MatineeKit.SwitchRow(
                    subtitleLabel(track, texts), subtitle: detail.isEmpty ? nil : detail,
                    isOn: subtitleBinding(track.id))
                }
              }
            }
          }
        }
        .padding(.horizontal, SHEET_INSET)
        .padding(.bottom, Space.s4)
      }
      .scrollBounceBehavior(.basedOnSize)
      SheetFooter {
        MatineeButton(
          Str.downloadsStart, icon: .download, pending: device && planning && plans[picked] == nil, fullWidth: true
        ) { start(source, texts: texts) }
        .disabled(!canStart(picked, planning: planning, missingAudio: noAudio, plans: plans))
      }
    }
  }

  private func audioBinding(_ index: Int) -> Binding<Bool> {
    Binding(
      get: { audio.contains(index) },
      set: { on in if on { if !audio.contains(index) { audio.append(index) } } else { audio.removeAll { $0 == index } } })
  }

  private func subtitleBinding(_ id: String) -> Binding<Bool> {
    Binding(
      get: { subtitles.contains(id) },
      set: { on in if on { subtitles.insert(id) } else { subtitles.remove(id) } })
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
        codec = startingCodec(downloads.videoCodec, codecs: ready.choices.codecs) ?? "h264"
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
    let chosen = chosenAudio(source, indices: audio)
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
    picked = settledChoice(picked, plans: plans)
    #if DEBUG
      if let wanted = DownloadFixtures.takeStart() {
        let choices = shownChoices(source.resolved.choices.presets, plans: plans)
        picked =
          wanted == "original"
          ? .original : choices.first { $0.preset.map { String($0.height) } == wanted } ?? .device(nil)
        start(source, texts: source.subtitles)
      }
    #endif
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
    // On in a task of its own, so it's queued whether or not the sheet is still there.
    Task {
      do {
        try await downloads.enqueue(source, server: server, original: original, spec: spec, plan: plan, subtitles: saved)
      } catch {
        AppLog.downloads.error("Could not queue a download")
        // TODO(strings): downloads_queue_failed, "Couldn't start the download".
        snackbar.post(ToastMessage(Str.downloadsFailed, kind: .error))
      }
    }
    dismiss()
  }

  /// What a version comes to: its size, and how the video is saved.
  private func choiceDetail(_ choice: DownloadChoice, source: DownloadSource) -> String? {
    switch choice {
    case .original:
      return [
        formatBytes(source.item.sizeBytes), source.item.container.uppercased(),
        source.resolved.originalPlays ? nil : Str.downloadsOriginalMayNotPlay,
      ].compactMap(\.self).joined(separator: " · ")
    case .device:
      guard let plan = plans[choice] else { return planning ? nil : Str.downloadsChoiceUnavailable }
      return planDetail(plan)
    }
  }
}

/// "About 1.2 GB · 1080p H.264": what a version comes to, and how its video is saved.
func planDetail(_ plan: DownloadPlan) -> String {
  [Str.downloadsAbout(formatBytes(plan.estimatedBytes)), "\(plan.video.height)p \(videoCodecName(plan.video.codec))"]
    .joined(separator: " · ")
}

/// A choice's name: this device's version, at a size, or the original.
func choiceName(_ choice: DownloadChoice) -> String {
  switch choice {
  case .original: Str.downloadsChoiceOriginal
  case .device(let preset?): Str.downloadsChoicePreset(preset.height, mbps(preset.bitrate, locale: .app))
  case .device(nil): Str.downloadsChoiceDevice
  }
}

/// How far a download sheet's content sits from its edges, as the web's drawer's `px-5`.
let SHEET_INSET: CGFloat = Space.s5

/// A download sheet's top: its name in the web dialog's `text-lg
/// font-semibold`, and under it what it belongs to.
struct SheetTitle: View {
  let title: String
  let subtitle: String?
  @Environment(\.palette) private var palette

  init(_ title: String, subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s0_5) {
      Text(title).textStyle(.lg, weight: .semibold, tracking: .tight).foregroundStyle(palette.foreground)
        .lineLimit(2)
        .accessibilityAddTraits(.isHeader)
      if let subtitle {
        Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, SHEET_INSET)
    .padding(.top, Space.s2)
    .padding(.bottom, Space.s4)
  }
}

/// A group of a sheet's fields under its name, as the web's field legend: `text-sm font-medium`.
struct SheetGroup<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s2) {
      Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Why a sheet's button can't be pressed yet, in the danger color.
struct SheetProblem: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.px13).foregroundStyle(palette.destructive)
  }
}

/// The sheet's button, under a line, as the web's dialog footer, below what scrolls.
struct SheetFooter<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(spacing: 0) {
      Separator()
      content()
        .padding(.horizontal, SHEET_INSET)
        .padding(.top, Space.s3)
        .padding(.bottom, Space.s2)
    }
  }
}

/// A sheet's content loading: the spinner where it'll be.
struct SheetSpinner: View {
  @Environment(\.palette) private var palette

  var body: some View {
    Spinner(size: 32, tint: palette.accent)
      .frame(maxWidth: .infinity, minHeight: 160, maxHeight: .infinity)
  }
}

/// In a sheet that opened while the account may download, and no longer may.
struct DownloadsOff: View {
  var body: some View {
    // Near the top, where the eye is, rather than lost in the middle of a tall sheet.
    EmptyState(icon: .download, title: Str.downloadsOffTitle, description: Str.downloadsOffDescription)
      .padding(.horizontal, SHEET_INSET)
      .padding(.vertical, Space.s12)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

/// The versions to pick from, each a card with what it comes to, as the
/// web's version cards: `rounded-lg border p-3`, the one picked on the
/// accent's tint. Side by side where the sheet has the room.
struct VersionCards: View {
  let choices: [DownloadChoice]
  @Binding var picked: DownloadChoice
  /// What a choice comes to, nil while it isn't known yet.
  let detail: (DownloadChoice) -> String?
  /// Whether its size is on its way from the server.
  let waiting: (DownloadChoice) -> Bool
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let columns =
      typeSize.isAccessibilitySize
      ? [GridItem(.flexible())] : [GridItem(.adaptive(minimum: 220), spacing: Space.s2, alignment: .top)]
    LazyVGrid(columns: columns, alignment: .leading, spacing: Space.s2) {
      ForEach(choices, id: \.self) { choice in
        VersionCard(
          name: choiceName(choice), detail: detail(choice), waiting: waiting(choice), selected: choice == picked
        ) { withMotion(Motion.color) { picked = choice } }
      }
    }
  }
}

private struct VersionCard: View {
  let name: String
  let detail: String?
  let waiting: Bool
  let selected: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.lg)
    Pressable(shape: shape, action: action) {
      HStack(alignment: .top, spacing: Space.s2) {
        VStack(alignment: .leading, spacing: Space.s0_5) {
          Text(name).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
          if let detail {
            Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground)
          } else if waiting {
            Skeleton(radius: Radius.sm).frame(width: 128, height: 12).padding(.vertical, 4)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        LucideIcon(.check, size: 16, tint: palette.accent, scales: false)
          .opacity(selected ? 1 : 0)
          .padding(.top, 2)
      }
      .padding(Space.s3)
      .frame(maxWidth: .infinity, alignment: .topLeading)
      .background(selected ? palette.accentSoft : .clear, in: shape)
      .overlay { shape.strokeBorder(selected ? palette.accentBorder : palette.border) }
      .contentShape(shape)
    }
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

/// The codec a version's video is encoded in, under the versions: a menu
/// of the server's codecs, or, when the server keeps the video, which it
/// stays in. Nothing for the file as it is.
struct CodecField: View {
  let row: CodecRow
  @Binding var codec: String

  var body: some View {
    switch row {
    case .hidden: EmptyView()
    case .kept(let kept):
      SheetGroup(Str.downloadsCodec) {
        Select(Str.downloadsCodec, selection: .constant(0), options: [(0, Str.downloadsCodecKept(videoCodecName(kept)))])
          .disabled(true)
      }
    case .choose(let codecs):
      SheetGroup(Str.downloadsCodec) {
        Select(Str.downloadsCodec, selection: $codec, options: codecs.map { ($0, videoCodecName($0)) })
          .disabled(codecs.count < 2)
      }
    }
  }
}
