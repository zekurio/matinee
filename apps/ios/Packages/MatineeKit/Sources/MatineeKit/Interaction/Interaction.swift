import SwiftUI

/*
 * What a press, the pointer, and focus look like everywhere in the kit,
 * drawn by it, never the system's highlight: the foreground washed over
 * what's pressed, as the web's `hover:bg-foreground/10` rows and buttons
 * light up and Android's PressIndication does, and the web's
 * `focus-visible` ring for keyboard and remote focus.
 *
 * Every component draws focus through `FocusIndicator`, which on a TV is
 * the TV's focus design (TV/TVFocus.swift): pictures grow and gain a ring,
 * controls fill with the text color.
 */

/// A state the gallery pins a component in, to show it without a finger on it.
@_spi(Gallery) public enum ForcedInteraction: String, Sendable, CaseIterable {
  case none, pressed, hovered, focused
}

extension EnvironmentValues {
  @_spi(Gallery) @Entry public var forcedInteraction = ForcedInteraction.none
}

/// How strongly the foreground washes over what's pressed or hovered.
enum Wash {
  /// The web's `bg-foreground/10` under a pressed menu row.
  static let pressed = 0.1
  /// A pointer over it, the web's `hover:bg-foreground/6`.
  static let hovered = 0.06
}

/// Where the focus ring sits: outside the shape, as the web's
/// `outline-offset-2` on buttons, or inside it, as on list rows that a
/// clipped block would cut off.
public enum FocusRingPlacement: Sendable {
  case outside, inside, none
}

/// A press's state as the kit draws it, with a quick tap held long enough
/// to be seen, as Android's PressIndication does.
struct InteractionState {
  var pressed = false
  var hovered = false
  var focused = false

  var wash: Double { pressed ? Wash.pressed : hovered ? Wash.hovered : 0 }
}

/// The ring a focused control wears: 2 points of the accent, 2 outside its
/// shape, the web's `focus-visible:outline-2 outline-offset-2 outline-ring`.
struct FocusIndicator<S: InsettableShape>: View {
  let shape: S
  let placement: FocusRingPlacement
  var color: Color?
  @Environment(\.palette) private var palette

  var body: some View {
    #if os(tvOS)
      // The TV's ring, in the text color and clear of the shape (TV/TVFocus.swift).
      TVFocusRing(shape: shape, placement: placement, color: color)
    #else
      switch placement {
      case .outside: shape.inset(by: -4).strokeBorder(color ?? palette.ring, lineWidth: 2)
      case .inside: shape.strokeBorder(color ?? palette.ring, lineWidth: 2)
      case .none: EmptyView()
      }
    #endif
  }
}

/// The button style behind everything pressable in the kit. It draws the
/// label, the wash in `shape` while pressed or hovered, the focus ring,
/// and the disabled state, and takes the system's pointer effect away.
struct KitPressStyle<S: InsettableShape>: ButtonStyle {
  var shape: S
  var wash = true
  var washColor: Color?
  /// A little give, as the tab bar's `active:scale-[0.92]`.
  var pressScale: CGFloat?
  var ring = FocusRingPlacement.outside
  var dimsWhenDisabled = true
  /// How far past the shape a finger still hits it, so a small control takes `TouchTarget` to hit.
  var hitInset: CGFloat = 0

  func makeBody(configuration: Configuration) -> some View {
    PressBody(style: self, configuration: configuration)
  }
}

private struct PressBody<S: InsettableShape>: View {
  let style: KitPressStyle<S>
  let configuration: ButtonStyleConfiguration
  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled
  @Environment(\.isFocused) private var focused
  @Environment(\.forcedInteraction) private var forced
  @State private var shownPressed = false
  @State private var hovered = false
  @State private var pressedAt = Date.distantPast
  @State private var presses = 0

  var body: some View {
    let state = self.state
    configuration.label
      .overlay {
        if style.wash {
          style.shape.fill((style.washColor ?? palette.foreground).opacity(state.wash))
            .allowsHitTesting(false)
        }
      }
      .contentShape(style.shape.inset(by: -style.hitInset))
      .scaleEffect(state.pressed ? (style.pressScale ?? 1) : 1)
      // With no wash and no give, as a link, a press dims it instead.
      .opacity(state.pressed && !style.wash && style.pressScale == nil ? 0.7 : 1)
      .overlay {
        if state.focused { FocusIndicator(shape: style.shape, placement: style.ring).allowsHitTesting(false) }
      }
      .opacity(style.dimsWhenDisabled && !enabled ? 0.5 : 1)
      .motion(Motion.color, value: state.wash)
      .motion(Motion.color, value: state.pressed)
      .hoverEffectDisabled()
      #if os(iOS)
        .onHover { hovered = $0 && enabled }
      #endif
      .onChange(of: configuration.isPressed) { _, pressed in
        presses += 1
        if pressed {
          pressedAt = .now
          shownPressed = true
        } else {
          // A tap shorter than the fade still shows it in full before it goes.
          let press = presses
          let held = Date.now.timeIntervalSince(pressedAt)
          let wait = max(0, Motion.colorDuration - held)
          DispatchQueue.main.asyncAfter(deadline: .now() + wait) {
            if presses == press { shownPressed = false }
          }
        }
      }
  }

  private var state: InteractionState {
    InteractionState(
      pressed: shownPressed || forced == .pressed,
      hovered: hovered || forced == .hovered,
      focused: focused || forced == .focused)
  }
}

/// Anything pressable that isn't one of the kit's controls, like a card or
/// a custom row: the kit's press, focus, and disabled states over it, a
/// button to VoiceOver. `shape` is where the wash and the ring go.
///
///     Pressable(shape: .kit(Radius.md), action: open) { PosterArt(…) }
///
/// With `onLongPress`, holding it does that instead, with a tap of haptic
/// feedback, as a card's long press opens its actions. VoiceOver offers it
/// as an action named `longPressLabel`.
public struct Pressable<Label: View, S: InsettableShape>: View {
  let shape: S
  let wash: Bool
  let ring: FocusRingPlacement
  let action: () -> Void
  let onLongPress: (() -> Void)?
  let longPressLabel: String?
  @ViewBuilder let label: () -> Label
  @State private var longPressed = false
  @State private var longPresses = 0

  public init(
    shape: S, wash: Bool = true, ring: FocusRingPlacement = .outside, action: @escaping () -> Void,
    onLongPress: (() -> Void)? = nil, longPressLabel: String? = nil, @ViewBuilder label: @escaping () -> Label
  ) {
    self.shape = shape
    self.wash = wash
    self.ring = ring
    self.action = action
    self.onLongPress = onLongPress
    self.longPressLabel = longPressLabel
    self.label = label
  }

  public var body: some View {
    let button = Button {
      // The finger lifting after a long press isn't also a tap.
      if longPressed {
        longPressed = false
      } else {
        action()
      }
    } label: {
      label()
    }
    .buttonStyle(KitPressStyle(shape: shape, wash: wash, ring: ring))
    if let onLongPress {
      button
        .simultaneousGesture(
          LongPressGesture(minimumDuration: 0.45).onEnded { _ in
            longPressed = true
            longPresses += 1
            onLongPress()
            // What the long press opened usually takes the touch, so no lift
            // comes to clear it; a tap after that is a tap again.
            let press = longPresses
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
              if longPresses == press { longPressed = false }
            }
          }
        )
        #if os(iOS)
          .sensoryFeedback(.impact(weight: .medium), trigger: longPresses)
        #endif
        .accessibilityAction(named: Text(longPressLabel ?? "")) { onLongPress() }
    } else {
      button
    }
  }
}

extension Pressable where S == Rectangle {
  public init(
    wash: Bool = true, ring: FocusRingPlacement = .inside, action: @escaping () -> Void,
    onLongPress: (() -> Void)? = nil, longPressLabel: String? = nil, @ViewBuilder label: @escaping () -> Label
  ) {
    self.init(
      shape: Rectangle(), wash: wash, ring: ring, action: action, onLongPress: onLongPress,
      longPressLabel: longPressLabel, label: label)
  }
}
