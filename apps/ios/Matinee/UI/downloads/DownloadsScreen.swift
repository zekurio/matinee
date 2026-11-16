import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DownloadsScreen.kt: the Downloads tab and a downloaded show's page. The
 * rows, their sheets, and the words for a download's state are
 * DownloadRows.swift's; the lists are sorted by MatineeCore's
 * `downloadList`, and what the tab says over them is its `downloadsNotice`.
 * Both pages follow the store as it changes, so progress moves on and a
 * finished download takes its place without a reload. They show the
 * server in use's downloads only, as the store does.
 *
 * Android's tab has no storage figure; Settings' Downloads page has it,
 * and so it is here, on a phone and an iPad alike.
 */

/// How wide the lists get on an iPad: a row's bar and words stay a line's
/// length, the column centered, rather than stretch across a wide window.
private let LIST_WIDTH: CGFloat = 840

/// The downloads, in two lists: what's still coming, file by file, with
/// how far each is and a button to pause or go on; then what's on the
/// device, movies and shows, newest first. A movie plays with a tap; a show
/// opens its own page of episodes.
struct DownloadsScreen: View {
  @Environment(Downloads.self) private var downloads
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.shellStyle) private var style
  @Environment(\.gutter) private var gutter
  @Environment(\.snackbar) private var snackbar
  @State private var acting: OfflineItem?
  @State private var actingShow: ShowDownloads?
  @State private var removing: Removal?

  var body: some View {
    let entries = shownEntries(downloads)
    let list = downloadList(entries)
    let notice = downloadsNotice(count: entries.count, offline: offline, mayDownload: viewer?.options?.downloads)
    Group {
      if entries.isEmpty {
        VStack(spacing: 0) {
          if style == .tablet {
            header.frame(maxWidth: LIST_WIDTH).padding(.horizontal, gutter).frame(maxWidth: .infinity)
          }
          empty(notice)
        }
      } else {
        ScrollView {
          LazyVStack(alignment: .leading, spacing: Space.s1) {
            if style == .tablet { header }
            if notice == .off {
              Callout(Str.downloadsOffTitle, description: Str.downloadsOffDescription, icon: .info)
                .padding(.top, Space.s3)
            }
            content(list)
          }
          .frame(maxWidth: LIST_WIDTH)
          .padding(.horizontal, gutter)
          .frame(maxWidth: .infinity)
          .padding(.bottom, Space.s6)
          .motion(Motion.move, value: list.coming.map(\.id) + list.finished.map(\.id))
        }
        .scrollsToTopOnReselect()
      }
    }
    .modifier(TabTop(tablet: style == .tablet))
    .matineeSheet(item: $acting) { DownloadActions(entry: $0) }
    .matineeSheet(item: $actingShow) { show in
      ShowActions(title: show.title, entries: show.entries) {
        removing = Removal(name: show.title.name, entries: show.entries)
      }
    }
    .removalDialog($removing)
    #if DEBUG
      .task { await devOpen(list) }
    #endif
  }

  #if DEBUG
    @Environment(\.actions) private var actions
    @Environment(\.api) private var api

    /// `-dev.downloadOpen` (DownloadFixtures.swift), once, then
    /// `-dev.downloadAfter`, the same after the seconds its third part says.
    private func devOpen(_ list: DownloadList) async {
      if let open = DownloadFixtures.open, let id = open.id {
        UserDefaults.standard.removeObject(forKey: "dev.downloadOpen")
        try? await Task.sleep(for: .milliseconds(800))
        await devDo(open.what, id: id, season: open.season, list: list)
      }
      if let after = DownloadFixtures.after, let id = after.id {
        UserDefaults.standard.removeObject(forKey: "dev.downloadAfter")
        try? await Task.sleep(for: .seconds(after.season ?? 1))
        await devDo(after.what, id: id, season: nil, list: list)
      }
    }

    private func devDo(_ what: String, id: String, season: Int?, list: DownloadList) async {
      switch what {
      case "actions": acting = shownEntries(downloads).first { $0.id == id }
      case "show":
        actingShow = list.finished.compactMap { if case .show(let show) = $0 { show } else { nil } }.first { $0.id == id }
      case "sheet": actions?.download = try? await api?.media.get(id: id)
      case "files":
        guard let title = try? await api?.titles.get(id: id) else { return }
        actions?.files = FileSet(title: title.summary, season: season.flatMap { n in title.seasons.first { $0.number == n } })
      case "pause": try? await downloads.pause(id)
      case "resume": try? await downloads.resume(id)
      case "remove": try? await downloads.remove(id)
      default: break
      }
    }
  #endif

  /// What the page says with nothing on it, in the middle of what's visible.
  private func empty(_ notice: DownloadsNotice) -> some View {
    let off = notice == .off
    return EmptyState(
      icon: .download, title: off ? Str.downloadsOffTitle : Str.downloadsEmpty,
      description: off ? Str.downloadsOffDescription : Str.downloadsEmptyHint
    )
    .padding(.horizontal, gutter)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  @ViewBuilder private func content(_ list: DownloadList) -> some View {
    if !list.coming.isEmpty {
      ListHeading(Str.downloadsComing) { comingAction(list.coming) }
      ForEach(list.coming) { entry in
        let (primary, secondary) = downloadNames(entry.item)
        ComingRow(entry: entry, primary: primary, secondary: secondary) { acting = entry }
      }
    }
    if !list.finished.isEmpty {
      // A heading only to tell the two lists apart.
      if !list.coming.isEmpty { ListHeading(Str.downloadsDone) } else { Color.clear.frame(height: Space.s2) }
      ForEach(list.finished) { group in
        switch group {
        case .show(let show): ShowRow(show: show) { actingShow = show }
        case .file(let entry):
          let (primary, secondary) = downloadNames(entry.item)
          DoneRow(entry: entry, primary: primary, secondary: secondary) { acting = entry }
        }
      }
    }
  }

  /// The web's page header from `sm` up: the page's name large, and
  /// whether the app is offline at its end.
  private var header: some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.s4) {
      Text(Str.downloadsTitle).textStyle(.px32, weight: .semibold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
        .frame(maxWidth: .infinity, alignment: .leading)
      if offline { LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.mutedForeground) }
    }
    .padding(.top, Space.s6)
    .padding(.bottom, Space.s2)
  }

  /// What the heading offers for every file still coming: what broke off
  /// first, as that's what wants doing, then pausing what moves, then going on.
  @ViewBuilder private func comingAction(_ coming: [OfflineItem]) -> some View {
    switch MatineeCore.comingAction(coming) {
    case .retryAll(let ids): headingButton(Str.downloadsRetryAll, ids) { try await $0.resume($1) }
    case .pauseAll(let ids): headingButton(Str.downloadsPauseAll, ids) { try await $0.pause($1) }
    case .resumeAll(let ids): headingButton(Str.downloadsResumeAll, ids) { try await $0.resume($1) }
    case .none: EmptyView()
    }
  }

  /// A heading's action, as the web's ghost buttons: the accent's words on nothing.
  private func headingButton(
    _ label: String, _ ids: [String], _ change: @escaping @MainActor (Downloads, String) async throws -> Void
  ) -> some View {
    MatineeButton(look: .ghost, size: .md) {
      changeDownloads(downloads, snackbar, ids, change)
    } label: {
      Text(label).foregroundStyle(palette.accent)
    }
  }
}

/// The page's top on a tab's first page: the phone's bar with the page's
/// name, and whether the app is offline at its end; an iPad's page draws
/// its own header under the shell's bar.
private struct TabTop: ViewModifier {
  let tablet: Bool
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    if tablet {
      content.hidesSystemNavigationBar()
    } else {
      content.topBar(Str.downloadsTitle, leading: .none) {
        if offline {
          LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.mutedForeground)
            .padding(.horizontal, Space.s3)
        }
      }
    }
  }
}

/// The downloads the pages show: the server in use's, and in a debug build
/// with `-dev.downloadFixtures YES` a made-up one in every state.
@MainActor func shownEntries(_ downloads: Downloads) -> [OfflineItem] {
  let stored = Array(downloads.store.items.values)
  #if DEBUG
    if DownloadFixtures.on { return stored + DownloadFixtures.entries }
  #endif
  return stored
}

/// A downloaded show's episodes by season, each playing with a tap, and
/// the ones still coming with how far they are. Its menu, and each
/// season's button, remove them.
struct DownloadsShowScreen: View {
  let titleId: String
  @Environment(Downloads.self) private var downloads
  @Environment(\.dismiss) private var dismiss
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette
  @State private var acting: OfflineItem?
  @State private var menu = false
  @State private var removing: Removal?

  var body: some View {
    let entries = shownEntries(downloads).filter { $0.item.title?.id == titleId }
    let title = entries.first?.item.title
    Group {
      if let title {
        page(title, entries: entries)
      } else {
        Color.clear
      }
    }
    .topBar(title?.name) {
      if title != nil {
        RoundIconButton(.ellipsis, label: Str.titleMoreActions, look: .ghost, size: 40, iconSize: 20) { menu = true }
          .padding(.trailing, Space.s1)
      }
    }
    // Everything removed: back to the list.
    .onChange(of: entries.isEmpty, initial: true) { _, empty in if empty { dismiss() } }
    .matineeSheet(item: $acting) { DownloadActions(entry: $0) }
    .matineeSheet(isPresented: $menu) {
      if let title {
        ShowActions(title: title, entries: entries) { removing = Removal(name: title.name, entries: entries) }
      }
    }
    .removalDialog($removing)
    #if DEBUG
      .task {
        guard let open = DownloadFixtures.open else { return }
        UserDefaults.standard.removeObject(forKey: "dev.downloadOpen")
        try? await Task.sleep(for: .milliseconds(800))
        let entries = shownEntries(downloads).filter { $0.item.title?.id == titleId }
        switch open.what {
        case "menu": menu = true
        case "remove":
          if let title = entries.first?.item.title, let season = seasonsOf(entries).first {
            removing = Removal(name: Str.titleSeasonOf(title.name, seasonName(season.number)), entries: season.entries)
          }
        case "actions": acting = entries.first { $0.id == open.id }
        default: break
        }
      }
    #endif
  }

  private func page(_ title: TitleSummary, entries: [OfflineItem]) -> some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: Space.s1) {
        Text(episodesAndSize(entries)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        ForEach(seasonsOf(entries), id: \.number) { season in
          let name = seasonName(season.number)
          ListHeading(name) {
            RoundIconButton(
              .trash, label: Str.downloadsRemoveNamed(name), look: .ghost, size: 40, iconSize: 18,
              tint: palette.mutedForeground
            ) {
              removing = Removal(name: Str.titleSeasonOf(title.name, name), entries: season.entries)
            }
          }
          ForEach(season.entries) { entry in
            let label = itemLabel(entry.item)
            let name = episodeNumber(entry.item).map { Str.titleEpisodesCodedName($0, label.title) } ?? label.title
            if entry.state == .done {
              DoneRow(entry: entry, primary: name, secondary: nil) { acting = entry }
            } else {
              ComingRow(entry: entry, primary: name, secondary: nil) { acting = entry }
            }
          }
        }
      }
      .frame(maxWidth: LIST_WIDTH)
      .padding(.horizontal, gutter)
      .frame(maxWidth: .infinity)
      .padding(.bottom, Space.s6)
      .motion(Motion.move, value: entries.map { "\($0.id)\($0.state)" }.sorted())
    }
  }
}
