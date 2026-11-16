import MatineeCore
import MatineeKit
import SwiftUI

/*
 * RequestsHub.kt and RequestSnackbars.kt: what the request screens share
 * while signed in. The last word the server streamed about each title on
 * screen, one overlay for every page (MatineeCore's
 * `RequestAvailabilityState`), so what one page hears every page shows;
 * asking and taking an ask back with the toast's Undo (`RequestAskFlow`);
 * for an admin, the live queue with Add and Decline behind a delayed Undo
 * (`RequestAdminQueue`); and the request and decline sheets, shown once
 * around the shell, so a card that scrolls away doesn't take them along.
 *
 * How the screens stay current: each one follows its titles through
 * `requests.live` while it's on screen (`.followsRequests`), and lets go
 * when another covers it or the app goes away. A stream starts with the
 * current state, so reconnecting loses nothing. Lists that hold asks fetch
 * again when an ask or a cancel changed something
 * (`.reloadsOnAsk`), as Android's `ReloadOnAsk`.
 *
 * Every state, whether someone may ask, and how many asks are left are
 * the server's; the hub shows what it answered and never works one out.
 */

/// The request sheet's subject: a title, its seasons, and where the ask goes.
struct RequestSheetModel: Identifiable {
  let id = UUID()
  let ref: CatalogRef
  let name: String
  let seasons: [CatalogSeason]
  let first: Bool
  let defaultFuture: Bool
  let libraryId: String?
  /// A season's card asked for that season alone.
  let only: Int?
  /// The title's state when the sheet opened, for what the server says of asking.
  let availability: Availability
}

@Observable final class RequestsHub {
  /// The last word on each title, from a stream or from an answer to an ask.
  let state = RequestAvailabilityState()
  /// The admin's queue as the server streams it; nil for everyone else and until it answers.
  let queue = RequestAdminQueue()
  /// Moves on each ask, cancel, and answer, so lists that hold asks fetch again.
  private(set) var version = 0
  /// Titles with an ask on its way to the server, by `requestKey`.
  private(set) var busy: Set<String> = []
  /// The request sheet showing.
  var sheet: RequestSheetModel?
  /// The waiting request an admin is declining, in the decline sheet.
  var declining: AdminRequestItem?

  @ObservationIgnored var api: MatineeApi?
  @ObservationIgnored var toasts: ToastState?
  @ObservationIgnored var admin = false

  func availability(_ ref: CatalogRef, _ loaded: Availability) -> Availability {
    state.availability(ref, fallback: loaded)
  }

  func seasons(_ ref: CatalogRef, _ seasons: [CatalogSeason]) -> [CatalogSeason] {
    requestSeasonsInOrder(state.seasons(ref, seasons))
  }

  /// Something about asks changed that the server knows of: lists fetch again.
  func bump() { version += 1 }

  /// For an admin, the waiting request behind a title's or season's
  /// "Requested", still there while an answer waits out its Undo.
  func waiting(_ availability: Availability) -> AdminRequestItem? {
    queue.waitingRequest(availability, isAdmin: admin)
  }

  /// The same, only while it can still be answered.
  func answerable(_ availability: Availability) -> AdminRequestItem? {
    waiting(availability).flatMap { queue.canAnswer($0) ? $0 : nil }
  }

  // MARK: Asking

  /// Opens the request sheet.
  func open(_ model: RequestSheetModel) { sheet = model }

  /// Asks for what `chooser` holds: the film, or the seasons picked. The
  /// whole app shows the answer at once; the toast offers Undo for a first
  /// ask while the server lets it be taken back. True once it's asked.
  @discardableResult
  func ask(_ chooser: RequestChooser, name: String, availability: Availability) async -> Bool {
    guard let api, !busy.contains(chooser.ref.requestKey) else { return false }
    let key = chooser.ref.requestKey
    busy.insert(key)
    let flow = RequestAskFlow()
    let actions = RequestActions(api: api)
    await flow.submit(chooser, availability: availability, actions: actions)
    busy.remove(key)
    if let failure = flow.failure {
      fail(Str.webAskToastFailed(name), failure)
      return false
    }
    guard let item = flow.item else { return false }
    state.apply(item.title.ref, availability: item.availability, season: item.season)
    bump()
    let undo = flow.undoId != nil
    Task {
      let message = ToastMessage(
        Str.webAskToastAsked(name), kind: .success, action: undo ? Str.webAskToastUndo : nil,
        duration: undo ? .seconds(6) : nil)
      guard await toasts?.show(message) == .actionPerformed else { return }
      await flow.undo(actions: actions)
      if let failure = flow.failure { fail(Str.webAskToastCancelFailed(name), failure) }
      bump()
    }
    return true
  }

  /// Takes an ask back, from the poster's Cancel.
  func cancel(id: String, name: String) {
    guard let api else { return }
    Task {
      do {
        try await RequestActions(api: api).cancel(id: id)
        bump()
      } catch {
        fail(Str.webAskToastCancelFailed(name), Failure(error))
      }
    }
  }

  // MARK: Answering

  /// An admin's Add or Decline: the request leaves the lists at once, and
  /// the answer goes once the toast's Undo has passed, as the web's queue holds it.
  func answer(_ item: AdminRequestItem, _ answer: RequestAdminAnswer) {
    guard let api else { return }
    let name = item.title.name
    let failed =
      switch answer {
      case .add: Str.webRequestsToastAddFailed
      case .decline: Str.webRequestsToastDeclineFailed(name)
      }
    queue.answer(id: item.id, answer: answer, actions: RequestActions(api: api)) { [weak self] in
      self?.bump()
    }
    Task {
      let said =
        switch answer {
        case .add: Str.webRequestsToastAdded(name)
        case .decline: Str.webRequestsToastDeclined(name)
        }
      let result = await toasts?.show(ToastMessage(said, action: Str.webRequestsToastUndo, duration: .seconds(6)))
      if result == .actionPerformed { queue.undo(id: item.id) }
      await queue.settled(id: item.id)
      if let failure = queue.failure { fail(failed, failure) }
    }
  }

  // MARK: Messages

  private func fail(_ message: String, _ failure: Failure) {
    switch failure {
    case .cancelled: return
    case .unreadable, .other: toasts?.post(ToastMessage(message, kind: .error, closeButton: true))
    default: toasts?.post(ToastMessage(message, description: describeFailure(failure), kind: .error, closeButton: true))
    }
  }
}

extension EnvironmentValues {
  /// The signed-in app's requests; nil outside it, as in the gallery, where
  /// request buttons do nothing.
  @Entry var requests: RequestsHub? = nil
}

/// The API the request screens talk to: the server's, or in a debug build
/// with `-dev.requestFixtures`, a stand-in for its request endpoints
/// (RequestFixtures.swift), as the dev server has no metadata provider.
nonisolated func requestApi(_ api: MatineeApi) -> MatineeApi {
  #if DEBUG
    if let fixture = RequestFixtures.api(api) { return fixture }
  #endif
  return api
}

// MARK: Around the shell

extension View {
  /// The requests for everything under it: the hub, the request and
  /// decline sheets, and an admin's live queue. The shell puts it around
  /// its tabs, once.
  func requestsHost() -> some View { modifier(RequestsHost()) }
}

private struct RequestsHost: ViewModifier {
  @State private var hub = RequestsHub()
  @Environment(\.api) private var api
  @Environment(\.user) private var user
  @Environment(\.offline) private var offline
  @Environment(\.scenePhase) private var phase
  @Environment(ToastState.self) private var toasts

  func body(content: Content) -> some View {
    @Bindable var hub = hub
    content
      .environment(\.requests, offline ? nil : hub)
      .background {
        Color.clear.matineeSheet(item: $hub.sheet) { model in
          RequestSheet(model: model).environment(\.requests, hub)
        }
      }
      .background {
        Color.clear.matineeSheet(item: $hub.declining) { item in
          DeclineSheet(item: item).environment(\.requests, hub)
        }
      }
      .onAppear(perform: attach)
      .onChange(of: api?.base) { attach() }
      // An admin's queue, streamed once for the whole app: the profile's
      // dot, the queue, and Add and Decline on a title's page.
      .task(id: QueueKey(admin: user?.isAdmin == true && !offline, active: phase == .active)) {
        guard user?.isAdmin == true, !offline, phase == .active, let api else { return }
        await followQueue(requestApi(api))
      }
  }

  private struct QueueKey: Hashable {
    let admin: Bool
    let active: Bool
  }

  private func attach() {
    hub.api = api.map(requestApi)
    hub.toasts = toasts
    hub.admin = user?.isAdmin == true
    #if DEBUG
      if let api { RequestFixtures.prepare(api, admin: user?.isAdmin == true) }
    #endif
  }

  /// Follows the queue while the app is open, again after it ends or
  /// breaks, waiting longer each time it fails in a row.
  private func followQueue(_ api: MatineeApi) async {
    var wait: Duration = .seconds(1)
    while !Task.isCancelled {
      do {
        for try await snapshot in try await api.admin.requests.live(limit: 1) {
          hub.queue.queue = snapshot
          wait = .seconds(1)
        }
      } catch {
        if Failure(error) == .cancelled { return }
        wait = min(wait * 2, .seconds(30))
      }
      do { try await Task.sleep(for: wait) } catch { return }
    }
  }
}

// MARK: Following

extension View {
  /// Follows what the server says of `titles` while this page shows, into
  /// the hub every page reads, as Android's `FollowTitles`. `reload` runs
  /// after a broken connection, for what the stream can't say, like a list.
  func followsRequests(_ titles: [CatalogInput], reload: (@MainActor () async -> Void)? = nil) -> some View {
    modifier(FollowsRequests(titles: titles, reload: reload))
  }

  /// Fetches `loader` again each time an ask or a cancel changed
  /// something, including while its page was covered, as Android's `ReloadOnAsk`.
  func reloadsOnAsk<T: Sendable>(_ loader: Loader<T>) -> some View { modifier(ReloadsOnAsk(loader: loader)) }
}

private struct FollowsRequests: ViewModifier {
  let titles: [CatalogInput]
  let reload: (@MainActor () async -> Void)?
  @Environment(\.requests) private var hub
  @Environment(\.api) private var api
  @Environment(\.scenePhase) private var phase
  @State private var live: RequestLiveController?
  @State private var shown = false

  func body(content: Content) -> some View {
    content
      .onAppear {
        shown = true
        update()
      }
      .onDisappear {
        shown = false
        live?.hide()
      }
      .onChange(of: titles) { update() }
      .onChange(of: phase) { if phase == .active { update() } else if phase == .background { live?.hide() } }
  }

  private func update() {
    guard shown, let hub, let api else { return }
    if live == nil {
      let reload = reload
      live = RequestLiveController(api: requestApi(api), state: hub.state) { await reload?() }
    }
    live?.updateVisible(titles)
  }
}

private struct ReloadsOnAsk<T: Sendable>: ViewModifier {
  let loader: Loader<T>
  @Environment(\.requests) private var hub
  @State private var seen: Int?

  func body(content: Content) -> some View {
    content
      .onAppear { catchUp() }
      .onChange(of: hub?.version) { catchUp() }
  }

  private func catchUp() {
    guard let version = hub?.version else { return }
    if let seen, seen != version, loader.configured { loader.reload() }
    seen = version
  }
}
