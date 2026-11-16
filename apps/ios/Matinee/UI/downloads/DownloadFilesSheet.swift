import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DownloadFilesSheet.kt: every file of a show, or of one of its seasons, at
 * once. The server resolves them in batches for this device; the sheet
 * offers the versions they share and queues the answers it got, without
 * asking again per file. It looks like the file's sheet (DownloadSheet.swift).
 */

/// Every file of a show, or of one of its seasons when `season` is set.
struct FileSet: Hashable, Identifiable {
  let title: TitleSummary
  var season: Season?

  var id: String { "\(title.id)/\(season.map { String(describing: $0.number) } ?? "all")" }

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
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.snackbar) private var snackbar
  @Environment(\.sheetDismiss) private var dismiss

  @State private var items: [MediaItem]?
  @State private var error: String?
  @State private var picked: DownloadChoice = .device(nil)
  @State private var presets: [DownloadVideoPreset] = []
  @State private var codecs: [String] = []
  /// The server's answers for what's picked; the last ones stay while new ones come.
  @State private var results: [DownloadResolution]?
  @State private var resolvedWishes: DownloadWishes?
  @State private var resolving = false
  /// Empty for the server's first.
  @State private var codec = ""

  var body: some View {
    let name = files.season.map { Str.titleSeasonOf(files.title.name, seasonName($0.number)) } ?? files.title.name
    VStack(spacing: 0) {
      SheetTitle(Str.downloadsSheetTitleNamed(name), subtitle: items.map(summary))
      if viewer?.options?.downloads == false {
        DownloadsOff()
      } else if let error {
        ErrorState(Str.downloadsFilesFailed, error)
          .padding(.vertical, Space.s12)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      } else if let items, let results {
        content(items, results)
      } else {
        SheetSpinner()
      }
    }
    .task { await load() }
    .task(id: Wanted(loaded: items != nil, picked: picked, codec: codec)) { await again() }
  }

  private struct Wanted: Hashable {
    let loaded: Bool
    let picked: DownloadChoice
    let codec: String
  }

  private func missing(_ items: [MediaItem]) -> [MediaItem] {
    items.filter { downloads.store.items[$0.id] == nil }
  }

  /// "3 files · 1 on this device", or that there are none.
  private func summary(_ items: [MediaItem]) -> String {
    let missing = missing(items).count
    let have = items.count - missing
    let parts = [missing == 0 ? nil : Str.downloadsAllFiles(missing), have > 0 ? Str.downloadsAllHave(have) : nil]
    let summary = parts.compactMap(\.self).joined(separator: " · ")
    return summary.isEmpty ? Str.downloadsAllEmpty : summary
  }

  @ViewBuilder private func content(_ items: [MediaItem], _ results: [DownloadResolution]) -> some View {
    let missing = missing(items)
    // One line for each thing the server said, however many files it said it of.
    let refusals = results.compactMap(\.unavailable).map(\.message).reduce(into: [String]()) {
      if !$0.contains($1) { $0.append($1) }
    }
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.s6) {
          if !missing.isEmpty {
            SheetGroup(Str.downloadsDefaultTitle) {
              VersionCards(
                choices: downloadChoices(presets), picked: $picked,
                detail: { detail($0, missing: missing, results: results) },
                waiting: { $0 == picked && resolving })
            }
            // Files that get encoded come in the codec picked; a preset encodes every file.
            CodecField(
              row: codecRow(picked, plan: nil, codecs: codecs),
              codec: Binding(get: { codec.isEmpty ? codecs.first ?? "" : codec }, set: { codec = $0 }))
            ForEach(refusals, id: \.self) { message in
              Callout(message, icon: .circleAlert, look: .destructive)
            }
          }
        }
        .padding(.horizontal, SHEET_INSET)
        .padding(.bottom, Space.s4)
      }
      .scrollBounceBehavior(.basedOnSize)
      if !missing.isEmpty {
        SheetFooter {
          MatineeButton(Str.downloadsStart, icon: .download, pending: resolving, fullWidth: true) {
            start(missing, results)
          }
        }
      }
    }
  }

  /// What a version of the files comes to: the files as they are, or, for
  /// the one picked, what the server estimates. The others aren't asked
  /// for until they're picked.
  private func detail(_ choice: DownloadChoice, missing: [MediaItem], results: [DownloadResolution]) -> String? {
    if choice == .original { return formatBytes(filesSize(.original, missing: missing, results: results)) }
    guard choice == picked, !resolving else { return nil }
    return Str.downloadsAbout(formatBytes(filesSize(choice, missing: missing, results: results)))
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
      // Empty for the server's first, as Settings' "auto" asks it, until one's picked.
      codec = codecs.contains(downloads.videoCodec) ? downloads.videoCodec : ""
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
      preset: picked.preset.map { DownloadWishes.Preset(height: $0.height, bitrate: $0.bitrate) },
      codec: codec.isEmpty ? nil : codec)
    guard wishes != resolvedWishes else { return }
    resolving = true
    defer { resolving = false }
    do {
      let answer = try await downloads.resolve(
        api: api, items: missing(items), device: downloadDevice(PlayerPrefs()), wishes: wishes)
      results = answer
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
      if failed > 0 { snackbar.post(ToastMessage(Str.downloadsAllFailed(failed), kind: .error)) }
    }
    dismiss()
  }
}
