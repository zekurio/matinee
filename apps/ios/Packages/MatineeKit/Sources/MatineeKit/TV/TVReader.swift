#if os(tvOS)
  import SwiftUI

  /*
   * A long text to read from the couch, as a playback report or the app's
   * log: TvAbout.kt's `TvTextViewer`. It covers the screen, the title at
   * the top and the text under it in monospace, as code is set. Nothing in
   * it takes focus but the page itself: Up and Down turn most of a screen
   * at a time, held they keep turning, and Menu closes it, focus going back
   * to what opened it. A TV has nowhere to copy or share text to, so
   * reading is all it does.
   */

  /// The reader's measures.
  public enum TVReaders {
    /// The text's size and line height: a little under `.caption`, so a
    /// log's long lines wrap less, and above Apple's least.
    public static let textSize: CGFloat = 26
    public static let lineHeight: CGFloat = 38
    /// How much of the screen a press turns.
    public static let page: CGFloat = 0.8
  }

  extension View {
    /// `text` over the whole screen while `isPresented`, with `title` at its
    /// top and `subtitle` under it. `fromEnd` opens it at the bottom, as for
    /// a log, whose latest lines are last.
    ///
    ///     .tvReader(isPresented: $reading, title: "App log", text: log, fromEnd: true)
    public func tvReader(
      isPresented: Binding<Bool>, title: String, subtitle: String? = nil, text: String, fromEnd: Bool = false
    ) -> some View {
      kitOverlay(isPresented: isPresented) { visible in
        TVReaderLayer(
          visible: visible, title: title, subtitle: subtitle, text: text, fromEnd: fromEnd,
          close: { isPresented.wrappedValue = false })
      }
    }
  }

  private struct ReaderGeometry: Equatable {
    var offset: CGFloat = 0
    var viewport: CGFloat = 0
    var content: CGFloat = 0
  }

  private struct TVReaderLayer: View {
    let visible: Bool
    let title: String
    let subtitle: String?
    let text: String
    let fromEnd: Bool
    let close: () -> Void
    @State private var position: ScrollPosition
    @State private var geometry = ReaderGeometry()
    @State private var held: Task<Void, Never>?
    @FocusState private var focused: Bool
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(visible: Bool, title: String, subtitle: String?, text: String, fromEnd: Bool, close: @escaping () -> Void) {
      self.visible = visible
      self.title = title
      self.subtitle = subtitle
      self.text = text
      self.fromEnd = fromEnd
      self.close = close
      _position = State(initialValue: ScrollPosition(edge: fromEnd ? .bottom : .top))
    }

    var body: some View {
      let font = Font.system(size: TVReaders.textSize, weight: .regular, design: .monospaced)
      VStack(alignment: .leading, spacing: 0) {
        Text(title).textStyle(.headline).foregroundStyle(palette.foreground).lineLimit(1)
          .accessibilityAddTraits(.isHeader)
        if let subtitle {
          Text(subtitle).textStyle(.caption).foregroundStyle(palette.mutedForeground).lineLimit(1)
            .padding(.top, 4)
        }
        ScrollView(.vertical) {
          Text(text)
            .font(font)
            .lineSpacing(TVReaders.lineHeight - TVReaders.textSize * 1.2)
            .foregroundStyle(palette.foreground)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, TVSpace.s5)
        }
        .scrollPosition($position)
        .defaultScrollAnchor(fromEnd ? .bottom : .top)
        .onScrollGeometryChange(for: ReaderGeometry.self) { scroll in
          ReaderGeometry(offset: scroll.contentOffset.y, viewport: scroll.containerSize.height, content: scroll.contentSize.height)
        } action: { _, now in
          geometry = now
        }
        // The text runs out softly at both edges, so it reads as going on.
        .mask {
          VStack(spacing: 0) {
            LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: TVSpace.s5)
            Color.black
            LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: TVSpace.s7)
          }
        }
        .padding(.top, TVSpace.s5)
      }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .padding(.top, TVOverscan.vertical + 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(palette.background)
      // The one thing to focus, so the presses come here and nowhere else.
      .overlay { TVFocusSurface {}.focused($focused).accessibilityHidden(true) }
      .onTVPress([.up, .down, .left, .right], isEnabled: visible) { button, phase in
        switch (button, phase) {
        case (.up, .began): turn(-1)
        case (.down, .began): turn(1)
        default: stop()
        }
      }
      .opacity(visible ? 1 : 0)
      .ignoresSafeArea()
      .defaultFocus($focused, true)
      .closesOnExit(close)
      .accessibilityElement(children: .contain)
    }

    /// A page up (-1) or down (1), and on while the press is held.
    private func turn(_ direction: CGFloat) {
      step(direction)
      held?.cancel()
      held = Task {
        try? await Task.sleep(for: .milliseconds(450))
        while !Task.isCancelled {
          step(direction)
          try? await Task.sleep(for: .milliseconds(300))
        }
      }
    }

    private func stop() {
      held?.cancel()
      held = nil
    }

    private func step(_ direction: CGFloat) {
      let end = max(geometry.content - geometry.viewport, 0)
      let to = min(max(geometry.offset + direction * geometry.viewport * TVReaders.page, 0), end)
      withAnimation(Motion.animation(Motion.move, reduceMotion: reduceMotion)) { position.scrollTo(y: to) }
    }
  }
#endif
