import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DownloadFilesSheet.kt: every file of a show, or of one of its seasons, at
 * once. The server resolves them in batches for this device; the sheet
 * offers the versions they share and queues the answers it got, without
 * asking again per file.
 */

/// Every file of a show, or of one of its seasons when `season` is set.
struct FileSet: Hashable {
  let title: TitleSummary
  var season: Season?

  func load(_ api: MatineeApi) async throws -> [MediaItem] {
    guard let season else { return try await api.titleItems(title.id) }
    guard let number = season.number else { return try await api.looseItems(title.id) }
    return try await api.titleItems(title.id, season: number)
  }
}

/// Resolve a season in batches, then queue the returned plans without more requests.
struct DownloadFilesSheet: View {
  let files: FileSet
  @Environment(\.api) private var api
  @Environment(Downloads.self) private var downloads
  @Environment(MatineeSession.self) private var session
  @Environment(\.snackbar) private var snackbar
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  @State private var items: [MediaItem]?
  @State private var error: String?
  @State private var picked: DownloadChoice = .device(nil)
  @State private var presets: [DownloadVideoPreset] = []
  @State private var codecs: [String] = []
  @State private var results: [DownloadResolution]?
  @State private var resolvedWishes: DownloadWishes?
  @State private var codec: String?

  var body: some View {
    let name = files.season.map { Str.titleSeasonOf(files.title.name, seasonName($0.number)) } ?? files.title.name
    VStack(alignment: .leading, spacing: 0) {
      Text(Str.downloadsSheetTitleNamed(name)).textStyle(.xl, weight: .semibold, tracking: .tight).lineLimit(2)
        .accessibilityAddTraits(.isHeader)
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
      if let error {
        Text(error).textStyle(.sm).foregroundStyle(palette.destructive).padding(.horizontal, 20)
      } else if let items, let results {
        content(items, results)
      } else {
        ProgressView().controlSize(.large).tint(palette.accent).padding(24).frame(maxWidth: .infinity)
      }
      Spacer(minLength: 0)
    }
    .padding(.top, 28)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .legacySheet([.medium, .large])
    .task { await load() }
    .task(id: Wanted(loaded: items != nil, picked: picked, codec: codec)) { await again() }
  }

  private struct Wanted: Hashable {
    let loaded: Bool
    let picked: DownloadChoice
    let codec: String?
  }

  private func missing(_ items: [MediaItem]) -> [MediaItem] {
    items.filter { downloads.store.items[$0.id] == nil }
  }

  @ViewBuilder private func content(_ items: [MediaItem], _ results: [DownloadResolution]) -> some View {
    let missing = missing(items)
    let have = items.count - missing.count
    let summary = [
      missing.isEmpty ? nil : Str.downloadsAllFiles(missing.count), have > 0 ? Str.downloadsAllHave(have) : nil,
    ].compactMap(\.self).joined(separator: " · ")
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        Text(summary.isEmpty ? Str.downloadsAllEmpty : summary).textStyle(.sm)
          .foregroundStyle(palette.mutedForeground)
          .padding(.horizontal, 20)
        if !missing.isEmpty {
          let ready = results.compactMap(\.ready)
          let size =
            picked == .original
            ? missing.reduce(Int64(0)) { $0 + $1.sizeBytes } : ready.reduce(Int64(0)) { $0 + $1.plan.estimatedBytes }
          // Files that get encoded come in the codec picked; a preset encodes every file.
          VersionPanel(
            choices: downloadChoices(presets), picked: picked, onPick: { picked = $0 }, codecs: codecs,
            codec: codec ?? codecs.first, onCodec: { codec = $0 }, plan: nil,
            detail: Str.downloadsAbout(formatBytes(size))
          )
          .padding(.top, 12)
          ForEach(Array(results.compactMap(\.unavailable).enumerated()), id: \.offset) { _, refused in
            Text(refused.message).textStyle(.sm).foregroundStyle(palette.destructive)
              .padding(.horizontal, 20)
              .padding(.top, 8)
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, 16)
    }
    .scrollBounceBehavior(.basedOnSize)
    .safeAreaInset(edge: .bottom) {
      if !missing.isEmpty {
        LegacyButton(.primary, action: { start(missing, results) }) {
          HStack(spacing: 8) {
            LucideIcon(.download, size: 18)
            Text(Str.downloadsStart)
          }
          .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(palette.popover)
      }
    }
  }

  private func load() async {
    guard items == nil, error == nil, let api else { return }
    do {
      let loaded = try await files.load(api)
      let wishes = downloads.wishes()
      let initial = try await downloads.resolve(
        api: api, items: missing(loaded), device: downloadDevice(PlayerPrefs()), wishes: wishes)
      presets = mergedPresets(initial)
      codecs = mergedCodecs(initial)
      codec = codecs.contains(downloads.videoCodec) ? downloads.videoCodec : nil
      picked = startingChoice(downloads.defaultVersion, presets: presets)
      resolvedWishes = wishes
      results = initial
      items = loaded
    } catch {
      if Failure(error) != .cancelled { self.error = Str.downloadsAllLoadFailed(describeFailure(error)) }
    }
  }

  /// What the files come to at the version and codec picked, from the server.
  private func again() async {
    guard let items, let api else { return }
    let wishes = downloads.wishes(
      preset: picked.preset.map { DownloadWishes.Preset(height: $0.height, bitrate: $0.bitrate) }, codec: codec)
    guard wishes != resolvedWishes else { return }
    results = nil
    do {
      results = try await downloads.resolve(
        api: api, items: missing(items), device: downloadDevice(PlayerPrefs()), wishes: wishes)
      resolvedWishes = wishes
    } catch {
      if Failure(error) != .cancelled { self.error = describeFailure(error) }
    }
  }

  private func start(_ missing: [MediaItem], _ results: [DownloadResolution]) {
    guard let server = session.activeServer else { return }
    let original = picked == .original
    let downloads = downloads
    let snackbar = snackbar
    snackbar.show(Str.downloadsAllStarted(missing.count))
    // On in a task of its own, so the files keep queueing after the sheet goes.
    Task {
      let (ready, refused) = readyDownloads(missing, results)
      var failed = refused
      for (item, answer) in ready where downloads.store.items[item.id] == nil {
        do {
          let source = DownloadSource(item: item, resolved: answer)
          try await downloads.enqueue(
            source, server: server, original: original, spec: original ? nil : answer.spec,
            plan: original ? nil : answer.plan)
        } catch {
          AppLog.downloads.error("Could not queue a download")
          failed += 1
        }
      }
      if failed > 0 { snackbar.show(Str.downloadsAllFailed(failed)) }
    }
    dismiss()
  }
}
