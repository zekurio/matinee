#if os(tvOS)
  import SwiftUI
  import UIKit

  /// A search field for TV pages. Focus rests on it as on a button, so
  /// moving past it doesn't bring the keyboard up; Select opens the
  /// system's keyboard, which takes the whole screen as on every Apple TV
  /// app and offers dictation, and what's typed shows in the field as it's
  /// typed. The keyboard's Search key, or Menu, closes it and focus is back
  /// on the field. With text in it, a round clear button sits at its end.
  ///
  ///     TVSearchField(text: $query, placeholder: "Movies, shows, people") { search() }
  public struct TVSearchField: View {
    @Binding var text: String
    let placeholder: String?
    let focus: FocusState<Bool>.Binding?
    let onSubmit: (() -> Void)?
    @State private var editing = false
    @Environment(\.locale) private var locale

    /// `focus` binds the field's focus, for a page that starts on it.
    public init(
      text: Binding<String>, placeholder: String? = nil, focus: FocusState<Bool>.Binding? = nil,
      onSubmit: (() -> Void)? = nil
    ) {
      self._text = text
      self.placeholder = placeholder
      self.focus = focus
      self.onSubmit = onSubmit
    }

    public var body: some View {
      let prompt = placeholder ?? TVText.search(locale)
      HStack(spacing: 28) {
        TVControlButton(shape: Capsule(), scale: TVFocus.rowScale, action: { editing = true }) {
          SearchFace(text: text, placeholder: prompt)
        }
        .background {
          KeyboardBridge(text: $text, editing: $editing, placeholder: prompt, onSubmit: onSubmit)
            .frame(width: 1, height: 1)
            .accessibilityHidden(true)
        }
        .modifier(BoundFocus(focus: focus))
        .accessibilityLabel(prompt)
        .accessibilityValue(text)
        if !text.isEmpty {
          TVRoundButton(.x, label: TVText.clearSearch(locale)) { text = "" }
            .transition(.opacity)
        }
      }
      .animation(Motion.enter, value: text.isEmpty)
    }
  }

  /// `.focused(focus)`, when there is one.
  private struct BoundFocus: ViewModifier {
    let focus: FocusState<Bool>.Binding?

    @ViewBuilder func body(content: Content) -> some View {
      if let focus { content.focused(focus) } else { content }
    }
  }

  private struct SearchFace: View {
    let text: String
    let placeholder: String
    @Environment(\.tvFocused) private var focused
    @Environment(\.palette) private var palette

    var body: some View {
      HStack(spacing: 24) {
        LucideIcon(.search, size: 44, tint: focused ? nil : palette.mutedForeground, scales: false)
        Group {
          if text.isEmpty {
            Text(placeholder).foregroundStyle(focused ? palette.background.opacity(0.55) : palette.foregroundFaint)
          } else {
            Text(text)
          }
        }
        .textStyle(.facts)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.leading, 36)
      .padding(.trailing, 44)
      .frame(height: TVButtons.height)
    }
  }

  /// A text field the focus engine never lands on, made first responder to
  /// bring the system's keyboard up for the field it stands behind.
  private struct KeyboardBridge: UIViewRepresentable {
    @Binding var text: String
    @Binding var editing: Bool
    let placeholder: String
    let onSubmit: (() -> Void)?

    func makeUIView(context: Context) -> UnfocusableTextField {
      let field = UnfocusableTextField()
      field.delegate = context.coordinator
      field.returnKeyType = .search
      field.autocorrectionType = .no
      field.alpha = 0.02
      field.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .editingChanged)
      return field
    }

    func updateUIView(_ field: UnfocusableTextField, context: Context) {
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
      var parent: KeyboardBridge

      init(parent: KeyboardBridge) { self.parent = parent }

      @objc func changed(_ field: UITextField) {
        parent.text = field.text ?? ""
      }

      func textFieldDidEndEditing(_ field: UITextField) {
        parent.text = field.text ?? ""
        if parent.editing { parent.editing = false }
      }

      func textFieldShouldReturn(_ field: UITextField) -> Bool {
        parent.onSubmit?()
        field.resignFirstResponder()
        return true
      }
    }
  }

  private final class UnfocusableTextField: UITextField {
    override var canBecomeFocused: Bool { false }
  }
#endif
