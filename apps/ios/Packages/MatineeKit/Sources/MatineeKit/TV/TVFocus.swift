#if os(tvOS)
  import SwiftUI

  /*
   * How a focused thing on Apple TV stands out. There are two looks, as on
   * Android TV (ui/tv/Focus.kt), and every focusable thing takes one:
   *
   * - A picture (a poster, a still, a person's photo) keeps its picture in
   *   view, so it lifts: the system's own focus effect, which grows it,
   *   casts its shadow, tilts it under the thumb on the remote's touch
   *   surface, and runs a sheen across it, as every Apple TV app's posters
   *   do. `TVPictureButton`.
   * - A control (a button, a chip, a list row, a drawer entry, the search
   *   field) fills with the text color and its content turns the page's
   *   color, growing a little; no ring. `TVControlButton`.
   *
   * Focus moves by the system's focus engine. Rows and panels are focus
   * sections, so a move lands in the row or panel nearest along the way,
   * and `TVFocusMemory` sends it to the card the row had last.
   */

  /// The TV's focus measures.
  public enum TVFocus {
    /// How much a focused button, chip, or drawer entry grows.
    public static let controlScale: CGFloat = 1.05
    /// How much a focused list row grows: less, since rows sit close together.
    public static let rowScale: CGFloat = 1.02
    /// The ring round a focused picture with Matinee's own lift, and the
    /// gap between the two; also what the phone's controls wear on a TV.
    public static let ring: CGFloat = 6
    public static let gap: CGFloat = 6
    /// Room a row or grid keeps round its cards, for a focused one's growth and shadow.
    public static let room: CGFloat = 40
    /// Between a picture and its caption: clear of the system's lift.
    public static let captionGap: CGFloat = 32
  }

  extension Palette {
    /// A control's fill while it doesn't have focus, so its shape shows on
    /// any backdrop: the text color at 12%.
    public var tvRest: Color { foreground.opacity(0.12) }
  }


  /// The ring round a focused picture: the text color, `TVFocus.ring`
  /// wide, `TVFocus.gap` clear of the shape. Also what the phone's
  /// controls wear on a TV, through `FocusIndicator`.
  struct TVFocusRing<S: InsettableShape>: View {
    let shape: S
    let placement: FocusRingPlacement
    var color: Color?
    @Environment(\.palette) private var palette

    var body: some View {
      switch placement {
      case .outside:
        shape.inset(by: -(TVFocus.gap + TVFocus.ring)).strokeBorder(color ?? palette.foreground, lineWidth: TVFocus.ring)
      case .inside: shape.strokeBorder(color ?? palette.foreground, lineWidth: TVFocus.ring)
      case .none: EmptyView()
      }
    }
  }

  /// The picture look as a button style: `shape` is the picture's outline.
  struct TVPictureStyle<S: InsettableShape>: ButtonStyle {
    let shape: S
    var longPress: (() -> Void)?
    var memo: TVPressMemo?

    func makeBody(configuration: Configuration) -> some View {
      TVPictureBody(shape: shape, longPress: longPress, memo: memo, configuration: configuration)
    }
  }

  private struct TVPictureBody<S: InsettableShape>: View {
    let shape: S
    let longPress: (() -> Void)?
    let memo: TVPressMemo?
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var focused
    @Environment(\.isEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      let pressed = configuration.isPressed
      configuration.label
        .clipShape(shape)
        .contentShape(shape)
        // The lift's platter and sheen take the picture's own outline, a circle for a person.
        .contentShape(.hoverEffect, shape)
        .hoverEffect(.highlight)
        .scaleEffect(pressed ? 0.97 : 1)
        .opacity(enabled ? 1 : 0.5)
        .background {
          if let longPress, let memo { TVLongPress(isEnabled: focused && enabled, memo: memo, action: longPress) }
        }
        .animation(Motion.animation(focused ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: focused)
        .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: pressed)
    }
  }

  /// The control look as a button style: `shape` filled with `rest`, or
  /// with the text color while focused, when the content takes the page's
  /// color and the whole grows by `scale`.
  struct TVControlStyle<S: InsettableShape>: ButtonStyle {
    let shape: S
    var rest: Color?
    var content: Color?
    var scale = TVFocus.controlScale
    /// Shown as focused whether or not it is, for one about to take focus as it appears.
    var lit = false
    var longPress: (() -> Void)?
    var memo: TVPressMemo?

    func makeBody(configuration: Configuration) -> some View {
      TVControlBody(style: self, configuration: configuration)
    }
  }

  private struct TVControlBody<S: InsettableShape>: View {
    let style: TVControlStyle<S>
    let configuration: ButtonStyleConfiguration
    @Environment(\.isFocused) private var isFocused
    @Environment(\.isEnabled) private var enabled
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      let focused = isFocused || style.lit
      let pressed = configuration.isPressed
      configuration.label
        .foregroundStyle(focused ? palette.background : enabled ? (style.content ?? palette.foreground) : palette.mutedForeground)
        .environment(\.tvFocused, focused)
        .background(focused ? palette.foreground : (style.rest ?? palette.tvRest), in: style.shape)
        .contentShape(style.shape)
        .scaleEffect(focused ? (pressed ? 1 + (style.scale - 1) / 3 : style.scale) : 1)
        .shadow(color: .black.opacity(focused && palette.isDark ? 0.35 : focused ? 0.15 : 0), radius: 12, y: 8)
        .opacity(enabled ? 1 : 0.6)
        .background {
          if let longPress = style.longPress, let memo = style.memo {
            TVLongPress(isEnabled: isFocused && enabled, memo: memo, action: longPress)
          }
        }
        .animation(Motion.animation(focused ? Motion.enter : Motion.exit, reduceMotion: reduceMotion), value: focused)
        .animation(Motion.animation(Motion.color, reduceMotion: reduceMotion), value: pressed)
    }
  }

  extension EnvironmentValues {
    /// Inside a TV control: whether it shows focus, so its content can
    /// follow the fill, as a subtitle that dims on it. The control already
    /// sets the foreground style; this is for anything drawn otherwise.
    @Entry public var tvFocused = false
  }


  /// A picture that's pressed, with the TV's picture focus: it lifts, tilts,
  /// and shines. `shape` is its outline. `onLongPress` is a
  /// held Select, for the actions panel; `onPlayPause` the remote's
  /// Play/Pause while it's focused, as Apple TV plays a focused title.
  ///
  ///     TVPictureButton(shape: .kit(TVRadius.card), action: open) { poster }
  public struct TVPictureButton<Label: View, S: InsettableShape>: View {
    let shape: S
    let action: () -> Void
    let onLongPress: (() -> Void)?
    let onPlayPause: (() -> Void)?
    @ViewBuilder let label: () -> Label
    @State private var memo = TVPressMemo()

    public init(
      shape: S, action: @escaping () -> Void, onLongPress: (() -> Void)? = nil, onPlayPause: (() -> Void)? = nil,
      @ViewBuilder label: @escaping () -> Label
    ) {
      self.shape = shape
      self.action = action
      self.onLongPress = onLongPress
      self.onPlayPause = onPlayPause
      self.label = label
    }

    public var body: some View {
      Button { memo.click(action) } label: { label() }
        .buttonStyle(TVPictureStyle(shape: shape, longPress: onLongPress, memo: memo))
        // The lift's platter follows the button's border shape, not the content shape, for a circle.
        .buttonBorderShape(S.self == Circle.self ? .circle : .roundedRectangle(radius: TVRadius.card))
        .onPlayPauseCommand(perform: onPlayPause)
    }
  }

  /// Anything pressed that isn't a picture, with the TV's control focus: it
  /// fills with the text color, its content turns the page's color, and it
  /// grows by `scale`. `rest` is its fill without focus, the text color at
  /// 12% unless given; `content` its content's color then.
  ///
  ///     TVControlButton(shape: Capsule(), action: retry) { Text("Retry") }
  public struct TVControlButton<Label: View, S: InsettableShape>: View {
    let shape: S
    let rest: Color?
    let content: Color?
    let scale: CGFloat
    let lit: Bool
    let action: () -> Void
    let onLongPress: (() -> Void)?
    @ViewBuilder let label: () -> Label
    @State private var memo = TVPressMemo()

    public init(
      shape: S, rest: Color? = nil, content: Color? = nil, scale: CGFloat = TVFocus.controlScale, lit: Bool = false,
      action: @escaping () -> Void, onLongPress: (() -> Void)? = nil, @ViewBuilder label: @escaping () -> Label
    ) {
      self.shape = shape
      self.rest = rest
      self.content = content
      self.scale = scale
      self.lit = lit
      self.action = action
      self.onLongPress = onLongPress
      self.label = label
    }

    public var body: some View {
      Button { memo.click(action) } label: { label() }
        .buttonStyle(
          TVControlStyle(
            shape: shape, rest: rest, content: content, scale: scale, lit: lit, longPress: onLongPress, memo: memo))
    }
  }
#endif
