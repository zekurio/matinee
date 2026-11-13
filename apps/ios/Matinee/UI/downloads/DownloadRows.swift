import MatineeCore
import SwiftUI

/*
 * DownloadsScreen.kt's rows, its menu sheet, and the words for a
 * download's state, shared by the Downloads tab and a show's downloads
 * page. Android opens a bottom sheet from a row's menu button; iOS opens a
 * `Menu` there and a context menu on a long press, with the same items,
 * and adds swipe actions to the rows, as iOS lists have them. The sorting
 * is MatineeCore's (Downloads/DownloadList.swift), where it's tested.
 */

/// Every row's picture is this wide, so the text beside them lines up down the list.
private let THUMB_WIDTH: CGFloat = 112

/// An iPad's rows have the room for a bigger picture.
private let WIDE_THUMB_WIDTH: CGFloat = 160

/// What went wrong with a download, in words: the server's own message as
/// it sent it, or the app's for what it worked out itself.
func failureText(_ entry: OfflineItem) -> String? {
  switch entry.failure {
  case .server(let message): message
  case .forbidden: Str.downloadsErrorForbidden
  case .unreachable: Str.downloadsErrorUnreachable
  case .brokeOff: Str.downloadsErrorBrokeOff
  case nil: entry.error
  }
}

/// How a download stands, in a line: its size, how far it is, paused,
/// stopped and why, or waiting, for Wi-Fi when Settings says so.
func downloadStatus(_ entry: OfflineItem, unmetered: Bool) -> String {
  switch entry.state {
  case .done: return formatBytes(entry.bytes)
  case .running:
    guard let total = entry.totalBytes else { return formatBytes(entry.bytes) }
    return Str.downloadsOf(formatBytes(entry.bytes), formatBytes(total))
  case .paused: return Str.downloadsStatePaused
  case .failed: return Str.downloadsStateFailed(failureText(entry) ?? "")
  case .queued:
    // What went wrong, alone: the red and the retry button say the rest.
    return failureText(entry) ?? (unmetered ? Str.downloadsStateWaitingUnmetered : Str.downloadsStateWaiting)
  }
}

/// "3 episodes · 1.2 GB", for a show's or a season's files.
func episodesAndSize(_ entries: [OfflineItem]) -> String {
  [Str.mediaEpisodeCount(entries.count), formatBytes(entries.reduce(Int64(0)) { $0 + $1.bytes })]
    .joined(separator: " · ")
}

/// Files to remove at once, with what to call them in the question.
struct Removal: Identifiable {
  let name: String
  let entries: [OfflineItem]
  var id: String { name + entries.map(\.id).joined(separator: ",") }
}

extension View {
  /// Asks before removing several files at once, saying how much space it frees.
  func removalAlert(_ removal: Binding<Removal?>) -> some View {
    modifier(RemovalAlert(removal: removal))
  }

  /// A row of a downloads list: the page's gutter, its background, no line between.
  func downloadRow(top: CGFloat = 0, bottom: CGFloat = 0) -> some View {
    modifier(DownloadRowLook(top: top, bottom: bottom))
  }
}

private struct DownloadRowLook: ViewModifier {
  let top: CGFloat
  let bottom: CGFloat
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .listRowInsets(EdgeInsets(top: 2 + top, leading: Gutter, bottom: 2 + bottom, trailing: Gutter))
      .listRowBackground(palette.background)
      .listRowSeparator(.hidden)
  }
}

private struct RemovalAlert: ViewModifier {
  @Binding var removal: Removal?
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar

  func body(content: Content) -> some View {
    content.alert(
      removal.map { Str.downloadsRemoveNamedConfirm($0.name) } ?? "",
      isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }),
      presenting: removal
    ) { removal in
      Button(Str.commonRemove, role: .destructive) {
        self.removal = nil
        let ids = removal.entries.map(\.id)
        let downloads = downloads
        launchShowing(snackbar, Str.downloadsFailed) {
          for id in ids { try await downloads.remove(id) }
        }
      }
      Button(Str.commonCancel, role: .cancel) { self.removal = nil }
    } message: { removal in
      Text(Str.downloadsRemoveAllBody(formatBytes(removal.entries.reduce(Int64(0)) { $0 + $1.bytes })))
    }
  }
}

/// A list's name, with room for an action at its end.
struct ListHeading<Action: View>: View {
  let text: String
  @ViewBuilder var action: () -> Action

  init(_ text: String, @ViewBuilder action: @escaping () -> Action) {
    self.text = text
    self.action = action
  }

  var body: some View {
    HStack(spacing: 8) {
      Text(text).textStyle(.titleMedium).accessibilityAddTraits(.isHeader)
        .frame(maxWidth: .infinity, alignment: .leading)
      action()
    }
    .frame(minHeight: MinTouch)
    .padding(.top, 12)
    .padding(.bottom, 4)
  }
}

extension ListHeading where Action == EmptyView {
  init(_ text: String) { self.init(text) { EmptyView() } }
}

/// A heading's action in words, in the accent, as Android's text button.
struct HeadingButton: View {
  let label: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  init(_ label: String, action: @escaping () -> Void) {
    self.label = label
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      Text(label).textStyle(.labelLarge).foregroundStyle(palette.accent)
        .padding(.horizontal, 12)
        .frame(minHeight: MinTouch)
        .contentShape(Rectangle())
    }
    .buttonStyle(RoundPress())
  }
}

/// A file's saved picture over the title's tone, or the film icon without one.
struct DownloadThumb: View {
  let entry: OfflineItem?
  let toneKey: String
  @Environment(Downloads.self) private var downloads
  @Environment(\.palette) private var palette

  var body: some View {
    ArtFrame(toneKey, aspect: 16 / 9) {
      LucideIcon(.film, size: 18, tint: palette.muted.opacity(0.5))
      if let image = entry?.image {
        Picture(ImageSource(url: downloads.store.root.appending(path: image)))
      }
    }
  }
}

/// A row's picture and text beside it; at the accessibility sizes, the
/// picture over the text, so the words get the row's width.
private struct RowBody<Lines: View>: View {
  let entry: OfflineItem?
  let toneKey: String
  @ViewBuilder let text: () -> Lines
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.windowSize) private var window

  var body: some View {
    let large = typeSize.isAccessibilitySize
    let layout = large ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 14))
    layout {
      DownloadThumb(entry: entry, toneKey: toneKey)
        .frame(width: isWide(window) ? WIDE_THUMB_WIDTH : THUMB_WIDTH)
      text()
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
    }
    .padding(.vertical, 8)
    .contentShape(Rectangle())
  }
}

/// Lines that stay on one line beside a picture, and wrap at the accessibility sizes, where they have the row.
private struct RowLines: ViewModifier {
  let lines: Int
  @Environment(\.dynamicTypeSize) private var typeSize

  func body(content: Content) -> some View { content.lineLimit(typeSize.isAccessibilitySize ? nil : lines) }
}

extension View {
  fileprivate func rowLines(_ lines: Int) -> some View { modifier(RowLines(lines: lines)) }
}

/// The round, quiet button at a row's end, its column the same down the list.
private struct RowIconButton: View {
  let icon: Lucide
  let label: String
  var iconSize: CGFloat = 18
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    RoundIconButton(icon, label: label, size: 40, iconSize: iconSize, tint: palette.muted, background: .clear, action: action)
  }
}

/// The menu button at a row's end, opening the same items a long press does.
private struct RowMenuButton<Items: View>: View {
  @ViewBuilder let items: () -> Items
  @Environment(\.palette) private var palette

  var body: some View {
    Menu {
      items().tint(palette.foreground)
    } label: {
      LucideIcon(.ellipsis, size: 18, tint: palette.muted, scales: false)
        .frame(width: 40, height: 40)
        .frame(minWidth: MinTouch, minHeight: MinTouch)
        .contentShape(Rectangle())
    }
    .buttonStyle(RoundPress())
    .accessibilityLabel(Str.titleMoreActions)
    .accessibilityShowsLargeContentViewer {
      Image(Lucide.ellipsis)
      Text(Str.titleMoreActions)
    }
  }
}

/// A downloaded show: its name, how many episodes and how much space; a tap opens its episodes.
struct ShowRow: View {
  let show: ShowDownloads
  @Binding var removing: Removal?
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    let entries = show.entries
    let title = show.title
    Button { nav.downloadsShow(title.id) } label: {
      HStack(spacing: 14) {
        RowBody(entry: show.newestEntry, toneKey: title.name) {
          VStack(alignment: .leading, spacing: 0) {
            Text(title.name).textStyle(.bodyMedium, weight: .medium).foregroundStyle(palette.foreground).rowLines(1)
            Text(episodesAndSize(entries)).textStyle(.bodySmall).foregroundStyle(palette.muted).rowLines(1)
          }
        }
        LucideIcon(.chevronRight, size: 18, tint: palette.muted)
      }
      .accessibilityElement(children: .combine)
    }
    .buttonStyle(CardPress())
    .contentShape(.contextMenuPreview, CardShape)
    .contextMenu {
      Group {
        if !offline {
          Button { nav.titleId(title.id) } label: { Label { Text(Str.mediaHeroEpisodes) } icon: { Image(Lucide.info) } }
        }
        Button(role: .destructive) {
          removing = Removal(name: title.name, entries: entries)
        } label: {
          Label { Text(Str.downloadsRemoveNamed(title.name)) } icon: { Image(Lucide.trash) }
        }
      }
      .tint(palette.foreground)
    }
    .swipeActions(edge: .trailing) {
      Button {
        removing = Removal(name: title.name, entries: entries)
      } label: {
        Label { Text(Str.downloadsRemoveNamed(title.name)) } icon: { Image(Lucide.trash) }
      }
      .tint(palette.danger)
    }
  }
}

/// A file on the phone: a tap plays it, the menu, a long press, or a swipe removes it.
struct DoneRow: View {
  let entry: OfflineItem
  let primary: String
  let secondary: String?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 14) {
      Button { nav.play(entry.id, nil) } label: {
        RowBody(entry: entry, toneKey: entry.item.title?.name ?? primary) {
          VStack(alignment: .leading, spacing: 0) {
            Text(primary).textStyle(.bodyMedium).foregroundStyle(palette.foreground).rowLines(2)
            if let secondary {
              Text(secondary).textStyle(.bodySmall).foregroundStyle(palette.muted).rowLines(1)
            }
            Text(formatBytes(entry.bytes)).textStyle(.bodySmall).foregroundStyle(palette.faint).rowLines(1)
          }
        }
        .accessibilityElement(children: .combine)
        .accessibilityHint(Str.titlePlay)
      }
      .buttonStyle(CardPress())
      .contentShape(.contextMenuPreview, CardShape)
      .contextMenu { DownloadMenuItems(entry: entry).tint(palette.foreground) }
      RowMenuButton { DownloadMenuItems(entry: entry) }
    }
    .downloadSwipes(entry)
  }
}

/// A file still coming: how far it is, as a bar and in words, and a button
/// to pause it or go on. A tap opens its menu, as a long press does.
struct ComingRow: View {
  let entry: OfflineItem
  let primary: String
  let secondary: String?
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    let broken = entry.isBroken
    HStack(spacing: 14) {
      Menu {
        DownloadMenuItems(entry: entry).tint(palette.foreground)
      } label: {
        RowBody(entry: entry, toneKey: entry.item.title?.name ?? primary) {
          // One line each, so the name, the bar, and how it stands fit beside the picture.
          VStack(alignment: .leading, spacing: 2) {
            Text(primary).textStyle(.bodyMedium).foregroundStyle(palette.foreground).rowLines(1)
            if let secondary {
              Text(secondary).textStyle(.bodySmall).foregroundStyle(palette.muted).rowLines(1)
            }
            if let progress = entry.progress {
              DownloadProgress(
                progress: progress, color: broken ? palette.danger : entry.isMoving ? palette.accent : palette.muted)
            }
            Text(downloadStatus(entry, unmetered: downloads.unmeteredOnly)).textStyle(.bodySmall)
              .foregroundStyle(broken ? palette.danger : palette.faint)
              .rowLines(1)
          }
        }
        .accessibilityElement(children: .combine)
      }
      .buttonStyle(CardPress())
      .contentShape(.contextMenuPreview, CardShape)
      .contextMenu { DownloadMenuItems(entry: entry).tint(palette.foreground) }
      // The same weight as a finished row's menu button, so the column of buttons matches.
      if entry.isRefused {
        // Refused, trying again would only be refused again: what's left is to remove it.
        RowIconButton(icon: .trash, label: Str.downloadsRemove) { run { try await $0.remove(entry.id) } }
      } else if broken {
        // One that broke off, or waits to try again, can be tried again at once.
        RowIconButton(icon: .rotateCw, label: Str.downloadsRetry) { run { try await $0.resume(entry.id) } }
      } else if entry.isMoving {
        RowIconButton(icon: .pause, label: Str.downloadsPause, iconSize: 14) { run { try await $0.pause(entry.id) } }
      } else {
        RowIconButton(icon: .refreshCw, label: Str.downloadsResume) { run { try await $0.resume(entry.id) } }
      }
    }
    .downloadSwipes(entry)
  }

  private func run(_ change: @escaping (Downloads) async throws -> Void) {
    let downloads = downloads
    launchShowing(snackbar, Str.downloadsFailed) { try await change(downloads) }
  }
}

/// How far a download is: a thin bar in its state's color, moving on as it comes.
private struct DownloadProgress: View {
  let progress: Double
  let color: Color
  @Environment(\.palette) private var palette

  var body: some View {
    Capsule()
      .fill(palette.secondary)
      .overlay(alignment: .leading) {
        GeometryReader { proxy in
          Capsule().fill(color).frame(width: proxy.size.width * min(max(progress, 0), 1))
        }
      }
      .frame(height: 3)
      .padding(.vertical, 3)
      .motion(Motion.move, value: progress)
      .accessibilityElement()
      .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0)).locale(.app)))
  }
}

extension View {
  /// A row's swipes: removing it from the end, and from the start pausing,
  /// going on, or trying again, as the row's button does.
  fileprivate func downloadSwipes(_ entry: OfflineItem) -> some View {
    modifier(DownloadSwipes(entry: entry))
  }
}

private struct DownloadSwipes: ViewModifier {
  let entry: OfflineItem
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  func body(content: Content) -> some View {
    content
      .swipeActions(edge: .trailing) {
        Button { run { try await $0.remove(entry.id) } } label: {
          Label { Text(Str.downloadsRemove) } icon: { Image(Lucide.trash) }
        }
        .tint(palette.danger)
      }
      .swipeActions(edge: .leading) {
        if let action = stateAction(entry) {
          Button { run(action.change) } label: { Label { Text(action.label) } icon: { Image(action.icon) } }
            .tint(palette.accent)
        }
      }
  }

  private func run(_ change: @escaping (Downloads) async throws -> Void) {
    let downloads = downloads
    launchShowing(snackbar, Str.downloadsFailed) { try await change(downloads) }
  }
}

/// What can be done about where a download stands: try it again, pause it,
/// or go on with it. Nothing for one that's done, or that the server refused.
private func stateAction(_ entry: OfflineItem) -> StateAction? {
  let id = entry.id
  if entry.state == .done || entry.isRefused { return nil }
  if entry.isBroken { return StateAction(icon: .rotateCw, label: Str.downloadsRetry) { try await $0.resume(id) } }
  if entry.isMoving { return StateAction(icon: .pause, label: Str.downloadsPause) { try await $0.pause(id) } }
  return StateAction(icon: .refreshCw, label: Str.downloadsResume) { try await $0.resume(id) }
}

private struct StateAction {
  let icon: Lucide
  let label: String
  let change: (Downloads) async throws -> Void
}

/// A download's menu, from its button, a long press, or a tap on one still
/// coming: where it stands' action, Play once it's on the phone, its page
/// while the server's there, and removing it.
struct DownloadMenuItems: View {
  let entry: OfflineItem
  @Environment(Downloads.self) private var downloads
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    if let action = stateAction(entry) {
      Button { run(action.change) } label: { Label { Text(action.label) } icon: { Image(action.icon) } }
    }
    if entry.state == .done {
      Button { nav.play(entry.id, nil) } label: { Label { Text(Str.titlePlay) } icon: { Image(Lucide.playOutline) } }
    }
    if !offline {
      Button { nav.item(entry.item) } label: { Label { Text(Str.mediaHeroDetails) } icon: { Image(Lucide.info) } }
    }
    Button(role: .destructive) {
      run { try await $0.remove(entry.id) }
    } label: {
      Label { Text(Str.downloadsRemove) } icon: { Image(Lucide.trash) }
    }
  }

  private func run(_ change: @escaping (Downloads) async throws -> Void) {
    let downloads = downloads
    launchShowing(snackbar, Str.downloadsFailed) { try await change(downloads) }
  }
}
