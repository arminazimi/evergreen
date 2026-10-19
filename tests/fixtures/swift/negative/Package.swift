// Notes: this manifest once said swift-tools-version:4.0 (see git history).
import PackageDescription

// .package(url: "https://github.com/example/old", from: "0.9.0"),
let major = Int(ProcessInfo.processInfo.environment["MAJOR"] ?? "2") ?? 2
let libraryVersion = ProcessInfo.processInfo.environment["LIBRARY_VERSION"] ?? "1.0.0"
let banner = "Built with swift-tools-version:5.9"

let package = Package(
    name: "Negative",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(path: "../LocalKit"),
        .package(url: "https://github.com/example/library", from: Version(libraryVersion)!),
        .package(url: "https://github.com/example/other", from: "\(major).0.0"),
    ],
    targets: [
        .target(name: "Negative", dependencies: ["LocalKit"]),
    ]
)
