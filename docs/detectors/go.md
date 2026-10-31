# Go

The `go` detector reports Go release lines that no longer receive fixes, as declared in `go.mod` and `go.work`. It is **supported**: it is scored on the [public corpus](../VALIDATION.md) and held to the corpus precision and recall floors. The reasoning is in [Decision 0002](../decisions/0002-go-ecosystem-support.md).

## What it reads

| File | Declaration |
| --- | --- |
| `go.mod` | the `go` directive, the `toolchain` directive, and direct `require` entries (single lines and `require (...)` blocks) |
| `go.work` | the `go` and `toolchain` directives |

It walks the repository up to eight directories deep (at most 500 matching files), finds nested modules, and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. The Go toolchain is never run.

## What it reports

- A `go` directive or `toolchain` line whose release line (`1.21`, `1.22`, ...) is past its end of support under the [Go release policy](https://go.dev/doc/devel/release). The rules cover Go 1.21 through 1.25 and have a catch-all for 1.20 and older.
- A `go` directive is a compatibility floor, not the toolchain that builds the module, so it is reported at **medium** severity. A `toolchain` line names the toolchain that builds the module and keeps the rule's severity.
- A direct `require` of a module that has a lifecycle rule (`pkg:golang/<module>`) at an affected version. The bundled rules cover `cloud.google.com/go/pubsub`, `github.com/cncf/udpa/go`, `github.com/discord/lilliput`, `github.com/golang/protobuf`, `github.com/streadway/amqp`, and `go.opentelemetry.io/otel/exporters/zipkin`; the module-deprecation importer drafts more for review.

Each finding carries its rule's source, replacement, migration steps, and verification commands (`go build ./... && go test ./...`).

## What it intentionally does not judge

- A version that is not a Go release number is listed as an unclassified reference, not guessed.
- `// indirect` requirements, `replace` and `exclude` directives, `retract`, and `-mod=vendor` contents are not read.
- Dynamic or malformed files (an unterminated `require` block, for example) produce nothing, not partial results.
- Source usage: imports (single and `import (...)` groups, aliases, `/vN` major-version paths) and qualified calls of an affected module are mapped to files and lines. Blank (`_`) and dot (`.`) imports count as imports but bind no name, so calls through them are not found. Raw multi-line strings are not masked, so a quoted import path inside one could be counted.
- Modules without a reviewed lifecycle rule, including a `require` line whose module is deprecated upstream but not yet in `registry/go.json`.

## Known limits and false-positive boundaries

- A `go 1.21` directive can be a deliberate compatibility floor for a library that is built with a newer toolchain. Evergreen reports it at medium severity and cannot know the intent.
- The support policy is "the two newest major releases"; the dates in the rules are the days the newer release shipped. A release candidate or an unreleased version is not matched.
- Multi-module repositories are scanned module by module; findings in test or example modules are reported like any other.

## Data

The rules are in `registry/go.json` and ship in the [data bundle](../DATA.md). The importers `go-1` (release policy) and `go-2` (module deprecation comments) draft new rules for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

The corpus holds 43 pinned Go repositories: 39 with reviewed Go findings and four with none (`helm/helm`, `charmbracelet/wish`, `slackhq/go-audit`, and `prometheus/prometheus`). Their 71 expected Go findings were reviewed by hand against the files at the pinned commit, and the notes cite the Go release policy or the module's own deprecation notice rather than Evergreen's output. Other ecosystems' entries declare Go modules too, so the corpus expects 111 Go findings in total. Of the 43 Go entries, 31 were selected blind (72%). The full-corpus run on 2026-11-01 reported 111 true positives, no false positives, and no false negatives; the method and evidence counts are in [Validation](../VALIDATION.md).
