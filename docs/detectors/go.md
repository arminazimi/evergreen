# Go

The `go` detector reports Go release lines that no longer receive fixes, as declared in `go.mod` and `go.work`. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0002](../decisions/0002-go-ecosystem-support.md).

## What it reads

| File | Declaration |
| --- | --- |
| `go.mod` | the `go` directive, the `toolchain` directive, and direct `require` entries (single lines and `require (...)` blocks) |
| `go.work` | the `go` and `toolchain` directives |

It walks the repository up to eight directories deep (at most 500 matching files), finds nested modules, and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. The Go toolchain is never run.

## What it reports

- A `go` directive or `toolchain` line whose release line (`1.22`, `1.23`, ...) is past its end of support under the [Go release policy](https://go.dev/doc/devel/release). The rules cover Go 1.21 to 1.25 today.
- A `go` directive is a compatibility floor, not the toolchain that builds the module, so it is reported at **medium** severity. A `toolchain` line names the toolchain that builds the module and keeps the rule's severity.
- A direct `require` of a module that has a lifecycle rule (`pkg:golang/<module>`) at an affected version. The registry has no such rules yet; the module-deprecation importer drafts them from `// Deprecated:` comments, and they are added after review.

Each finding carries its rule's source, replacement, migration steps, and verification commands (`go build ./... && go test ./...`).

## What it intentionally does not judge

- A version that is not a Go release number is listed as an unclassified reference, not guessed.
- `// indirect` requirements, `replace` and `exclude` directives, `retract`, and `-mod=vendor` contents are not read.
- Dynamic or malformed files (an unterminated `require` block, for example) produce nothing, not partial results.
- Releases older than Go 1.21 have no rule yet, so a `go 1.18` directive is not reported. This is a data gap, not a statement that it is supported.
- Source usage (imports and calls of an affected package) is not mapped for Go yet.

## Known limits and false-positive boundaries

- A `go 1.22` directive can be a deliberate compatibility floor for a library that is built with a newer toolchain. Evergreen reports it at medium severity and cannot know the intent.
- The support policy is "the two newest major releases"; the dates in the rules are the days the newer release shipped. A release candidate or an unreleased version is not matched.
- Multi-module repositories are scanned module by module; findings in test or example modules are reported like any other.

## Data

The rules are in `registry/go.json` and ship in the [data bundle](../DATA.md). The importers `go-1` (release policy) and `go-2` (module deprecation comments) draft new rules for review; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Five public repositories at pinned commits are in the corpus (four on Go 1.24 or 1.25 before the maintainers moved on, one with none). Their expected findings were reviewed by hand against the files at that commit, and the note links the maintainers' own migration commit where there is one.
