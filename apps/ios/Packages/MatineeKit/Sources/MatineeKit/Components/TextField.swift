import SwiftUI

/// What a text field is for, which decides what it offers at its end.
public enum TextFieldKind: Sendable {
  /// Plain text.
  case text
  /// A password: dots, and a button to show what was typed.
  case secure
  /// A search: the search icon before it and a clear button once there's text.
  case search
}

/// A way out in place of a search field's icon, as Findroid's search bar
/// turns its magnifier into Back while it's open: `arrow-left`, named
/// `label` for VoiceOver.
public struct TextFieldBack {
  let label: String
  let action: () -> Void

  public init(_ label: String, action: @escaping () -> Void) {
    self.label = label
    self.action = action
  }
}

/// How a text field is drawn.
public enum TextFieldLook: Sendable {
  /// The web's Input: the sunken field, `rounded-lg`, 44 tall.
  case field
  /// The search page's pill, Android's `SearchBarFrame`: the foreground at
  /// 6% with a 12% rim, round at the ends, 48 tall, standing alone at the
  /// top of a page rather than in a form.
  case pill
}

/// A text field as the web's Input: the sunken `--field` surface, a quiet
/// `--input` border that turns the accent with a soft halo around it while
/// focused (`focus-visible:border-ring ring-3 ring-ring/20`), the danger
/// color for an error, `rounded-lg`, and 44 points tall for a finger, as
/// the web's is on a touch screen. Text is `text-base`, as the web sets it
/// on phones. No floating label: `placeholder` says what goes in, and a
/// label, where there is one, sits above it in a `FormField`.
///
/// The keyboard, content type, submit label, and submit action are
/// SwiftUI's own modifiers on it (`.keyboardType`, `.textContentType`,
/// `.submitLabel`, `.onSubmit`), which reach the field inside.
public struct MatineeTextField<Trailing: View>: View {
  let placeholder: String
  @Binding var text: String
  let kind: TextFieldKind
  let icon: Lucide?
  let isError: Bool
  let lines: ClosedRange<Int>?
  let focus: Binding<Bool>?
  let look: TextFieldLook
  let back: TextFieldBack?
  @ViewBuilder let trailing: () -> Trailing

  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled
  @Environment(\.locale) private var locale
  @FocusState private var focused: Bool
  @State private var revealed = false
  @State private var hovered = false

  /// `lines` makes it grow downward between that many lines, as the web's
  /// Textarea. `back` puts Back where the icon is.
  public init(
    _ placeholder: String, text: Binding<String>, kind: TextFieldKind = .text, icon: Lucide? = nil,
    isError: Bool = false, lines: ClosedRange<Int>? = nil, focused: Binding<Bool>? = nil,
    look: TextFieldLook = .field, back: TextFieldBack? = nil, @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self.placeholder = placeholder
    self._text = text
    self.kind = kind
    self.icon = icon ?? (kind == .search ? .search : nil)
    self.isError = isError
    self.lines = lines
    self.focus = focused
    self.look = look
    self.back = back
    self.trailing = trailing
  }

  public var body: some View {
    let shape = KitShape(radius: look == .pill ? 0 : Radius.lg).capsule(look == .pill)
    let isFocused = focused
    let tint = isError ? palette.destructive : palette.ring
    HStack(alignment: lines == nil ? .center : .top, spacing: look == .pill ? Space.s3 : Space.s2) {
      if let back {
        // 36 across, centered where the icon was, and 44 to hit.
        RoundIconButton(.arrowLeft, label: back.label, look: .ghost, size: 36, iconSize: 20, action: back.action)
          .padding(.horizontal, look == .pill ? -8 : -9)
          .transition(.opacity)
      } else if let icon {
        LucideIcon(icon, size: look == .pill ? 20 : 18, tint: palette.mutedForeground)
          .padding(.top, lines == nil ? 0 : 3)
          .transition(.opacity)
      }
      field
        .textStyle(.base)
        .foregroundStyle(palette.foreground)
        .tint(palette.accent)
        .focused($focused)
        .frame(maxWidth: .infinity, alignment: .leading)
      if kind == .search, !text.isEmpty {
        RoundIconButton(.x, label: KitText.clearText(locale), look: .ghost, size: 28, iconSize: 16) {
          text = ""
          focused = true
        }
      }
      if kind == .secure {
        RoundIconButton(
          revealed ? .eyeOff : .eye, label: revealed ? KitText.hidePassword(locale) : KitText.showPassword(locale),
          look: .ghost, size: 32, iconSize: 18, tint: palette.mutedForeground
        ) { revealed.toggle() }
      }
      trailing()
    }
    .padding(.leading, look == .pill ? Space.s4 : Space.s3)
    .padding(.trailing, kind == .text && Trailing.self == EmptyView.self ? 12 : 6)
    .padding(.vertical, lines == nil ? 0 : 10)
    .frame(minHeight: look == .pill ? 48 : TouchTarget)
    .background(look == .pill ? palette.foreground.opacity(0.06) : palette.field, in: shape)
    .overlay {
      shape.strokeBorder(border(focused: isFocused), lineWidth: 1)
    }
    // The halo, `ring-3` at 20%, outside the border.
    .background {
      if isFocused || isError {
        shape.inset(by: -3).fill(tint.opacity(0.2))
      }
    }
    .opacity(enabled ? 1 : 0.5)
    .contentShape(shape)
    .onTapGesture { focused = true }
    #if os(iOS)
      .onHover { hovered = $0 }
    #endif
    .motion(Motion.color, value: isFocused)
    .onChange(of: focused) { _, now in if focus?.wrappedValue != now { focus?.wrappedValue = now } }
    .onChange(of: focus?.wrappedValue) { _, wanted in
      if let wanted, wanted != focused { focused = wanted }
    }
  }

  private func border(focused: Bool) -> Color {
    if isError { return palette.destructive.opacity(0.6) }
    if focused { return palette.ring }
    if look == .pill { return palette.foreground.opacity(hovered ? 0.2 : 0.12) }
    return hovered ? palette.inputHover : palette.input
  }

  @ViewBuilder private var field: some View {
    let prompt = Text(placeholder).foregroundStyle(palette.mutedForeground)
    if kind == .secure, !revealed {
      SecureField("", text: $text, prompt: prompt)
        .textFieldStyle(.plain)
    } else if let lines {
      TextField("", text: $text, prompt: prompt, axis: .vertical)
        .lineLimit(lines)
        .textFieldStyle(.plain)
    } else {
      TextField("", text: $text, prompt: prompt)
        .textFieldStyle(.plain)
        .accessibilityAddTraits(kind == .search ? .isSearchField : [])
    }
  }
}

extension MatineeTextField where Trailing == EmptyView {
  public init(
    _ placeholder: String, text: Binding<String>, kind: TextFieldKind = .text, icon: Lucide? = nil,
    isError: Bool = false, lines: ClosedRange<Int>? = nil, focused: Binding<Bool>? = nil,
    look: TextFieldLook = .field, back: TextFieldBack? = nil
  ) {
    self.init(
      placeholder, text: text, kind: kind, icon: icon, isError: isError, lines: lines, focused: focused,
      look: look, back: back
    ) { EmptyView() }
  }
}

/// A field with its label over it and, under it, a line of help or the
/// error, as the web's Field: the label `text-sm font-medium`, the help
/// `text-13px` muted, the error in the danger color. VoiceOver reads the
/// label and the help with the control.
public struct FormField<Control: View>: View {
  let label: String
  let help: String?
  let error: String?
  @ViewBuilder let control: () -> Control
  @Environment(\.palette) private var palette

  public init(_ label: String, help: String? = nil, error: String? = nil, @ViewBuilder control: @escaping () -> Control)
  {
    self.label = label
    self.help = help
    self.error = error
    self.control = control
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: Space.s2) {
      Text(label).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        .accessibilityHidden(true)
      control()
        .accessibilityLabel(label)
        .accessibilityHint(error ?? help ?? "")
      if let error {
        Text(error).textStyle(.px13).foregroundStyle(palette.destructive).accessibilityHidden(true)
      } else if let help {
        Text(help).textStyle(.px13).foregroundStyle(palette.mutedForeground).accessibilityHidden(true)
      }
    }
  }
}
