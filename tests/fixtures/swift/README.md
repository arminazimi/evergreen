# Swift and Apple toolchain fixtures

These fixtures define the parser boundary for Swift and Apple toolchain declarations in [issue #431](https://github.com/arminazimi/evergreen/issues/431). The scope is the `swift-tools-version` line and dependency declarations in `Package.swift`; the pinned package versions in `Package.resolved`; and the `.swift-version` and `.xcode-version` files. Line numbers below are 1-based. The versions are parser examples only: **they do not claim that any Swift tools version, Xcode version, or package is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source. The `revision` values in `Package.resolved` are placeholder hashes, not real commits.

| Fixture file | Expected case |
| --- | --- |
| `positive/Package.swift` | `swift-tools-version:5.9` (line 1) is the tools version. Dependencies `from: "1.2.0"` (line 11) and `exact: "1.5.3"` (line 12) are direct declarations. `platforms` (line 6), `products` (lines 7–8), and `.product(...)` target references (lines 18–19) are not version declarations. |
| `positive/Package.resolved` | Resolved pins `swift-argument-parser` at version `1.2.3` (line 9) and `swift-log` at version `1.5.3` (line 18). The top-level `"version" : 2` (line 22) is the file format version, not a package version. |
| `positive/.swift-version` | The pinned Swift version `5.9` (line 1). |
| `positive/.xcode-version` | The pinned Xcode version `15.4` (line 1). |
| `negative/Package.swift` | The tools-version text in a comment (line 1) and in a string (line 7), a commented `.package` declaration (line 4), `name` (line 10) and `platforms` (line 11) as unrelated keys, a local `path:` dependency with no version (line 13), and version values computed at runtime (`Version(libraryVersion)!` on line 14, `"\(major).0.0"` on line 15) produce no declarations with a literal version. |
| `negative/Package.resolved` | A pin tracking `branch` `main` with a revision and no version (lines 8–9), an identity that looks like a version, `swift-nio-2.0` (line 13), with no `state.version`, and a `fileSystem` pin with no version (line 21) produce no pinned version. |
| `negative/.swift-version` | `latest` (line 1) is not a pinned version. |
| `negative/.xcode-version` | A comment that mentions `15.4` (line 1) and `stable` (line 2) are not pinned versions. |
| `zero/Package.swift` | `swift-tools-version:6.0` (line 1) and the dependency `from: "1.3.0"` (line 8): valid declarations, no lifecycle finding. |
| `zero/Package.resolved` | The pin `swift-argument-parser` at version `1.3.0` (line 9): a valid declaration, no lifecycle finding. |
| `zero/.swift-version` | The pinned Swift version `6.0` (line 1): a valid declaration, no lifecycle finding. |
| `zero/.xcode-version` | The pinned Xcode version `26.0` (line 1): a valid declaration, no lifecycle finding. It is at or above the current App Store minimum, so no curated Xcode rule covers it. |
| `malformed/Package.swift` | The tools-version (line 1) is valid. The dependency on line 7 has an unterminated string and an unclosed call: no partial declaration, no error. |
| `malformed/Package.resolved` | Truncated JSON. The file ends inside the `state` object (line 9), so it is not valid JSON: no partial pins, no error. |
| `malformed/.swift-version` | `five-point-nine` (line 1) is not a version: no declaration, no error. |
| `malformed/.xcode-version` | An empty file (0 bytes): no declaration, no error. |

The zero fixtures are valid projects whose declarations are all supported, so they yield no lifecycle findings. Lookalike and dynamic values in the negative fixtures are not findings. Malformed fixtures are handled without an error or partial declarations.
