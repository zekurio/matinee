// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "MatineeMPV",
  platforms: [.iOS(.v18), .tvOS(.v18), .macOS(.v15)],
  products: [.library(name: "MatineeMPV", targets: ["MatineeMPV"])],
  dependencies: [
    .package(path: "../MatineeCore"),
    .package(url: "https://github.com/LePips/MPVUI", exact: "0.10.0"),
  ],
  targets: [
    .target(name: "MatineeMPV", dependencies: ["MatineeCore", .product(name: "MPVUI", package: "MPVUI")]),
    .testTarget(name: "MatineeMPVTests", dependencies: ["MatineeMPV", "MatineeCore"]),
  ])
