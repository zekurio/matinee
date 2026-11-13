import MatineeCore
import SwiftUI

@main
struct MatineeApp: App {
  @State private var theme = ThemeStore()
  @State private var viewer = ViewerState()

  var body: some Scene {
    WindowGroup {
      root
        .environment(theme)
        .environment(viewer)
        .measuresWindow()
        .matineeTheme(theme)
    }
  }

  /// The gallery in debug builds, until the shell (Root.swift) takes over.
  @ViewBuilder private var root: some View {
    #if DEBUG
      GalleryRoot()
    #else
      Logo(height: 32).frame(maxWidth: .infinity, maxHeight: .infinity)
    #endif
  }
}
