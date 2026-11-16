import MatineeCore
import MatineeKit
import SwiftUI

/*
 * ServerBrandingSettings.kt: how the server looks to everyone on it, as
 * the web's branding panel: the Matinee theme's accent, and the login
 * screen's backdrop. The presets, the hex checks, and the draft are
 * MatineeCore's (Admin/AuthForms.swift, Admin/BrandingForm.swift).
 */

/// The entry point Settings' row opens, under the name it had while the
/// page edited only the accents.
typealias ServerAppearanceSettings = ServerBrandingSettings

/// How the server looks to everyone on it: the accent, a preset or a color
/// per appearance, and whether the login screen shows the libraries'
/// artwork behind its form, and how. The fields save together, from the
/// save bar. The app previews each accent at once, as the web does, and
/// goes back to the saved ones when the page closes.
struct ServerBrandingSettings: View {
  @State private var loader = Loader<Branding>()
  @State private var form: BrandingDraft?
  @Environment(\.api) private var api
  @Environment(ThemeStore.self) private var theme

  var body: some View {
    SaveBarPage(
      Str.settingsAdminBranding, dirty: form?.dirty == true, canSave: form?.valid == true,
      onReset: { form?.reset() },
      onSave: {
        guard let api, let draft = form?.draft else { return }
        let saved = try await api.admin.branding.update(branding: draft)
        loader.show(saved)
        // The app shows the new accent at once, as the web does.
        theme.setAccents(saved.themeAccents)
      }
    ) {
      AdminLoaded(loader) { _ in
        if let binding = Binding($form) { BrandingForm(form: binding) }
      }
    }
    .loads(loader) { api in try await api.admin.branding.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: loader.state.value, initial: true) { _, saved in
      form = saved.map(BrandingDraft.init)
      if adminDemo("edit") {
        form?.accents.light = ACCENT_PRESETS[2].light
        form?.accents.dark = ACCENT_PRESETS[2].dark
        form?.backdrop.enabled = true
      }
    }
    // Each accent shows as it's picked or typed, once it's a color.
    .onChange(of: form?.valid == true ? form?.accents.draft : nil) { _, draft in if let draft { theme.setAccents(draft) } }
    .onDisappear { if let saved = loader.state.value { theme.setAccents(saved.themeAccents) } }
  }
}

private struct BrandingForm: View {
  @Binding var form: BrandingDraft
  @Environment(\.adminPalette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: Space.section) {
      VStack(alignment: .leading, spacing: Space.s3) {
        Text(Str.webBrandingTitle).textStyle(.base, weight: .semibold, tracking: .tight)
          .accessibilityAddTraits(.isHeader)
        Presets(form: $form.accents)
        ListBlock {
          ColorRow(title: Str.webBrandingModeLight, label: Str.webBrandingAccentLight, value: $form.accents.light)
          ColorRow(title: Str.webBrandingModeDark, label: Str.webBrandingAccentDark, value: $form.accents.dark)
        }
      }

      VStack(alignment: .leading, spacing: Space.s3) {
        ListSection(Str.webBrandingBackdropTitle) {
          MatineeKit.SwitchRow(Str.webBrandingBackdropEnabled, isOn: $form.backdrop.enabled)
          Group {
            SelectRow(
              Str.webBrandingBackdropArtwork, selection: $form.backdrop.artwork,
              options: LoginBackdropArtwork.knownValues.map { ($0, artworkName($0)) })
            SliderRow(
              title: Str.webBrandingBackdropBlur, value: Double(form.backdrop.blur),
              range: 0...Double(LOGIN_BACKDROP_MAX_BLUR), text: { Str.webBrandingBackdropBlurValue(String($0)) }
            ) { form.setBlur($0) }
            SliderRow(
              title: Str.webBrandingBackdropFade, value: Double(form.backdrop.fade), range: 0...100,
              text: { Str.webBrandingBackdropFadeValue(String($0)) }
            ) { form.setFade($0) }
          }
          .disabled(!form.backdrop.enabled)
        }
        Note(form.backdrop.enabled ? Str.webBrandingBackdropSource : Str.webBrandingBackdropPreviewOff)
      }
    }
  }
}

/// The starting points, Matinee's own first: each the light accent and the
/// dark one split on a diagonal, ringed when it's what the fields hold.
private struct Presets: View {
  @Binding var form: AccentDraft

  var body: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: TouchTarget, maximum: TouchTarget), spacing: 0)], spacing: 0) {
      ForEach(Array(ACCENT_PRESETS.enumerated()), id: \.offset) { index, preset in
        Swatch(
          light: preset.light, dark: preset.dark, selected: form.picked(preset),
          name: index == 0 ? Str.webBrandingDefault : "\(preset.light) / \(preset.dark)"
        ) {
          form.light = preset.light
          form.dark = preset.dark
        }
      }
    }
    // The first swatch's ring lines up with the page's edge, as the web's.
    .padding(.horizontal, -(TouchTarget - 32) / 2)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.webBrandingPresets)
  }
}

private struct Swatch: View {
  let light: String
  let dark: String
  let selected: Bool
  let name: String
  let action: () -> Void
  @Environment(\.adminPalette) private var palette

  var body: some View {
    Pressable(shape: Circle(), wash: false, action: action) {
      ZStack {
        Circle().fill(hexColor(dark))
        DiagonalHalf().fill(hexColor(light)).clipShape(Circle())
      }
      .frame(width: 32, height: 32)
      // `ring-2 ring-offset-2`, the page's background between the ring and the colors.
      .background { Circle().strokeBorder(selected ? palette.foreground : .clear, lineWidth: 2).padding(-4) }
      .frame(width: TouchTarget, height: TouchTarget)
      .contentShape(Circle())
    }
    .accessibilityLabel(name)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .adminMotion(MatineeKit.Motion.color, value: selected)
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

private func hexColor(_ hex: String) -> Color { MatineeKit.RGB(hex: hex)?.color ?? .clear }

/// An appearance's accent: its name, then the hex value with the color it
/// names beside it, as the web's HexColorInput. A value that isn't a color
/// yet turns the field red and holds the save.
private struct ColorRow: View {
  let title: String
  let label: String
  @Binding var value: String
  @Environment(\.adminPalette) private var palette

  var body: some View {
    let parsed = normalizeHex(value)
    VStack(alignment: .leading, spacing: Space.s2_5) {
      Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        .accessibilityHidden(true)
      HStack(spacing: Space.s2) {
        MatineeKit.MatineeTextField(
          "#rrggbb", text: Binding(get: { value }, set: { value = String($0.prefix(7)) }), isError: parsed == nil
        )
        .keyboardType(.asciiCapable)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.done)
        .accessibilityLabel(label)
        RoundedRectangle.kit(Radius.lg)
          .fill(parsed.map(hexColor) ?? .clear)
          .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.foreground.opacity(0.15)) }
          .frame(width: TouchTarget, height: TouchTarget)
          .accessibilityHidden(true)
          .adminMotion(MatineeKit.Motion.color, value: parsed)
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
  }
}

/// A number set by a slider, as the web's SliderRow: its name, then the
/// slider with what it's set to at its end.
private struct SliderRow: View {
  let title: String
  let value: Double
  let range: ClosedRange<Double>
  let text: (Int) -> String
  let onChange: (Double) -> Void
  @Environment(\.adminPalette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s1) {
      Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
        .accessibilityHidden(true)
      HStack(spacing: Space.s3) {
        MatineeKit.MatineeSlider(
          value: Binding(get: { value }, set: onChange), in: range, step: 1, label: title,
          valueText: { text(Int($0.rounded())) })
        Text(text(Int(value.rounded()))).textStyle(.xs).monospacedDigit().foregroundStyle(palette.mutedForeground)
          .frame(minWidth: 48, alignment: .trailing)
          .accessibilityHidden(true)
      }
    }
    .padding(.horizontal, Space.s4)
    .padding(.vertical, Space.s2_5)
  }
}

private func artworkName(_ id: String) -> String {
  switch id {
  case LoginBackdropArtwork.posters: Str.webBrandingBackdropArtworkPosters
  case LoginBackdropArtwork.thumbs: Str.webBrandingBackdropArtworkThumbs
  default: Str.webBrandingBackdropArtworkMixed
  }
}
