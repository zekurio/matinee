import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Actions.kt: what can be done with a title, a season, or a file, from a
 * long press on any card and from the "more" button on its page. As on the
 * web on a phone and on Android, they're a sheet from the bottom of rows,
 * with Android's items, in its order, with its icons and words, rather
 * than iOS's context menu: the sheet looks like the rest of the app and
 * holds a header naming what it's for.
 *
 * The sheets live once, around the shell (`ActionsHost`), so a card that
 * scrolls away or a page that closes doesn't take them along. A row closes
 * the sheet and then runs, so what it opens next, as the question of when
 * something was watched, arrives once the sheet has gone.
 */

/// What a sheet of actions is for: a file, a whole title, or one season of
/// a show. One opened on the page of what it's for is `here`: that page
/// already shows Play, the tick, and the heart, and opening the page again
/// would only stack another copy of it, so the sheet leaves those out.
enum ActionTarget: Hashable, Identifiable {
  case item(MediaItem, here: Bool)
  /// `file` is what Play starts, when known: a movie's file, which the sheet
  /// downloads. `recommended` is the title at its provider when a
  /// recommendation row offered it, for "Not interested".
  case title(TitleSummary, file: MediaItem?, here: Bool, recommended: CatalogRef? = nil)
  case season(TitleSummary, Season, here: Bool)

  var id: String {
    switch self {
    case .item(let item, let here): "item/\(item.id)/\(here)"
    case .title(let title, _, let here, _): "title/\(title.id)/\(here)"
    case .season(let title, let season, let here): "season/\(title.id)/\(season.number ?? -1)/\(here)"
    }
  }

  var here: Bool {
    switch self {
    case .item(_, let here), .title(_, _, let here, _), .season(_, _, let here): here
    }
  }
}

/// The app's actions and the sheets they open: Android's `Actions`. One for
/// the signed-in app, in the environment as `\.actions`; nil outside it, as
/// in the gallery, where long presses do nothing.
@Observable final class Actions {
  /// The sheet of actions showing, if one is.
  var target: ActionTarget?
  /// A file whose download sheet is open.
  var download: MediaItem?
  /// A show or season whose download sheet is open.
  var files: FileSet?
  /// Something being marked watched, while the person says when.
  var watched: WatchedAsk?
  /// The same, while the person picks the day.
  var watchedDay: WatchedAsk?
  /// Titles marked "Not interested" in this sign-in, which recommendation rows leave out.
  let hidden = HiddenRecommendations()

  /// Each library's metadata provider, nil for none, once asked; an admin's
  /// fix match and refresh show only for a library whose provider has its key.
  private(set) var providers: [String: MetadataProvider?] = [:]
  @ObservationIgnored private var asking = false

  /// Opens the sheet of `target`'s actions.
  func open(_ target: ActionTarget) { self.target = target }

  /// Ask when the person watched `name`, then `mark` it with the answer.
  func askWatched(_ name: String, mark: @escaping (_ watchedAt: String?) async throws -> Void) {
    watched = WatchedAsk(name: name, mark: mark)
  }

  /// Leaves `ref` out of the viewer's recommendations, saying so, or putting
  /// it back and saying why if the server refused.
  func hideRecommendation(_ ref: CatalogRef, name: String, api: MatineeApi, snackbar: Snackbar) {
    let hidden = hidden
    Task {
      do {
        try await hidden.dismiss(ref) { try await api.recommendations.dismiss(ref: ref, dismissed: true) }
        snackbar.show(Str.webDiscoverDismissed(name))
      } catch {
        launchShowing(snackbar, Str.webDiscoverDismissFailed(name)) { throw error }
      }
    }
  }

  /// The provider of the library `libraryId`, or nil, while it isn't known yet too.
  func provider(_ libraryId: String) -> MetadataProvider? { providers[libraryId] ?? nil }

  /// What the metadata items need, asked once for an admin: every library's
  /// provider. The server turns anyone else away. A failure is asked again
  /// when the shell next shows.
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
  @Entry var actions: Actions? = nil
}

/// Installs the actions for everything under it, and the sheets they open.
/// The shell puts it around its tabs, once.
struct ActionsHost: ViewModifier {
  @State private var actions = Actions()
  @Environment(\.api) private var api
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline
  @Environment(ViewerState.self) private var viewer: ViewerState?

  func body(content: Content) -> some View {
    @Bindable var actions = actions
    content
      .environment(\.actions, actions)
      .background {
        Color.clear.matineeSheet(item: $actions.target) { target in
          ActionItems(target: target).padding(.vertical, Space.s2)
        }
      }
      .background {
        Color.clear.matineeSheet(item: $actions.watched) { ask in WatchedAtSheet(ask) }
      }
      .background { WatchedDayDialog(ask: $actions.watchedDay) }
      .background {
        Color.clear.matineeSheet(
          isPresented: Binding(get: { actions.download != nil }, set: { if !$0 { actions.download = nil } }),
          size: .large
        ) { if let item = actions.download { DownloadSheet(item: item).id(item.id) } }
      }
      .background {
        Color.clear.matineeSheet(item: $actions.files, size: .mediumAndLarge) { DownloadFilesSheet(files: $0) }
      }
      .task(id: user?.isAdmin == true && !offline) {
        guard user?.isAdmin == true, !offline, let api else { return }
        await actions.loadProviders(api)
      }
      #if DEBUG
        // `-dev.noDownloads YES`: the account as one that may not download,
        // which neither of the dev server's is, to see what it's offered.
        .onChange(of: viewer?.options, initial: true) { _, options in
          guard UserDefaults.standard.bool(forKey: "dev.noDownloads"), var options, options.downloads else { return }
          options.downloads = false
          viewer?.options = options
        }
      #endif
  }
}

/// Whether `target`'s sheet has anything in it. One opened on its own page
/// holds only starting over, downloads, and an admin's items, so for an
/// account that may not download it can be empty, and the page leaves its
/// button out.
@MainActor func hasActions(_ target: ActionTarget, viewer: ViewerState?, user: User?, downloads: Downloads) -> Bool {
  guard target.here, viewer?.mayDownload != true else { return true }
  let admin = user?.isAdmin == true
  let stored = downloads.store.items
  switch target {
  case .item(let item, _): return admin || isResumable(item) || stored[item.id] != nil
  case .title(_, let file, _, _): return admin || isResumable(file) || file.flatMap { stored[$0.id] } != nil
  case .season(_, let season, _): return admin && season.number != nil
  }
}

/// A page's "more" button: the round ellipsis, opening the same sheet a long
/// press on its card does. Nothing when the sheet would be empty.
struct ActionsButton: View {
  let target: ActionTarget
  var look: IconButtonLook = .secondary
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(Downloads.self) private var downloads
  @Environment(\.user) private var user
  @Environment(\.actions) private var actions

  init(_ target: ActionTarget, look: IconButtonLook = .secondary) {
    self.target = target
    self.look = look
  }

  var body: some View {
    if hasActions(target, viewer: viewer, user: user, downloads: downloads) {
      RoundIconButton(.ellipsis, label: Str.titleMoreActions, look: look, size: TouchTarget) {
        actions?.open(target)
      }
    }
  }
}

extension View {
  /// A long press on this opens `target`'s actions, for something pressable
  /// that isn't a card. Cards have it already.
  func cardMenu(_ target: ActionTarget) -> some View { modifier(CardMenu(target: target)) }
}

private struct CardMenu: ViewModifier {
  let target: ActionTarget
  @Environment(\.actions) private var actions
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    content
      .onLongPressGesture(minimumDuration: 0.45) { if !offline { actions?.open(target) } }
      .accessibilityAction(named: Text(Str.titleMoreActions)) { if !offline { actions?.open(target) } }
  }
}

/// A sheet's rows for `target`.
struct ActionItems: View {
  let target: ActionTarget

  var body: some View {
    VStack(spacing: 0) {
      switch target {
      case .item(let item, let here): ItemActions(item: item, here: here)
      case .title(let title, let file, let here, let recommended):
        TitleActions(title: title, file: file, here: here, recommended: recommended)
      case .season(let title, let season, let here): SeasonActions(title: title, season: season, here: here)
      }
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
    SheetHeader(code != nil ? label.title : label.showName, subtitle: code != nil ? label.showName : label.year)
    if !here {
      SheetItem(resume ? Str.titleResume : Str.titlePlay, icon: .playOutline) { nav.play(item.id, nil) }
    }
    if resume {
      SheetItem(Str.actionsPlayFromStart, icon: .rotateCcw) { nav.play(item.id, 0) }
    }
    if !here {
      SheetItem(watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched, icon: .check) {
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
      SheetItem(favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite, icon: favorite ? .heartFilled : .heart) {
        guard let api, let viewer else { return }
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await viewer.setFavorite(api, item, !favorite) }
      }
    }
    DownloadItem(item: item)
    if let title = item.title {
      let show = title.kind == TitleKind.show
      if !here && show {
        SheetItem(Str.actionsEpisodeDetails, icon: .info) { nav.episode(item.id) }
        SheetItem(Str.actionsGoToShow(title.name), icon: .tv) { nav.titleUp(title.id) }
      } else if !here {
        SheetItem(Str.mediaHeroDetails, icon: .info) { nav.titleUp(title.id) }
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
  let recommended: CatalogRef?
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
    SheetHeader(title.name, subtitle: formatYear(title.year))
    if !here {
      SheetItem(Str.titlePlay, icon: .playOutline) { withNext { nav.play($0.id, nil) } }
    }
    if let file, isResumable(file) {
      SheetItem(Str.actionsPlayFromStart, icon: .rotateCcw) { nav.play(file.id, 0) }
    }
    if !here {
      let words =
        show
        ? (watched ? Str.mediaMarkAllUnwatched : Str.mediaMarkAllWatched)
        : (watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched)
      SheetItem(words, icon: .check) {
        guard let api, let viewer else { return }
        // Unwatched at once; watched asks when first.
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await viewer.setWatched(api, title, false) }
        } else {
          actions?.askWatched(title.name) { at in try await viewer.setWatched(api, title, true, watchedAt: at) }
        }
      }
      SheetItem(favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite, icon: favorite ? .heartFilled : .heart) {
        guard let api, let viewer else { return }
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await viewer.setFavorite(api, title, !favorite) }
      }
    }
    if !mayDownload {
      // What's on the phone already can still go.
      if let file { DownloadItem(item: file) }
    } else if show {
      SheetItem(Str.downloadsAction, icon: .download) { actions?.files = FileSet(title: title) }
    } else if let file {
      DownloadItem(item: file)
    } else {
      SheetItem(Str.downloadsAction, icon: .download) { withNext { actions?.download = $0 } }
    }
    if !here {
      SheetItem(show ? Str.mediaHeroEpisodes : Str.mediaHeroDetails, icon: .info) { nav.titleUp(title.id) }
    }
    if let recommended, let api {
      SheetItem(Str.webDiscoverNotInterested, icon: .eyeOff) {
        actions?.hideRecommendation(recommended, name: title.name, api: api, snackbar: snackbar)
      }
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

/// A season's sheet: its tick from its card, its download, and its page. The card goes by the season's counts for whether it's watched; its
/// page, by its episodes.
private struct SeasonActions: View {
  let title: TitleSummary
  let season: Season
  let here: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    SheetHeader(seasonName(season.number), subtitle: title.name)
    if !here {
      let watched = season.itemCount > 0 && season.watchedCount >= season.itemCount
      SheetItem(watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched, icon: .check) {
        guard let api, let viewer else { return }
        let number = season.number
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) {
            try await setSeasonWatched(api, viewer, title, season: number, watched: false, watchedAt: nil)
          }
        } else {
          actions?.askWatched(Str.titleSeasonOf(title.name, seasonName(number))) { at in
            try await setSeasonWatched(api, viewer, title, season: number, watched: true, watchedAt: at)
          }
        }
      }
    }
    // Its heart, as Android's SeasonActions has it; the files without a
    // season number aren't a season to mark. Its own page has the heart already.
    if !here, let number = season.number {
      let favorite = viewer?.isSeasonFavorite(title, number: number, fallback: season.favorite) ?? season.favorite
      SheetItem(favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite, icon: favorite ? .heartFilled : .heart) {
        guard let api, let viewer else { return }
        launchShowing(snackbar, Str.mediaFavoriteFailed) {
          try await viewer.setSeasonFavorite(api, title, number: number, favorite: !favorite)
        }
      }
    }
    if viewer?.mayDownload == true {
      SheetItem(Str.downloadsAction, icon: .download) { actions?.files = FileSet(title: title, season: season) }
    }
    if !here {
      SheetItem(Str.mediaHeroEpisodes, icon: .list) { nav.season(title.id, season.number) }
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
        Separator().padding(.vertical, Space.s1_5)
        if provider != nil {
          SheetItem(Str.titleMenuFixMatch, icon: .search) { nav.identify(title.id) }
          SheetItem(Str.titleMenuRefresh, icon: .refreshCw) { refresh() }
        }
        if let images {
          SheetItem(Str.titleMenuEditImages, icon: .image) { nav.images(images) }
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
      snackbar.post(ToastMessage(Str.titleRefreshDone(title.name), kind: .success))
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
        SheetItem(Str.downloadsAction, icon: .download) { actions?.download = item }
      }
    } else {
      SheetItem(Str.downloadsRemove, icon: .trash, destructive: true) {
        let id = item.id
        let downloads = downloads
        launchShowing(snackbar, Str.downloadsFailed) { try await downloads.remove(id) }
      }
    }
  }
}
