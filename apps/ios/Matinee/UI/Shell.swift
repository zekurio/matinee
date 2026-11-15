import MatineeCore
import MatineeKit
import Nuke
import SwiftUI
import UIKit

/*
 * Shell.kt: the signed-in app. Its tabs, as Android's and the web's on a
 * phone: Home, Media, Downloads, and the profile behind the person's
 * picture in a floating capsule at the bottom of each tab's first page,
 * with search in a circle beside it. Offline only Home, Downloads, and the
 * profile stay. On an iPad the same tabs sit at the top, in the web's bar
 * from `sm` up (Bars.swift, and apps/ios/Matinee/UI/README.md for why).
 *
 * Each tab keeps a stack of its own, as iOS apps do, so a tab keeps its
 * place while another is open. Switching tabs is immediate, as on iOS,
 * rather than Android's slide; pages opened from a tab slide in over it and
 * follow the edge swipe back, which is the system's.
 *
 * Everything a page reads comes from here: the API, the account, the
 * navigator, toasts, offline, the viewer's marks, and the actions a long
 * press on a card offers.
 */

extension EnvironmentValues {
  /// The signed-in account, Android's `LocalUser`; nil before the shell.
  @Entry var user: User? = nil
}

/// The signed-in app, for `user`; `offline` shows what's downloaded without the server.
struct SignedInApp: View {
  let user: User
  let offline: Bool
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.horizontalSizeClass) private var sizeClass
  @State private var nav: ShellNav
  /// Watched and favorite marks last only for this sign-in.
  @State private var viewer = ViewerState()
  /// The tabs opened so far: each is made the first time it's picked, and kept.
  @State private var opened: Set<ShellTab> = []
  @State private var keyboard = false
  @SceneStorage("shell.nav") private var savedNav: Data?
  /// The tabs show once the pages kept from before are back, so the shell
  /// starts on the tab that was open rather than on Home.
  @State private var restored = false

  init(user: User, offline: Bool) {
    self.user = user
    self.offline = offline
    _nav = State(initialValue: ShellNav(offline: offline))
  }

  var body: some View {
    if restored {
      tabs
    } else {
      palette.background.ignoresSafeArea().onAppear(perform: restore)
    }
  }

  private var style: ShellStyle { ShellStyle(idiom: UIDevice.current.userInterfaceIdiom, sizeClass: sizeClass) }

  private var tabs: some View {
    ZStack {
      ForEach(nav.tabs, id: \.self) { tab in
        if opened.contains(tab) || tab == nav.tab {
          let open = tab == nav.tab
          TabStack(tab: tab)
            .opacity(open ? 1 : 0)
            .allowsHitTesting(open)
            .accessibilityHidden(!open)
            .zIndex(open ? 1 : 0)
        }
      }
    }
    .onChange(of: nav.tab, initial: true) { _, tab in opened.insert(tab) }
    // The actions a long press offers, and the sheets they open, over every tab.
    .modifier(ActionsHost())
    .fullScreenCover(item: $nav.player) { PlayerCover(request: $0) }
    .environment(nav)
    .environment(\.navigator, nav.navigator)
    .environment(viewer)
    .environment(\.api, session.api)
    .environment(\.user, user)
    .environment(\.offline, offline)
    .environment(\.shellStyle, style)
    // Toasts rise over the phone's tabs while a tab's first page shows them.
    .preference(key: ToastClearanceKey.self, value: tabBarShows ? BottomBar<ShellTab>.clearance : 0)
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
      keyboard = true
    }
    .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
      keyboard = false
    }
    .onAppear {
      #if DEBUG
        DevLaunch.openRoute(nav)
      #endif
    }
    .onChange(of: nav.saved(owner: owner)) { _, saved in savedNav = try? JSONEncoder().encode(saved) }
    // What the account may do, like download, follows what the server allows
    // now: asked again each time the app comes back.
    .task(id: scenePhase) {
      guard scenePhase == .active, !offline, let api = session.api else { return }
      if let options = try? await api.playback.options() { viewer.options = options }
    }
  }

  /// The phone's tabs are on screen: a tab's first page, no keyboard.
  private var tabBarShows: Bool {
    style == .phone && !keyboard && (nav.paths[nav.tab] ?? []).isEmpty
  }

  /// The account and server the saved pages belong to.
  private var owner: String { "\(session.activeServer ?? "")\n\(user.id)" }

  private func restore() {
    nav.restore(savedNav, owner: owner)
    restored = true
  }
}

/// How far above the bottom safe area toasts sit: the shell says, as it
/// knows whether its tabs show. The root reads it for its toast host.
struct ToastClearanceKey: PreferenceKey {
  static let defaultValue: CGFloat = 0
  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}
