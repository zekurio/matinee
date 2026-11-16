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

  /// Moves each time focus is handed back to the page from the drawer: the
  /// page puts focus back where it was (`TVFocusMemory.restore()`, or its own).
  @Entry var tvPageReturn = 0
}

/// The signed-in TV app, for `user`.
struct TVSignedInApp: View {
  let user: User
  @Environment(MatineeSession.self) private var session
  @Environment(\.scenePhase) private var scenePhase
  @State private var nav = TVNav()
  /// Watched and favorite marks last only for this sign-in.
  @State private var viewer = ViewerState()
  @State private var drawer = TVDrawerState()
  @State private var actions = TVActions()
  /// How many movies and shows there are, so the drawer offers only the kinds the server has.
  @State private var kinds = Loader<BrowsedTitles.Kinds>()
  @State private var returns = 0

  var body: some View {
    @Bindable var nav = nav
    ZStack(alignment: .topLeading) {
      NavigationStack(path: $nav.path) {
        TVHomeScreen(drawer: drawer)
          .toolbar(.hidden, for: .navigationBar)
          .navigationDestination(for: TVRoute.self) { route in
            TVRouteScreen(route: route).toolbar(.hidden, for: .navigationBar)
          }
      }
      TVShellDrawer(user: user, nav: nav, drawer: drawer, counts: kinds.state.value) { returns += 1 }
    }
    .ignoresSafeArea()
    .tvClock()
    .tvActionsHost(actions)
    .fullScreenCover(item: $nav.player) { request in
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
    .task(id: scenePhase) {
      guard scenePhase == .active, let api = session.api else { return }
      if let options = try? await api.playback.options() { viewer.options = options }
    }
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
