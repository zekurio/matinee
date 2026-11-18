import SwiftUI

/// A choice from a list, as the web's Select: a field-styled trigger with
/// the current choice and a chevron, 44 tall for a finger, and its list in
/// a menu as wide as it, with a check by the current one. `label` names it
/// for VoiceOver; a `FormField` or `SelectRow` shows it.
///
///     Select("Quality", selection: $quality, options: [(.original, "Original"), (.p1080, "1080p")])
public struct Select<Value: Hashable>: View {
  let label: String
  @Binding var selection: Value
  let options: [(Value, String)]
  let size: ButtonSize
  @State private var open = false
  @Environment(\.palette) private var palette

  /// `size` `.sm` is the web's 28-tall `sm` trigger, for a toolbar.
  public init(_ label: String, selection: Binding<Value>, options: [(Value, String)], size: ButtonSize = .touch) {
    self.label = label
    self._selection = selection
    self.options = options
    self.size = size
  }

  public var body: some View {
    let current = options.first { $0.0 == selection }?.1
    Button {
      open = true
    } label: {
      SelectFace(text: current ?? "", open: open, height: size == .sm ? 32 : size == .md ? 36 : TouchTarget)
    }
    .buttonStyle(KitPressStyle(shape: RoundedRectangle.kit(Radius.lg), wash: false, hitInset: size == .sm ? 6 : 0))
    .dropdownMenu(isPresented: $open, matchWidth: true) {
      ForEach(options.indices, id: \.self) { index in
        let option = options[index]
        MenuItem(option.1, selected: option.0 == selection) { selection = option.0 }
      }
    }
    .accessibilityLabel(label)
    .accessibilityValue(current ?? "")
  }
}

/// The trigger's face: the field's look, the value, and the chevron.
struct SelectFace: View {
  let text: String
  let open: Bool
  var height: CGFloat = TouchTarget
  var placeholder = false
  @Environment(\.palette) private var palette
  @Environment(\.forcedInteraction) private var forced
  @Environment(\.isFocused) private var focused
  @State private var hovered = false

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.lg)
    let ringed = open || focused || forced == .focused
    HStack(spacing: 6) {
      Text(text)
        .textStyle(.sm)
        .foregroundStyle(placeholder ? palette.mutedForeground : palette.foreground)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      LucideIcon(.chevronDown, size: 16, tint: palette.mutedForeground, scales: false)
    }
    .padding(.leading, 10)
    .padding(.trailing, 8)
    .frame(minHeight: height)
    .background(palette.field, in: shape)
    .overlay {
      shape.strokeBorder(
        ringed ? palette.ring : (hovered || forced == .hovered || forced == .pressed) ? palette.inputHover : palette.input)
    }
    .background {
      if focused || forced == .focused { RoundedRectangle.kit(Radius.lg + 3).inset(by: -3).fill(palette.ring.opacity(0.2)) }
    }
    #if os(iOS)
      .onHover { hovered = $0 }
    #endif
    .motion(Motion.color, value: ringed)
  }
}
