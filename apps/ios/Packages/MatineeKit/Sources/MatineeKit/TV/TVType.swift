#if os(tvOS)
  import SwiftUI
  import UIKit

  /*
   * The TV's measures: type, margins, and sizes for a screen read from the
   * couch. Apple TV lays out 1920 by 1080 points whatever the panel, at 1x on
   * a 1080p set and 2x on a 4K one, so one scale serves both.
   *
   * They come from Android TV's (ui/tv/TvType.kt, Cards.kt, Buttons.kt),
   * which lays out 960 by 540 dp: a dp there is two points here, so a page
   * takes the same share of the screen on both. Where Apple has a number of
   * its own for the same thing, the margins and the least type size, the
   * TV takes Apple's.
   *
   * tvOS has no Dynamic Type: the system offers no text size, and these stay
   * as they are. Bold Text in the TV's accessibility settings is honoured: a
   * style's weight goes up a step.
   */

  /// The TV's type scale, in Red Hat Text, Android TV's `TvType` at two
  /// points a dp: `.textStyle(.body)` is `TvType.Body`.
  public nonisolated enum TVTextStyle: String, CaseIterable, Sendable {
    /// The name a detail page is about: a title, an episode, a person. 88/100 bold.
    case hero
    /// The focused item's name in a page's header. 68/80 bold.
    case display
    /// A page's own name, a panel's title. 52/64 bold.
    case headline
    /// A row's heading. 40/52 semibold.
    case title
    /// The facts under a name, and the label of a button or list row. 32/44 medium.
    case facts
    /// Running text, like an overview. 32/48.
    case body
    /// A line under a card, a chip, a value at a row's end. 30/40 medium.
    case label
    /// The least that reads from the couch, above Apple's 23. 28/40.
    case caption
    /// The clock at the top right. 40/52 medium.
    case clock
    /// A number inside an icon, like the seconds in a skip arrow. 22/24 semibold.
    case iconNumber

    /// Size and line height in points, weight, and tracking in em.
    public var metrics: (size: CGFloat, line: CGFloat, weight: Font.Weight, tracking: CGFloat) {
      switch self {
      case .hero: (88, 100, .bold, -0.02)
      case .display: (68, 80, .bold, -0.02)
      case .headline: (52, 64, .bold, -0.02)
      case .title: (40, 52, .semibold, -0.01)
      case .facts: (32, 44, .medium, 0)
      case .body: (32, 48, .regular, 0)
      case .label: (30, 40, .medium, 0)
      case .caption: (28, 40, .regular, 0)
      case .clock: (40, 52, .medium, 0)
      case .iconNumber: (22, 24, .semibold, 0)
      }
    }

    /// The weight with Bold Text on: a step up, as the system's own text does.
    func weight(bold: Bool) -> Font.Weight {
      bold ? Self.step(metrics.weight) : metrics.weight
    }

    static func step(_ weight: Font.Weight) -> Font.Weight {
      switch weight {
      case .regular: .medium
      case .medium: .semibold
      default: .bold
      }
    }
  }

  private struct TVTextStyleModifier: ViewModifier {
    let style: TVTextStyle
    let weight: Font.Weight?
    @Environment(\.legibilityWeight) private var legibility

    @ViewBuilder func body(content: Content) -> some View {
      let metrics = style.metrics
      let bold = legibility == .bold
      let resolved = weight.map { bold ? TVTextStyle.step($0) : $0 } ?? style.weight(bold: bold)
      let font = RedHatText.uiFont(size: metrics.size, weight: resolved)
      let styled = content.font(Font(font)).tracking(metrics.tracking * metrics.size)
      if #available(tvOS 26, *) {
        styled.lineHeight(.exact(points: metrics.line))
      } else {
        styled.lineSpacing(max(0, metrics.line - font.lineHeight))
      }
    }
  }

  extension View {
    /// Sets text in the TV's type scale: `.textStyle(.body)` is Android's
    /// `TvType.Body`. `weight` overrides the style's own.
    public func textStyle(_ style: TVTextStyle, weight: Font.Weight? = nil) -> some View {
      modifier(TVTextStyleModifier(style: style, weight: weight))
    }
  }

  /// A code to type on another device, like the sign-in code: monospaced,
  /// 88/108 semibold, spaced 8 points.
  public struct TVCodeText: View {
    let code: String

    public init(_ code: String) { self.code = code }

    public var body: some View {
      Text(code)
        .font(.system(size: 88, weight: .semibold, design: .monospaced))
        .tracking(8)
        .lineLimit(1)
    }
  }

  /// Margins for what a person reads or focuses on: Apple's 80 at the sides
  /// and 60 at the top and bottom, which tvOS gives as the safe area.
  /// Backdrops still reach the edges, rows run off the right one, and the
  /// drawer's rail sits nearer the left edge.
  public enum TVOverscan {
    public static let horizontal: CGFloat = 80
    public static let vertical: CGFloat = 60
    /// Both, as padding, for a screen with no drawer, like the player.
    public static let insets = EdgeInsets(top: vertical, leading: horizontal, bottom: vertical, trailing: horizontal)
    /// Where the collapsed drawer's icons are centred, from the left edge:
    /// the rail's circles touch the side margin.
    public static let railCenter: CGFloat = 80
  }

  /// Where TV pages start and end across: clear of the drawer's rail on the
  /// left, of the overscan on the right.
  public enum TVPage {
    /// Past the collapsed drawer's rail, with room for a first card's growth and ring.
    public static let start: CGFloat = 176
    public static let end: CGFloat = TVOverscan.horizontal
  }

  /// The TV's spacing steps, Android TV's at two points a dp. Between a
  /// page's rows, between cards, between a row's heading and its cards.
  public enum TVSpace {
    public static let s1: CGFloat = 8
    public static let s2: CGFloat = 12
    public static let s3: CGFloat = 16
    public static let s4: CGFloat = 20
    public static let s5: CGFloat = 24
    public static let s6: CGFloat = 32
    public static let s7: CGFloat = 40
    public static let s8: CGFloat = 56
    /// Between a page's rows of cards.
    public static let rows: CGFloat = 56
  }

  /// The TV's corner radii: the web's scale, doubled with everything else.
  public enum TVRadius {
    /// A content rating's box.
    public static let sm: CGFloat = 8
    /// Cards: posters, stills.
    public static let card: CGFloat = 20
    /// List rows and the field.
    public static let row: CGFloat = 28
    /// A toast, a panel's inner blocks.
    public static let lg: CGFloat = 32
  }
#endif
