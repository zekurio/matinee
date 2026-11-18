import MatineeCore
import MatineeKit
import SwiftUI

/*
 * ActionsPanel.kt: what can be done with a title, a season, or a file, from
 * a long press of Select on its card, in the panel at the right edge. Which
 * actions there are, in which order, is MatineeCore's `cardActions` (it
 * leaves out downloads, the admin's metadata items, and the image editor on
 * a TV, by `ClientCapabilities`), and `performCardAction` carries them out;
 * this puts them in words and icons, asks when something was watched, as
 * the phone's sheet does, and offers "Not interested" on a recommendation.
 *
 * Play/Pause on a focused card plays it at once (`play`), as Apple TV plays
 * a focused title.
 */

/// What a panel of actions is for: a file, a whole title, or one season of a show.
enum TVActionTarget: Hashable {
  case item(MediaItem)
  /// `file` is what Play starts, when known. `recommended` is the title at
  /// its provider when a recommendation row offered it, for "Not interested".
  case title(TitleSummary, file: MediaItem? = nil, recommended: CatalogRef? = nil)
  case season(TitleSummary, Season)

  var card: CardTarget {
    switch self {
    case .item(let item): .item(item)
    case .title(let title, let file, _): .title(title, file: file)
    case .season(let title, let season): .season(title, season)
    }
  }

  /// The panel's heading: the episode's name over its show, or the name over its year.
  var heading: (title: String, subtitle: String?) {
    switch self {
    case .item(let item):
      let label = itemLabel(item)
      return episodeCode(item) != nil ? (label.title, label.showName) : (label.showName, label.year)
    case .title(let title, _, _): return (title.name, formatYear(title.year))
    case .season(let title, let season): return (seasonName(season.number), title.name)
    }
  }
}

/// Someone marking `name` watched, to be asked when: just now, on the
/// release date, on a day they pick, or some time they don't remember.
struct TVWatchedAsk: Hashable {
  let id = UUID()
  let name: String
  let mark: @MainActor (_ watchedAt: String?) async throws -> Void

  static func == (a: TVWatchedAsk, b: TVWatchedAsk) -> Bool { a.id == b.id }
  func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// What the panel shows: a card's actions, the watched question, or the day for it.
enum TVActionPanel: Identifiable, Hashable {
  case menu(TVActionTarget)
  case watched(TVWatchedAsk)
  case day(TVWatchedAsk)

  var id: String {
    switch self {
    case .menu(let target): "menu/\(target.hashValue)"
    case .watched(let ask): "watched/\(ask.id)"
    case .day(let ask): "day/\(ask.id)"
    }
  }
}

/// The signed-in TV app's actions: the panel showing, and the titles marked
/// "Not interested" in this sign-in. One per signed-in app, in the
/// environment as `\.tvActions`.
@Observable final class TVActions {
  var panel: TVActionPanel?
  /// Titles marked "Not interested", which recommendation rows leave out.
  let hidden = HiddenRecommendations()

  /// Opens the panel of `target`'s actions, as a long press on its card does.
  func open(_ target: TVActionTarget) { panel = .menu(target) }

  /// Plays what `target` is, from where the person left off: a file at
  /// once, a title's next file once the server says which.
  func play(_ target: TVActionTarget, api: MatineeApi?, viewer: ViewerState?, nav: Navigator, snackbar: Snackbar) {
    switch target {
    case .item(let item): nav.play(item.id, nil)
    case .title(let title, _, _):
      guard let api, let viewer else { return }
      launchShowing(snackbar, Str.mediaPlayFailed(title.name)) {
        let effect = try await performCardAction(
          .play, target: target.card, viewer: viewer, permissions: tvPermissions(nil), api: api)
        switch effect {
        case .play(let itemId, let position): nav.play(itemId, position)
        case .noFiles: snackbar.show(Str.mediaNoFiles(title.name))
        default: break
        }
      }
    case .season: break
    }
  }
}

extension EnvironmentValues {
  @Entry var tvActions: TVActions? = nil
}

/// What a TV may offer: no downloads, no admin pages, no image editor, as
/// `ClientCapabilities` has it on tvOS, whoever is signed in.
@MainActor func tvPermissions(_ user: User?) -> ActionPermissions {
  ActionPermissions(admin: user?.isAdmin == true)
}

extension View {
  /// Installs the actions for everything under it, and their panel. The shell puts it around its pages, once.
  func tvActionsHost(_ actions: TVActions) -> some View { modifier(TVActionsHost(actions: actions)) }
}

private struct TVActionsHost: ViewModifier {
  let actions: TVActions

  func body(content: Content) -> some View {
    @Bindable var actions = actions
    content
      .tvSidePanel(item: $actions.panel, title: { $0.title }, description: { $0.subtitle }) { panel in
        TVActionRows(panel: panel)
      }
      // Outside the panel, so its rows read it too.
      .environment(\.tvActions, actions)
  }
}

extension TVActionPanel {
  var title: String {
    switch self {
    case .menu(let target): target.heading.title
    case .watched: Str.mediaMarkWatched
    case .day: Str.mediaWatchedDateTitle
    }
  }

  var subtitle: String? {
    switch self {
    case .menu(let target): target.heading.subtitle
    case .watched(let ask), .day(let ask): ask.name
    }
  }
}

/// The panel's rows for what it shows.
private struct TVActionRows: View {
  let panel: TVActionPanel
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.tvActions) private var actions
  @Environment(\.user) private var user
  @Environment(\.overlayDismiss) private var dismiss
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @FocusState private var focused: String?
  @State private var day = Date.now

  var body: some View {
    Group {
      switch panel {
      case .menu(let target): menu(target)
      case .watched(let ask): watched(ask)
      case .day(let ask): dayPicker(ask)
      }
    }
    .defaultFocus($focused, firstRow)
    // The panel's rows change in place, from the menu to the question: focus goes to the first.
    .onChange(of: panel.id) { focused = firstRow }
    // From the day, Menu goes back to the question it came from.
    .onTVBack(isActive: isDay) { if case .day(let ask) = panel { actions?.panel = .watched(ask) } }
  }

  private var isDay: Bool { if case .day = panel { true } else { false } }

  private var firstRow: String? {
    switch panel {
    case .menu(let target): entries(target).first?.id
    case .watched: "now"
    case .day: "day"
    }
  }

  // MARK: The menu

  @ViewBuilder private func menu(_ target: TVActionTarget) -> some View {
    ForEach(entries(target)) { entry in
      TVListItem(entry.label, icon: entry.icon, quiet: true) { entry.action() }
        .focused($focused, equals: entry.id)
    }
  }

  /// The entries `cardActions` allows for `target`, in its order, then "Not interested" for a recommendation.
  private func entries(_ target: TVActionTarget) -> [TVAction] {
    guard let viewer else { return [] }
    let allowed = cardActions(for: target.card, viewer: viewer, permissions: tvPermissions(user))
    var entries = allowed.compactMap { entry(for: $0, target: target) }
    if case .title(let title, _, let recommended?) = target {
      entries.append(
        TVAction(Str.webDiscoverNotInterested, icon: .eyeOff, id: "not-interested") {
          close { hide(recommended, name: title.name) }
        })
    }
    return entries
  }

  private func entry(for action: CardAction, target: TVActionTarget) -> TVAction? {
    let id = "\(action)"
    switch action {
    case .play:
      let resume = if case .item(let item) = target { isResumable(item) } else { false }
      return TVAction(resume ? Str.titleResume : Str.titlePlay, icon: .playOutline, id: id) {
        close { run(action, target, failure: playFailure(target)) }
      }
    case .playFromStart:
      return TVAction(Str.actionsPlayFromStart, icon: .rotateCcw, id: id) {
        close { run(action, target, failure: playFailure(target)) }
      }
    case .setWatched(let watched):
      return TVAction(watchedWords(watched, target), icon: .check, id: id) {
        if watched {
          // Watched asks when first, in the same panel.
          let name = target.heading.title
          actions?.panel = .watched(
            TVWatchedAsk(name: name) { at in try await perform(action, target, watchedAt: at) })
        } else {
          close { run(action, target, failure: Str.mediaMarkUnwatchedFailed) }
        }
      }
    case .setFavorite(let favorite):
      return TVAction(
        favorite ? Str.mediaAddFavorite : Str.mediaRemoveFavorite, icon: favorite ? .heart : .heartFilled, id: id
      ) {
        close { run(action, target, failure: Str.mediaFavoriteFailed) }
      }
    case .details:
      let (words, icon) = detailsWords(target)
      return TVAction(words, icon: icon, id: id) { close { run(action, target, failure: nil) } }
    case .showDetails:
      guard case .item(let item) = target, let title = item.title else { return nil }
      return TVAction(Str.actionsGoToShow(title.name), icon: .tv, id: id) { close { run(action, target, failure: nil) } }
    case .download, .removeDownload, .fixMatch, .refreshMetadata, .editImages:
      // No TV page or place for these; cardActions leaves them out on tvOS already.
      return nil
    }
  }

  private func watchedWords(_ watched: Bool, _ target: TVActionTarget) -> String {
    if case .title(let title, _, _) = target, title.isShow {
      return watched ? Str.mediaMarkAllWatched : Str.mediaMarkAllUnwatched
    }
    return watched ? Str.mediaMarkWatched : Str.mediaMarkUnwatched
  }

  private func detailsWords(_ target: TVActionTarget) -> (String, Lucide) {
    switch target {
    case .item(let item):
      item.title?.kind == TitleKind.show ? (Str.actionsEpisodeDetails, .info) : (Str.mediaHeroDetails, .info)
    case .title(let title, _, _): title.isShow ? (Str.mediaHeroEpisodes, .info) : (Str.mediaHeroDetails, .info)
    case .season: (Str.mediaHeroEpisodes, .list)
    }
  }

  private func playFailure(_ target: TVActionTarget) -> String { Str.mediaPlayFailed(target.heading.title) }

  // MARK: When it was watched

  @ViewBuilder private func watched(_ ask: TVWatchedAsk) -> some View {
    TVListItem(Str.mediaWatchedAtNow, icon: .clock, quiet: true) { close { mark(ask, nil) } }
      .focused($focused, equals: "now")
    TVListItem(Str.mediaWatchedAtReleased, icon: .calendar, quiet: true) { close { mark(ask, WatchedAt.released) } }
      .focused($focused, equals: "released")
    TVListItem(Str.mediaWatchedAtOther, icon: .calendarClock, quiet: true) {
      day = .now
      actions?.panel = .day(ask)
    }
    .focused($focused, equals: "other")
    TVListItem(Str.mediaWatchedAtUnknown, icon: .calendarOff, quiet: true) { close { mark(ask, WatchedAt.unknown) } }
      .focused($focused, equals: "unknown")
  }

  /// The day, month, and year, each stepped by Left and Right, up to today; then Mark watched.
  @ViewBuilder private func dayPicker(_ ask: TVWatchedAsk) -> some View {
    let locale = Locale.app
    TVStepRow(day.formatted(.dateTime.day().locale(locale))) { step(.day, by: $0) }
      .focused($focused, equals: "day")
    TVStepRow(day.formatted(.dateTime.month(.wide).locale(locale))) { step(.month, by: $0) }
      .focused($focused, equals: "month")
    TVStepRow(day.formatted(.dateTime.year().locale(locale))) { step(.year, by: $0) }
      .focused($focused, equals: "year")
    TVListItem(Str.mediaMarkWatched, icon: .check, quiet: true) { close { mark(ask, watchedAtOn(day)) } }
      .focused($focused, equals: "mark")
      .padding(.top, TVSpace.s2)
  }

  /// Steps the day by `amount` of `component`, a day wrapping within its month, never past today.
  private func step(_ component: Calendar.Component, by amount: Int) {
    let calendar = Calendar.current
    var next: Date?
    if component == .day, let range = calendar.range(of: .day, in: .month, for: day) {
      let current = calendar.component(.day, from: day)
      let wrapped = ((current - range.lowerBound + amount) % range.count + range.count) % range.count + range.lowerBound
      next = calendar.date(byAdding: .day, value: wrapped - current, to: day)
    } else {
      next = calendar.date(byAdding: component, value: amount, to: day)
    }
    if let next { day = min(next, .now) }
  }

  // MARK: Doing it

  /// Closes the panel, then runs `then`, so what it opens arrives once the panel has gone.
  private func close(_ then: @escaping @MainActor () -> Void) {
    dismiss(then: then)
  }

  private func run(_ action: CardAction, _ target: TVActionTarget, failure: String?) {
    let failure = failure ?? Str.errorConnectionLost
    launchShowing(snackbar, failure) { try await perform(action, target) }
  }

  /// Carries `action` out with MatineeCore, then does what it says the screen should.
  private func perform(_ action: CardAction, _ target: TVActionTarget, watchedAt: String? = nil) async throws {
    guard let api, let viewer else { return }
    let effect = try await performCardAction(
      action, target: target.card, viewer: viewer, permissions: tvPermissions(user), api: api, watchedAt: watchedAt)
    switch effect {
    case .play(let itemId, let position): nav.play(itemId, position)
    case .titleDetails(let id): nav.titleUp(id)
    case .episodeDetails(let id): nav.episode(id)
    case .seasonDetails(let titleId, let season): nav.season(titleId, season)
    case .noFiles: snackbar.show(Str.mediaNoFiles(target.heading.title))
    case .updated, .downloadItem, .downloadFiles, .removeDownload, .fixMatch, .editImages: break
    }
  }

  private func mark(_ ask: TVWatchedAsk, _ watchedAt: String?) {
    let mark = ask.mark
    launchShowing(snackbar, Str.mediaMarkWatchedFailed) { try await mark(watchedAt) }
  }

  /// Leaves `ref` out of the viewer's recommendations, saying so, or putting it back and saying why if the server refused.
  private func hide(_ ref: CatalogRef, name: String) {
    guard let api, let hidden = actions?.hidden else { return }
    Task {
      do {
        try await hidden.dismiss(ref) { try await api.recommendations.dismiss(ref: ref, dismissed: true) }
        snackbar.show(Str.webDiscoverDismissed(name))
      } catch {
        launchShowing(snackbar, Str.webDiscoverDismissFailed(name)) { throw error }
      }
    }
  }
}
