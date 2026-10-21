# Swift

The `swift` detector reports Xcode pins and iOS app deployment targets that App Store Connect no longer accepts, as declared in `.xcode-version` and an application's `project.pbxproj`. It is **beta**: findings were checked against ground truth on enough repositories to measure them, and the precision floor in `benchmarks/thresholds.json` is enforced. The maturity rules are in [Decision 0013](../decisions/0013-detector-maturity.md).

## What it reads

| File | Declaration |
| --- | --- |
| `.xcode-version` | One pinned Xcode release on a line by itself, such as `15.4` or `14.2.0` |
| `.swift-version` | One pinned Swift release on a line by itself, such as `5.9` or `5.9.2` |
| `Package.swift` | The `swift-tools-version` comment on line 1, and direct `.package(url:…, from:…)` / `.package(url:…, exact:…)` dependencies with a literal version string |
| `Package.resolved` | Each pin under `pins` with a non-empty `identity` and a `state.version` string (SwiftPM lockfile v2) |
| `*.xcodeproj/project.pbxproj` | `IPHONEOS_DEPLOYMENT_TARGET` on build configurations of application targets (`com.apple.product-type.application`) |

Blank lines and `#` comments in a toolchain file are ignored. A file with more than one pin, or any non-release token (`latest`, `stable`), produces nothing. Block and line comments and string literals are stripped before `.package` calls are read. `path:`, `branch:`, `revision:`, range / `.upToNextMajor` requirements, multi-line `.package` calls, platform minimums (`.iOS(.v13)` and friends), and interpolated or `Version(…)` values are ignored. Pins with only `branch` / `revision`, the legacy v1 `object.pins` shape, and non-version pins produce nothing. Frameworks, static libraries, extensions, and other product types are skipped. Project-level settings, `$(…)` references, and non-numeric deployment targets are ignored.

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. A `project.pbxproj` is read only when it sits inside a directory whose name ends with `.xcodeproj`. Swift, SwiftPM, and Xcode are never run, and nothing is fetched.

## What it reports

- An `.xcode-version` pin that App Store Connect no longer accepts. The bundled rules cover Xcode older than 15 (deadline 2024-04-29) and Xcode 15 through 25 (deadline 2026-04-28), citing [App Store upcoming requirements](https://developer.apple.com/news/upcoming-requirements/).
- An application target whose `IPHONEOS_DEPLOYMENT_TARGET` is below iOS 13. The bundled rule cites the [iOS and iPadOS minimum system requirements](https://developer.apple.com/news/upcoming-requirements/?id=0992026a) (deadline 2026-09-09).
- A `Package.swift` `exact:` pin or a `Package.resolved` version when a rule for that SwiftPM identity's `vers` contains the version. A `from:` requirement is reported only by a rule that covers every version of the package. There are no bundled package rules yet.
- A `.swift-version` or `swift-tools-version` pin when a rule for `pkg:generic/swift` contains that version. There are no such bundled rules yet.

Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A package finding whose rule lists usage matchers also lists the `.swift` files that `import` that module and the qualified calls those matchers name. The finding's impact counts those usages, and a migration packet lists the files. Toolchain and App Store findings point at the pin or deployment-target line only.

## What it intentionally does not judge

- Xcode releases, Swift toolchain lines, iOS deployment targets, and SwiftPM packages with no rule in `registry/swift.json`. A missing finding is not evidence that a version is current.
- A `.xcode-version` or `.swift-version` value of `latest` or `stable`, a template, or a value that interpolates at runtime.
- Platform minimums in `Package.swift` (`platforms: [.iOS(.v12)]` and similar). Those declare a library's supported OS floor, not an App Store upload target.
- Deployment targets on non-application Xcode targets (frameworks, libraries, extensions, tests), including `TVOS_DEPLOYMENT_TARGET`.
- `path:`, `branch:`, `revision:`, range, and `.upToNextMajor` / `.upToNextMinor` package requirements; multi-line `.package` calls; and dynamic version expressions.
- The legacy `Package.resolved` v1 shape.
- Vulnerability advisories and license policy.

## Known limits and false-positive boundaries

- An `.xcode-version` pin is reported whatever the project actually builds with. A stale pin that CI no longer uses still produces a finding.
- The App Store Xcode rules apply to uploads to App Store Connect. A Swift package that never ships an app can still pin an old Xcode for local builds and be reported.
- The iOS deployment-target rule names only application targets. A shared framework that still declares an older minimum is not reported, even when an app links it.
- Package identity is the lowercased last path segment of the http(s) URL without `.git`. A `file://` or relative URL has no identity and never matches. A renamed repository matches only under the identity SwiftPM recorded.
- Malformed input produces no declarations from the affected unit, never a partial result, and no error is raised. For `.xcode-version`, `.swift-version`, `Package.swift`, `Package.resolved`, and `project.pbxproj` that unit is the whole file. A toolchain or package file over 1 MiB yields nothing; a `project.pbxproj` over 16 MiB yields nothing. A single line over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under `vendor` or a skipped directory, are not scanned.
- Source usage reads `.swift` files. An `import Module` (including `@testable` and similar attributes) matches a rule whose module is that name. A call matches when the rule names the qualified form. Usage is not a Swift AST: it is regex-based matching, so unusual formatting can miss an import or call.
- Runtime Objective-C lookup forms (`NSClassFromString`, `NSProtocolFromString`, `NSSelectorFromString`, `Selector(…)`, `objc_getClass`, `sel_registerName`, `dlsym`) are listed as unclassified, with their file and line. Evergreen does not guess which type they resolve to.
- Usage is not read under `vendor`, `fixtures`, `__fixtures__`, or `testdata`. Comments and ordinary strings are not usages. A single source line over 4,096 characters is skipped for usage scanning, matching the declaration parsers.

## Data

The rules are in `registry/swift.json` and ship in the [data bundle](../DATA.md). The importer `swift-1` drafts Xcode upload-floor rules from Apple's App Store upcoming-requirements listing; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Thirteen public repositories at pinned commits cover the detector: six targeted (Formalist, Troop, xc, L10nLint, simperium-ios, and JohnSundell/Files) and seven chosen blind by the rule in [Validation](../VALIDATION.md#swift-blind-selection) (swift-paperless, SwiftStreamingMarkdown, mvi-swift, Stevenson, TvOSMoreButton, TM-SGNL-iOS, and BudouX.swift). Each expected finding was reviewed by hand against the file at that commit. Precision and recall are measured on the full public corpus and recorded with the beta promotion in `benchmarks/thresholds.json`.
