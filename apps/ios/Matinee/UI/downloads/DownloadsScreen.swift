import MatineeCore
import SwiftUI

/*
 * DownloadsScreen.kt: the Downloads tab and a downloaded show's page. The
 * rows, their menus, and the words for a download's state are
 * DownloadRows.swift's; the lists are sorted by MatineeCore's
 * `downloadList`. Both pages follow the store as it changes, so progress
 * moves on and a finished download takes its place without a reload. They
 * show the server in use's downloads only, as the store does.
 */

/// The downloads, in two lists: what's still coming, file by file, with
/// how far each is and a button to pause or go on; then what's on the
/// phone, movies and shows, newest first. A movie plays with a tap; a show
/// opens its own page of episodes.
struct DownloadsScreen: View {
  @Environment(Downloads.self) private var downloads
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @State private var removing: Removal?

  var body: some View {
    let items = downloads.store.items
    let list = downloadList(items.values)
    List {
      if items.isEmpty {
        // Offline, the server can't say, so the usual hint stays.
        let off = !offline && viewer?.mayDownload == false && viewer?.options != nil
        EmptyState(
          .download, off ? Str.downloadsOffTitle : Str.downloadsEmpty,
          off ? Str.downloadsOffDescription : Str.downloadsEmptyHint
        )
        .downloadRow()
      }
      if !list.coming.isEmpty {
        ListHeading(Str.downloadsComing) { comingAction(list.coming) }.downloadRow()
        ForEach(list.coming) { entry in
          let (primary, secondary) = downloadNames(entry.item)
          ComingRow(entry: entry, primary: primary, secondary: secondary).downloadRow()
        }
      }
      if !list.finished.isEmpty {
        if !list.coming.isEmpty { ListHeading(Str.downloadsDone).downloadRow() }
        ForEach(list.finished) { group in
          switch group {
          case .show(let show): ShowRow(show: show, removing: $removing).downloadRow()
          case .file(let entry):
            let (primary, secondary) = downloadNames(entry.item)
            DoneRow(entry: entry, primary: primary, secondary: secondary).downloadRow()
          }
        }
      }
      if !items.isEmpty {
        DownloadsStorage().downloadRow(top: 24, bottom: 24)
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .environment(\.defaultMinListRowHeight, 0)
    .motion(Motion.move, value: list.coming.map(\.id) + list.finished.map(\.id))
    .scrollsToTopOnReselect()
    .topBar(Str.downloadsTitle) {
      if offline { LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.muted) }
    }
    .removalAlert($removing)
  }

  /// What the heading offers for every file still coming: what broke off
  /// first, as that's what wants doing, then pausing what moves, then going on.
  @ViewBuilder private func comingAction(_ coming: [OfflineItem]) -> some View {
    switch MatineeCore.comingAction(coming) {
    case .retryAll(let ids): HeadingButton(Str.downloadsRetryAll) { run(ids) { try await $0.resume($1) } }
    case .pauseAll(let ids): HeadingButton(Str.downloadsPauseAll) { run(ids) { try await $0.pause($1) } }
    case .resumeAll(let ids): HeadingButton(Str.downloadsResumeAll) { run(ids) { try await $0.resume($1) } }
    case .none: EmptyView()
    }
  }

  private func run(_ ids: [String], _ change: @escaping (Downloads, String) async throws -> Void) {
    let downloads = downloads
    Task {
      for id in ids {
        do { try await change(downloads, id) } catch { AppLog.downloads.error("Could not change a download") }
      }
    }
  }
}

/// How much room the downloads take and what's left, read from the disk,
/// and removing every download of the server in use, after asking.
/// Android keeps these on Settings' Downloads page; the tab shows them too,
/// where the downloads are.
struct DownloadsStorage: View {
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar
  @State private var storage: DownloadStorage?
  @State private var confirm = false

  var body: some View {
    let items = downloads.store.items
    let total = storage.map { formatBytes($0.used) } ?? formatBytes(items.values.reduce(Int64(0)) { $0 + $1.bytes })
    Panel {
      ValueRow(
        Str.downloadsStorage,
        value: Str.downloadsStorageValue(total, storage?.free.map(formatBytes) ?? "–"))
      if !items.isEmpty {
        RowDivider()
        LinkRow(Str.downloadsRemoveAll, destructive: true) { confirm = true }
      }
    }
    // Again as files come and go, and as they grow.
    .task(id: items.values.reduce(Int64(items.count)) { $0 + $1.bytes }) {
      storage = await downloads.store.storage()
    }
    .alert(Str.downloadsRemoveAllConfirm, isPresented: $confirm) {
      Button(Str.commonRemove, role: .destructive) {
        let downloads = downloads
        launchShowing(snackbar, Str.downloadsFailed) { try await downloads.removeAll() }
      }
      Button(Str.commonCancel, role: .cancel) {}
    } message: {
      Text(Str.downloadsRemoveAllBody(total))
    }
  }
}

/// A downloaded show's episodes by season, each playing with a tap, and
/// the ones still coming with how far they are. Its menu, and each
/// season's button, remove them.
struct DownloadsShowScreen: View {
  let titleId: String
  @Environment(Downloads.self) private var downloads
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.snackbar) private var snackbar
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var removing: Removal?

  var body: some View {
    let entries = downloads.store.items.values.filter { $0.item.title?.id == titleId }
    let title = entries.first?.item.title
    Group {
      if let title {
        page(title, entries: entries)
      } else {
        palette.background.ignoresSafeArea()
      }
    }
    // Everything removed: back to the list.
    .onChange(of: entries.isEmpty, initial: true) { _, empty in if empty { dismiss() } }
    .removalAlert($removing)
  }

  private func page(_ title: TitleSummary, entries: [OfflineItem]) -> some View {
    let seasons = seasonsOf(entries)
    return List {
      Text(episodesAndSize(entries)).textStyle(.bodyMedium).foregroundStyle(palette.muted).downloadRow()
      ForEach(seasons, id: \.number) { season in
        let name = seasonName(season.number)
        ListHeading(name) {
          RoundIconButton(
            .trash, label: Str.downloadsRemoveNamed(name), size: 40, iconSize: 18, tint: palette.muted,
            background: .clear
          ) {
            removing = Removal(name: Str.titleSeasonOf(title.name, name), entries: season.entries)
          }
        }
        .downloadRow()
        ForEach(season.entries) { entry in
          let label = itemLabel(entry.item)
          let name = episodeNumber(entry.item).map { Str.titleEpisodesCodedName($0, label.title) } ?? label.title
          if entry.state == .done {
            DoneRow(entry: entry, primary: name, secondary: nil).downloadRow()
          } else {
            ComingRow(entry: entry, primary: name, secondary: nil).downloadRow()
          }
        }
      }
    }
    .listStyle(.plain)
    .scrollContentBackground(.hidden)
    .environment(\.defaultMinListRowHeight, 0)
    .motion(Motion.move, value: entries.map { "\($0.id)\($0.state)" }.sorted())
    .background(palette.background.ignoresSafeArea())
    .topBar(title.name) { showMenu(title, entries: entries) }
  }

  /// The show's menu: pause or resume what's still coming, its page, and removing every episode.
  private func showMenu(_ title: TitleSummary, entries: [OfflineItem]) -> some View {
    let active = entries.filter(\.isMoving).map(\.id)
    let stopped = entries.filter { ($0.state == .paused || $0.state == .failed) && !$0.isRefused }.map(\.id)
    return Menu {
      Group {
        if !active.isEmpty {
          Button { run(active) { try await $0.pause($1) } } label: {
            Label { Text(Str.downloadsPauseAll) } icon: { Image(Lucide.pause) }
          }
        }
        if !stopped.isEmpty {
          Button { run(stopped) { try await $0.resume($1) } } label: {
            Label { Text(Str.downloadsResumeAll) } icon: { Image(Lucide.refreshCw) }
          }
        }
        if !offline {
          Button { nav.title(title) } label: { Label { Text(Str.mediaHeroEpisodes) } icon: { Image(Lucide.info) } }
        }
        Button(role: .destructive) {
          removing = Removal(name: title.name, entries: entries)
        } label: {
          Label { Text(Str.downloadsRemoveNamed(title.name)) } icon: { Image(Lucide.trash) }
        }
      }
      .tint(palette.foreground)
    } label: {
      Image(Lucide.ellipsis)
    }
    .accessibilityLabel(Str.titleMoreActions)
  }

  private func run(_ ids: [String], _ change: @escaping (Downloads, String) async throws -> Void) {
    let downloads = downloads
    Task {
      for id in ids {
        do { try await change(downloads, id) } catch { AppLog.downloads.error("Could not change a download") }
      }
    }
  }
}
