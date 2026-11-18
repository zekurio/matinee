#if os(tvOS)
  import SwiftUI
  import UIKit

  /// What a `TVTextField` takes: plain text, or an address.
  public enum TVTextFieldKind: Sendable {
    case text
    /// A web address: the keyboard's URL layout, no capitals or corrections, and Go.
    case url
  }

  /// A field to type into on a TV, like a server's address, laid out as a
  /// list row: focus rests on it as on a row, so moving past it doesn't
  /// bring the keyboard up; Select opens the system's keyboard, which takes
  /// the whole screen and offers dictation, and what's typed shows in the
  /// field as it's typed. The keyboard's Go, or Menu, closes it, focus back
  /// on the field; Go also runs `onSubmit`. `isError` rings it in the
  /// danger color, for an address that didn't answer. A search field is
  /// `TVSearchField`.
  ///
  ///     TVTextField(text: $address, placeholder: "media.example.com", icon: .server, kind: .url) { connect() }
  public struct TVTextField: View {
    @Binding var text: String
    let placeholder: String
    let icon: Lucide?
    let kind: TVTextFieldKind
    let isError: Bool
    let focus: FocusState<Bool>.Binding?
    let onSubmit: (() -> Void)?
    @State private var editing = false
    @Environment(\.palette) private var palette

    /// `focus` binds the field's focus, for a screen that starts on it.
    public init(
      text: Binding<String>, placeholder: String, icon: Lucide? = nil, kind: TVTextFieldKind = .text,
      isError: Bool = false, focus: FocusState<Bool>.Binding? = nil, onSubmit: (() -> Void)? = nil
    ) {
      self._text = text
      self.placeholder = placeholder
      self.icon = icon
      self.kind = kind
      self.isError = isError
      self.focus = focus
      self.onSubmit = onSubmit
    }

    public var body: some View {
      TVControlButton(
        shape: RoundedRectangle.kit(TVListItems.radius), rest: palette.foreground.opacity(0.07),
        scale: TVFocus.rowScale, action: { editing = true }
      ) {
        FieldFace(text: text, placeholder: placeholder, icon: icon)
      }
      .overlay {
        if isError {
          RoundedRectangle.kit(TVListItems.radius).strokeBorder(palette.destructive, lineWidth: 4)
            .allowsHitTesting(false)
        }
      }
      .background {
        FieldKeyboard(text: $text, editing: $editing, placeholder: placeholder, kind: kind, onSubmit: onSubmit)
          .frame(width: 1, height: 1)
          .accessibilityHidden(true)
      }
      .modifier(FieldFocus(focus: focus))
      .accessibilityLabel(placeholder)
      .accessibilityValue(text)
    }
  }

  private struct FieldFocus: ViewModifier {
    let focus: FocusState<Bool>.Binding?

    @ViewBuilder func body(content: Content) -> some View {
      if let focus { content.focused(focus) } else { content }
    }
  }

  private struct FieldFace: View {
    let text: String
    let placeholder: String
    let icon: Lucide?
    @Environment(\.tvFocused) private var focused
    @Environment(\.palette) private var palette

    var body: some View {
      HStack(spacing: 32) {
        if let icon { LucideIcon(icon, size: 48, scales: false).opacity(focused ? 1 : 0.7) }
        Group {
          if text.isEmpty {
            Text(placeholder).foregroundStyle(focused ? palette.background.opacity(0.55) : palette.foregroundFaint)
          } else {
            Text(text)
          }
        }
        .textStyle(.title, weight: .medium)
        .lineLimit(1)
        .truncationMode(.head)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, TVListItems.inset)
      .frame(maxWidth: .infinity, minHeight: TVListItems.height + 8)
    }
  }

  /// A text field the focus engine never lands on, made first responder to
  /// bring the system's keyboard up for the field it stands behind.
  private struct FieldKeyboard: UIViewRepresentable {
    @Binding var text: String
    @Binding var editing: Bool
    let placeholder: String
    let kind: TVTextFieldKind
    let onSubmit: (() -> Void)?

    func makeUIView(context: Context) -> HiddenField {
      let field = HiddenField()
      field.delegate = context.coordinator
      field.alpha = 0.02
      // Nothing of it shows: the face draws the text, the system's keyboard its own field.
      field.textColor = .clear
      field.tintColor = .clear
      field.clipsToBounds = true
      switch kind {
      case .text:
        field.returnKeyType = .done
      case .url:
        field.keyboardType = .URL
        field.textContentType = .URL
        field.autocapitalizationType = .none
        field.autocorrectionType = .no
        field.spellCheckingType = .no
        field.returnKeyType = .go
      }
      field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
      return field
    }

    func updateUIView(_ field: HiddenField, context: Context) {
      context.coordinator.parent = self
      field.placeholder = placeholder
      if field.text != text { field.text = text }
      if editing, !field.isFirstResponder {
        DispatchQueue.main.async { field.becomeFirstResponder() }
      } else if !editing, field.isFirstResponder {
        field.resignFirstResponder()
      }
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    final class Coordinator: NSObject, UITextFieldDelegate {
      var parent: FieldKeyboard

      init(parent: FieldKeyboard) { self.parent = parent }

      @objc func changed(_ field: UITextField) {
        parent.text = field.text ?? ""
      }

      func textFieldDidEndEditing(_ field: UITextField) {
        parent.text = field.text ?? ""
        if parent.editing { parent.editing = false }
      }

      func textFieldShouldReturn(_ field: UITextField) -> Bool {
        parent.text = field.text ?? ""
        field.resignFirstResponder()
        parent.onSubmit?()
        return true
      }
    }
  }

  private final class HiddenField: UITextField {
    override var canBecomeFocused: Bool { false }
  }
#endif
