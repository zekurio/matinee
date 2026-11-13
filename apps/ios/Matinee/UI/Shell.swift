import MatineeCore
import Nuke
import SwiftUI
import UIKit

/*
 * Shell.kt: the signed-in app. Its tabs, as Android's: Home, Media,
 * Downloads, and the profile behind the person's picture, then search on
 * its own, as iOS lays a search tab out. Offline only Home, Downloads, and
 * the profile stay. The tab bar is the system's, in the theme's colors
 * (Theme.swift): at the bottom of a phone; on an iPad at the top, with the
 * sidebar it opens into, as iPad apps have it.
 *
 * Everything a page reads comes from here: the API, the account, the
 * navigator, the snackbar, offline, the viewer's marks, and the context
 * menus' hook, which the Actions task fills in.
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
  @Environment(\.imagePipeline) private var pipeline
  @Environment(\.scenePhase) private var scenePhase
  @State private var nav: ShellNav
  /// Watched and favorite marks last only for this sign-in.
  @State private var viewer = ViewerState()
  @State private var snackbar = SnackbarModel()
  @State private var picture: UIImage?
  @SceneStorage("shell.nav") private var savedNav: Data?
  /// The tabs show once the pages kept from before are back, so the tab
  /// view starts on the tab that was open rather than picking the first.
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

  private var tabs: some View {
    TabView(selection: Binding(get: { nav.tab }, set: { nav.select($0) })) {
      ForEach(nav.tabs.filter { $0 != .search }, id: \.self) { tab in
        Tab(value: tab) {
          page(tab)
        } label: {
          Label {
            Text(tab.label)
          } icon: {
            if tab == .profile {
              Image(uiImage: ProfilePicture.image(picture, name: user.name, palette: palette))
            } else {
              Image(tab.icon)
            }
          }
        }
      }
      // Search in a circle of its own beside the bar, as iOS lays out a search tab.
      if nav.tabs.contains(.search) {
        Tab(value: ShellTab.search, role: .search) {
          page(.search)
        } label: {
          Label { Text(ShellTab.search.label) } icon: { Image(ShellTab.search.icon) }
        }
      }
    }
    .modifier(TabStyle())
    .fullScreenCover(item: $nav.player) { PlayerCover(request: $0) }
    .environment(nav)
    .environment(\.navigator, nav.navigator)
    .environment(viewer)
    .environment(\.api, session.api)
    .environment(\.user, user)
    .environment(\.offline, offline)
    .environment(\.snackbar, Snackbar(show: snackbar.show))
    // The context menus' items are the Actions task's (Actions.swift); until then cards offer none.
    .environment(\.actionMenu, ActionMenu())
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
    .task(id: user.avatarId) { await loadPicture() }
  }

  /// The account and server the saved pages belong to.
  private var owner: String { "\(session.activeServer ?? "")\n\(user.id)" }

  private func page(_ tab: ShellTab) -> some View {
    TabStack(tab: tab).overlay(alignment: .bottom) { SnackbarHost(model: snackbar) }
  }

  private func restore() {
    nav.restore(savedNav, owner: owner)
    restored = true
  }

  private func loadPicture() async {
    guard let id = user.avatarId, let api = session.api, let url = URL(string: api.paths.avatar(id)) else {
      picture = nil
      return
    }
    picture = try? await pipeline.image(for: url)
  }
}

/// The tab bar as each device has it: a bar at the bottom of a phone; on an
/// iPad, the bar at the top, which opens into a sidebar with the logo at
/// its head, as iPad apps have it.
private struct TabStyle: ViewModifier {
  func body(content: Content) -> some View {
    if UIDevice.current.userInterfaceIdiom == .pad {
      content
        .tabViewStyle(.sidebarAdaptable)
        .defaultAdaptableTabBarPlacement(.tabBar)
        .tabViewSidebarHeader { Logo(height: 22).frame(maxWidth: .infinity, alignment: .leading) }
    } else {
      content
    }
  }
}

/// Android's snackbar: one message at a time at the bottom, above the tab
/// bar, gone after a few seconds or a tap. VoiceOver reads it out.
@Observable final class SnackbarModel {
  private(set) var message: String?
  @ObservationIgnored private var hiding: Task<Void, Never>?

  func show(_ text: String) {
    withMotion(Motion.enter) { message = text }
    AccessibilityNotification.Announcement(text).post()
    hiding?.cancel()
    hiding = Task { [weak self] in
      try? await Task.sleep(for: .seconds(4))
      guard !Task.isCancelled else { return }
      self?.dismiss()
    }
  }

  func dismiss() {
    hiding?.cancel()
    withMotion(Motion.exit) { message = nil }
  }
}

private struct SnackbarHost: View {
  let model: SnackbarModel
  @Environment(\.palette) private var palette

  var body: some View {
    if let message = model.message {
      Text(message)
        .textStyle(.bodyMedium)
        .foregroundStyle(palette.background)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(palette.foreground, in: ControlShape)
        .frame(maxWidth: 560)
        .padding(.horizontal, Gutter)
        .padding(.bottom, 12)
        .onTapGesture(perform: model.dismiss)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityAddTraits(.isStaticText)
    }
  }
}
