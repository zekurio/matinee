// swift-tools-version: 6.2
import PackageDescription

/// MatineeKit's boundary tests by themselves, for the Mac: they read Swift
/// files and need none of the kit, which builds only for iOS and tvOS. The
/// tests are the kit's own files (Tests/MatineeKitBoundaryTests is a link to
/// them), so there's one copy. `just boundary` and `just tv-boundary` run
/// this; MatineeKit's README has the rest.
let package = Package(
  name: "MatineeKitBoundary",
  platforms: [.macOS(.v14)],
  targets: [
    .testTarget(
      name: "MatineeKitBoundaryTests",
      swiftSettings: [
        // As the kit's own test target.
        .defaultIsolation(MainActor.self),
        .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
        .enableUpcomingFeature("InferIsolatedConformances"),
      ]
    )
  ],
  swiftLanguageModes: [.v6]
)
