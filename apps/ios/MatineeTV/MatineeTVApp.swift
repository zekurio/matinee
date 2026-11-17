import MatineeCore
import MatineeKit
import Nuke
import SwiftUI
import UIKit

#if DEBUG
  import MatineeKitGallery
#endif

/*
 * The Apple TV app: MainActivity.kt's part for a TV, with TvRoot.kt in
 * UI/TVRoot.swift. One session, one theme, and one set of toasts, made at
 * launch and kept for the app's life, as the iPhone app's AppModel keeps
 * them. A TV has no downloads, so no offline mode and no background
 * transfers, and nothing for an app delegate to do.
 */
@Observable final class TVAppModel {
  let topShelf = TVTopShelf()
  let session: MatineeSession
  let theme = ThemeStore()
  /// The messages at the bottom of the screen, one host for the whole app (TVRoot.swift).
  let toasts = ToastState()

  init() {
    let store = SessionStore()
    #if DEBUG
      TVDevLaunch.prepare(store)
    #endif
    session = MatineeSession(store: store, deviceName: UIDevice.current.name)
    // A server removed takes its artwork along; the session forgets its token.
    let topShelf = self.topShelf
    session.onRemove = { _, _ in ImagePipeline.forgetAll(); topShelf.clear() }
  }
}

@main
struct MatineeTVApp: App {
  @State private var model = TVAppModel()

  var body: some Scene {
    WindowGroup {
      root
        .environment(model.topShelf)
        .onOpenURL { url in if TopShelfLink(url: url) != nil { model.topShelf.pending = url } }
        .environment(model.theme)
        .environment(model.session)
        .environment(model.toasts)
        // The TV's own light or dark, with the server's accents (Info.plist opts in to both).
        .matineeTheme(model.theme)
    }
  }

  @ViewBuilder private var root: some View {
    #if DEBUG
      // The kit's TV gallery, for checking the components on this TV: `-gallery YES`.
      if UserDefaults.standard.bool(forKey: "gallery") {
        TVKitGallery(launch: .fromArguments())
      } else {
        TVRoot()
      }
    #else
      TVRoot()
    #endif
  }
}
