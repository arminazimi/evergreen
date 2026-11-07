---
title: Detector layouts
---

{% raw %}
# Detector layouts

The layout each built-in detector follows: one pure parser per file type, rules from a bundled registry, and a documented boundary. The authoring guide starts at [Detector authoring](../DETECTORS.md).

## Ruby detector layout

The Ruby detector is a useful example of the layout a built-in detector follows. Its entry point, `src/detectors/ruby/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-ruby-runtime.ts`, `parse-gemfile.ts`, `parse-gemfile-lock.ts`, and `parse-gemspec.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/ruby.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A runtime pin uses the first rule whose `vers` range contains the version. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A `Gemfile` gem is matched only against rules that cover every version, while a `Gemfile.lock` gem is matched against any rule for that gem name.
- Gem rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the Ruby files that import or call the gem. A `require`, `load`, `gem`, or `autoload` whose argument is not a string literal is unclassified. `require_relative` is never unclassified. Qualified calls without parentheses (for example `JSON.parse text`) are not matched.

The user-facing list of supported forms and limits for this detector is in [Compatibility](../compatibility/ruby.md#ruby-detector).

## PHP detector layout

The PHP detector follows the same layout. Its entry point, `src/detectors/php/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-php-runtime.ts`, `parse-composer-json.ts`, and `parse-composer-lock.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/php.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A runtime pin uses the first rule whose `vers` range contains the version. A constraint that is not a concrete version (for example `>=7.4` or `^8.2`) is skipped, and a rule whose `vers` is malformed is skipped, so neither hides a later rule.
- A `composer.json` package is matched only against rules that cover every version of the package, while a `composer.lock` package is matched against any rule whose `vers` contains the resolved version. An `abandoned` flag in the lockfile is recorded by the parser and is not itself a finding.
- Package rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the `.php` files that `require` or `include` that package and the qualified calls those matchers name. A `require` or `include` whose argument is not a string literal is unclassified, as is `new $class` or `$class::method()`. Runtime end-of-life rules do not name source usages.

The user-facing list of supported forms and limits for this detector is in [Compatibility](../compatibility/php.md#php-detector).

## Android detector layout

The Android detector follows the same layout. Its entry point, `src/detectors/android/index.ts`, finds the files, reads them, and matches each declaration to a rule. Pure parsers sit beside it: `parse-build-gradle.ts` for SDK settings, `parse-settings-gradle.ts` for plugin pins, and `parse-libs-versions-toml.ts` for the version catalog. String-notation Maven dependencies in `build.gradle` and `build.gradle.kts` come from the Java detector's `parse-gradle.ts`; this detector keeps only those dependency declarations.

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/android.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A declaration uses the first rule whose `vers` range contains the version text. A rule whose `vers` is malformed, or whose comparison throws, is skipped, so it does not hide a later rule.
- An SDK setting matches `pkg:generic/android/<kind>` (`compileSdk`, `minSdk`, `targetSdk`, `buildToolsVersion`). An Android Gradle Plugin pin, in settings or the catalog `agp` key, matches `pkg:generic/android/agp`. `org.jetbrains.kotlin.android` in settings matches `pkg:generic/android/kotlin-android`. The catalog `kotlin` key matches `pkg:generic/android/kotlin`. A string-notation dependency matches `pkg:maven/<group>/<artifact>`.
- Property references, method calls, version-catalog lookups, and `$` interpolation produce no declaration. The analysis reports no unclassified references.
- A rule that lists usage matchers uses `analyzeSourceUsage` for `.java` and `.kt` files. The bundled Play Billing rules do not list matchers, so those findings point at the declaration only.

The user-facing list of supported forms and limits for this detector is in [Compatibility](../compatibility/android.md#android-detector).

## CI runner images detector layout

The CI runner images detector follows the same layout. Its entry point, `src/detectors/ci-images/index.ts`, finds the files, reads them, and matches Azure hosted-image labels to a rule. One pure parser per file type sits beside it (`parse-gitlab-ci.ts`, `parse-circleci.ts`, and `parse-azure-pipelines.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/ci-images.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An Azure `pool.vmImage` label of the form `ubuntu-<version>`, `macos-<version>`, or `windows-<version>` matches `pkg:generic/azure-pipelines/<family>-image` with an `intdot` version. Every rule whose `vers` range contains that version is reported. A label with an architecture suffix, or any other shape, is not matched.
- GitLab `image` and `services` values are always unclassified. CircleCI returns orbs, dynamic values, and floating aliases as unclassified; a literal CircleCI image is not matched, because this version has no CircleCI Package URL mapping.
- `latest`, `*-latest`, variables, and template expressions produce no finding. There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Compatibility](../compatibility/ci-runner-images.md#ci-runner-images-detector).

## Dart detector layout

The Dart detector follows the same layout. Its entry point, `src/detectors/dart/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-pubspec.ts`, `parse-pubspec-lock.ts`, and `parse-fvm.ts`):

- Rules come from `registry/dart.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An exact version (a `pubspec.lock` package, an FVM pin, or a constraint without an operator) uses the first rule whose `vers` range contains it. A constraint with an operator is matched only against rules that cover every version of that package. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- Rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the `.dart` files that import the package and the calls those matchers name. `Function.apply` and `dart:mirrors` reflection are unclassified.

The user-facing list of supported forms and limits for this detector is in [Dart and Flutter](dart.md).

## Database runtimes detector layout

The database detector reuses what the container and Terraform detectors already parse. Its entry point, `src/detectors/database/index.ts`, finds Compose and `*.tf` files, reads them, and matches each declaration to a rule. Two pure parsers sit beside it: `parse-compose.ts` filters the shared Compose image parser to database images, and `parse-terraform.ts` reads `engine` and `engine_version` with the shared HCL scanner:

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/database.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A full version uses the first rule whose `vers` range contains it. A partial version (`12`, `5.7`) matches a rule only when the rule contains both ends of what the partial version could mean. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- Each product maps to one Package URL (`pkg:generic/postgresql`, `mysql`, `mariadb`, `redis`, `mongodb`). There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Database runtimes](database.md).

## Shell and PowerShell detector layout

The shell detector reads PowerShell declarations and the PowerShell image tags in workflow files. Its entry point, `src/detectors/shell/index.ts`, finds `*.ps1`, `*.psm1`, `*.psd1`, and `.github/workflows` files, reads them, and matches each declaration to a rule. Two pure parsers sit beside it: `parse-powershell.ts` is a bounded lexical reader for `#Requires -Version` and `PowerShellVersion`, and `parse-workflow.ts` reads `shell:` values and pinned PowerShell or Bash images from workflow YAML.

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/shell.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- Matching works as in the database detector: a full version uses the first rule whose `vers` range contains it, and a partial version matches only when the rule contains both ends of what it could mean.
- All rules use one Package URL, `pkg:generic/powershell`. Shell names and Bash images are parsed but produce no findings. There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Shell and PowerShell](shell.md).

## Terraform detector layout

The Terraform detector follows the same layout. Its entry point, `src/detectors/terraform/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-terraform.ts`, `parse-lock.ts`, and `parse-version-files.ts`), on top of the shared bounded scanner in `hcl.ts`:

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/terraform.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An exact version (a version file, a lock entry, or a constraint without an operator) uses the first rule whose `vers` range contains it. A `~> X.Y.Z` constraint matches a rule that contains both ends of that minor line. Any other constraint is matched only against rules that cover every version. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- The Terraform CLI is `pkg:generic/terraform` and a provider is `pkg:generic/terraform-provider/<namespace>/<name>`. There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Terraform](terraform.md).

## Swift detector layout

The Swift detector follows the same layout. Its entry point, `src/detectors/swift/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-swift-toolchain.ts`, `parse-package-swift.ts`, `parse-package-resolved.ts`, and `parse-xcode-project.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/swift.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An exact pin (`.xcode-version`, `.swift-version`, `swift-tools-version`, `exact:` in `Package.swift`, a `Package.resolved` version, or an app-target `IPHONEOS_DEPLOYMENT_TARGET`) uses the first rule whose `vers` range contains the version. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A `from:` requirement in `Package.swift` is matched only against rules that cover every version of that package. Package identity is the lowercased repository name without `.git`, matching what SwiftPM writes in `Package.resolved`.
- The iOS deployment target is read only from application targets in `project.pbxproj` (`com.apple.product-type.application`), so a library or a `platforms:` minimum in `Package.swift` never produces that finding.
- Package rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the `.swift` files that `import` that module and the qualified calls those matchers name. Runtime Objective-C lookup forms (`NSClassFromString`, `Selector(…)`, and similar) are unclassified. Toolchain and App Store rules do not name source usages.

The user-facing list of supported forms and limits for this detector is in [Swift](swift.md).

## C and C++ detector layout

The C and C++ detector follows the same layout. Its entry point, `src/detectors/cpp/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per manifest sits beside it (`parse-cmakelists.ts`, `parse-conan.ts`, and `parse-vcpkg.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/cpp.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A declaration with a version uses the first rule whose `vers` range contains that version. A rule whose `vers` is malformed, or whose comparison throws, is skipped, so it does not hide a later rule.
- A vcpkg dependency with no `version>=` matches only a rule that covers every version of that package. `cmake_minimum_required` matches `pkg:generic/cmake`. A Conan requirement matches `pkg:conan/<name>`. A vcpkg dependency matches `pkg:vcpkg/<name>`. Language standards, compiler checks, and `builtin-baseline` match the generic Package URLs named in the detector.
- Generator and module rules are not matched yet: the CMake parser does not emit those declarations. There is no source-usage pass.

The detector is supported. Its public corpus and the user-facing list of supported forms, lifecycle data sources, and limits are in [C and C++](cpp.md) and [Compatibility](../compatibility/cpp.md#c-and-c-detector).

## Serverless runtimes detector layout

The Serverless runtimes detector follows the same layout. Its entry point, `src/detectors/serverless/index.ts`, finds the files, reads them, and matches each literal runtime identifier to a rule. One pure parser per file type sits beside it (`parse-template.ts`, `parse-serverless-yml.ts`, and `parse-tf.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/serverless.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- Each literal identifier is tried against `pkg:generic/aws-lambda-runtime/<id>` and `pkg:generic/google-cloud-functions-runtime/<id>`. The first rule whose VERS range contains the identifier wins. A rule whose VERS is malformed is skipped, so it does not hide a later rule.
- CloudFormation tags (`!Ref`, `!Sub`), Serverless `${…}` interpolations, Terraform `var` / `local` / interpolation values, and floating aliases such as `latest` produce no declaration.
- There is no source-usage pass: a runtime finding points at the declaration only.

The user-facing list of supported forms and limits for this detector is in [Serverless runtimes](serverless.md).

{% endraw %}
