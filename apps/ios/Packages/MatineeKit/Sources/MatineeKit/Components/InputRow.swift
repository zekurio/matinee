import SwiftUI

/// A setting typed in, as the web's InputField: its name in `text-sm
/// font-medium`, the `MatineeTextField` under it at full width (the web's
/// `split` layout at phone width), and under that a line of help in
/// `text-13px` muted, or the error in the danger color, which opens and
/// closes rather than jumps. VoiceOver reads the name, and the help or the
/// error, with the field.
///
///     InputRow("Issuer URL", text: $issuer, placeholder: "https://auth.example.com", error: issuerError)
///       .keyboardType(.URL)
///
/// The keyboard, content type, and submit modifiers reach the field, as on
/// `MatineeTextField`; `trailing` sits inside the field's end.
public struct InputRow<Trailing: View>: View {
  let title: String
  @Binding var text: String
  let placeholder: String
  let kind: TextFieldKind
  let help: String?
  let error: String?
  @ViewBuilder let trailing: () -> Trailing
  /// The last error, kept while it closes so its words don't vanish first.
  @State private var shownError = ""
  @Environment(\.palette) private var palette

  public init(
    _ title: String, text: Binding<String>, placeholder: String = "", kind: TextFieldKind = .text,
    help: String? = nil, error: String? = nil, @ViewBuilder trailing: @escaping () -> Trailing
  ) {
    self.title = title
    self._text = text
    self.placeholder = placeholder
    self.kind = kind
    self.help = help
    self.error = error
    self.trailing = trailing
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        .padding(.bottom, Space.s2_5)
        .accessibilityHidden(true)
      MatineeTextField(placeholder, text: $text, kind: kind, isError: error != nil, trailing: trailing)
        .accessibilityLabel(title)
        .accessibilityHint(error ?? help ?? "")
      Reveal(error != nil) {
        Text(shownError).textStyle(.px13).foregroundStyle(palette.destructive)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, Space.s2)
      }
      .accessibilityHidden(true)
      if let help, error == nil {
        Text(help).textStyle(.px13).foregroundStyle(palette.mutedForeground)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, Space.s2)
          .accessibilityHidden(true)
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
    .frame(maxWidth: .infinity, alignment: .leading)
    .onChange(of: error, initial: true) { _, error in if let error { shownError = error } }
  }
}

extension InputRow where Trailing == EmptyView {
  public init(
    _ title: String, text: Binding<String>, placeholder: String = "", kind: TextFieldKind = .text,
    help: String? = nil, error: String? = nil
  ) {
    self.init(title, text: text, placeholder: placeholder, kind: kind, help: help, error: error) { EmptyView() }
  }
}
