import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * AppearanceSettings.kt, drawn as the web's appearance panel
 * (appearance-panel.tsx, color-scheme-picker.tsx): the app's language, then
 * the color scheme as three miniatures of the app, in Matinee's colors with
 * the server's accent. Android 12 and later can take the wallpaper's
 * colors instead; iOS has nothing like it, so that switch isn't here. The
 * web has no palettes of its own to pick yet, only the accent the server's
 * admins choose, so neither has the app.
 *
 * The language is iOS's to pick, in the app's page of the Settings app, as
 * Android keeps it in its per-app language setting; the row says which it
 * is and opens that page.
 */

/// Settings' Appearance page.
struct AppearancePage: View {
  @Environment(ThemeStore.self) private var theme
  @Environment(\.api) private var api
  @Environment(\.offline) private var offline
  @Environment(\.openURL) private var openURL

  var body: some View {
    SettingsScaffold(Str.settingsPageAppearance) {
      ListSection(Str.webAppearanceLanguage) {
        ListRow(
          Str.webAppearanceLanguageTitle, subtitle: Str.iosAppearanceLanguageDescription, value: appLanguage
        ) {
          if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
        }
      }
      SettingsSection(Str.webAppearanceColorScheme) {
        SchemePicker(theme: theme)
      }
    }
    // An accent an admin changed since the app started comes in when the page opens.
    .task(id: offline) {
      if !offline, let api { await theme.pull(api) }
    }
  }

  /// The language the app shows, as iOS picked it from the person's and the app's, by its own name.
  private var appLanguage: String {
    languageName(Bundle.main.preferredLocalizations.first ?? "en")
  }
}

/// System, Light, and Dark as cards, each a miniature of the app in the
/// theme that mode shows; System splits the light and dark down the middle.
/// The picked one takes the accent's border and tint. VoiceOver reads them
/// as three choices, the picked one selected.
private struct SchemePicker: View {
  let theme: ThemeStore
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    // Side by side, as the web's `grid-cols-3`; at the accessibility sizes the
    // names no longer fit under a third of a phone, so the cards stack.
    let layout = dynamicType.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: Space.s2))
      : AnyLayout(HStackLayout(alignment: .top, spacing: Space.s2))
    layout {
      ForEach(ThemeMode.allCases, id: \.self) { mode in
        card(mode, light: theme.light, dark: theme.dark)
      }
    }
    .frame(maxWidth: 560, alignment: .leading)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Str.webAppearanceColorScheme)
  }

  private func card(_ mode: ThemeMode, light: ThemeColors, dark: ThemeColors) -> some View {
    let selected = theme.mode == mode
    let shape = RoundedRectangle.kit(Radius.xl)
    // At the accessibility sizes the cards stack, each its miniature beside its name.
    let layout = dynamicType.isAccessibilitySize
      ? AnyLayout(HStackLayout(spacing: Space.s3))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s2))
    return Pressable(shape: shape) {
      withMotion(Motion.color) { theme.setMode(mode) }
    } label: {
      layout {
        Group {
          switch mode {
          case .system:
            // The seam falls between the third and fourth posters; light stops
            // just past it, so its border doesn't show through dark's edge.
            AppMiniature(colors: light)
              .mask(alignment: .leading) {
                GeometryReader { proxy in Rectangle().frame(width: proxy.size.width / 2 + 1) }
              }
              .overlay {
                AppMiniature(colors: dark).mask(alignment: .trailing) {
                  GeometryReader { proxy in
                    Rectangle().frame(width: proxy.size.width / 2).frame(maxWidth: .infinity, alignment: .trailing)
                  }
                }
              }
          case .light: AppMiniature(colors: light)
          case .dark: AppMiniature(colors: dark)
          }
        }
        .frame(width: dynamicType.isAccessibilitySize ? 128 : nil)
        Text(label(mode))
          .textStyle(.xs, weight: .medium)
          .foregroundStyle(selected ? palette.foreground : palette.mutedForeground)
          .lineLimit(dynamicType.isAccessibilitySize ? nil : 1)
          .padding(.horizontal, Space.s0_5)
          .frame(maxWidth: dynamicType.isAccessibilitySize ? .infinity : nil, alignment: .leading)
      }
      .padding(Space.s1_5)
      .padding(.bottom, Space.s0_5)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(selected ? palette.accentSoft : palette.foreground.opacity(0.02), in: shape)
      .overlay { shape.strokeBorder(selected ? palette.accent : palette.border) }
      .contentShape(shape)
    }
    .motion(Motion.color, value: selected)
    .accessibilityLabel(label(mode))
    .accessibilityAddTraits(selected ? [.isSelected] : [])
  }

  private func label(_ mode: ThemeMode) -> String {
    switch mode {
    case .system: Str.webAppearanceColorSchemeSystem
    case .light: Str.webAppearanceColorSchemeLight
    case .dark: Str.webAppearanceColorSchemeDark
    }
  }
}

/// The home page in `colors`, as the web's AppMiniature: the floating bar
/// over the featured banner, the banner's words and buttons, and a row of
/// posters, each placed as a share of the miniature's size.
private struct AppMiniature: View {
  let colors: ThemeColors

  var body: some View {
    let page = colors.background
    let tint = colors.text.opacity(0.12)
    let shape = RoundedRectangle.kit(Radius.md)
    Color.clear
      .aspectRatio(16 / 10, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .background(page.color)
      .overlay {
        GeometryReader { proxy in
          let size = proxy.size
          ZStack(alignment: .topLeading) {
            // The banner's backdrop, veiled behind its words and faded into the page.
            ZStack {
              colors.borderStrong.color
              LinearGradient(
                colors: [page.opacity(0.95), page.opacity(0.6), page.opacity(0)], startPoint: .leading,
                endPoint: .trailing)
              LinearGradient(
                stops: [
                  .init(color: page.opacity(0), location: 0), .init(color: page.opacity(0.4), location: 0.65),
                  .init(color: page.color, location: 1),
                ], startPoint: .top, endPoint: .bottom)
            }
            .frame(width: size.width, height: size.height * 0.62)
            bar(size, page: page, tint: tint)
            pill(colors.textDim.color, size, x: 0.06, y: 0.21, width: 0.12, height: 0.025)
            pill(colors.text.color, size, x: 0.06, y: 0.26, width: 0.30, height: 0.07)
            pill(colors.textDim.color, size, x: 0.06, y: 0.36, width: 0.22, height: 0.025)
            HStack(spacing: size.width * 0.26 * 0.08) {
              Capsule().fill(colors.accent.color).frame(width: size.width * 0.26 * 0.54)
              Capsule().fill(tint)
            }
            .frame(width: size.width * 0.26, height: size.height * 0.08)
            .offset(x: size.width * 0.06, y: size.height * 0.42)
            pill(colors.textMuted.color, size, x: 0.06, y: 0.59, width: 0.14, height: 0.025)
            posters(size)
          }
        }
      }
      .clipShape(shape)
      .overlay { shape.strokeBorder(colors.border.color) }
      .accessibilityHidden(true)
  }

  private func pill(_ color: Color, _ size: CGSize, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat)
    -> some View
  {
    Capsule().fill(color)
      .frame(width: size.width * width, height: size.height * height)
      .offset(x: size.width * x, y: size.height * y)
  }

  /// The floating tab bar: the accent's dot, the open tab, two more, and the profile.
  private func bar(_ size: CGSize, page: RGB, tint: Color) -> some View {
    let height = size.height * 0.10
    return HStack(spacing: 0) {
      Circle().fill(colors.accent.color).frame(width: height * 0.5, height: height * 0.5)
      Spacer(minLength: 0)
      Rectangle().fill(tint).frame(width: 1, height: height * 0.5)
      Spacer(minLength: 0)
      Capsule().fill(tint)
        .frame(width: size.width * 0.42 * 0.22, height: height * 0.7)
        .overlay { Capsule().fill(colors.text.color).frame(width: size.width * 0.42 * 0.11, height: height * 0.21) }
      Spacer(minLength: 0)
      Capsule().fill(colors.textDim.color).frame(width: size.width * 0.42 * 0.14, height: height * 0.2)
      Spacer(minLength: 0)
      Capsule().fill(colors.textDim.color).frame(width: size.width * 0.42 * 0.14, height: height * 0.2)
      Spacer(minLength: 0)
      Rectangle().fill(tint).frame(width: 1, height: height * 0.5)
      Spacer(minLength: 0)
      Circle().fill(colors.borderEmphasis.color).frame(width: height * 0.7, height: height * 0.7)
    }
    .padding(.horizontal, size.width * 0.42 * 0.015 + 1)
    .frame(width: size.width * 0.42, height: height)
    .background(page.opacity(0.6), in: Capsule())
    .overlay { Capsule().strokeBorder(tint, lineWidth: 0.5) }
    .offset(x: size.width * 0.29, y: size.height * 0.05)
  }

  /// Six posters across the bottom, `aspect-[2/3]`, 6% in from each side.
  private func posters(_ size: CGSize) -> some View {
    let inner = size.width * 0.88
    let gap = inner * 0.036
    let width = (inner - gap * 5) / 6
    return HStack(spacing: gap) {
      ForEach(0..<6, id: \.self) { _ in
        RoundedRectangle(cornerRadius: 2, style: .circular).fill(colors.input.color)
          .frame(width: width, height: width * 1.5)
      }
    }
    .offset(x: size.width * 0.06, y: size.height * 0.65)
  }
}
