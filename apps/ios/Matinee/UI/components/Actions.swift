import MatineeCore
import SwiftUI

/*
 * Actions.kt: what can be done with a title, a season, or a file, from a
 * long press on any card and from the menu button on its page. Android
 * opens a bottom sheet of rows; iOS a context menu over the card, and a
 * `Menu` from the page's button, with Android's items, in its order, with
 * its icons and words. The sheets those items open, a download's, a
 * season's downloads, and when it was watched, are presented once for the
 * whole app by `ActionsHost`, as Android's `ActionsSheet` lives once at its
 * root, so a menu that goes away doesn't take its sheet with it.
 */

/// A sheet an action opened.
enum ActionSheet: Identifiable {
  /// The download sheet for a file.
  case download(MediaItem)
  /// The download sheet for a show, or one of its seasons.
  case files(FileSet)
  /// When something being marked watched was watched.
  case watched(WatchedAsk)

  var id: String {
    switch self {
    case .download(let item): "download-\(item.id)"
    case .files(let files): "files-\(files.title.id)-\(files.season.map { String(describing: $0.number) } ?? "all")"
    case .watched(let ask): "watched-\(ask.id)"
    }
  }
}

/// Opens the actions' sheets, and keeps what the metadata items need to
/// know: Android's `Actions`. One for the signed-in app, in the
/// environment as `\.actions`.
@Observable final class Actions {
  var sheet: ActionSheet?

  /// Each library's metadata provider, nil for none, once asked; an admin's
  /// fix match and refresh show only for a library whose provider has its key.
  private(set) var providers: [String: MetadataProvider?] = [:]
  @ObservationIgnored private var asking = false

  /// Ask when the person watched `name`, then `mark` it with the answer.
  func askWatched(_ name: String, mark: @escaping (_ watchedAt: String?) async throws -> Void) {
    present(.watched(WatchedAsk(name: name, mark: mark)))
  }

  func download(_ item: MediaItem) { present(.download(item)) }

  func files(_ files: FileSet) { present(.files(files)) }

  /// A menu's item opens its sheet once the menu has gone, as Android's
  /// sheet slides away before the next opens; while a context menu is still
  /// leaving, UIKit refuses to present over it.
  private func present(_ sheet: ActionSheet) {
    Task {
      try? await Task.sleep(for: .milliseconds(350))
      self.sheet = sheet
    }
  }

  /// The provider of the library `libraryId`, or nil, while it isn't known yet too.
  func provider(_ libraryId: String) -> MetadataProvider? { providers[libraryId] ?? nil }

  /// What the metadata items need, asked once for an admin: every library's
  /// provider. The server turns anyone else away. A failure is asked again
  /// when a title's page shows.
  func loadProviders(_ api: MatineeApi) async {
    guard !asking, providers.isEmpty else { return }
    asking = true
    defer { asking = false }
    do {
      async let libraries = api.libraries.list()
      async let known = api.metadata.providers()
      let (list, all) = try await (libraries, known)
      providers = Dictionary(
        list.map { library in (library.id, library.metadataProvider.flatMap { id in all.first { $0.id == id } }) }
      ) { first, _ in first }
    } catch {
      AppLog.app.error("Could not load the libraries' metadata providers")
    }
  }
}

extension EnvironmentValues {
  /// The app's actions; nil outside the signed-in app, as in the gallery.
  @Entry var actions: Actions? = nil
}

/// Installs the actions for everything under it: the context menus' items
/// and the sheets they open. The shell puts it around its tabs.
struct ActionsHost: ViewModifier {
  @State private var actions = Actions()
  @Environment(\.api) private var api
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    content
      .environment(\.actions, actions)
      .environment(\.actionMenu, ActionMenu { AnyView(ActionItems(target: $0)) })
      .sheet(item: $actions.sheet) { sheet in
        switch sheet {
        case .download(let item): DownloadSheet(item: item)
        case .files(let files): DownloadFilesSheet(files: files)
        case .watched(let ask): WatchedAtSheet(ask)
        }
      }
      .task(id: user?.isAdmin == true && !offline) {
        guard user?.isAdmin == true, !offline, let api else { return }
        await actions.loadProviders(api)
      }
  }
}

/// Whether `target`'s menu has anything in it. One opened on its own page
/// holds only starting over, downloads, and an admin's items, so for an
/// account that may not download it can be empty, and the page leaves its
/// button out.
@MainActor func hasActions(_ target: ActionTarget, viewer: ViewerState?, user: User?, downloads: Downloads) -> Bool {
  guard target.here, viewer?.mayDownload != true else { return true }
  let admin = user?.isAdmin == true
  let stored = downloads.store.items
  switch target {
  case .item(let item, _): return admin || isResumable(item) || stored[item.id] != nil
  case .title(_, let file, _): return admin || isResumable(file) || file.flatMap { stored[$0.id] } != nil
  case .season(_, let season, _): return admin && season.number != nil
  }
}

extension ActionTarget {
  var here: Bool {
    switch self {
    case .item(_, let here), .title(_, _, let here), .season(_, _, let here): here
    }
  }
}

/// A page's menu button: the round ellipsis, opening the same items a long
/// press on its card offers. Nothing when the menu would be empty.
struct ActionsButton: View {
  let target: ActionTarget
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(Downloads.self) private var downloads
  @Environment(\.user) private var user
  @Environment(\.palette) private var palette

  init(_ target: ActionTarget) { self.target = target }

  var body: some View {
    if hasActions(target, viewer: viewer, user: user, downloads: downloads) {
      Menu {
        ActionItems(target: target).tint(palette.foreground)
      } label: {
        LucideIcon(.ellipsis, size: 20, tint: palette.foreground, scales: false)
          .frame(width: 44, height: 44)
          .background(palette.secondary, in: Circle())
          .contentShape(Circle())
      }
      .buttonStyle(RoundPress())
      .accessibilityLabel(Str.titleMoreActions)
      .accessibilityShowsLargeContentViewer {
        Image(Lucide.ellipsis)
        Text(Str.titleMoreActions)
      }
    }
  }
}

/// A menu's items for `target`, as `Button`s and `Divider`s.
struct ActionItems: View {
  let target: ActionTarget

  var body: some View {
    switch target {
    case .item(let item, let here): ItemActions(item: item, here: here)
    case .title(let title, let file, let here): TitleActions(title: title, file: file, here: here)
    case .season(let title, let season, let here): SeasonActions(title: title, season: season, here: here)
    }
  }
}

/// A menu's row: an icon and a label, as Android's `SheetItem`.
private struct ActionItem: View {
  let icon: Lucide
  let label: String
  var destructive = false
  let action: () -> Void

  init(_ icon: Lucide, _ label: String, destructive: Bool = false, action: @escaping () -> Void) {
    self.icon = icon
    self.label = label
    self.destructive = destructive
    self.action = action
  }

  var body: some View {
    Button(role: destructive ? .destructive : nil, action: action) {
      Label { Text(label) } icon: { Image(icon) }
    }
  }
}

private struct ItemActions: View {
  let item: MediaItem
  let here: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let code = episodeCode(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let favorite = viewer?.isFavorite(item) ?? item.favorite
    let resume = isResumable(item)
    if !here {
      ActionItem(.playOutline, resume ? Str.titleResume : Str.titlePlay) { nav.play(item.id, nil) }
    }
    if resume {
      ActionItem(.rotateCcw, Str.actionsPlayFromStart) { nav.play(item.id, 0) }
    }
    if !here {
      ActionItem(.check, watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched) {
        guard let api, let viewer else { return }
        // Unwatched at once; watched asks when first.
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await viewer.setWatched(api, item, false) }
        } else {
          actions?.askWatched(code != nil ? label.title : label.showName) { at in
            try await viewer.setWatched(api, item, true, watchedAt: at)
          }
        }
      }
      ActionItem(favorite ? .heartFilled : .heart, favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite) {
        guard let api, let viewer else { return }
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await viewer.setFavorite(api, item, !favorite) }
      }
    }
    DownloadItem(item: item)
    if let title = item.title {
      let show = title.kind == TitleKind.show
      if !here && show {
        ActionItem(.info, Str.actionsEpisodeDetails) { nav.episode(item.id) }
        ActionItem(.tv, Str.actionsGoToShow(title.name)) { nav.titleUp(title.id) }
      } else if !here {
        ActionItem(.info, Str.mediaHeroDetails) { nav.titleUp(title.id) }
      }
      // A movie's file is the movie, so it has the movie's; an episode has its still.
      MetadataItems(title: title, images: images(title, show: show), matchable: !show)
    }
  }

  private func images(_ title: TitleSummary, show: Bool) -> ImageTarget? {
    if !show { return ImageTarget(titleId: title.id) }
    guard let season = item.seasonNumber, let episode = item.episodeNumber else { return nil }
    return ImageTarget(titleId: title.id, season: season, episode: episode)
  }
}

private struct TitleActions: View {
  let title: TitleSummary
  let file: MediaItem?
  let here: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let watched = viewer?.isWatched(title) ?? title.watched
    let favorite = viewer?.isFavorite(title) ?? title.favorite
    let show = title.isShow
    let mayDownload = viewer?.mayDownload == true
    if !here {
      ActionItem(.playOutline, Str.titlePlay) {
        withNext { nav.play($0.id, nil) }
      }
    }
    if let file, isResumable(file) {
      ActionItem(.rotateCcw, Str.actionsPlayFromStart) { nav.play(file.id, 0) }
    }
    if !here {
      let words =
        show
        ? (watched ? Str.mediaMarkAllUnwatched : Str.mediaMarkAllWatched)
        : (watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched)
      ActionItem(.check, words) {
        guard let api, let viewer else { return }
        // Unwatched at once; watched asks when first.
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await viewer.setWatched(api, title, false) }
        } else {
          actions?.askWatched(title.name) { at in try await viewer.setWatched(api, title, true, watchedAt: at) }
        }
      }
      ActionItem(favorite ? .heartFilled : .heart, favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite) {
        guard let api, let viewer else { return }
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await viewer.setFavorite(api, title, !favorite) }
      }
    }
    if !mayDownload {
      // What's on the phone already can still go.
      if let file { DownloadItem(item: file) }
    } else if show {
      ActionItem(.download, Str.downloadsAction) { actions?.files(FileSet(title: title)) }
    } else if let file {
      DownloadItem(item: file)
    } else {
      ActionItem(.download, Str.downloadsAction) {
        withNext { actions?.download($0) }
      }
    }
    if !here {
      ActionItem(.info, show ? Str.mediaHeroEpisodes : Str.mediaHeroDetails) { nav.titleUp(title.id) }
    }
    MetadataItems(title: title, images: ImageTarget(titleId: title.id), matchable: true)
  }

  /// What Play starts, from the server, which a card doesn't know.
  private func withNext(_ then: @escaping (MediaItem) -> Void) {
    guard let api else { return }
    let title = title
    let snackbar = snackbar
    launchShowing(snackbar, Str.mediaPlayFailed(title.name)) {
      guard let next = try await api.titles.get(id: title.id).next else {
        snackbar.show(Str.mediaNoFiles(title.name))
        return
      }
      then(next)
    }
  }
}

/// A season's menu: its download, and its page from its card. Its tick is
/// on its page, where the season's own episodes say whether it's watched.
private struct SeasonActions: View {
  let title: TitleSummary
  let season: Season
  let here: Bool
  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if viewer?.mayDownload == true {
      ActionItem(.download, Str.downloadsAction) { actions?.files(FileSet(title: title, season: season)) }
    }
    if !here {
      ActionItem(.list, Str.mediaHeroEpisodes) { nav.season(title.id, season.number) }
    }
    // Files without a season number aren't a season to give a poster.
    MetadataItems(
      title: title, images: season.number.map { ImageTarget(titleId: title.id, season: $0) }, matchable: false)
  }
}

/// An admin's metadata items, after the rest: fix match and refresh for a
/// movie or show that's `matchable` and whose library has a provider with
/// its API key, and the image editor for `images`.
private struct MetadataItems: View {
  let title: TitleSummary
  let images: ImageTarget?
  let matchable: Bool
  @Environment(\.api) private var api
  @Environment(\.user) private var user
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if user?.isAdmin == true {
      let provider = matchable ? actions?.provider(title.libraryId).flatMap { $0.configured ? $0 : nil } : nil
      if provider != nil || images != nil {
        Divider()
        if provider != nil {
          ActionItem(.search, Str.titleMenuFixMatch) { nav.identify(title.id) }
          ActionItem(.refreshCw, Str.titleMenuRefresh) { refresh() }
        }
        if let images {
          ActionItem(.image, Str.titleMenuEditImages) { nav.images(images) }
        }
      }
      }
    }
  }

  private func refresh() {
    guard let api else { return }
    let title = title
    let snackbar = snackbar
    let viewer = viewer
    launchShowing(snackbar, Str.titleRefreshError) {
      _ = try await api.titles.refresh(id: title.id)
      viewer?.changed()
      snackbar.show(Str.titleRefreshDone(title.name))
    }
  }
}

/// Download a file, or take back its download. An account that may not
/// download gets only the second, for a file on the phone already.
private struct DownloadItem: View {
  let item: MediaItem
  @Environment(Downloads.self) private var downloads
  @Environment(\.actions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if downloads.store.items[item.id] == nil {
      if viewer?.mayDownload == true {
        ActionItem(.download, Str.downloadsAction) { actions?.download(item) }
      }
    } else {
      ActionItem(.trash, Str.downloadsRemove, destructive: true) {
        let id = item.id
        let downloads = downloads
        launchShowing(snackbar, Str.downloadsFailed) { try await downloads.remove(id) }
      }
    }
  }
}
