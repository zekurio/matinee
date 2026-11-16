import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Bars.kt: the bars around pages. The tabs on a tab's first page, at the
 * bottom of a phone and at the top of an iPad (Shell.swift says which);
 * Home's header, the logo on a phone; the floating buttons over a title's
 * art; and the frost that keeps the status bar readable over art and once
 * a page scrolls under it.
 *
 * A page opened from a tab gets its top from the kit, `.topBar(title)`,
 * which hides the system's bar and keeps the edge swipe back; one that
 * draws art to the top uses `.hidesSystemNavigationBar()` and `ItemTopBar`.
 */

extension ShellTab {
  /// The tab's name, as Android's tab bar says it.
  var label: String {
    switch self {
    case .home: Str.tabHome
    case .media: Str.tabMedia
    case .downloads: Str.downloadsTitle
    case .profile: Str.tabProfile
    case .search: Str.searchTitle
    }
  }

  /// The tab's icon; the profile's is the person's picture instead.
  var icon: Lucide {
    switch self {
    case .home: .house
    case .media: .libraryBig
    case .downloads: .download
    case .profile: .userRound
    case .search: .search
    }
  }
}

/// How the shell lays itself out: a phone's tabs at the bottom, or an iPad's
/// at the top, the web's bar from `sm` up. An iPad in a narrow split is a
/// phone's width, and gets the phone's.
enum ShellStyle: Sendable {
  case phone, tablet

  init(idiom: UIUserInterfaceIdiom, sizeClass: UserInterfaceSizeClass?) {
    self = idiom == .pad && sizeClass == .regular ? .tablet : .phone
  }
}

extension EnvironmentValues {
  /// Whether the tabs are a phone's, at the bottom, or a tablet's, at the top.
  @Entry var shellStyle = ShellStyle.phone
}

extension View {
  /// The tabs on `tab`'s first page: the kit's `BottomBar` on a phone, its
  /// `NavBar` on an iPad. They belong to the page, so a page opened from it
  /// covers them, and swiping back brings them back with it.
  func tabBars(_ tab: ShellTab) -> some View { modifier(TabBars(tab: tab)) }
}

private struct TabBars: ViewModifier {
  let tab: ShellTab
  @Environment(ShellNav.self) private var nav
  @Environment(\.shellStyle) private var style
  @Environment(\.user) private var user
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    switch style {
    case .phone:
      content.bottomBar(
        BottomBar(
          nav.tabs.filter { $0 != .search }.map(item),
          accessory: nav.tabs.contains(.search) ? item(.search) : nil,
          selection: nav.barTab
        ) { nav.select($0) })
    case .tablet:
      content.navBar(
        NavBar(
          nav.tabs.filter { $0 != .search && $0 != .profile }.map(item),
          // Search, then the account, as the web's bar ends.
          trailing: [ShellTab.search, .profile].filter(nav.tabs.contains).map(item),
          selection: nav.barTab
        ) {
          nav.select($0)
        } leading: {
          Pressable(shape: Capsule(), wash: true, action: nav.home) {
            LogoMark(size: 24).padding(.leading, Space.s3).padding(.trailing, Space.s2).frame(height: TouchTarget)
          }
          .accessibilityLabel(Str.shellHomeLink)
        })
    }
  }

  private func item(_ tab: ShellTab) -> TabBarItem<ShellTab> {
    guard tab == .profile, let user else { return TabBarItem(tab, label: tab.label, icon: tab.icon) }
    let url = user.avatarId.flatMap { api?.paths.avatar($0) }
    return TabBarItem(tab, label: tab.label) { selected in
      ProfileTabPicture(name: user.name, url: url, selected: selected, named: style == .tablet)
    }
  }
}

/// The profile tab's picture, as the web's and Android's tab bars draw it:
/// the person's avatar, ringed in the text's color while the tab is open.
/// An iPad's bar names them beside it, as the web's account button does.
private struct ProfileTabPicture: View {
  let name: String
  let url: String?
  let selected: Bool
  let named: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s2) {
      ProfileAvatar(name, url: url, size: selected && !named ? 22 : 28)
        .padding(selected && !named ? 3 : 0)
        .overlay { if selected && !named { Circle().strokeBorder(palette.foreground, lineWidth: 1.5) } }
      if named {
        Text(name).textStyle(.sm, weight: .medium).lineLimit(1).frame(maxWidth: 128).fixedSize()
      }
    }
    .accessibilityHidden(true)
  }
}

/// Home's header, over its featured titles and over offline Home's rows:
/// on a phone, the logo, as the top edge the tab's first page has; and
/// whether the app is offline, or `action`, as the icon to reach the server
/// again. An iPad's tabs have the logo already, so there it holds only the
/// icon. It sits below the status bar and scrolls away with the page.
/// Search and the account are in the tabs. The frost under the status bar
/// is the page's `statusBarScrim(fadesIn: true)`, which stays away at rest
/// so it doesn't blur the logo.
struct AppHeader<Action: View>: View {
  @ViewBuilder var action: () -> Action
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.shellStyle) private var style

  init(@ViewBuilder action: @escaping () -> Action) {
    self.action = action
  }

  var body: some View {
    HStack(spacing: Space.s3) {
      if style == .phone {
        Logo(height: 20).accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 0)
      if offline {
        LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.mutedForeground)
      } else {
        action()
      }
    }
    .frame(height: 56)
    .padding(.horizontal, gutter)
  }
}

extension AppHeader where Action == EmptyView {
  init() { self.init { EmptyView() } }
}

/// Back and Home over a title's, season's, or episode's art, with the page
/// above it, like the show of a season, in a pill: the web's and Android's
/// `ItemTopBar`. It stays at the top while the page scrolls under it, so
/// the way back is always there. Goes over a page with
/// `.hidesSystemNavigationBar()`, which keeps the edge swipe back.
struct ItemTopBar: View {
  var parent: String?
  var onParent: (() -> Void)?
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s1_5) {
      RoundIconButton(.arrowLeft, label: Str.commonBack, look: .floating, size: TouchTarget, iconSize: 22) {
        nav.back()
      }
      if !offline {
        RoundIconButton(.house, label: Str.shellHomeLink, look: .floating, size: TouchTarget, iconSize: 20) {
          nav.home()
        }
      }
      if let parent, let onParent {
        MatineeButton(look: .floating, shape: .capsule, action: onParent) {
          Text(parent).lineLimit(1)
        }
      }
      Spacer(minLength: 0)
    }
    .padding(.horizontal, Space.s2)
    .padding(.vertical, Space.s1_5)
  }
}

extension View {
  /// Keeps the status bar readable over art and once a scroll view under
  /// it scrolls, as Android's `StatusBarScrim`: the kit's `StatusBarFrost`,
  /// the page blurred and veiled across the whole bar and thinning out
  /// below it, light at rest and deepening over the first 40 points of
  /// scrolling. `fadesIn`, for Home, whose header sits below the bar, brings
  /// the frost in over those 40 points, since at rest it would only blur the
  /// logo. Goes on the `ScrollView` of a page that reaches under the status bar.
  func statusBarScrim(fadesIn: Bool = false) -> some View { modifier(StatusBarScrim(fadesIn: fadesIn)) }
}

private struct StatusBarScrim: ViewModifier {
  let fadesIn: Bool
  @State private var strength: StatusBarFrostStrength?
  @Environment(\.shellStyle) private var style
  @Environment(\.tabRoot) private var tabRoot

  /// The status bar's height: above the scroll view when it starts below
  /// the bar, or its own top inset when it reaches under it.
  private func statusBar(_ proxy: GeometryProxy) -> CGFloat {
    max(proxy.frame(in: .global).minY, proxy.safeAreaInsets.top)
  }

  func body(content: Content) -> some View {
    content
      .onScrollGeometryChange(for: StatusBarFrostStrength.self) { [fadesIn] geometry in
        // Settles once the page is 40 down, so scrolling on redraws nothing.
        StatusBarFrostStrength(offset: geometry.contentOffset.y + geometry.contentInsets.top, fadesIn: fadesIn)
      } action: { _, value in
        strength = value
      }
      .overlay(alignment: .top) {
        // On an iPad the tabs' own frost does this, where they show: a page
        // opened from a tab covers them, and needs its own.
        if style == .phone || !tabRoot {
          let strength = strength ?? StatusBarFrostStrength(offset: 0, fadesIn: fadesIn)
          GeometryReader { proxy in
            StatusBarFrost(bar: statusBar(proxy), veil: strength.veil, reducedVeil: strength.reducedVeil)
              .opacity(strength.opacity)
              // From the screen's top, wherever the scroll view itself starts.
              .offset(y: -proxy.frame(in: .global).minY)
          }
          .ignoresSafeArea(edges: .horizontal)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
        }
      }
  }
}
