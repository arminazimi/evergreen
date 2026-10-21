# Detector authoring

Evergreen detectors are adapters at the detector SDK seam. They inspect a repository and return lifecycle findings; the scan engine handles detector attribution, sorting, reporting, and composition.

## Supported interface

Import the public SDK from `evergreen-deprecation/sdk`:

```ts
import {
  defineDetector,
  DETECTOR_API_VERSION,
  type Detector,
} from "evergreen-deprecation/sdk";
```

A compatible detector has one stable identifier and one operation:

```ts
export const detector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "example-ecosystem",
  async scan({ root }) {
    return [];
  },
}) satisfies Detector;
```

The interface guarantees:

- `root` is an absolute repository path.
- `id` uses lowercase letters, numbers, and single hyphens.
- `scan` returns findings without a `detector` field; the engine adds it from `id`.
- Findings must be deterministic for the same repository and bundled registry.
- Repository contents are untrusted input.
- The core contract provides no network capability. Detectors should use bundled, reviewed registry data so scans remain local and reproducible.
- An incompatible `apiVersion` fails before the detector scans.

See [`examples/detectors/todo-comments.ts`](../examples/detectors/todo-comments.ts) for a complete minimal adapter.

Built-in detectors with their own pages: [Container base images](detectors/container.md), [.NET](detectors/dotnet.md), [Go](detectors/go.md), [Java and Kotlin](detectors/java.md), [Kubernetes APIs](detectors/kubernetes.md), [Rust](detectors/rust.md), [Serverless runtimes](detectors/serverless.md), [Swift](detectors/swift.md). The C and C++, Ruby, PHP, Android, and CI runner images detectors have no separate pages yet; their supported declarations and limits are in [Compatibility](COMPATIBILITY.md#c-and-c-detector), [Compatibility](COMPATIBILITY.md#ruby-detector), [Compatibility](COMPATIBILITY.md#php-detector), [Compatibility](COMPATIBILITY.md#android-detector), and [Compatibility](COMPATIBILITY.md#ci-runner-images-detector).

## Ruby detector layout

The Ruby detector is a useful example of the layout a built-in detector follows. Its entry point, `src/detectors/ruby/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-ruby-runtime.ts`, `parse-gemfile.ts`, `parse-gemfile-lock.ts`, and `parse-gemspec.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/ruby.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A runtime pin uses the first rule whose `vers` range contains the version. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A `Gemfile` gem is matched only against rules that cover every version, while a `Gemfile.lock` gem is matched against any rule for that gem name.
- Gem rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the Ruby files that import or call the gem. A `require`, `load`, `gem`, or `autoload` whose argument is not a string literal is unclassified. `require_relative` is never unclassified. Qualified calls without parentheses (for example `JSON.parse text`) are not matched.

The user-facing list of supported forms and limits for this detector is in [Compatibility](COMPATIBILITY.md#ruby-detector).

## PHP detector layout

The PHP detector follows the same layout. Its entry point, `src/detectors/php/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-php-runtime.ts`, `parse-composer-json.ts`, and `parse-composer-lock.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/php.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A runtime pin uses the first rule whose `vers` range contains the version. A constraint that is not a concrete version (for example `>=7.4` or `^8.2`) is skipped, and a rule whose `vers` is malformed is skipped, so neither hides a later rule.
- A `composer.json` package is matched only against rules that cover every version of the package, while a `composer.lock` package is matched against any rule whose `vers` contains the resolved version. An `abandoned` flag in the lockfile is recorded by the parser and is not itself a finding.
- Package rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the `.php` files that `require` or `include` that package and the qualified calls those matchers name. A `require` or `include` whose argument is not a string literal is unclassified, as is `new $class` or `$class::method()`. Runtime end-of-life rules do not name source usages.

The user-facing list of supported forms and limits for this detector is in [Compatibility](COMPATIBILITY.md#php-detector).

## Android detector layout

The Android detector follows the same layout. Its entry point, `src/detectors/android/index.ts`, finds the files, reads them, and matches each declaration to a rule. Pure parsers sit beside it: `parse-build-gradle.ts` for SDK settings, `parse-settings-gradle.ts` for plugin pins, and `parse-libs-versions-toml.ts` for the version catalog. String-notation Maven dependencies in `build.gradle` and `build.gradle.kts` come from the Java detector's `parse-gradle.ts`; this detector keeps only those dependency declarations.

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/android.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A declaration uses the first rule whose `vers` range contains the version text. A rule whose `vers` is malformed, or whose comparison throws, is skipped, so it does not hide a later rule.
- An SDK setting matches `pkg:generic/android/<kind>` (`compileSdk`, `minSdk`, `targetSdk`, `buildToolsVersion`). An Android Gradle Plugin pin, in settings or the catalog `agp` key, matches `pkg:generic/android/agp`. `org.jetbrains.kotlin.android` in settings matches `pkg:generic/android/kotlin-android`. The catalog `kotlin` key matches `pkg:generic/android/kotlin`. A string-notation dependency matches `pkg:maven/<group>/<artifact>`.
- Property references, method calls, version-catalog lookups, and `$` interpolation produce no declaration. The analysis reports no unclassified references.
- A rule that lists usage matchers uses `analyzeSourceUsage` for `.java` and `.kt` files. The bundled Play Billing rules do not list matchers, so those findings point at the declaration only.

The user-facing list of supported forms and limits for this detector is in [Compatibility](COMPATIBILITY.md#android-detector).

## CI runner images detector layout

The CI runner images detector follows the same layout. Its entry point, `src/detectors/ci-images/index.ts`, finds the files, reads them, and matches Azure hosted-image labels to a rule. One pure parser per file type sits beside it (`parse-gitlab-ci.ts`, `parse-circleci.ts`, and `parse-azure-pipelines.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/ci-images.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An Azure `pool.vmImage` label of the form `ubuntu-<version>`, `macos-<version>`, or `windows-<version>` matches `pkg:generic/azure-pipelines/<family>-image` with an `intdot` version. Every rule whose `vers` range contains that version is reported. A label with an architecture suffix, or any other shape, is not matched.
- GitLab `image` and `services` values are always unclassified. CircleCI returns orbs, dynamic values, and floating aliases as unclassified; a literal CircleCI image is not matched, because this version has no CircleCI Package URL mapping.
- `latest`, `*-latest`, variables, and template expressions produce no finding. There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Compatibility](COMPATIBILITY.md#ci-runner-images-detector).

## Swift detector layout

The Swift detector follows the same layout. Its entry point, `src/detectors/swift/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per file type sits beside it (`parse-swift-toolchain.ts`, `parse-package-swift.ts`, `parse-package-resolved.ts`, and `parse-xcode-project.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file or line.
- Rules come from `registry/swift.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- An exact pin (`.xcode-version`, `.swift-version`, `swift-tools-version`, `exact:` in `Package.swift`, a `Package.resolved` version, or an app-target `IPHONEOS_DEPLOYMENT_TARGET`) uses the first rule whose `vers` range contains the version. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.
- A `from:` requirement in `Package.swift` is matched only against rules that cover every version of that package. Package identity is the lowercased repository name without `.git`, matching what SwiftPM writes in `Package.resolved`.
- The iOS deployment target is read only from application targets in `project.pbxproj` (`com.apple.product-type.application`), so a library or a `platforms:` minimum in `Package.swift` never produces that finding.
- Package rules that declare usage matchers use `analyzeSourceUsage`, so those findings list the `.swift` files that `import` that module and the qualified calls those matchers name. Runtime Objective-C lookup forms (`NSClassFromString`, `Selector(…)`, and similar) are unclassified. Toolchain and App Store rules do not name source usages.

The user-facing list of supported forms and limits for this detector is in [Swift](detectors/swift.md).

## C and C++ detector layout

The C and C++ detector follows the same layout. Its entry point, `src/detectors/cpp/index.ts`, finds the files, reads them, and matches each declaration to a rule. One pure parser per manifest sits beside it (`parse-cmakelists.ts`, `parse-conan.ts`, and `parse-vcpkg.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/cpp.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- A declaration with a version uses the first rule whose `vers` range contains that version. A rule whose `vers` is malformed, or whose comparison throws, is skipped, so it does not hide a later rule.
- A vcpkg dependency with no `version>=` matches only a rule that covers every version of that package. `cmake_minimum_required` matches `pkg:generic/cmake`. A Conan requirement matches `pkg:conan/<name>`. A vcpkg dependency matches `pkg:vcpkg/<name>`. Language standards, compiler checks, and `builtin-baseline` match the generic Package URLs named in the detector.
- Generator and module rules are not matched yet: the CMake parser does not emit those declarations. There is no source-usage pass.

The user-facing list of supported forms and limits for this detector is in [Compatibility](COMPATIBILITY.md#c-and-c-detector).

## Serverless runtimes detector layout

The Serverless runtimes detector follows the same layout. Its entry point, `src/detectors/serverless/index.ts`, finds the files, reads them, and matches each literal runtime identifier to a rule. One pure parser per file type sits beside it (`parse-template.ts`, `parse-serverless-yml.ts`, and `parse-tf.ts`):

- A parser returns nothing, not an error, for a form it does not support, and never returns part of a malformed file.
- Rules come from `registry/serverless.json`, loaded through the bundled data. The detector takes a rule loader so tests can supply their own rules.
- Each literal identifier is tried against `pkg:generic/aws-lambda-runtime/<id>` and `pkg:generic/google-cloud-functions-runtime/<id>`. The first rule whose VERS range contains the identifier wins. A rule whose VERS is malformed is skipped, so it does not hide a later rule.
- CloudFormation tags (`!Ref`, `!Sub`), Serverless `${…}` interpolations, Terraform `var` / `local` / interpolation values, and floating aliases such as `latest` produce no declaration.
- There is no source-usage pass: a runtime finding points at the declaration only.

The user-facing list of supported forms and limits for this detector is in [Serverless runtimes](detectors/serverless.md).

## Start a new detector in this repository

Do not copy an existing detector by hand. Generate the skeleton from a checkout of this repository:

```bash
npm ci
npm run build
node dist/src/cli.js new-detector go-modules --ecosystem go
```

The id is the detector's stable identifier (lowercase letters, digits, and single hyphens, starting with a letter). `--ecosystem` is the registry slug and defaults to the id. The command creates nine files and nothing else:

| File | What it is for |
| --- | --- |
| `src/detectors/<id>.ts` | The detector. It imports only the public SDK, reports nothing yet, and says in its header what to do next. |
| `src/detectors/<id>/parse.ts` | A pure, bounded parser: contents in, `{ value, line }` declarations out. Its header lists the rules it keeps and a place to document the forms it deliberately does not read. |
| `registry/<id>.json` | An empty `evergreen.registry.v2` registry for your rules ([Lifecycle rules](RULES.md)). |
| `tests/<id>-detector.test.ts` | The conformance suite (determinism, zero-finding, malformed input) against the generated fixtures. |
| `tests/<id>-parse.test.ts` | The invariants every parser keeps: no throw on junk, bounded input and lines, determinism, 1-based lines. |
| `tests/fixtures/<id>/` | A README with a table of cases, and `zero/` and `malformed/` fixtures to replace with real ones. |
| `docs/detectors/<id>.md` | The page that describes what the detector reads, its rules, and its limits. |

The skeleton compiles and passes its own tests with zero rules, so every later change starts from a green build. The command refuses to run outside a checkout, refuses an id or ecosystem that an existing detector, registry file, or rule-id prefix already uses (it lists every clash and the file that holds it), and writes nothing if any target file exists.

After generating:

1. **Fixtures first.** Fill `tests/fixtures/<id>/` with small repositories: one positive per declaration type, lookalike negatives (comments, unrelated keys, dynamic values), a zero-finding one, and a malformed one. Describe each in the README table.
2. **Parser.** Teach `parse.ts` to read the declarations, one form at a time, each with a test. Bound the input, never evaluate what you read, and return nothing, not an error, for forms you do not support.
3. **Rules.** Add evidence-backed rules to `registry/<id>.json` ([evidence policy](../CONTRIBUTING.md#evidence-policy)).
4. **Detector.** In `<id>.ts`, find the files, parse them, and match declarations to rules. Report an exact path and line. Add the expected findings to the conformance test.
5. **Register it.** Add the detector to `builtInDetectors` in `src/detectors/index.ts`. To ship its rules in the signed data bundle ([Lifecycle data](DATA.md)), add the ecosystem to `BUNDLED_ECOSYSTEMS` in `src/data-bundle.ts`. The generator leaves both to you on purpose, so a skeleton never changes what scans report or what a data release contains.
6. **Check.** `npm run check` must pass, and `npm run validate:public-repos` must still match exactly. A new detector starts non-stable in `benchmarks/thresholds.json` until the corpus has meaningful coverage ([Validation](VALIDATION.md#precision-thresholds)).

Detectors that live outside this repository use the public SDK directly, as described below; `new-detector` is for contributors to Evergreen itself.

## Maturity

Every built-in detector has a level (`experimental`, `beta`, or `stable`) in `benchmarks/thresholds.json`. The level is what the detector promises users. [Decision 0013](decisions/0013-detector-maturity.md) defines those promises and the evidence that earns each level. The table below is that evidence, and `earnedLevel` in `benchmarks/thresholds.ts` checks the counts. A new detector starts as `experimental`.

A promotion is a pull request that changes `level` and records the corpus run the claim rests on: date, commit, precision, recall, and the counts below. For `beta` and `stable`, the thresholds file sets `stable` to `true`, so the corpus run enforces the precision floor. A demotion is the same pull request in reverse. It is also required when a full run shows precision or recall below the floor for that level and the gap is still open 30 days later.

### Promotion gates

A detector is named by the first segment of its rule ids. Conformance is the shared harness: determinism, locations, evidence, a mandatory zero-finding fixture, and malformed input that does not throw. "Repositories with findings" counts corpus repositories with at least one expected finding for that detector. "Zero-finding repositories" counts corpus repositories of the detector's ecosystem with no expected findings. A repository is blind when a rule fixed before the scan chose it. A repository picked because it contained a finding is targeted, and the corpus entry records `selection`. Every expected finding has a `groundTruthSource` that is independent of Evergreen's own output.

| Gate | Experimental → beta | Beta → stable |
| --- | --- | --- |
| Conformance | Passes on positive, negative, zero, and malformed fixtures | Still passes |
| Repositories with findings | At least 8 | At least 20 |
| Expected findings | At least 15 | At least 60 |
| Zero-finding repositories | At least 2 | At least 4 |
| Blind selection | At least half of the ecosystem's corpus repositories | At least two thirds |
| Precision on the whole corpus | At least 0.95 | At least 0.95 |
| Recall on the whole corpus | At least 0.80 | At least 0.90 |
| Full corpus run on current main, recorded in the thresholds file | Within 30 days | Within 30 days, with no precision or recall regression left open |
| Detector page | `docs/detectors/` states what is and is not judged | The page still matches the detector |

Experimental → beta is the conformance suite plus the beta column. Beta → stable keeps precision at or above 0.95 on the larger corpus, and the recorded run stays inside 30 days (four weeks) with no regression left open. An `experimental` detector is still scored; a precision or recall miss does not fail its run.

Four detectors that predate this bar (`github-actions`, `nodejs`, `npm`, and `python`) keep the level they already have until the corpus catches up. The threshold test names them. Every other detector's level has to meet the column it claims.

## Unclassified references

Detectors may implement the optional `analyze` operation when they need to return both findings and references that could not be classified safely. The stable `scan` operation remains required, so existing external detectors continue to work unchanged. The engine adds the detector ID, sorts the references deterministically, and exposes them under `unclassified.count` and `unclassified.references` in `evergreen.scan.v1` JSON output.

The built-in GitHub Actions detector uses this metadata for full 40-character commit pins it cannot resolve. It classifies a covered action from a valid trailing version comment first, or from Evergreen's bundled exact SHA-to-release map when no comment is present. An unknown SHA is reported with reason `unknown-sha`; a present but unusable comment is reported with reason `invalid-version-comment`. Neither case becomes a lifecycle finding because Evergreen does not guess a release line.

This resolution is fully offline. The bundled map is reviewed and regenerated by a separate maintainer tool; repository scans never query GitHub or another service.

## Declaring the files a detector reads

A detector may declare, in one place, which repository files its `scan` reads. The optional `inputs` field on `Detector` (added to the `evergreen.detector.v1` interface without changing anything that exists) has four parts, all relative to the scanned root with forward slashes:

| Field | Meaning |
| --- | --- |
| `fileNames` | Exact base names at any depth, case-insensitive; `*` matches any run of characters (`requirements*.txt`, `*.Dockerfile`). |
| `extensions` | Base-name endings, including the dot (`.csproj`). |
| `directories` | Directories, at the root or below any directory, all of whose files may be read (`.github/workflows`). |
| `sourceExtensions` | Source files read to map usage of a deprecated API (`.ts`, `.cs`). |

```ts
readonly inputs: DetectorInputs = {
  fileNames: ["go.mod", "go.work"],
  sourceExtensions: [".go"],
};
```

Every built-in detector declares it, and a test fails if one does not. `declaredInputsCheck` (`evergreen/conformance`, from `src/conformance/checks/inputs.ts`) scans a fixture while recording every file whose contents the scan opens, and fails naming each file outside the declaration:

```text
Detector "leaky" violated the "declared inputs" guarantee for fixture "leak": read "secrets/token.txt", which its inputs do not declare
```

Listing a directory or testing that a path exists is not a read, and files outside the scanned root (the bundled rules) are ignored. A detector that omits `inputs` makes no promise and passes the check. The declaration is what a tool needs to fetch only the files a detector reads; keep it as narrow as the detector's real behavior, and widen it in the same change that makes the detector read something new.

## Registry validation

The bundled registries use the shared `evergreen.registry.v2` format, keyed by Package URL and version range with provenance for every rule. See [Lifecycle rules](RULES.md) for the format, the evidence policy, and how to write a rule. The v2 loader is internal to the bundled detectors for now; the public SDK validates the v1-style envelope below, so detectors outside this repository keep working unchanged.

Registry files for external detectors use a versioned envelope:

```json
{
  "schemaVersion": "example.registry.v1",
  "rules": []
}
```

Use `validateRegistry` for the envelope and a detector-owned type guard for each rule:

```ts
const registry = validateRegistry(JSON.parse(contents), {
  schemaVersion: "example.registry.v1",
  isRule: (value): value is ExampleRule =>
    isDeprecationRule(value) && typeof value.package === "string",
});
```

Validation rejects a missing or unexpected schema version, a non-array `rules` value, and the first invalid rule with its array index. `isDeprecationRule` validates the fields shared by every Evergreen lifecycle rule.

Rules may include optional migration guidance so `evergreen context` can produce ecosystem-specific packets without hard-coding detector knowledge in the CLI:

```json
{
  "migration": {
    "constraints": ["Preserve observable behavior."],
    "steps": [
      {
        "id": "replace-declaration",
        "title": "Replace the declaration",
        "instructions": "Move to the supported replacement.",
        "targets": "declaration"
      }
    ],
    "verification": [
      { "command": "npm test", "purpose": "Run the repository tests." }
    ]
  }
}
```

Step targets are `declaration`, `usages`, or `all`. The packet module resolves those targets to exact repository paths. Step IDs must be unique within a rule, and constraints, steps, and verification commands must all be non-empty. External detectors without migration guidance receive deterministic generic fallback steps.

## Source usage contracts

Detectors can enrich findings with concrete repository usages through the public `analyzeSourceUsage` helper. Pass all matched rules in one batch so the repository is traversed once:

```ts
import {
  analyzeSourceUsage,
  type SourceUsageContract,
} from "evergreen-deprecation/sdk";

const contracts: SourceUsageContract[] = [{
  id: "legacy-client",
  matchers: [
    { kind: "import", language: "typescript", module: "legacy-client" },
    {
      kind: "call",
      language: "typescript",
      module: "legacy-client",
      targets: ["default", "get"],
    },
  ],
}];

const analyses = await analyzeSourceUsage(root, contracts);
```

Import and call matchers resolve common aliases in JavaScript, TypeScript, and Python. Go supports import and call matchers by import path. Java and Kotlin support import matchers only (`language: "java"` for `.java` files and `"kotlin"` for `.kt` files): `module` is a package or class name, an import of it or of anything below it matches (`import static` and wildcard imports included), and calls through the imported names are not mapped. Ruby supports import and call matchers (`language: "ruby"` for `.rb`, `.rake`, and `.ru` files): `module` is a require path, a literal `require`, `load`, `gem`, or `autoload` of that path (or a path under it) is an import, and a call target is a qualified call such as `JSON.parse(` (parentheses required). An assignment `Parser = JSON` makes `Parser.parse(` the same call. A dynamic `require`/`load`/`gem`/`autoload` argument is reported as unclassified instead of being guessed; `require_relative` is not. Configuration-key matchers support Python settings plus JSON, YAML, TOML, and INI-style files, and can optionally require a value fragment. Results include exact locations, excerpts, and a deterministic `none`, `low`, `medium`, or `high` migration-impact estimate. Keep matchers narrow: a lifecycle finding may safely have zero source usages, but an ambiguous match should not be reported as evidence.

## Compatibility policy

`evergreen.detector.v1` remains compatible throughout the `0.1.x` line. Additive fields will be optional. A future breaking interface will use a new API version so an old adapter fails clearly instead of producing unreliable findings.

Run `npm run check` against the minimum Evergreen version your detector supports. The repository compatibility suite exercises an external adapter, rejects an old API version, validates registry failure modes, and runs the published example through the same engine seam used by built-in detectors.
