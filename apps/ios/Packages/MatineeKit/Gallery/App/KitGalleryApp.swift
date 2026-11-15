import MatineeKitGallery
import SwiftUI

/// The gallery, on its own. Launch arguments pick what it opens on, for
/// screenshots: `-page buttons -scheme dark -accent ember -locale de -rtl YES`.
/// On a TV it's the TV gallery, whose last page is the phone's.
@main
struct KitGalleryApp: App {
  var body: some Scene {
    WindowGroup {
      #if os(tvOS)
        TVKitGallery(launch: .fromArguments())
      #else
        KitGallery(launch: .fromArguments())
      #endif
    }
  }
}
