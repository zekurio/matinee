import Foundation

/*
 * The signed-in shell's arrangement, after Findroid's phone app: which
 * tabs a phone and a tablet have, where each place opens, what the Media
 * tab shows for the state of its search field, and where Home's header
 * goes. The app's Shell, Nav, Media, and Home screens draw what this
 * decides.
 *
 * On a phone the tabs are Home, Media, and Downloads. Search lives at the
 * top of Media, and the profile opens from the account button in Home's
 * header, on Home's own stack. A tablet in a regular width keeps the web's
 * bar, where search and the account are places of their own.
 */

/// The shell's places, by their first page: the phone's tabs and the tablet's.
public enum ShellPage: String, Codable, CaseIterable, Hashable, Sendable {
  case home, media, downloads, profile, search
}

/// How the shell is laid out: a phone's tab bar at the bottom, or a
/// tablet's bar at the top, from a regular width up.
public enum ShellLayout: Sendable, Equatable {
  case phone, tablet
}

/// The tabs, in the bar's order. Offline only what works without the
/// server stays: Home from the downloads and the downloads, and on a
/// tablet the profile with Settings, which a phone opens from Home.
public func shellTabs(_ layout: ShellLayout, offline: Bool) -> [ShellPage] {
  switch layout {
  case .phone: offline ? [.home, .downloads] : [.home, .media, .downloads]
  case .tablet: offline ? [.home, .downloads, .profile] : ShellPage.allCases
  }
}

/// Where a place opens: the tab whose stack shows it, whether the profile
/// goes on that stack first, and whether the search field takes the keyboard.
public struct ShellLanding: Equatable, Sendable {
  public let tab: ShellPage
  /// The profile is pushed on `tab`'s stack, as a phone's Home opens it.
  public let underProfile: Bool
  /// Media's search field takes the keyboard, as a phone's search does.
  public let focusesSearch: Bool

  public init(tab: ShellPage, underProfile: Bool = false, focusesSearch: Bool = false) {
    self.tab = tab
    self.underProfile = underProfile
    self.focusesSearch = focusesSearch
  }
}

/// Where `page` opens. A tab opens as itself. On a phone the profile is
/// a page on Home's stack and search is Media with its field focused;
/// offline, where there's no Media, search lands on Home. Anything else
/// the layout lacks lands on Home.
public func shellLanding(_ page: ShellPage, layout: ShellLayout, offline: Bool) -> ShellLanding {
  let tabs = shellTabs(layout, offline: offline)
  if tabs.contains(page) { return ShellLanding(tab: page) }
  switch page {
  case .profile: return ShellLanding(tab: .home, underProfile: true)
  case .search where tabs.contains(.media): return ShellLanding(tab: .media, focusesSearch: true)
  default: return ShellLanding(tab: .home)
  }
}

/// Where a page that belongs to `owner` (as Settings belongs to the
/// profile, or Browse to search) goes on top of: `owner`'s landing,
/// without the keyboard, since the page opened is what's wanted.
public func shellStack(for owner: ShellPage, layout: ShellLayout, offline: Bool) -> ShellLanding {
  let landing = shellLanding(owner, layout: layout, offline: offline)
  return ShellLanding(tab: landing.tab, underProfile: landing.underProfile)
}

// MARK: Home's header

/// What's behind Home's header on a phone while Home scrolls under it.
public enum HeaderBackdrop: Equatable, Sendable {
  /// Nothing, as Findroid's: the logo, search, and the account stay put and
  /// the page scrolls on behind them and under the status bar, with no band,
  /// tint, blur, or line between.
  case none
  /// The page's background, solid from the screen's top to `room` below
  /// the header's band, where the page goes under a clean edge.
  case solid(room: Double)

  /// What ships. The owner was offered both: nothing behind the header, as
  /// Findroid's, or a solid band with room under the buttons. To show him
  /// the other, change this line to `.solid(room: 12)`.
  public static let home: HeaderBackdrop = .none

  /// How far below the header's band the backdrop's edge is: 0 with none.
  public var room: Double {
    switch self {
    case .none: 0
    case .solid(let room): max(room, 0)
    }
  }
}

/// Where Home's header goes and how far below it Home's content starts.
/// On a phone it stays put at the top while Home scrolls under it, right
/// under the status bar, over `backdrop`. At rest the featured cards start
/// 8 below the header's band and, with none, the first row a row's gap
/// below, as it would follow the cards; a solid backdrop's room counts
/// toward that, so the content never starts under its edge. Online and
/// offline alike. A tablet's tabs stay put instead: there the header, when
/// it shows, rides on the banner or at the top of the list and scrolls away
/// with it.
public struct HomeHeaderPlacement: Equatable, Sendable {
  /// The header stays put above the page rather than scrolling with it.
  public let pinned: Bool
  /// What's behind it, where it's pinned.
  public let backdrop: HeaderBackdrop
  /// From the backdrop's edge, or the header's band with none, to the
  /// first thing under it at rest; 0 where it isn't pinned, as the page
  /// then lays its own top out.
  public let gap: Double

  /// From a phone's header to the featured cards under it.
  public static let cardsGap = 8.0

  /// `cards` is whether the featured cards, or their place while they load,
  /// are under the header; `rowSpacing` is the gap between Home's rows.
  public init(
    _ layout: ShellLayout, cards: Bool, rowSpacing: Double, backdrop: HeaderBackdrop = .home
  ) {
    pinned = layout == .phone
    self.backdrop = backdrop
    gap = pinned ? max((cards ? Self.cardsGap : rowSpacing) - backdrop.room, 0) : 0
  }

  /// From the header's band to the first thing under it at rest.
  public var below: Double { pinned ? backdrop.room + gap : 0 }
}

// MARK: Media's search

/// What the Media tab shows under its search field.
public enum MediaPageContent: Equatable, Sendable {
  /// The libraries: the field at rest, with nothing typed.
  case libraries
  /// Search is open with nothing typed: Discover's rows, when the server
  /// has Discover on, else nothing but the field.
  case suggestions
  /// What the server found for the text, trimmed.
  case results(String)
}

/// The Media tab's search field: what's typed, and whether search is open.
/// Search opens when the field takes focus and stays open while the
/// keyboard goes down, as a scroll puts it away, so what it shows doesn't
/// vanish under a finger; Cancel closes it, back to the libraries. Text
/// opens it too, as a search started from elsewhere or kept from before.
public struct MediaSearch: Equatable, Sendable {
  public private(set) var query = ""
  public private(set) var open = false

  public init(query: String = "", open: Bool = false) {
    self.query = query
    self.open = open || !query.isEmpty
  }

  /// The field took focus.
  public mutating func begin() { open = true }

  /// Cancel: the text gone and the libraries back.
  public mutating func cancel() {
    query = ""
    open = false
  }

  /// The text changed; clearing it with the field's own button leaves search open.
  public mutating func type(_ text: String) {
    query = text
    if !text.isEmpty { open = true }
  }

  /// What the page shows under the field.
  public var content: MediaPageContent {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    if !text.isEmpty { return .results(text) }
    return open ? .suggestions : .libraries
  }

  /// What Media shows in `layout`: on a phone, what's under the field; on a
  /// tablet, where search is a tab of its own and Media has no field, the
  /// libraries, whatever the field held. The field keeps it, so an iPad's
  /// window that narrows to a phone's width again shows the search again.
  public func content(in layout: ShellLayout) -> MediaPageContent {
    layout == .phone ? content : .libraries
  }
}
