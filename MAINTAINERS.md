# Maintainers and detector owners

Evergreen is maintainer-led. This file names who is accountable for each ecosystem. Review routing for the same paths lives in [`.github/CODEOWNERS`](.github/CODEOWNERS). How ownership is granted, transferred, or abandoned is in [GOVERNANCE.md](GOVERNANCE.md).

Library maintainers who ship CLE lifecycle declarations for *their* packages: see [docs/MAINTAINERS.md](docs/MAINTAINERS.md).

## Project maintainers

| Person | Role |
|---|---|
| [@arminazimi](https://github.com/arminazimi) | Maintainer (merge, release, accounts, security, Code of Conduct) |

## Branch protection and the merge queue

`main` requires one status check, `ci-ok`. The CI workflow reports it after every other job, and it passes when each needed job succeeded or was skipped; it fails when any of them failed or was cancelled. Keep the individual jobs, and the public-corpus run, out of the required list so the matrix can change without editing repository settings.

The merge queue is part of the same rule and runs CI on `merge_group` before it lands a pull request. To turn both on for a repository: **Settings → Rules → the `main` rule → Require status checks to pass**, add `ci-ok`, then enable **Require merge queue** and pick the merge method and grouping. The `merge_group` trigger in `.github/workflows/ci.yml` is what gives the queued pull request its `ci-ok`; without it a queued pull request waits forever.

## Detector owners

Each owner is the accountable reviewer for that ecosystem's detector under `src/detectors/`, its registry file, fixtures and conformance tests, public corpus entries, documentation page, and maturity level in `benchmarks/thresholds.json`. The owner does not have to write every change; they are the person expected to review evidence and answer questions about that ecosystem.

Until another contributor adopts an ecosystem, the maintainer owns every detector.

| Ecosystem | Owner | Detector | Registry |
|---|---|---|---|
| Android | [@arminazimi](https://github.com/arminazimi) | `src/detectors/android/` | `registry/android.json` |
| CI runner images | [@arminazimi](https://github.com/arminazimi) | `src/detectors/ci-images/` | `registry/ci-images.json` |
| Container | [@arminazimi](https://github.com/arminazimi) | `src/detectors/container/` | `registry/container.json` |
| C and C++ | [@arminazimi](https://github.com/arminazimi) | `src/detectors/cpp/` | `registry/cpp.json` |
| Dart and Flutter | [@arminazimi](https://github.com/arminazimi) | `src/detectors/dart/` | `registry/dart.json` |
| Database runtimes | [@arminazimi](https://github.com/arminazimi) | `src/detectors/database/` | `registry/database.json` |
| Deno / Bun | [@arminazimi](https://github.com/arminazimi) | `src/detectors/deno/` | `registry/deno.json` |
| .NET | [@arminazimi](https://github.com/arminazimi) | `src/detectors/dotnet/` | `registry/dotnet.json` |
| Elixir | [@arminazimi](https://github.com/arminazimi) | `src/detectors/elixir/` | `registry/elixir.json` |
| GitHub Actions | [@arminazimi](https://github.com/arminazimi) | `src/detectors/github-actions.ts` (and `github-actions-node.ts`, `github-actions-dotnet.ts`) | `registry/github-actions.json`, `registry/github-actions-shas.json` |
| Go | [@arminazimi](https://github.com/arminazimi) | `src/detectors/go/` | `registry/go.json` |
| Java and Kotlin | [@arminazimi](https://github.com/arminazimi) | `src/detectors/java/` | `registry/java.json` |
| Kubernetes APIs | [@arminazimi](https://github.com/arminazimi) | `src/detectors/kubernetes/` | `registry/kubernetes.json` |
| Node.js | [@arminazimi](https://github.com/arminazimi) | `src/detectors/npm.ts` (Node.js runtime rules) | `registry/nodejs.json` |
| npm | [@arminazimi](https://github.com/arminazimi) | `src/detectors/npm.ts` | `registry/npm.json` |
| PHP | [@arminazimi](https://github.com/arminazimi) | `src/detectors/php/` | `registry/php.json` |
| Python | [@arminazimi](https://github.com/arminazimi) | `src/detectors/python.ts` | `registry/python.json` |
| Ruby | [@arminazimi](https://github.com/arminazimi) | `src/detectors/ruby/` | `registry/ruby.json` |
| Rust | [@arminazimi](https://github.com/arminazimi) | `src/detectors/rust/` | `registry/rust.json` |
| Scala | [@arminazimi](https://github.com/arminazimi) | `src/detectors/scala/` | `registry/scala.json` |
| Serverless runtimes | [@arminazimi](https://github.com/arminazimi) | `src/detectors/serverless/` | `registry/serverless.json` |
| Shell and PowerShell | [@arminazimi](https://github.com/arminazimi) | `src/detectors/shell/` | `registry/shell.json` |
| Swift | [@arminazimi](https://github.com/arminazimi) | `src/detectors/swift/` | `registry/swift.json` |
| Terraform | [@arminazimi](https://github.com/arminazimi) | `src/detectors/terraform/` | `registry/terraform.json` |
| CLE ingest | [@arminazimi](https://github.com/arminazimi) | `src/cle-ingest.ts` | *(reads packaged `cle.json`; no ecosystem registry)* |

## Shared registry data

These files are not a single ecosystem's rules. The maintainer owns them.

| File | Owner | Notes |
|---|---|---|
| `registry/osv.json` | [@arminazimi](https://github.com/arminazimi) | Bundled OSV advisory IDs attached to findings |
| `registry/sources.lock.json` | [@arminazimi](https://github.com/arminazimi) | Source-freshness lock; not a rules registry |

## Adopting an ecosystem

Open a pull request that:

1. Adds you to the table above and to the matching lines in [`.github/CODEOWNERS`](.github/CODEOWNERS).
2. Reviews the detector page, fixtures, and maturity record for that ecosystem.

See [GOVERNANCE.md](GOVERNANCE.md#detector-and-rule-ownership) for the abandoned-owner path and what does not change when ownership is lost.
