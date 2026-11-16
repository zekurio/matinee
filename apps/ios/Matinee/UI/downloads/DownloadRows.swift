import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DownloadsScreen.kt's rows, the sheet each opens, and the words for a
 * download's state, shared by the Downloads tab and a show's downloads
 * page. As on Android and the web on a phone, a row's actions are a sheet
 * from the bottom, from its button or a long press, rather than iOS's
 * context menu and swipes. What a row offers and how it stands are
 * MatineeCore's (Downloads/DownloadList.swift), where they're tested.
 */

/// Every row's picture is this wide, so the text beside them lines up down the list.
private let THUMB_WIDTH: CGFloat = 112

/// An iPad's rows have the room for a bigger picture.
private let WIDE_THUMB_WIDTH: CGFloat = 160

/// What went wrong with a download, in words: the server's own message as
/// it sent it, or the app's for what it worked out itself.
func failureText(_ failure: DownloadFailure) -> String {
  switch failure {
  case .server(let message): message
  case .forbidden: Str.downloadsErrorForbidden
  case .unreachable: Str.downloadsErrorUnreachable
  case .brokeOff: Str.downloadsErrorBrokeOff
  }
}

/// How a download stands, in a line: its size, how far it is, paused,
/// stopped and why, or waiting, for Wi-Fi when Settings says so.
func statusText(_ status: DownloadStatus) -> String {
  switch status {
  case .size(let bytes): formatBytes(bytes)
  case .progress(let bytes, let total): Str.downloadsOf(formatBytes(bytes), formatBytes(total))
  case .paused: Str.downloadsStatePaused
  case .stopped(let failure): Str.downloadsStateFailed(failure.map(failureText) ?? "")
  case .broken(let failure): failureText(failure)
  case .waiting(let wifi): wifi ? Str.downloadsStateWaitingUnmetered : Str.downloadsStateWaiting
  }
}

/// "3 episodes · 1.2 GB", for a show's or a season's files.
func episodesAndSize(_ entries: [OfflineItem]) -> String {
  [Str.mediaEpisodeCount(entries.count), formatBytes(totalBytes(entries))].joined(separator: " · ")
}

func totalBytes(_ entries: [OfflineItem]) -> Int64 { entries.reduce(0) { $0 + $1.bytes } }

/// The show and episode, or the movie, of a file.
func downloadNames(_ item: MediaItem) -> (String, String?) {
  let label = itemLabel(item)
  if let code = episodeCode(item) { return (label.showName, Str.mediaCodeTitle(code, label.title)) }
  return (label.title, nil)
}

/// Pause, resume, retry, or remove downloads, telling the person when one couldn't.
@MainActor func changeDownloads(
  _ downloads: Downloads, _ snackbar: Snackbar, _ ids: [String],
  _ change: @escaping @MainActor (Downloads, String) async throws -> Void
) {
  // TODO(strings): downloads_change_failed, "Couldn't change the download".
  launchShowing(snackbar, Str.downloadsFailed) {
    for id in ids { try await change(downloads, id) }
  }
}

/// What a row's button or menu does about where a download stands, as an icon and words.
private struct StateCommand {
  let icon: Lucide
  let iconSize: CGFloat
  let label: String
  let change: @MainActor (Downloads, String) async throws -> Void

  init?(_ action: DownloadRowAction) {
    switch action {
    case .retry: self.init(.rotateCw, 18, Str.downloadsRetry) { try await $0.resume($1) }
    case .pause: self.init(.pause, 14, Str.downloadsPause) { try await $0.pause($1) }
    case .resume: self.init(.refreshCw, 18, Str.downloadsResume) { try await $0.resume($1) }
    case .remove, .none: return nil
    }
  }

  private init(
    _ icon: Lucide, _ iconSize: CGFloat, _ label: String,
    change: @escaping @MainActor (Downloads, String) async throws -> Void
  ) {
    self.icon = icon
    self.iconSize = iconSize
    self.label = label
    self.change = change
  }
}

/// Files to remove at once, with what to call them in the question.
struct Removal: Identifiable {
  let name: String
  let entries: [OfflineItem]
  var id: String { name + entries.map(\.id).joined(separator: ",") }
}

extension View {
  /// Asks before removing several files at once, saying how much space it frees.
  func removalDialog(_ removal: Binding<Removal?>) -> some View {
    modifier(RemovalDialog(removal: removal))
  }
}

private struct RemovalDialog: ViewModifier {
  @Binding var removal: Removal?
  @State private var shown: Removal?
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar

  func body(content: Content) -> some View {
    // The question keeps its words while it fades, after `removal` is cleared.
    let asked = removal ?? shown
    content
      .confirmDialog(
        isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } }),
        title: asked.map { Str.downloadsRemoveNamedConfirm($0.name) } ?? "",
        message: asked.map { Str.downloadsRemoveAllBody(formatBytes(totalBytes($0.entries))) },
        confirm: Str.commonRemove
      ) {
        guard let asked else { return }
        changeDownloads(downloads, snackbar, asked.entries.map(\.id)) { try await $0.remove($1) }
      }
      .onChange(of: removal?.id) { if let removal { shown = removal } }
  }
}

/// A list's name, with room for an action at its end: the web's settings
/// heading, `text-base font-semibold tracking-tight`.
struct ListHeading<Action: View>: View {
  let text: String
  @ViewBuilder var action: () -> Action
  @Environment(\.palette) private var palette

  init(_ text: String, @ViewBuilder action: @escaping () -> Action) {
    self.text = text
    self.action = action
  }

  var body: some View {
    HStack(spacing: Space.s2) {
      Text(text).textStyle(.base, weight: .semibold, tracking: .tight).foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
        .frame(maxWidth: .infinity, alignment: .leading)
      action()
    }
    .frame(minHeight: TouchTarget)
    .padding(.top, Space.s4)
    .padding(.bottom, Space.s1)
  }
}

extension ListHeading where Action == EmptyView {
  init(_ text: String) { self.init(text) { EmptyView() } }
}

/// A file's saved picture over the title's tone, or the film icon without one.
struct DownloadThumb: View {
  let entry: OfflineItem?
  let toneKey: String
  @Environment(Downloads.self) private var downloads
  @Environment(\.palette) private var palette

  var body: some View {
    ArtFrame(toneKey, aspect: 16 / 9) {
      LucideIcon(.film, size: 18, tint: palette.mutedForeground.opacity(0.5))
      if let image = entry?.image {
        Picture(ImageSource(url: downloads.store.root.appending(path: image)))
      }
    }
  }
}

/// A row's picture and the lines beside it, pressed as one, with the
/// button at its end; at the accessibility sizes, the picture over the
/// lines, so the words get the row's width.
private struct DownloadRowLayout<Lines: View, Trailing: View>: View {
  let entry: OfflineItem?
  let toneKey: String
  let action: () -> Void
  let onLongPress: (() -> Void)?
  var hint: String?
  @ViewBuilder let lines: () -> Lines
  @ViewBuilder let trailing: () -> Trailing
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.windowSize) private var window

  var body: some View {
    let large = typeSize.isAccessibilitySize
    let layout =
      large
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s2)) : AnyLayout(HStackLayout(spacing: Space.s3_5))
    HStack(spacing: Space.s2) {
      Pressable(
        shape: .kit(Radius.md), action: action, onLongPress: onLongPress, longPressLabel: Str.titleMoreActions
      ) {
        layout {
          DownloadThumb(entry: entry, toneKey: toneKey)
            .frame(width: isWide(window) ? WIDE_THUMB_WIDTH : THUMB_WIDTH)
          lines()
            .frame(maxWidth: .infinity, alignment: .leading)
            .multilineTextAlignment(.leading)
        }
        .padding(.vertical, Space.s2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityHint(hint ?? "")
      }
      trailing()
    }
  }
}

/// Lines that stay on one line beside a picture, and wrap at the
/// accessibility sizes, where they have the row.
private struct RowLines: ViewModifier {
  let lines: Int
  @Environment(\.dynamicTypeSize) private var typeSize

  func body(content: Content) -> some View {
    content.lineLimit(typeSize.isAccessibilitySize ? nil : lines)
      .fixedSize(horizontal: false, vertical: true)
  }
}

extension View {
  fileprivate func rowLines(_ lines: Int) -> some View { modifier(RowLines(lines: lines)) }
}

/// The round, quiet button at a row's end, its column the same down the list.
private struct RowButton: View {
  let icon: Lucide
  let label: String
  var iconSize: CGFloat = 18
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    RoundIconButton(icon, label: label, look: .ghost, size: 40, iconSize: iconSize, tint: palette.mutedForeground,
      action: action)
  }
}

/// A downloaded show: its name, how many episodes and how much space; a
/// tap opens its episodes, a long press its sheet.
struct ShowRow: View {
  let show: ShowDownloads
  let onMore: () -> Void
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    DownloadRowLayout(
      entry: show.newestEntry, toneKey: show.title.name, action: { nav.downloadsShow(show.title.id) },
      onLongPress: onMore
    ) {
      VStack(alignment: .leading, spacing: 0) {
        Text(show.title.name).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground).rowLines(2)
        Text(episodesAndSize(show.entries)).textStyle(.px13).foregroundStyle(palette.mutedForeground).rowLines(1)
      }
    } trailing: {
      LucideIcon(.chevronRight, size: 18, tint: palette.mutedForeground)
        .frame(width: 40, height: 40)
        .accessibilityHidden(true)
    }
  }
}

/// A file on the device: a tap plays it, its button or a long press opens its sheet.
struct DoneRow: View {
  let entry: OfflineItem
  let primary: String
  let secondary: String?
  let onMore: () -> Void
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    DownloadRowLayout(
      entry: entry, toneKey: entry.item.title?.name ?? primary, action: { nav.play(entry.id, nil) },
      onLongPress: onMore, hint: Str.titlePlay
    ) {
      VStack(alignment: .leading, spacing: 0) {
        Text(primary).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground).rowLines(2)
        if let secondary {
          Text(secondary).textStyle(.px13).foregroundStyle(palette.mutedForeground).rowLines(1)
        }
        Text(formatBytes(entry.bytes)).textStyle(.px13).foregroundStyle(palette.foregroundFaint).rowLines(1)
      }
    } trailing: {
      RowButton(icon: .ellipsis, label: Str.titleMoreActions, action: onMore)
    }
  }
}

/// A file still coming: how far it is, as a bar and in words, and a button
/// to pause it, go on, try again, or, refused, remove it. A tap opens its
/// sheet, as a long press does.
struct ComingRow: View {
  let entry: OfflineItem
  let primary: String
  let secondary: String?
  let onMore: () -> Void
  @Environment(Downloads.self) private var downloads
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    let broken = entry.isBroken
    let status = downloadStatus(entry, wifiOnly: downloads.unmeteredOnly)
    DownloadRowLayout(entry: entry, toneKey: entry.item.title?.name ?? primary, action: onMore, onLongPress: onMore) {
      // One line each, so the name, the bar, and how it stands fit beside the picture.
      VStack(alignment: .leading, spacing: Space.s0_5) {
        Text(primary).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground).rowLines(1)
        if let secondary {
          Text(secondary).textStyle(.px13).foregroundStyle(palette.mutedForeground).rowLines(1)
        }
        if let progress = entry.progress {
          ProgressBar(
            progress, height: 3, track: palette.secondary,
            fill: broken ? palette.destructive : entry.isMoving ? palette.accent : palette.mutedForeground
          )
          .padding(.vertical, 3)
          .motion(Motion.move, value: progress)
          .accessibilityElement()
          .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0)).locale(.app)))
        }
        Text(statusText(status)).textStyle(.px13)
          .foregroundStyle(broken ? palette.destructive : palette.foregroundFaint)
          // What went wrong, often the server's own words, gets a second line rather than being cut.
          .rowLines(broken ? 2 : 1)
      }
    } trailing: {
      let action = rowAction(entry)
      if let command = StateCommand(action) {
        RowButton(icon: command.icon, label: command.label, iconSize: command.iconSize) {
          changeDownloads(downloads, snackbar, [entry.id], command.change)
        }
      } else if action == .remove {
        RowButton(icon: .trash, label: Str.downloadsRemove) {
          changeDownloads(downloads, snackbar, [entry.id]) { try await $0.remove($1) }
        }
      }
    }
  }
}

/// A download's sheet, from its button, a long press, or a tap on one still
/// coming: what it is, where it stands' action, Play once it's on the
/// device, its page while the server's there, and removing it.
struct DownloadActions: View {
  let entry: OfflineItem
  @Environment(Downloads.self) private var downloads
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let (primary, secondary) = downloadNames(entry.item)
    let id = entry.id
    VStack(spacing: 0) {
      SheetHeader(primary, subtitle: secondary ?? statusLine)
      if let command = StateCommand(rowAction(entry)) {
        SheetItem(command.label, icon: command.icon) { changeDownloads(downloads, snackbar, [id], command.change) }
      }
      if entry.state == .done {
        SheetItem(Str.titlePlay, icon: .playOutline) { nav.play(id, nil) }
      }
      if !offline {
        let item = entry.item
        SheetItem(Str.mediaHeroDetails, icon: .info) { nav.item(item) }
      }
      SheetItem(Str.downloadsRemove, icon: .trash, destructive: true) {
        changeDownloads(downloads, snackbar, [id]) { try await $0.remove($1) }
      }
    }
    .padding(.vertical, Space.s2)
  }

  /// A movie has no second name: how it stands goes under it instead.
  private var statusLine: String {
    statusText(downloadStatus(entry, wifiOnly: downloads.unmeteredOnly))
  }
}

/// A downloaded show's sheet: pause or resume what's still coming, its
/// page while the server's there, and removing every episode.
struct ShowActions: View {
  let title: TitleSummary
  let entries: [OfflineItem]
  let onRemove: () -> Void
  @Environment(Downloads.self) private var downloads
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    let commands = ShowCommands(entries)
    VStack(spacing: 0) {
      SheetHeader(title.name, subtitle: episodesAndSize(entries))
      if !commands.pause.isEmpty {
        SheetItem(Str.downloadsPauseAll, icon: .pause) {
          changeDownloads(downloads, snackbar, commands.pause) { try await $0.pause($1) }
        }
      }
      if !commands.resume.isEmpty {
        SheetItem(Str.downloadsResumeAll, icon: .refreshCw) {
          changeDownloads(downloads, snackbar, commands.resume) { try await $0.resume($1) }
        }
      }
      if !offline {
        SheetItem(Str.mediaHeroEpisodes, icon: .info) { nav.title(title) }
      }
      SheetItem(Str.downloadsRemoveNamed(title.name), icon: .trash, destructive: true, action: onRemove)
    }
    .padding(.vertical, Space.s2)
  }
}
