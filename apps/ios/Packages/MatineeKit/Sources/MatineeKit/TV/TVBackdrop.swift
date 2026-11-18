#if os(tvOS)
  import SwiftUI

  /// The picture behind a TV page, edge to edge, as Android TV's backdrop
  /// layer: dimmed from the left and the bottom, where a page's text and
  /// rows sit, and a little at the top for the clock. When `item` changes it
  /// waits for focus to rest, so a held direction doesn't load every
  /// picture on the way, then crossfades; the first picture, or none, shows
  /// at once. Put it behind the page, filling the screen.
  ///
  ///     TVBackdrop(focused) { title in Picture(api?.art(title.backdrop) ?? [], alignment: .topTrailing) }
  public struct TVBackdrop<Item: Hashable, Picture: View>: View {
    let item: Item?
    let settle: Duration
    @ViewBuilder let picture: (Item) -> Picture
    @State private var shown: Item?
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// `settle` is how long focus rests before the picture follows it.
    public init(_ item: Item?, settle: Duration = .milliseconds(350), @ViewBuilder picture: @escaping (Item) -> Picture) {
      self.item = item
      self.settle = settle
      self.picture = picture
      _shown = State(initialValue: item)
    }

    public var body: some View {
      ZStack {
        palette.background
        if let shown {
          ZStack {
            picture(shown)
            TVScrim()
          }
          .id(shown)
          .transition(.opacity)
        }
      }
      .ignoresSafeArea()
      .accessibilityHidden(true)
      .task(id: item) {
        guard item != shown else { return }
        if shown != nil, item != nil {
          try? await Task.sleep(for: settle)
          if Task.isCancelled { return }
        }
        withAnimation(Motion.animation(Motion.easing(Motion.moveDuration * 2), reduceMotion: reduceMotion)) {
          shown = item
        }
      }
    }
  }

  /// Darkens a picture so text reads on it: most at the left and the bottom,
  /// a little at the top for the clock, in the page's own color, so a light
  /// theme fades to white.
  public struct TVScrim: View {
    @Environment(\.palette) private var palette

    public init() {}

    public var body: some View {
      let shade = palette.background
      ZStack {
        LinearGradient(
          stops: [
            .init(color: shade.opacity(0.94), location: 0), .init(color: shade.opacity(0.78), location: 0.35),
            .init(color: shade.opacity(0.3), location: 0.7), .init(color: shade.opacity(0.15), location: 1),
          ], startPoint: .leading, endPoint: .trailing)
        LinearGradient(
          stops: [
            .init(color: shade.opacity(0.45), location: 0), .init(color: shade.opacity(0), location: 0.18),
            .init(color: shade.opacity(0.35), location: 0.45), .init(color: shade.opacity(0.95), location: 1),
          ], startPoint: .top, endPoint: .bottom)
      }
    }
  }
#endif
