#if os(tvOS)
  import SwiftUI

  /// The time, as at the top right of every TV page, in the locale's 12 or
  /// 24 hour style, turning over with the minute.
  public struct TVClock: View {
    @Environment(\.palette) private var palette
    @Environment(\.locale) private var locale

    public init() {}

    public var body: some View {
      TimelineView(.everyMinute) { context in
        Text(context.date.formatted(Date.FormatStyle(date: .omitted, time: .shortened).locale(locale)))
          .textStyle(.clock)
          .foregroundStyle(palette.foreground.opacity(0.9))
          .monospacedDigit()
      }
    }
  }

  extension View {
    /// The clock at the top right, in line with the drawer's profile
    /// picture, fading away while not `visible`, as under an open panel or
    /// while a page's content has scrolled up to it.
    public func tvClock(visible: Bool = true) -> some View {
      overlay {
        // Measured from the screen's edges, as the rest of a TV page.
        ZStack(alignment: .topTrailing) {
          Color.clear
          TVClock()
            .padding(.top, TVOverscan.vertical + 18)
            .padding(.trailing, TVOverscan.horizontal)
            .opacity(visible ? 1 : 0)
            .animation(Motion.color, value: visible)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
      }
    }
  }
#endif
