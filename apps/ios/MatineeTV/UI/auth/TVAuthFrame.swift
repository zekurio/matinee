import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvAuthFrame.kt: a TV screen before signing in, laid out as Google TV's
 * setup and Apple TV's own: the logo at the top left, what this step is
 * about on the left, and the things to pick on the right, both centred
 * down the screen.
 */

/// Room between a heading on the left and what follows it.
enum TVAuthFrameSide {
  static let gap: CGFloat = 72
}

/// A screen before signing in: `title` and `description` on the left with
/// `side` under them, like a code to type; `content` on the right, the rows
/// to pick from. `split` is how much of the width the left gets.
/// `backdrop` fills the screen behind it all, like the server's login
/// backdrop. The rows are one focus section, so focus coming back from a
/// panel or the keyboard lands in them.
struct TVAuthFrame<Backdrop: View, Side: View, Content: View>: View {
  let title: String
  let description: String?
  let split: CGFloat
  @ViewBuilder let backdrop: () -> Backdrop
  @ViewBuilder let side: () -> Side
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(
    _ title: String, description: String?, split: CGFloat = 0.42, @ViewBuilder backdrop: @escaping () -> Backdrop,
    @ViewBuilder side: @escaping () -> Side, @ViewBuilder content: @escaping () -> Content
  ) {
    self.title = title
    self.description = description
    self.split = split
    self.backdrop = backdrop
    self.side = side
    self.content = content
  }

  var body: some View {
    GeometryReader { proxy in
      let inner = proxy.size.width - TVOverscan.horizontal * 2 - Self.gap
      ZStack(alignment: .topLeading) {
        palette.background
        backdrop()
        Logo(height: 48)
          .padding(.leading, TVOverscan.horizontal)
          .padding(.top, TVOverscan.vertical + 32)
        HStack(alignment: .center, spacing: Self.gap) {
          VStack(alignment: .leading, spacing: 0) {
            Text(title).textStyle(.display).foregroundStyle(palette.foreground)
              .fixedSize(horizontal: false, vertical: true)
              .accessibilityAddTraits(.isHeader)
            if let description {
              Text(description).textStyle(.body).foregroundStyle(palette.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, TVSpace.s5)
            }
            side()
          }
          .frame(width: inner * split, alignment: .leading)
          // Clear of the logo above it; the right side has the whole height.
          .padding(.top, 144)
          .padding(.bottom, 48)
          VStack(alignment: .leading, spacing: 0) { content() }
            .frame(width: inner * (1 - split), alignment: .leading)
            .frame(maxHeight: .infinity)
            .focusSection()
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, TVOverscan.horizontal)
        .padding(.vertical, TVOverscan.vertical)
      }
    }
    .ignoresSafeArea()
  }

  /// Between the two sides.
  static var gap: CGFloat { 128 }
}

extension TVAuthFrame where Backdrop == EmptyView {
  init(
    _ title: String, description: String?, split: CGFloat = 0.42, @ViewBuilder side: @escaping () -> Side,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.init(title, description: description, split: split, backdrop: { EmptyView() }, side: side, content: content)
  }
}

extension TVAuthFrame where Backdrop == EmptyView, Side == EmptyView {
  init(_ title: String, description: String?, split: CGFloat = 0.42, @ViewBuilder content: @escaping () -> Content) {
    self.init(title, description: description, split: split, backdrop: { EmptyView() }, side: { EmptyView() }, content: content)
  }
}

/// A short message under a list, such as what went wrong, in line with the rows' text.
struct TVAuthNote: View {
  let text: String
  var danger = false
  @Environment(\.palette) private var palette

  init(_ text: String, danger: Bool = false) {
    self.text = text
    self.danger = danger
  }

  var body: some View {
    Text(text).textStyle(.body).foregroundStyle(danger ? palette.destructive : palette.mutedForeground)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: 1120, alignment: .leading)
      .padding(.leading, TVListItems.inset)
      .padding(.top, TVSpace.s2)
  }
}

/// A list that scrolls when it's longer than the screen and sits centred
/// down it when it isn't, as Android's centred column with its scroll.
struct TVCenteredScroll<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        content()
          .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .leading)
      }
      .scrollClipDisabled()
      .scrollIndicators(.hidden)
    }
  }
}
