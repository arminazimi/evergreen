# Rust

The `rust` detector reports Rust toolchains that no longer receive fixes and direct dependencies on crates that are no longer maintained, as declared in `Cargo.toml`, `Cargo.lock`, and `rust-toolchain(.toml)`. It is **experimental**: it is scored on the [public corpus](../VALIDATION.md) but not yet held to the precision floor that stable detectors are. The reasoning is in [Decision 0011](../decisions/0011-rust-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `rust-toolchain.toml` | `channel` in `[toolchain]` |
| `rust-toolchain` | the legacy one-line form (`1.70.0`) or the TOML form |
| `Cargo.toml` | `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[workspace.dependencies]`, and target-specific dependency tables; a renamed dependency (`package = "name"`) is matched by its real crate name |
| `Cargo.lock` | the resolved version of each directly declared crate from the crates.io registry |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. Cargo and the Rust toolchain are never run.

## What it reports

- A toolchain pinned to an exact release (`1.70`, `1.70.0`) that is older than the newest stable release. Rust supports only the most recent stable release, so a line loses support the day the next one ships ([Rust security policy](https://www.rust-lang.org/policies/security)). Reported at **medium** severity.
- A direct dependency on a crate the [RustSec advisory database](https://github.com/rustsec/advisory-db) marks as unmaintained or deprecated (`failure`, `tempdir`, `atty`, and `ansi_term` today), at the `Cargo.toml` line that declares it. This is a lifecycle fact, not a vulnerability report.
- Where the crate is imported or called in the repository's Rust sources, the finding lists those files and lines as usages and an impact summary.
- A resolved version in `Cargo.lock` that crates.io has yanked, when the registry has a rule for it. There are no such rules yet; they are added after review of the importer's drafts.

Each finding carries its rule's source, replacement, migration steps, and verification commands.

## What it intentionally does not judge

- `edition` is read but never judged: editions never end, and every edition interoperates with every other.
- `rust-version` is a minimum, not the toolchain in use. Libraries keep it low on purpose, so it is read and never judged.
- `channel = "stable"` is always the newest release and is not a problem. `beta`, `nightly`, dated nightlies, and a toolchain given as a path are not release numbers and are listed as unclassified.
- Dependencies declared with `path`, `git`, or `workspace = true`, or with a version that is not a literal string, are skipped: there is no crates.io version to judge.
- Transitive dependencies, vulnerability advisories, license policy, Cargo features, and `cfg` tables other than the dependency tables.
- Malformed or oversized files (over 1 MiB, or a line over 4,096 characters) produce nothing, not partial results.

## Known limits and false-positive boundaries

- A dependency on an unmaintained crate is reported at any version, because the RustSec notice is about the crate, not a release. The crate may still work; Evergreen reports that nobody is maintaining it.
- The toolchain rule moves every six weeks. The importer drafts it from the project's release notes and a weekly workflow proposes the change; the rule's freshness window makes a missed update visible instead of silent.
- Source usage is found by import paths (`use`, grouped and nested, aliases, `crate::` and `::` paths), qualified calls, macros (`name!(`), and associated functions (`Type::new`). Macro-generated code, glob imports (`use crate::*`), and re-exports through another crate are not followed.
- Multi-crate workspaces are scanned manifest by manifest; findings in examples or test crates are reported like any other.

## Data

The rules are in `registry/rust.json` and ship in the [data bundle](../DATA.md). The importers `rust-1` (release notes) and `rust-2` (crates.io sparse index) draft new rules for review, and `rust-candidates` lists crates to consider; see [Lifecycle importers](../IMPORTERS.md).

## Validation

Five public repositories at pinned commits are in the corpus: four that depended on an abandoned crate until their maintainers moved on (hyperfine, wasm-pack, just, dust) and one with no findings (fd). Their expected findings were reviewed by hand against the files at that commit, and each note links the maintainers' own migration commit. Precision is measured on those five repositories only, which is why the detector is not yet stable.
