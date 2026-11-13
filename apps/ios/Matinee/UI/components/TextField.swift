import SwiftUI

/// A text field as the web draws one, on Android's terms: lighter than the
/// card it sits on, a quiet border that takes the accent while it has
/// focus, and the danger color for an error. The keyboard, content type,
/// and submit action are SwiftUI's modifiers on it, as on any field.
struct MatineeTextField<Trailing: View>: View {
  @Binding var text: String
  var placeholder: String?
  var leadingIcon: Lucide?
  var isError = false
  var secure = false
  @ViewBuilder var trailing: () -> Trailing

  @Environment(\.palette) private var palette
  @Environment(\.isEnabled) private var enabled
  @FocusState private var focused: Bool

  init(
    _ text: Binding<String>, placeholder: String? = nil, leadingIcon: Lucide? = nil, isError: Bool = false,
    secure: Bool = false, @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self._text = text
    self.placeholder = placeholder
    self.leadingIcon = leadingIcon
    self.isError = isError
    self.secure = secure
    self.trailing = trailing
  }

  var body: some View {
    HStack(spacing: 10) {
      if let leadingIcon { LucideIcon(leadingIcon, size: 18, tint: palette.muted) }
      field
        .textStyle(.bodyLarge)
        .foregroundStyle(palette.foreground)
        .tint(palette.accent)
        .focused($focused)
        .frame(maxWidth: .infinity)
      trailing()
    }
    .padding(.horizontal, 14)
    .frame(minHeight: 52)
    .background(palette.secondary, in: ControlShape)
    .overlay {
      ControlShape.strokeBorder(
        isError ? palette.danger : focused ? palette.accent : palette.input, lineWidth: focused ? 2 : 1)
    }
    .opacity(enabled ? 1 : 0.5)
    .contentShape(ControlShape)
    .onTapGesture { focused = true }
    .motion(Motion.color, value: focused)
  }

  @ViewBuilder private var field: some View {
    let prompt = placeholder.map { Text($0).foregroundStyle(palette.faint) }
    if secure {
      SecureField("", text: $text, prompt: prompt)
    } else {
      TextField("", text: $text, prompt: prompt)
    }
  }
}

extension MatineeTextField where Trailing == EmptyView {
  init(
    _ text: Binding<String>, placeholder: String? = nil, leadingIcon: Lucide? = nil, isError: Bool = false,
    secure: Bool = false
  ) {
    self.init(text, placeholder: placeholder, leadingIcon: leadingIcon, isError: isError, secure: secure) {
      EmptyView()
    }
  }
}
