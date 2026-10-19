// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Positive",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "positive", targets: ["Positive"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.0"),
        .package(url: "https://github.com/apple/swift-log.git", exact: "1.5.3"),
    ],
    targets: [
        .executableTarget(
            name: "Positive",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "Logging", package: "swift-log"),
            ]
        ),
    ]
)
