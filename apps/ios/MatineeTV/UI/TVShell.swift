import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvApp.kt: the signed-in app on a TV. Its own pages, under the drawer at
 * the left edge, with the clock at the top right. The routes and the
 * navigator are the phone's, mapped to TV pages (TVNav.swift); the screens
 * are all TV ones. Downloads, offline mode, the admin pages, the image
 * editor, identify, and linking by camera have no TV page, so nothing here
 * leads to them.
 *
 * Menu steps out one layer at a time: a panel first (the kit's panels close
 * themselves), then the page on top, back to Home; on Home it opens the
 * drawer, and from the drawer on Home it leaves the app, as Android TV's
 * Back does and as Apple TV's own apps send Menu to their tab bar before
 * leaving. From the drawer over any other page, Menu goes back to the page.
 *
 * Everything a page reads comes from here: the API, the account, the
 * navigator, toasts (the root's), the viewer's marks, and the actions a
 * long press on a card offers.
 */

extension EnvironmentValues {
  /// The signed-in account, Android's `LocalUser`; nil before the shell.
  @Entry var user: User? = nil

  /// Focus handed back to the page from the drawer: the page puts focus
  /// back where it was (`TVFocusMemory.restore()`, or its own) each time
  /// its count moves. `.tvPageFocus` watches it.
  @Entry var tvPageReturn: TVPageReturn? = nil
}

/// Counts the times the drawer handed focus back to the page. An object
/// rather than a number in the environment: a number there would draw the
/// whole shell again on each hand-back, and that moves focus to the top
/// left, into the drawer, which hands it back again, without end.
@Observable final class TVPageReturn {
  private(set) var count = 0

  func handBack() { count += 1 }
}

/// The signed-in TV app, for `user`.
struct TVSignedInApp: View {
  let user: User
  @Environment(MatineeSession.self) private var session
  @Environment(TVTopShelf.self) private var topShelf
  @Environment(ToastState.self) private var toasts
  @Environment(\.scenePhase) private var scenePhase
  @State private var nav = TVNav()
  /// Watched and favorite marks last only for this sign-in.
  @State private var viewer = ViewerState()
  @State private var drawer = TVDrawerState()
  @State private var actions = TVActions()
  /// How many movies and shows there are, so the drawer offers only the kinds the server has.
  @State private var kinds = Loader<BrowsedTitles.Kinds>()
  @State private var returns = TVPageReturn()

  var body: some View {
    @Bindable var nav = nav
    ZStack(alignment: .topLeading) {
      NavigationStack(path: $nav.path) {
        TVHomeScreen(drawer: drawer)
          .toolbar(.hidden, for: .navigationBar)
          .tvStackPage(nav, route: nil)
          .navigationDestination(for: TVRoute.self) { route in
            TVRouteScreen(route: route).toolbar(.hidden, for: .navigationBar).tvStackPage(nav, route: route)
          }
      }
      TVShellDrawer(user: user, nav: nav, drawer: drawer, counts: kinds.state.value) { returns.handBack() }
    }
    .ignoresSafeArea()
    .tvClock()
    .tvActionsHost(actions)
    .fullScreenCover(item: $nav.player, onDismiss: { Task { await topShelf.refresh(session) } }) { request in
      TVPlayerScreen(request: request) { nav.player = nil }
    }
    .loads(kinds) { api in try await api.titles.browse(limit: 1).kinds }
    .environment(\.tvPageReturn, returns)
    .environment(\.navigator, nav.navigator)
    .environment(viewer)
    .environment(\.api, session.api)
    .environment(\.user, user)
    .onAppear {
      #if DEBUG
        TVDevLaunch.openRoute(nav)
      #endif
    }
    // What the account may do follows what the server allows now: asked again each time the app comes back.
    .task(id: topShelf.pending) { await openTopShelfLink() }
    .task(id: scenePhase) {
      guard scenePhase == .active, let api = session.api else { return }
      await topShelf.refresh(session)
      if let options = try? await api.playback.options() { viewer.options = options }
    }
  }
  private func openTopShelfLink() async {
    guard let url = topShelf.pending, let link = TopShelfLink(url: url) else { return }
    defer { topShelf.pending = nil }
    // Never switch accounts or servers because of a stale launcher item.
    guard case .signedIn(let server, let account) = session.state,
      link.server == server, link.user == account.id, let api = session.api else { return }
    do {
      let item = try await api.media.get(id: link.item)
      guard case .signedIn(let active, let current) = session.state,
        active == server, current.id == account.id else { return }
      if link.play { nav.player = TVPlayerRequest(itemId: item.id, start: nil) }
      else { nav.navigator.item(item) }
    } catch { toasts.post(ToastMessage(Str.homeContinueFailed)) }
  }
}

/// TvApp.kt's `Drawer`: the profile at the top, the pages, and Settings at
/// the bottom, the current page's entry marked. Picking the page already on
/// screen goes back to it; a page opened from it, like a title from Home,
/// goes back to the entry's own page.
private struct TVShellDrawer: View {
  let user: User
  let nav: TVNav
  let drawer: TVDrawerState
  let counts: BrowsedTitles.Kinds?
  /// Focus goes back to the page.
  let onLeave: () -> Void

  var body: some View {
    let entries: [TVDrawerEntry] = [
      TVDrawerEntry(TVDrawerPage.search.rawValue, label: Str.searchTitle, icon: .search),
      TVDrawerEntry(TVDrawerPage.home.rawValue, label: Str.tabHome, icon: .house),
      TVDrawerEntry(TVDrawerPage.favorites.rawValue, label: Str.favoritesTitle, icon: .heart),
      (counts?.movie ?? 0) > 0 ? TVDrawerEntry(TVDrawerPage.movies.rawValue, label: Str.browseKindMovie, icon: .film) : nil,
      (counts?.show ?? 0) > 0 ? TVDrawerEntry(TVDrawerPage.shows.rawValue, label: Str.browseKindShow, icon: .tv) : nil,
    ].compactMap(\.self)
    TVNavDrawer(
      top: TVDrawerEntry(TVDrawerPage.profile.rawValue, label: user.name, icon: nil),
      entries: entries,
      bottom: TVDrawerEntry(TVDrawerPage.settings.rawValue, label: Str.shellSettings, icon: .settings),
      selection: nav.drawerPage.rawValue,
      state: drawer,
      onLeave: onLeave,
      onPick: { entry in
        guard let page = TVDrawerPage(rawValue: entry.id) else { return }
        if page == nav.shownPage {
          onLeave()
        } else {
          nav.drawer(page)
        }
      }
    ) {
      TVAvatar(user: user)
    }
    // Over Home, Menu in the drawer goes on to the system, which leaves the
    // app; over any other page it goes back to the page.
    .onTVBack(isActive: !nav.path.isEmpty, perform: onLeave)
  }
}
