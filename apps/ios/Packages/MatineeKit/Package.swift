// swift-tools-version: 6.2
import PackageDescription

/// The kit every Apple screen is built from: packages/ui drawn in SwiftUI,
/// as the Android app's ui/kit draws it in Compose. See README.md.
let swiftSettings: [SwiftSetting] = [
  // As the app: views and the state they own need no annotations.
  .defaultIsolation(MainActor.self),
  .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
  .enableUpcomingFeature("InferIsolatedConformances"),
]

let package = Package(
  name: "MatineeKit",
  defaultLocalization: "en",
  platforms: [.iOS(.v18), .tvOS(.v18)],
  products: [
    .library(name: "MatineeKit", targets: ["MatineeKit"]),
    .library(name: "MatineeKitGallery", targets: ["MatineeKitGallery"]),
  ],
  targets: [
    .target(
      name: "MatineeKit",
      resources: [.process("Resources")],
      swiftSettings: swiftSettings
    ),
    .target(
      name: "MatineeKitGallery",
      dependencies: ["MatineeKit"],
      swiftSettings: swiftSettings
    ),
    .testTarget(
      name: "MatineeKitBoundaryTests",
      swiftSettings: swiftSettings
    ),
  ],
  swiftLanguageModes: [.v6]
)
