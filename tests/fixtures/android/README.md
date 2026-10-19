# Android fixtures

These fixtures define the parser boundary for Android declarations in [epic #50](https://github.com/arminazimi/evergreen/issues/50). The scope is the `android` block's `compileSdk`, `minSdk`, and `targetSdk` in `build.gradle` and `build.gradle.kts`; the Android Gradle Plugin and Kotlin plugin versions in `settings.gradle(.kts)`; and the version catalog in `libs.versions.toml`. Line numbers below are 1-based. The versions are parser examples only: **they do not claim that any Android API level, plugin, or library is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source ([epic #50](https://github.com/arminazimi/evergreen/issues/50), "Scope" and "Non-goals").

| Fixture file | Expected case |
| --- | --- |
| `positive/build.gradle` | `compileSdk 34` (line 7), `minSdk 21` (line 11), and `targetSdk 34` (line 12) inside `android` and `defaultConfig`. `namespace` (line 6), `versionCode` (line 13), and `versionName` (line 14) are not SDK declarations. |
| `positive/build.gradle.kts` | `compileSdk = 34` (line 7), `minSdk = 21` (line 11), and `targetSdk = 34` (line 12). `namespace` (line 6) is not an SDK declaration. |
| `positive/settings.gradle.kts` | The Android Gradle Plugin `com.android.application` version `8.5.2` (line 10) and the Kotlin Android plugin version `1.9.24` (line 11). `rootProject.name` (line 14) is not a declaration. |
| `positive/libs.versions.toml` | The `[versions]` entries `agp = "8.5.2"` (line 2) and `kotlin = "1.9.24"` (line 3). `androidx-core` (line 4) is a library version used through `version.ref` (line 7), and the plugin `android-application` (line 10) resolves its version from `agp`. |
| `negative/build.gradle` | A commented-out `compileSdk` (line 1) and `minSdk` (line 2), an unrelated `ext.buildTools` value (line 3), a `compileSdk` read from a variable (line 7), a `minSdk` read from a version catalog reference (line 10), a `targetSdk` interpolated from a variable (line 11), and a string that mentions `compileSdk` (line 12) produce no declarations. |
| `negative/build.gradle.kts` | A commented-out `compileSdk` (line 1) and `minSdk` (line 2), a `compileSdk` read from a variable (line 7), a `minSdk` read from a version catalog reference (line 10), a `targetSdk` read from a project property (line 11), and a string that mentions `targetSdk` (line 12) produce no declarations. |
| `negative/settings.gradle` | A commented-out plugin version (line 1), a commented-out Kotlin version (line 2), and unrelated `rootProject.name` and `include` keys (lines 3–4) produce no declarations. The plugin `com.android.application` at line 7 uses a variable version (`agpVersion`), so it has no literal version. |
| `negative/libs.versions.toml` | A commented-out `agp` (line 1), a note that mentions `agp` (line 3), a library whose `version.ref` points to a key that is not defined (line 6), and a plugin whose version is a template placeholder (line 9) produce no declarations. |
| `zero/build.gradle` | `compileSdk 35` (line 7), `minSdk 24` (line 11), and `targetSdk 35` (line 12): valid declarations, no lifecycle finding. |
| `zero/build.gradle.kts` | `compileSdk = 35` (line 7), `minSdk = 24` (line 11), and `targetSdk = 35` (line 12): valid declarations, no lifecycle finding. |
| `zero/settings.gradle.kts` | The plugin versions `8.7.0` (line 10) and `2.0.21` (line 11): valid declarations, no lifecycle finding. |
| `zero/libs.versions.toml` | The `[versions]` entries `agp = "8.7.0"` (line 2) and `kotlin = "2.0.21"` (line 3): valid declarations, no lifecycle finding. |
| `malformed/build.gradle.kts` | An unterminated string on `minSdk` (line 4) makes the file invalid Kotlin: no partial declarations, no error. |
| `malformed/libs.versions.toml` | An unterminated string on `agp` (line 2) makes the file invalid TOML: no partial declarations, no error. |

The zero fixtures are valid projects whose declarations are all supported, so they yield no lifecycle findings. Unclassified or lookalike values in the negative fixtures are not findings. Malformed fixtures are handled without an error or partial declarations.
