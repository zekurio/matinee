#if os(tvOS)
  import SwiftUI

  /// A page of rows under a fixed header, as Home on Android TV
  /// (`PinnedRows` in ui/tv/Focus.kt) and in Wholphin: whichever row takes
  /// focus scrolls up to the top of the rows, so the focused row always sits
  /// in the same place under the header, and the header above it can speak
  /// for the focused card. The rows fade out under the header's edge rather
  /// than stop at a line.
  ///
  /// Each row is a `TVRow` of `memory`, or anything else with `.id(key)`
  /// under the same key it gives `memory`, like a `TVRowNotice`. The rows
  /// get `TVSpace.rows` between them and room after the last, so the last
  /// too can scroll up to the top.
  ///
  ///     ZStack(alignment: .topLeading) {
  ///       TVItemHeader(info, height: 380).padding(…)
  ///       TVPinnedRows(memory: memory) {
  ///         TVRow("Continue watching", key: "continue", items: …, memory: memory) { … }
  ///         TVRow("Recently added", key: "recent", items: …, memory: memory) { … }
  ///       }
  ///       .padding(.top, 452)
  ///     }
  public struct TVPinnedRows<Content: View>: View {
    let memory: TVFocusMemory
    let spacing: CGFloat
    let fade: CGFloat
    let end: CGFloat
    let lazy: Bool
    @ViewBuilder let content: () -> Content
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// `fade` is how far down the rows fade in from the top edge, which is
    /// also where the focused row's heading comes to rest; `end` the room
    /// after the last row. `lazy: false` makes every row at once, for a page
    /// of a few rows that each load on their own, like Home's shelves: they
    /// start loading as the page opens rather than as they near the screen,
    /// and Down can reach a row below the edge as soon as it has cards.
    public init(
      memory: TVFocusMemory, spacing: CGFloat = TVSpace.rows, fade: CGFloat = TVSpace.s5, end: CGFloat = 640,
      lazy: Bool = true, @ViewBuilder content: @escaping () -> Content
    ) {
      self.memory = memory
      self.spacing = spacing
      self.fade = fade
      self.end = end
      self.lazy = lazy
      self.content = content
    }

    public var body: some View {
      ScrollViewReader { reader in
        ScrollView(.vertical) {
          Group {
            if lazy {
              LazyVStack(alignment: .leading, spacing: spacing) { content() }
            } else {
              VStack(alignment: .leading, spacing: spacing) { content() }
            }
          }
          .padding(.bottom, end)
        }
        .scrollIndicators(.hidden)
        // The focused row rests a fade's height down, clear of the fade.
        .contentMargins(.top, fade, for: .scrollContent)
        .onChange(of: memory.lastRow) { _, row in
          guard let row else { return }
          withAnimation(Motion.animation(Motion.move, reduceMotion: reduceMotion)) {
            reader.scrollTo(row, anchor: .top)
          }
        }
      }
      .mask {
        VStack(spacing: 0) {
          LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: fade)
          Color.black
        }
      }
    }
  }
#endif
