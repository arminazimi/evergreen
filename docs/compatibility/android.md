---
title: Android detector
---

# Android detector

The detector's supported declarations, package URLs, what it reports, what it intentionally does not judge, and the false-positive boundaries. The matrix and policy it belongs to are on [Compatibility](../COMPATIBILITY.md).

## Android detector

The `android` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five public repositories are pinned for it in `benchmarks/public-repositories/` (four targeted, one blind). Its lifecycle rules are in `registry/android.json` and ship in the [data bundle](../DATA.md). The bundled rules cover Google Play Billing Library majors 5 through 9 and cite the [Google Play Billing Library version deprecation](https://developer.android.com/google/play/billing/deprecation-faq) timeline. Scans read that bundled registry only.

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `build.gradle`, `build.gradle.kts` | Literal `compileSdk`, `minSdk`, `targetSdk`, and `buildToolsVersion` inside an `android { }` block, including `defaultConfig`, product flavors, and build types | An API level is a bare or quoted integer (`34`, `"34"`, `= 34`). `buildToolsVersion` is a quoted dotted number (`"34.0.0"`). |
| `build.gradle`, `build.gradle.kts` | A string-notation Maven coordinate on `implementation`, `api`, `compileOnly`, `runtimeOnly`, `testImplementation`, `testRuntimeOnly`, `testCompileOnly`, `annotationProcessor`, `kapt`, `ksp`, `compile`, `runtime`, or `testCompile` | The form is `implementation("group:artifact:version")`, with or without the parentheses. An optional classifier or `@` packaging suffix is not part of the version. |
| `settings.gradle`, `settings.gradle.kts` | A literal `id(...) version "..."` pin (Groovy quotes work too) for `com.android.application`, `com.android.library`, or `org.jetbrains.kotlin.android` | `apply false` still counts. The pin is read wherever it appears in the file. |
| `libs.versions.toml` | `agp` and `kotlin` keys in the `[versions]` table, each a quoted literal version | The file is found by that name at any depth, including `gradle/libs.versions.toml`. |

Files are found by walking the repository up to eight directories deep, to at most 2,000 of these files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.gradle`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. Gradle is never run, and nothing is fetched.

### Package URLs

A string-notation dependency `group:artifact:version` is `pkg:maven/<group>/<artifact>`. An SDK setting is `pkg:generic/android/compileSdk`, `pkg:generic/android/minSdk`, `pkg:generic/android/targetSdk`, or `pkg:generic/android/buildToolsVersion`. An Android Gradle Plugin pin, in settings or the catalog `agp` key, is `pkg:generic/android/agp`. `org.jetbrains.kotlin.android` in settings is `pkg:generic/android/kotlin-android`. The catalog `kotlin` key is `pkg:generic/android/kotlin`, a different identity from the settings plugin.

### What it reports

- A string-notation `com.android.billingclient:billing` version that a bundled rule contains. The rules cover majors 5, 6, 7, 8, and 9.
- An SDK level, Android Gradle Plugin version, Kotlin Android plugin version, or catalog `agp` / `kotlin` pin when a rule for that Package URL contains the version text. No such rules are bundled, so those declarations produce no finding today.

The first matching rule wins. A rule whose VERS is malformed, or whose comparison throws, is skipped and does not hide a later rule. Each finding names the file and line, and carries its rule's source, replacement, deadline, migration guidance, and verification commands. A rule that lists usage matchers also lists `.java` and `.kt` usages. The bundled Play Billing rules do not list matchers, so those findings point at the declaration only.

### What it intentionally does not judge

- SDK levels, plugin versions, catalog pins, and Maven coordinates with no rule in `registry/android.json`. A missing finding is not evidence that a version meets Google Play's target API requirement or that a dependency is current.
- JDK pins in the same Gradle file (`sourceCompatibility`, `targetCompatibility`, `jvmToolchain`, `JavaLanguageVersion`). The Java and Kotlin detector reads those.
- Legacy names `compileSdkVersion`, `minSdkVersion`, and `targetSdkVersion`, method calls such as `compileSdk(34)`, and receiver forms such as `ext.minSdk`.
- Values outside an `android { }` block, property references, version-catalog calls, and `$` interpolation.
- Plugin versions written in `build.gradle(.kts)`, `alias(libs.plugins…)` lines, `kotlin("android") version "…"`, the chained `id("…").version("…")` form, and plugin ids other than `com.android.application`, `com.android.library`, and `org.jetbrains.kotlin.android`.
- Catalog keys other than `agp` and `kotlin`, and any version outside `[versions]`, including a `[plugins]` `version` or `version.ref`.
- Map notation (`group:`, `name:`, `version:`), version-catalog library aliases such as `implementation(libs.billing)`, and configuration names outside the list above, such as `debugImplementation` and `androidTestImplementation`.
- Dynamic and ranged versions (`8.+`, `latest.release`, `[8.0, 9.0)`) on plugin and catalog pins.
- Vulnerability advisories and license policy.

### Known limits and false-positive boundaries

- A literal inside `android { }` is reported when a rule matches it, including a product flavor or build type, and including a script the project no longer applies. Evergreen does not ask Gradle which variant is live.
- A plugin pin is read anywhere in `settings.gradle(.kts)`, including `pluginManagement` and a line marked `apply false`.
- String-notation test configurations are judged the same way as `implementation`.
- A catalog `kotlin` pin and the settings Kotlin Android plugin do not share a Package URL. A rule for one does not match the other.
- An unterminated comment or string, or a Kotlin string template the scanner cannot pair, makes that parser return nothing for the whole file. A `libs.versions.toml` with a multi-line string (`"""` or `'''`) does the same.
- Malformed input produces no declarations from the affected file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single line over 4,096 characters is skipped. Each parser keeps at most 5,000 declarations from one file.
- The eight-level and 2,000-file limits are silent. Files beyond them, and any under `build`, `.gradle`, or another skipped directory, are not scanned.
- A plugin or catalog value that is not a literal version is omitted. A string-notation coordinate is kept and compared as the version text written in the file. The analysis reports no unclassified references.
