# Dart and Flutter

The `dart` detector reports Dart SDK releases that no longer receive security updates and pub packages that their publisher discontinued, as declared in `pubspec.yaml`, `pubspec.lock`, `.fvmrc`, and `.fvm/fvm_config.json`. It is **supported**: it is scored on the [public corpus](../VALIDATION.md) and held to the corpus precision and recall floors. Its lifecycle rules are in `registry/dart.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `pubspec.yaml` | `environment.sdk`, `environment.flutter`, and each direct `dependencies` entry that has a version constraint |
| `pubspec.lock` | The resolved `version` of each hosted package, and the `sdks.dart` and `sdks.flutter` constraints |
| `.fvmrc` | The top-level `flutter` pin written by FVM 3 |
| `.fvm/fvm_config.json` | The legacy top-level `flutterSdkVersion` pin. A `fvm_config.json` outside an `.fvm` directory is not read |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `.dart_tool`, `fixtures`, `__fixtures__`, and `testdata`. Dart, Flutter, FVM, and pub are never run, and nothing is fetched.

## What it reports

- A Dart SDK version written exactly (`sdk: 3.8.1`) that falls in a release line the [Dart security policy](https://dart.dev/security) no longer covers. Dart commits security updates only for the most recent stable release, so a line loses support the day the next one ships. Reported at **high** severity. Bundled rules cover Dart 3.0 through 3.12 and a catch-all for Dart 2 and older.
- A Dart SDK constraint (`>=2.17.0 <3.0.0`, `>=3.0.0 <3.5.0`) that can resolve **only** to end-of-support release lines, reported against the newest such line. A constraint that also admits a supported or unjudged line (`^3.11.0`, `>=3.8.0 <4.0.0`) is not reported as an old SDK.
- A Flutter version pinned exactly in `.fvmrc`, `.fvm/fvm_config.json`, `pubspec.yaml`, or `pubspec.lock`, when a reviewed rule covers it. The registry has no Flutter rules yet, so this produces findings only after one is added.
- A direct dependency in `pubspec.yaml`, or a hosted package resolved in `pubspec.lock`, on a pub package that the publisher marked discontinued on pub.dev, at the `pubspec.yaml` or `pubspec.lock` line that declares it.
- Where a package rule lists usage matchers, the `.dart` files that import the package and the calls those matchers name, with an impact summary.

Each finding carries its rule's source, replacement, migration steps, and verification commands. The SDK rules' steps raise the pin, raise the `environment.sdk` constraint, and align CI; their verification commands are `dart --version`, `dart pub get`, `dart analyze && flutter test`, and `dart analyze && dart test`.

## How versions are matched

- An exact version (a resolved `pubspec.lock` package, an FVM pin, or a constraint written without an operator) uses the first rule whose `vers` range contains it. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A Dart SDK constraint with an operator is matched only when every release line it allows is covered by an end-of-support rule; the finding uses the newest such rule.
- A package constraint with an operator (`^1.0.0`) is matched only against a rule that covers every version of that package, which is how a discontinued package is recorded.
- Packages are matched as `pkg:pub/<name>`, the Dart SDK as `pkg:generic/dart`, and the Flutter SDK as `pkg:generic/flutter`.

## What it intentionally does not judge

- A Dart SDK constraint that also admits a supported or unjudged line, as described above.
- `any`, empty values, and `${…}` templates.
- Dependencies that use `sdk: flutter`, `path:`, `git:`, or `hosted:` without a `version:`.
- `dev_dependencies` and `dependency_overrides` in `pubspec.yaml`. In `pubspec.lock` every hosted package is read, including transitive ones, because the lock file records what is resolved; `git`, `path`, and `sdk` sources are not.
- FVM release channels (`stable`, `beta`), Git references, and flavor pins.
- Vulnerability advisories, license policy, and whether a newer version of a package exists.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters) produce nothing, not partial results.

## Known limits and false-positive boundaries

- A discontinued package is reported at any version, because the notice is about the package, not a release. The package may still work; Evergreen reports that nobody is publishing it.
- Source usage is read from `.dart` files only. It follows `import 'package:…'` and `import 'dart:…'` directives (including `deferred as`), `as` prefixes (`prefix.target(`), and names listed in `show`. A bare import brings unknown names into scope, so its unqualified calls are not attributed. `export`, `part`, and conditional imports (`if (dart.library.io)`) are not followed.
- Nested block comments are not tracked, so code after a nested `/* /* */ */` may be read as live.
- `Function.apply` and, in a file that imports `dart:mirrors`, `reflect(`, `reflectClass(`, `reflectType(`, and `currentMirrorSystem(` are listed as unclassified rather than attributed to a package.
- Monorepos are scanned file by file; findings in `example/` or test packages are reported like any other.

## Evidence

The Dart corpus holds 75 repositories: 55 selected blind (73%), and the reviewed corpus expects 138 Dart findings across 31 repositories (including Dart findings declared in other ecosystems' pins). 18 Dart-bucket repositories have no expected finding of any detector. The selection rules and counts are in [Validation: Dart corpus](../validation/ecosystems.md#dart-corpus).
