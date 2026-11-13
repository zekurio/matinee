import MatineeCore
import SwiftUI
import UIKit

/*
 * AppearanceSettings.kt: the color scheme as three miniatures of the app,
 * in Matinee's colors with the server's accent, as the web's. Android 12
 * and later can take the wallpaper's colors instead; iOS has nothing like
 * it, so that switch isn't here. Above it, as the web has it, the app's
 * language, which iOS keeps in the Settings app as Android keeps it in its
 * per-app language setting.
 */

/// Settings' Appearance page.
struct AppearancePage: View {
  @Environment(ThemeStore.self) private var theme
  @Environment(\.api) private var api
  @Environment(\.offline) private var offline
  @Environment(\.openURL) private var openURL

  var body: some View {
    SettingsScaffold(Str.settingsPageAppearance) {
      SettingsSection(Str.webAppearanceLanguage) {
        Panel {
          LinkRow(
            Str.webAppearanceLanguageTitle, value: appLanguage,
            description: Str.iosAppearanceLanguageDescription
          ) {
            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
          }
        }
      }
      SettingsSection(Str.webAppearanceColorScheme) {
        // The miniatures are drawn to a phone's width; across an iPad they keep it.
        SchemePicker(theme: theme).frame(maxWidth: 520, alignment: .leading)
      }
    }
    // An accent an admin changed since the app started comes in when the page opens.
    .task(id: offline) {
      if !offline, let api { await theme.pull(api) }
    }
  }

  /// The language the app shows, as iOS picked it from the person's and the app's.
  private var appLanguage: String {
    languageName(Bundle.main.preferredLocalizations.first ?? "en")
  }
}

/// System, Light, and Dark, each a miniature of the app in the theme that mode shows.
private struct SchemePicker: View {
  let theme: ThemeStore
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      ForEach(ThemeMode.allCases, id: \.self) { mode in
        let selected = theme.mode == mode
        let shape = PanelShape
        Button {
          withMotion(Motion.color) { theme.setMode(mode) }
        } label: {
          VStack(alignment: .leading, spacing: 8) {
            switch mode {
            case .system:
              Miniature(colors: theme.light)
                .overlay {
                  // Dark takes the right half.
                  Miniature(colors: theme.dark).mask(alignment: .trailing) {
                    GeometryReader { proxy in
                      Rectangle().frame(width: proxy.size.width / 2).frame(maxWidth: .infinity, alignment: .trailing)
                    }
                  }
                }
            case .light: Miniature(colors: theme.light)
            case .dark: Miniature(colors: theme.dark)
            }
            Text(label(mode)).textStyle(.labelMedium)
              .foregroundStyle(selected ? palette.foreground : palette.muted)
              .lineLimit(2)
              .minimumScaleFactor(0.8)
              .padding(.horizontal, 2)
          }
          .padding(6)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(selected ? palette.accentSoft : palette.foreground.opacity(0.02), in: shape)
          .overlay { shape.strokeBorder(selected ? palette.accent : palette.border) }
          .contentShape(shape)
        }
        .buttonStyle(RoundPress())
        .accessibilityLabel(label(mode))
        .accessibilityAddTraits(selected ? [.isSelected] : [])
      }
    }
  }

  private func label(_ mode: ThemeMode) -> String {
    switch mode {
    case .system: Str.webAppearanceColorSchemeSystem
    case .light: Str.webAppearanceColorSchemeLight
    case .dark: Str.webAppearanceColorSchemeDark
    }
  }
}

/// The home page in `colors`: the floating bar over the banner, its button, and a row of posters.
private struct Miniature: View {
  let colors: ThemeColors

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: 8, style: .continuous)
    Color.clear
      .aspectRatio(16 / 10, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .background(colors.background.color)
      .overlay {
        GeometryReader { proxy in
          ZStack(alignment: .topLeading) {
            LinearGradient(
              colors: [colors.borderStrong.color, colors.background.color], startPoint: .top, endPoint: .bottom
            )
            .frame(height: proxy.size.height * 0.6)
            Capsule()
              .fill(colors.background.opacity(0.6))
              .overlay { Capsule().strokeBorder(colors.text.opacity(0.12), lineWidth: 0.5) }
              .frame(width: proxy.size.width * 0.42, height: 6)
              .frame(maxWidth: .infinity)
              .padding(.top, 4)
            VStack(alignment: .leading, spacing: 3) {
              Capsule().fill(colors.text.color).frame(width: 22, height: 3)
              Capsule().fill(colors.accent.color).frame(width: 14, height: 5)
            }
            .padding(.leading, 6)
            .frame(maxHeight: .infinity)
            HStack(spacing: 3) {
              ForEach(0..<5, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 2).fill(colors.surfaceRaised.color).frame(width: 9, height: 13)
              }
            }
            .padding(5)
            .frame(maxHeight: .infinity, alignment: .bottom)
          }
        }
      }
      .clipShape(shape)
      .overlay { shape.strokeBorder(colors.border.color) }
      .accessibilityHidden(true)
  }
}
