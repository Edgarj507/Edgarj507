// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "KaijuBlocks",
    platforms: [.iOS(.v16), .macOS(.v13)],
    targets: [
        .target(name: "KaijuBlocks", path: "KaijuBlocks"),
        .testTarget(name: "KaijuBlocksTests", dependencies: ["KaijuBlocks"], path: "KaijuBlocksTests")
    ]
)
