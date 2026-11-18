import Foundation

/*
 * The rules the iPad's featured banner at the top of Home (the app's
 * home/Hero.swift) lays itself out and moves by, after the web's
 * components/hero.tsx and the place home.tsx gives it: what it shows, how
 * tall it is and where its text and buttons sit for the window, which
 * facts a slide lists, and how its repeating pages map to slides. The
 * iPhone's carousel is HomeCarousel.swift beside it; both name a title and
 * list its genres through the `FeaturedTitle` helpers at the end of this
 * file.
 */

/// What the banner shows besides the title's name and its picture. The
/// owner asked the phones for the name alone ("wont need more on space
/// constrained mobile") and picked the web's banner for the iPad, so the
/// iPad keeps the web's: its facts, its genres as badges, the overview, and
/// Play and Details. Each is one switch here, `ipad`, should he want one off.
public struct BannerParts: Equatable, Sendable {
  /// How the genres show: the web's frosted badges, each opening its
  /// genre; a line of plain text, as the iPhone's card has; or not at all.
  public enum Genres: Equatable, Sendable { case badges, line, none }

  public var genres: Genres
  /// The year and episode count, the age rating, and the score.
  public var facts: Bool
  /// Play and Details under the text.
  public var buttons: Bool
  /// Three lines of the overview, where the window is tall enough for them.
  public var overview: Bool

  public init(genres: Genres, facts: Bool, buttons: Bool, overview: Bool) {
    self.genres = genres
    self.facts = facts
    self.buttons = buttons
    self.overview = overview
  }

  /// The iPad's banner: the web's, all of it.
  public static let ipad = BannerParts(genres: .badges, facts: true, buttons: true, overview: true)
}

/// Featured slides, as the banner pages through them.
public enum HeroPaging {
  /// How many times over the banner's pages repeat, so it can keep going
  /// forward: after the last slide comes the first again, rather than a
  /// rewind through them all.
  public static let loops = 1000

  /// How long a slide stays before the banner moves on: the web's 8 seconds.
  public static let advance: Duration = .seconds(8)

  /// How many pages the banner has for `count` slides.
  public static func pages(_ count: Int) -> Int { count > 1 ? count * loops : count }

  /// The page it opens on: the middle of the repeats, so it can go either way.
  public static func initialPage(_ count: Int) -> Int { count > 1 ? count * (loops / 2) : 0 }

  /// The slide `page` shows.
  public static func slide(_ page: Int, count: Int) -> Int {
    guard count > 0 else { return 0 }
    return ((page % count) + count) % count
  }

  /// The page nearest `page` that shows slide `index`, for a dot's tap.
  public static func page(showing index: Int, from page: Int, count: Int) -> Int {
    page - slide(page, count: count) + index
  }
}

/// Where the banner puts things in a window, after the web's breakpoints:
/// a tablet's (`sm`, from 640 points wide), a desktop's (`lg`, from 1024),
/// and a short window's (`sm` under 540 tall). An iPad in portrait is the
/// web's tablet, on its side its desktop. All lengths are points, those
/// from the bottom measured up from the banner's bottom edge.
public struct HeroLayout: Equatable, Sendable {
  public enum Size: Equatable, Sendable {
    /// `sm` up to `lg`: buttons well up from the bottom, the dots under them at the right.
    case medium
    /// `lg`: the buttons near the bottom, the dots level with them.
    case large
    /// `sm` and under 540 tall: everything low, no genres.
    case short
  }

  public let size: Size
  /// How tall the banner is, from the screen's top, under the tabs.
  public let height: Double
  /// From the bottom to the buttons' bottom edge: `bottom-28`, `lg:bottom-8`, short `bottom-12`.
  public let buttonsBottom: Double
  /// The room between the buttons and the slide's text above them, which
  /// the web keeps by placing the text 64 (40 short) above the buttons' bottom.
  public let textGap: Double
  /// From the bottom to the dots' row, where it isn't level with the
  /// buttons: `sm:bottom-12`, short `bottom-3`.
  public let dotsBottom: Double
  /// Whether the dots and arrows sit level with the buttons, at the right.
  public var dotsBesideButtons: Bool { size == .large }
  /// Whether the window is tall enough for the overview: the web's hides it
  /// under 700 tall on a tablet and 880 on a desktop.
  public let showsOverview: Bool
  /// Whether there's room for the genres: not in a short window.
  public var showsGenres: Bool { size != .short }
  /// The title's size: `clamp(2.25rem, 7vh, 3rem)` on a tablet,
  /// `clamp(3rem, 5.5vh, 4.5rem)` on a desktop.
  public let titleSize: Double

  /// The layout for a window `width` by `height`. `rowsBelow` is whether
  /// Continue watching or Next up follow the banner (or may, while they
  /// load): on a desktop the web gives the banner what those rows leave of
  /// the first screen, which in an iPad's window is its floor,
  /// `max(360px, min(64vh, 40vw))`, so that's its height there. Otherwise
  /// it's `min(68vh, 720px)`, at least 480, or a short window's whole height.
  public init(width: Double, height: Double, rowsBelow: Bool) {
    let large = width >= 1024
    let short = !large && height <= 540
    size = large ? .large : short ? .short : .medium
    switch size {
    case .large where rowsBelow:
      self.height = max(360, min(height * 0.64, width * 0.4))
    case .short:
      self.height = height
    default:
      self.height = max(min(height * 0.68, 720), 480)
    }
    buttonsBottom = large ? 32 : short ? 48 : 112
    textGap = short ? 16 : 24
    dotsBottom = short ? 12 : 48
    showsOverview = large ? height > 880 : !short && height > 700
    titleSize = large ? min(max(height * 0.055, 48), 72) : min(max(height * 0.07, 36), 48)
  }
}

/// Whether Continue watching or Next up follow the banner, which on a
/// desktop-sized window keeps it short enough for them to start in the
/// first screen: either has titles, or is still loading, as the web's
/// `fold` assumes they'll come.
public func rowsFollowBanner<A, B>(resume: Load<[A]>, nextUp: Load<[B]>) -> Bool {
  func coming<T>(_ load: Load<[T]>) -> Bool {
    switch load {
    case .loading: true
    case .ready(let items): !items.isEmpty
    case .failed: false
    }
  }
  return coming(resume) || coming(nextUp)
}

extension FeaturedTitle {
  /// The name a featured title goes by, typed out, on the iPhone's card and
  /// the iPad's banner alike. Never the provider's logo image: it can't be
  /// made to read on every picture behind it.
  public var featuredName: String { title.name }

  /// The genres a featured title lists, at most three, as the web's banner.
  public var shownGenres: [String] { Array(title.genres.prefix(3)) }

  /// The year, and a show's episode count when it has more than one.
  public func facts(episodes: (Int) -> String) -> [String] {
    [
      title.year.map { String($0) },
      title.isShow && count > 1 ? episodes(count) : nil,
    ].compactMap(\.self)
  }
}
