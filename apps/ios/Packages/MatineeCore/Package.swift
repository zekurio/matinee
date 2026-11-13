// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "MatineeCore",
  platforms: [.iOS(.v18), .macOS(.v15)],
  products: [.library(name: "MatineeCore", targets: ["MatineeCore"])],
  targets: [
    .target(name: "MatineeCore"),
    .testTarget(name: "MatineeCoreTests", dependencies: ["MatineeCore"]),
  ],
  swiftLanguageModes: [.v6]
)
