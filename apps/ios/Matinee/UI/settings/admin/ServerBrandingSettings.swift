import MatineeCore
import SwiftUI

/*
 * ServerAppearanceSettings.kt: the accent the Matinee theme uses for
 * everyone on the server. The presets, the hex checks, and the draft are
 * MatineeCore's (Admin/AuthForms.swift).
 */

/// The accent the Matinee theme uses for everyone on the server, as the
/// web's server appearance panel: a preset, or a color per appearance,
/// saved from the save bar. The app previews each edit at once, as the web
/// does, and goes back to the saved accents when the page closes.
struct ServerAppearanceSettings: View {
  @State private var loader = Loader<Branding>()
  @State private var form: AccentDraft?
  @Environment(\.api) private var api
  @Environment(ThemeStore.self) private var theme

  var body: some View {
    SaveBarScaffold(
      Str.settingsAdminAppearance, dirty: form?.dirty == true, canSave: form?.valid == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let draft = form?.draft, var branding = loader.state.value else { return }
        branding.themeAccents = draft
        let saved = try await api.admin.branding.update(branding: branding)
        loader.show(saved)
        // The app shows the new accent at once, as the web does.
        theme.setAccents(saved.themeAccents)
      }
    ) {
      AdminLoaded(loader, failed: Str.webServerAppearanceLoadFailed) { _ in
        if let binding = Binding($form) { AccentForm(form: binding) }
      }
    }
    .loads(loader) { api in try await api.admin.branding.get() }
    .onChange(of: loader.state.value, initial: true) { _, saved in form = saved.map { AccentDraft($0.themeAccents) } }
    .onChange(of: form?.valid == true ? form?.draft : nil) { _, draft in if let draft { theme.setAccents(draft) } }
    .onDisappear { if let saved = loader.state.value { theme.setAccents(saved.themeAccents) } }
  }
}

private struct AccentForm: View {
  @Binding var form: AccentDraft

  var body: some View {
    SettingsSection(Str.webServerAppearanceTitle) {
      VStack(spacing: 16) {
        HStack(spacing: 0) {
          ForEach(Array(ACCENT_PRESETS.enumerated()), id: \.offset) { index, preset in
            if index > 0 { Spacer(minLength: 2) }
            Swatch(
              light: preset.light, dark: preset.dark, selected: form.picked(preset),
              name: index == 0 ? Str.webServerAppearanceDefault : "\(preset.light) / \(preset.dark)"
            ) {
              form.light = preset.light
              form.dark = preset.dark
            }
          }
        }
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Str.webServerAppearancePresets)
        Panel {
          ColorRow(label: Str.webServerAppearanceModeLight, value: $form.light)
          RowDivider()
          ColorRow(label: Str.webServerAppearanceModeDark, value: $form.dark)
        }
      }
    }
  }
}

/// A preset: the light accent and the dark one, split on a diagonal, ringed when picked.
private struct Swatch: View {
  let light: String
  let dark: String
  let selected: Bool
  let name: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    Button(action: action) {
      ZStack {
        Circle().fill(hexColor(dark))
        DiagonalHalf().fill(hexColor(light)).clipShape(Circle())
      }
      .frame(width: 30, height: 30)
      .padding(4)
      .overlay { Circle().strokeBorder(selected ? palette.foreground : .clear, lineWidth: 2) }
      .frame(width: MinTouch, height: MinTouch)
      .contentShape(Circle())
    }
    .buttonStyle(RoundPress())
    .accessibilityLabel(name)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .motion(Motion.color, value: selected)
  }
}

/// The top-left half of a square, cut on its diagonal.
private nonisolated struct DiagonalHalf: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
    path.closeSubpath()
    return path
  }
}

private func hexColor(_ hex: String) -> Color { RGB(hex: hex)?.color ?? .clear }

/// A mode's accent: its name, then the hex value with the color it names, in one field.
private struct ColorRow: View {
  let label: String
  @Binding var value: String
  /// Wide enough for "#rrggbb" at every text size.
  @ScaledMetric(relativeTo: .body) private var fieldWidth: CGFloat = 144
  @Environment(\.palette) private var palette

  var body: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: 12) {
        Text(label).textStyle(.bodyLarge).frame(maxWidth: .infinity, alignment: .leading)
        field
      }
      // At large text sizes the field goes under its name.
      VStack(alignment: .leading, spacing: 8) {
        Text(label).textStyle(.bodyLarge)
        field
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
  }

  private var field: some View {
    let parsed = normalizeHex(value)
    return HStack(spacing: 10) {
      Circle()
        .fill(parsed.map(hexColor) ?? .clear)
        .overlay { Circle().strokeBorder(palette.foreground.opacity(0.15)) }
        .frame(width: 20, height: 20)
        .accessibilityHidden(true)
      TextField("", text: Binding(get: { value }, set: { value = String($0.prefix(7)) }))
        .textStyle(.bodyLarge)
        .foregroundStyle(palette.foreground)
        .tint(palette.accent)
        .keyboardType(.asciiCapable)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .accessibilityLabel(label)
    }
    .padding(.horizontal, 10)
    .frame(width: fieldWidth)
    .frame(minHeight: 40)
    .background(palette.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(parsed == nil ? palette.danger : palette.border)
    }
  }
}
