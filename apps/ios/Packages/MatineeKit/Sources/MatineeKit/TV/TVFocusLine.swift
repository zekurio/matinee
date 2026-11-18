#if os(tvOS)
  import SwiftUI

  /// What a page says about the focused item: its name, an optional line
  /// under it, its facts (year, runtime, genres), its age rating, its score,
  /// and its overview. Plain values, for `TVFocusLine` and `TVItemHeader`.
  public struct TVItemInfo: Hashable, Sendable {
    public var name: String
    public var subtitle: String?
    public var facts: [String]
    public var contentRating: String?
    public var rating: String?
    public var overview: String?

    /// `rating` is the score as the app writes it, like "7.8".
    public init(
      name: String, subtitle: String? = nil, facts: [String] = [], contentRating: String? = nil, rating: String? = nil,
      overview: String? = nil
    ) {
      self.name = name
      self.subtitle = subtitle
      self.facts = facts
      self.contentRating = contentRating
      self.rating = rating
      self.overview = overview
    }
  }

  /// An item's facts on one line: "2023 · 2h 8m · Drama", its age rating
  /// in a box, and its score by the star, at 85% of the text color.
  public struct TVFacts: View {
    let info: TVItemInfo
    let ratingLabel: String?
    @Environment(\.palette) private var palette

    /// `ratingLabel` is what VoiceOver says before the score, like "Rated".
    public init(_ info: TVItemInfo, ratingLabel: String? = nil) {
      self.info = info
      self.ratingLabel = ratingLabel
    }

    public var body: some View {
      let color = palette.foreground.opacity(0.85)
      HStack(spacing: 32) {
        if !info.facts.isEmpty {
          Text(info.facts.joined(separator: "  ·  ")).textStyle(.facts).lineLimit(1)
        }
        if let rating = info.contentRating {
          Text(rating).textStyle(.caption).lineLimit(1)
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
            .overlay { RoundedRectangle.kit(TVRadius.sm).strokeBorder(palette.foreground.opacity(0.4), lineWidth: 2) }
        }
        if let rating = info.rating {
          HStack(spacing: 12) {
            LucideIcon(.star, label: ratingLabel, size: 32, tint: palette.star, scales: false)
            Text(rating).textStyle(.facts)
          }
        }
      }
      .foregroundStyle(color)
    }
  }

  /// Height of a `TVFocusLine`, kept when nothing has focus so what's under it doesn't move.
  public let TVFocusLineHeight: CGFloat = 60

  /// The focused card's name and facts on one line, for a grid's header, so
  /// the cards themselves stay pictures. Empty while nothing has focus.
  public struct TVFocusLine: View {
    let info: TVItemInfo?

    public init(_ info: TVItemInfo?) { self.info = info }

    public var body: some View {
      HStack(spacing: 32) {
        if let info {
          Text(info.name).textStyle(.title).lineLimit(1).layoutPriority(-1)
          TVFacts(TVItemInfo(name: info.name, facts: info.facts, contentRating: info.contentRating, rating: info.rating))
        }
      }
      .frame(height: TVFocusLineHeight, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      .animation(Motion.enter, value: info)
    }
  }

  /// The focused item over the backdrop, as Home and a library's page head
  /// themselves: its logo or name, the line under it, its facts, and three
  /// lines of its overview, two under a subtitle, in `height`, which stays
  /// the same whatever it shows so what's under it doesn't move. It fades from one item to
  /// the next. `logo` draws the title's logo, if there is one; `TVTitleLogo`
  /// falls back to the name when it fails.
  ///
  ///     TVItemHeader(info, height: 340) { TVTitleLogo(info.name, url: logo) }
  public struct TVItemHeader<Logo: View>: View {
    let info: TVItemInfo?
    let height: CGFloat
    @ViewBuilder let logo: (TVItemInfo) -> Logo
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ info: TVItemInfo?, height: CGFloat = 340, @ViewBuilder logo: @escaping (TVItemInfo) -> Logo) {
      self.info = info
      self.height = height
      self.logo = logo
    }

    public var body: some View {
      ZStack(alignment: .topLeading) {
        if let info {
          VStack(alignment: .leading, spacing: 0) {
            logo(info)
            if let subtitle = info.subtitle {
              Text(subtitle).textStyle(.title).foregroundStyle(palette.foreground.opacity(0.9)).lineLimit(1)
                .padding(.top, 4)
            }
            TVFacts(info).padding(.top, 20)
            if let overview = info.overview {
              Text(overview).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.75))
                .lineLimit(info.subtitle == nil ? 3 : 2)
                .frame(maxWidth: 1120, alignment: .leading)
                .padding(.top, 24)
            }
          }
          .id(info)
          .transition(.opacity)
        }
      }
      .frame(maxWidth: .infinity, minHeight: height, maxHeight: height, alignment: .topLeading)
      .animation(Motion.animation(Motion.enter, reduceMotion: reduceMotion), value: info)
    }
  }

  extension TVItemHeader where Logo == TVTitleLogo<EmptyView> {
    /// A header with the item's name in place of a logo.
    public init(_ info: TVItemInfo?, height: CGFloat = 340) {
      self.init(info, height: height) { info in TVTitleLogo(info.name) }
    }
  }
#endif
