import SwiftUI

extension View {
  /// `theme` on one part of the screen, inside the one `.matineeTheme`
  /// set on the root: its palette in the environment and its accent as the
  /// tint, in the light or dark the root picked. For a page that belongs
  /// to another server than the one in use, as the sign-in page of a
  /// server being added shows that server's accent. Paints no background
  /// and leaves the color scheme alone, which only the root decides.
  public func matineePalette(_ theme: MatineeTheme) -> some View {
    modifier(ThemeScope(theme: theme))
  }
}

private struct ThemeScope: ViewModifier {
  let theme: MatineeTheme
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    let palette = Palette(theme.colors(for: scheme))
    content
      .environment(\.palette, palette)
      .tint(palette.accent)
      .foregroundStyle(palette.foreground)
  }
}
