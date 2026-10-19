# Dart and Flutter fixtures

These fixtures define the parser boundary for Dart and Flutter declarations in [epic #53](https://github.com/arminazimi/evergreen/issues/53). The scope is the `environment` SDK constraints and direct dependencies in `pubspec.yaml`; the resolved packages and SDK constraints in `pubspec.lock`; and the Flutter version pinned by FVM in `.fvmrc` or `.fvm/fvm_config.json`. Line numbers below are 1-based. The versions are parser examples only: **they do not claim that any Dart SDK, Flutter release, or package is end of life or deprecated.** A lifecycle finding needs a reviewed rule with an authoritative source ([epic #53](https://github.com/arminazimi/evergreen/issues/53), “Scope” and “Non-goals”).

| Fixture file | Expected case |
| --- | --- |
| `positive/pubspec.yaml` | The Dart SDK constraint `>=2.19.0 <3.0.0` (line 7) and the Flutter constraint `>=3.7.0` (line 8); the direct dependencies `http` `^0.13.5` (line 13), `intl` `0.17.0` (line 14), `provider` `^6.0.5` (line 15), and `shared_preferences` `^2.0.15` (line 16). The `flutter`/`flutter_test` SDK dependencies (lines 11–12 and 19–20) are SDK packages, not hosted dependencies; `flutter_lints` is a dev dependency. |
| `positive/pubspec.lock` | The resolved hosted packages `collection` (line 11), `flutter_lints` (line 19), `http` (line 27), `intl` (line 35), `meta` (line 43), `provider` (line 51), and `shared_preferences` (line 59), plus the SDK constraints `dart` (line 61) and `flutter` (line 62). |
| `positive/.fvmrc` | The pinned Flutter version `3.7.12` (line 2). |
| `positive/.fvm/fvm_config.json` | The pinned Flutter version `3.7.12` (line 2). |
| `negative/pubspec.yaml` | Commented-out constraints (lines 1–3), a `description` that mentions versions in prose (line 5), `any` constraints (lines 10–11, 31, and 34), path and git dependencies (lines 16–21), a hosted dependency with no version (lines 22–23), and a dependency whose version is a `${…}` template (lines 24–26) produce no declarations. |
| `negative/pubspec.lock` | A git-sourced direct dependency (lines 4–11), a path-sourced direct dependency (lines 12–18), and a commented-out `sdks` block (lines 19–20) produce no hosted declaration and no SDK constraint. |
| `negative/.fvmrc` | A release channel instead of a version (line 3), a flavor pin (line 5), and the unrelated `$comment` key (line 2) produce no pin. |
| `negative/.fvm/fvm_config.json` | A release channel in `flutterSdkVersion` (line 3), a `cachePath` that contains a version (line 4), a flavor pin (line 6), and the unrelated `$comment` key (line 2) produce no pin. |
| `zero/pubspec.yaml` | The constraints `>=3.13.0 <4.0.0` (line 7) and `>=3.47.0` (line 8) and the dependencies `http` `^1.6.0` (line 13), `intl` `^0.20.3` (line 14), `provider` `^6.1.5` (line 15), and `shared_preferences` `^2.5.6` (line 16): valid declarations, no lifecycle finding. |
| `zero/pubspec.lock` | Current resolved packages with their SDK constraints (lines 61–62): valid declarations, no lifecycle findings. |
| `zero/.fvmrc` | The pinned Flutter version `3.47.7` (line 2): valid declaration, no lifecycle finding. |
| `zero/.fvm/fvm_config.json` | The pinned Flutter version `3.47.7` (line 2): valid declaration, no lifecycle finding. |
| `malformed/pubspec.yaml` | An unterminated quoted scalar (line 4): no partial declarations, no error. |
| `malformed/pubspec.lock` | An unclosed flow sequence (line 10): no partial declarations, no error. |
| `malformed/.fvmrc` | A trailing comma after the last member (line 2) makes the document invalid JSON: no declaration, no error. |
| `malformed/.fvm/fvm_config.json` | A missing value (line 2) makes the document invalid JSON: no declaration, no error. |

The `positive` fixtures are one realistic minimal project per declaration type. The zero fixtures are valid projects whose declarations are all supported, so they yield no lifecycle findings. Unclassified or lookalike values in the negative fixtures are not findings. Malformed fixtures are handled without an error or partial declarations.

`pubspec.lock` and the two FVM files exist in both the positive and zero cases because a Flutter project commonly pins its SDK in more than one place; the negative cases pin versions only in comments, prose, or channels.

## Adding a case

Keep each fixture minimal and self-contained, use real package names and real version syntax, and put the reason a value must be ignored in a comment only when the reason is not obvious from the table above. Update this README in the same change: every fixture file needs a row describing the declarations it produces, or the absence of them.
