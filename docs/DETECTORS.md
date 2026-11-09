{% raw %}
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

Built-in detectors with their own pages: [Container base images](detectors/container.md), [C and C++](detectors/cpp.md), [Dart and Flutter](detectors/dart.md), [Database runtimes](detectors/database.md), [.NET](detectors/dotnet.md), [Elixir and Mix](detectors/elixir.md), [Go](detectors/go.md), [Java and Kotlin](detectors/java.md), [Kubernetes APIs](detectors/kubernetes.md), [Rust](detectors/rust.md), [Scala and sbt](detectors/scala.md), [Serverless runtimes](detectors/serverless.md), [Shell and PowerShell](detectors/shell.md), [Swift](detectors/swift.md), [Terraform](detectors/terraform.md). The Ruby, PHP, Android, and CI runner images detectors have no separate pages yet; their supported declarations and limits are in [Compatibility](compatibility/ruby.md#ruby-detector), [Compatibility](compatibility/php.md#php-detector), [Compatibility](compatibility/android.md#android-detector), and [Compatibility](compatibility/ci-runner-images.md#ci-runner-images-detector).

## Python runtime declarations

The Python detector reads `.python-version` (one concrete version per line), `runtime.txt`, `.tool-versions`, `[project].requires-python` and Poetry's Python constraint in `pyproject.toml`, `python_requires` in the `[options]` section of `setup.cfg`, and literal `python_requires` keyword arguments to `setup(...)`, `setuptools.setup(...)`, or `distutils.core.setup(...)` in `setup.py`. Python source is parsed, never executed; computed values, variable references, concatenation, interpolation, and import aliases in `setup.py` are not resolved.

It also reads `envlist` and `env_list` in the `[tox]` section of `tox.ini`, including continuation lines, factors such as `py39-unit`, and Python brace lists such as `py{39,310}-unit`. These name pinned CPython release lines. Generic `py3`, PyPy environments, substitutions, and non-Python environments are skipped. Repeated factors for the same release on one line produce one finding.

A finding points at the pin, keyword, or value's exact line. Runtime pins use the rule's severity; compatibility ranges use medium severity and report a concrete lower bound. An upper-bound-only range such as `<3.9`, an exclusion such as `!=3.9.*`, or a floating value does not establish a runtime version and produces no finding. These declarations are read in the root project and each discovered uv workspace member.

## Ruby detector layout

Moved to [Detector layouts: Ruby detector layout](detectors/authoring-layouts.md#ruby-detector-layout).

## PHP detector layout

Moved to [Detector layouts: PHP detector layout](detectors/authoring-layouts.md#php-detector-layout).

## Android detector layout

Moved to [Detector layouts: Android detector layout](detectors/authoring-layouts.md#android-detector-layout).

## CI runner images detector layout

Moved to [Detector layouts: CI runner images detector layout](detectors/authoring-layouts.md#ci-runner-images-detector-layout).

## Dart detector layout

Moved to [Detector layouts: Dart detector layout](detectors/authoring-layouts.md#dart-detector-layout).

## Database runtimes detector layout

Moved to [Detector layouts: Database runtimes detector layout](detectors/authoring-layouts.md#database-runtimes-detector-layout).

## Shell and PowerShell detector layout

Moved to [Detector layouts: Shell and PowerShell detector layout](detectors/authoring-layouts.md#shell-and-powershell-detector-layout).

## Terraform detector layout

Moved to [Detector layouts: Terraform detector layout](detectors/authoring-layouts.md#terraform-detector-layout).

## Swift detector layout

Moved to [Detector layouts: Swift detector layout](detectors/authoring-layouts.md#swift-detector-layout).

## C and C++ detector layout

Moved to [Detector layouts: C and C++ detector layout](detectors/authoring-layouts.md#c-and-c-detector-layout).

## Serverless runtimes detector layout

Moved to [Detector layouts: Serverless runtimes detector layout](detectors/authoring-layouts.md#serverless-runtimes-detector-layout).

## Start a new detector in this repository

Do not copy an existing detector by hand. Generate the skeleton from a checkout of this repository:

```bash
npm ci
npm run build
node dist/src/cli.js new-detector go-modules --ecosystem go
```

The id is the detector's stable identifier (lowercase letters, digits, and single hyphens, starting with a letter). `--ecosystem` is the registry slug and defaults to the id. The command creates eight files and nothing else:

| File | What it is for |
| --- | --- |
| `src/detectors/<id>.ts` | The detector. It imports only the public SDK, reports nothing yet, and says in its header what to do next. |
| `src/detectors/<id>/parse.ts` | A pure, bounded parser: contents in, `{ value, line }` declarations out. Its header lists the rules it keeps and a place to document the forms it deliberately does not read. |
| `tests/<id>-detector.test.ts` | The conformance suite (determinism, zero-finding, malformed input) against the generated fixtures. |
| `tests/<id>-parse.test.ts` | The invariants every parser keeps: no throw on junk, bounded input and lines, determinism, 1-based lines. |
| `tests/fixtures/<id>/` | A README with a table of cases, and `zero/` and `malformed/` fixtures to replace with real ones. |
| `docs/detectors/<id>.md` | The page that describes what the detector reads, its rules, and its limits. |

The skeleton compiles and passes its own tests with zero rules, so every later change starts from a green build. The command refuses to run outside a checkout, refuses an id or ecosystem that an existing detector, registry file, or rule-id prefix already uses (it lists every clash and the file that holds it), and writes nothing if any target file exists.

After generating:

1. **Fixtures first.** Fill `tests/fixtures/<id>/` with small repositories: one positive per declaration type, lookalike negatives (comments, unrelated keys, dynamic values), a zero-finding one, and a malformed one. Describe each in the README table.
2. **Parser.** Teach `parse.ts` to read the declarations, one form at a time, each with a test. Bound the input, never evaluate what you read, and return nothing, not an error, for forms you do not support.
3. **Rules.** Add evidence-backed rules to `registry/<id>.json` in [Ebb](https://github.com/velella-sh/ebb) ([Lifecycle rules](RULES.md), [evidence policy](../CONTRIBUTING.md#evidence-policy)), then update `@velella/ebb` here.
4. **Detector.** In `<id>.ts`, find the files, parse them, and match declarations to rules. Report an exact path and line. Add the expected findings to the conformance test.
5. **Register it.** Add the detector to `builtInDetectors` in `src/detectors/index.ts`. The generator leaves this to you on purpose, so a skeleton never changes what scans report. Whether its rules ship in the signed data bundle is decided in Ebb.
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

### The runtime a `setup-*` action installs

Besides the action reference itself, the GitHub Actions detector reads one runtime input: the `dotnet-version` of `actions/setup-dotnet` (decided in [#845](https://github.com/arminazimi/evergreen/issues/845)). It judges each version with the `dotnet` runtime rules (`dotnet.runtime.end-of-support-*`, with Microsoft's support policy as the source), so a lifecycle change is made in one place. The workflow is parsed as YAML, never evaluated.

- A literal version names a release line: `6.0.x`, `6.0`, `6.0.100`, and the SDK band `6.0.4xx` are all .NET 6.
- A multi-line value (`dotnet-version: |`) is judged per entry, and each finding points at that entry's line.
- An expression such as `${{ matrix.dotnet }}`, a floating major (`6.x`, `6`), a pre-release (`7.0.100-preview.1`), or any other form is unclassified with its file and line, never guessed.
- The `global-json-file` input, `dotnet-quality`, and the other `setup-*` actions (`setup-node`, `setup-python`, and so on) are not read. Each needs its own mapping to a lifecycle rule set; they are follow-up work, not part of this decision.

### Bun lockfile resolution and diagnostics

The `npm` detector reads lockfiles to resolve exact package versions and build dependency paths: `package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, and Bun's text lockfile (`bun.lock`).

- **`bun.lock` (text)**: Parsed as JSON. Direct and transitive packages in the `packages` dictionary resolve exact versions and dependency edges, matching them against lifecycle rules.
- **`bun.lockb` (binary)**: Bun's legacy binary lockfile format is not parsed. Rather than guessing versions from manifest ranges, the binary lockfile is reported as an unclassified diagnostic reference (`bun.lockb` at line 1). Running `bun install` with Bun 1.2+ generates a text `bun.lock` file that Evergreen resolves.

## Declaring the files a detector reads

Moved to [Detector contracts: Declaring the files a detector reads](detectors/authoring-contracts.md#declaring-the-files-a-detector-reads).

## Registry validation

Moved to [Detector contracts: Registry validation](detectors/authoring-contracts.md#registry-validation).

## Source usage contracts

Moved to [Detector contracts: Source usage contracts](detectors/authoring-contracts.md#source-usage-contracts).

## Compatibility policy

`evergreen.detector.v1` remains compatible throughout the `0.1.x` line. Additive fields will be optional. A future breaking interface will use a new API version so an old adapter fails clearly instead of producing unreliable findings.

Run `npm run check` against the minimum Evergreen version your detector supports. The repository compatibility suite exercises an external adapter, rejects an old API version, validates registry failure modes, and runs the published example through the same engine seam used by built-in detectors.
{% endraw %}
