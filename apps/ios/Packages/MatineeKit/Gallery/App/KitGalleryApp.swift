import MatineeKitGallery
import SwiftUI

/// The gallery, on its own. Launch arguments pick what it opens on, for
/// screenshots: `-page buttons -scheme dark -accent ember -locale de -rtl YES`.
@main
struct KitGalleryApp: App {
  var body: some Scene {
    WindowGroup {
      KitGallery(launch: .fromArguments())
    }
  }
}
