import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Bars.kt: the bars around pages. The tabs on a tab's first page, at the
 * bottom of a phone and at the top of an iPad (Shell.swift says which);
 * Home's header, on a phone the logo, search, and the account, after
 * Findroid's; and the floating buttons over a title's art. Nothing shades
 * the status bar: a page under it shows there as it is.
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

  /// MatineeCore's name for it, which decides the tabs.
  var layout: ShellLayout {
    switch self {
    case .phone: .phone
    case .tablet: .tablet
    }
  }
}

extension EnvironmentValues {
  /// Whether the tabs are a phone's, at the bottom, or a tablet's, at the top.
  @Entry var shellStyle = ShellStyle.phone
}

extension View {
  /// The tabs on `tab`'s first page: the kit's `BottomBar` on a phone, its
  /// `NavBar` on an iPad. They belong to the page, so a page opened from it
  /// covers them, as on Android and in Findroid, and swiping back brings
  /// them back with it. Either is drawn around the same page (the kit's
  /// `tabBars`), so when an iPad's window crosses between the two, the page
  /// keeps what it loaded, where it's scrolled, and its state.
  func tabBars(_ tab: ShellTab) -> some View { modifier(TabBars(tab: tab)) }
}

private struct TabBars: ViewModifier {
  let tab: ShellTab
  @Environment(ShellNav.self) private var nav
  @Environment(\.shellStyle) private var style
  @Environment(\.user) private var user
  @Environment(\.api) private var api

  func body(content: Content) -> some View {
    content.tabBars(style == .phone ? .bottom : .top, bottom: bottomBar, top: navBar)
  }

  /// A phone's: Home, Media, and Downloads, each always named; search and
  /// the account are in Home's header.
  private var bottomBar: BottomBar<ShellTab> {
    let select: (ShellTab) -> Void = { [nav] in nav.select($0) }
    return BottomBar(nav.tabs.map { item($0) }, selection: nav.barTab, onSelect: select)
  }

  /// An iPad's: the logo, the tabs, then search and the account, as the web's bar ends.
  private var navBar: NavBar<ShellTab, HomeLogoLink> {
    let select: (ShellTab) -> Void = { [nav] in nav.select($0) }
    let places: [ShellTab] = [.search, .profile]
    let tabs = nav.tabs
    let logo: () -> HomeLogoLink = { HomeLogoLink() }
    let items = tabs.filter { !places.contains($0) }.map { item($0) }
    let trailing = places.filter { tabs.contains($0) }.map { item($0) }
    return NavBar(items, trailing: trailing, selection: nav.barTab, onSelect: select, leading: logo)
  }

  private func item(_ tab: ShellTab) -> TabBarItem<ShellTab> {
    guard tab == .profile, let user else { return TabBarItem(tab, label: tab.label, icon: tab.icon) }
    let url = user.avatarId.flatMap { api?.paths.avatar($0) }
    return TabBarItem(tab, label: tab.label) { _ in ProfileTabPicture(name: user.name, url: url) }
  }
}

/// The logo at the start of an iPad's bar, which goes Home.
private struct HomeLogoLink: View {
  @Environment(\.navigator) private var nav

  var body: some View {
    Pressable(shape: Capsule(), wash: true, action: { nav.home() }) {
      LogoMark(size: 24).padding(.leading, Space.s3).padding(.trailing, Space.s2).frame(height: TouchTarget)
    }
    .accessibilityLabel(Str.shellHomeLink)
  }
}

/// The account at the end of an iPad's bar, as the web's account button:
/// the person's avatar with their name beside it. A phone's is in Home's
/// header (`AccountButton`).
private struct ProfileTabPicture: View {
  let name: String
  let url: String?

  var body: some View {
    HStack(spacing: Space.s2) {
      ProfileAvatar(name, url: url, size: 28)
      Text(name).textStyle(.sm, weight: .medium).lineLimit(1).frame(maxWidth: 128).fixedSize()
    }
    .accessibilityHidden(true)
  }
}

/// Home's header, over its featured titles and over offline Home's rows,
/// after Findroid's `HomeHeader`. On a phone: the logo at the start, and at
/// the end whether the app is offline, or `action`, the icon to reach the
/// server again; search, which opens Media with its field taking the
/// keyboard; and the account, which opens the profile on Home's stack. It's
/// 44 tall, right under the status bar, where a navigation bar sits. An
/// iPad's bar has the logo, search, and the account already, so there it
/// holds only the icon. It scrolls away with the page.
struct AppHeader<Action: View>: View {
  @ViewBuilder var action: () -> Action
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.shellStyle) private var style
  @Environment(\.navigator) private var nav

  init(@ViewBuilder action: @escaping () -> Action) {
    self.action = action
  }

  var body: some View {
    HStack(spacing: Space.s2) {
      if style == .phone {
        Logo(height: 18).accessibilityAddTraits(.isHeader)
      }
      Spacer(minLength: 0)
      if offline {
        LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.mutedForeground)
          .padding(.horizontal, style == .phone ? Space.s2 : 0)
      } else {
        action()
      }
      if style == .phone {
        // Offline there's nothing to search, as Findroid leaves it out.
        if !offline {
          RoundIconButton(.search, label: Str.searchTitle, look: .secondary, size: 40, iconSize: 20, action: nav.search)
        }
        AccountButton()
      }
    }
    .frame(height: style == .phone ? TouchTarget : 56)
    .padding(.horizontal, gutter)
    #if DEBUG
      .task { await devPress() }
    #endif
  }

  #if DEBUG
    /// `-dev.header search|account`: that button pressed once, two seconds
    /// after Home shows, as a finger would, for a screenshot of where it goes.
    private func devPress() async {
      guard !AppHeaderDebug.pressed, style == .phone,
        let button = UserDefaults.standard.string(forKey: "dev.header")
      else { return }
      AppHeaderDebug.pressed = true
      try? await Task.sleep(for: .seconds(2))
      switch button {
      case "search": nav.search()
      case "account": nav.profile()
      default: break
      }
    }
  #endif
}

#if DEBUG
  /// `-dev.header` presses once a launch, not each time Home comes back.
  enum AppHeaderDebug {
    static var pressed = false
  }
#endif

/// The account at the end of a phone's Home header, as Findroid's user
/// button: the person's picture, or their initials, opening the profile.
/// An admin gets the accent's dot on it while requests need them, as
/// Android's profile tab and the web's avatar have it; the count is
/// VoiceOver's, and the profile's inbox.
private struct AccountButton: View {
  @Environment(\.user) private var user
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.requests) private var requests

  var body: some View {
    if let user {
      let waiting = user.isAdmin ? max(requests?.queue.needsYou ?? 0, Self.devInbox) : Self.devInbox
      Pressable(shape: Circle(), action: nav.profile) {
        // 40 to see, as the search beside it, and 44 to hit.
        ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 40, dot: waiting > 0)
          .padding(Space.s0_5)
      }
      // The picture's edge on the gutter, as the logo's at the other end.
      .padding(.trailing, -Space.s0_5)
      .accessibilityLabel(Str.tabProfile)
      .accessibilityValue(waiting > 0 ? Str.webRequestsMenuWaiting(waiting) : "")
    }
  }

  /// `-dev.profileInbox 3`: the dot as with three waiting, for a screenshot.
  private static var devInbox: Int {
    #if DEBUG
      UserDefaults.standard.integer(forKey: "dev.profileInbox")
    #else
      0
    #endif
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
