// swift-tools-version: 6.2
import PackageDescription

/// The boundary tests, which hold both apps' screens to MatineeKit. A
/// package of their own, for the Mac: they read Swift files and need none of
/// the kit, which builds only for iOS and tvOS. `just boundary` runs them.
let package = Package(
  name: "MatineeKitBoundary",
  platforms: [.macOS(.v14)],
  targets: [
    .testTarget(
      name: "MatineeKitBoundaryTests",
      swiftSettings: [
        .defaultIsolation(MainActor.self),
        .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
        .enableUpcomingFeature("InferIsolatedConformances"),
      ]
    )
  ],
  swiftLanguageModes: [.v6]
)
