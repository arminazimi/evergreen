# 0011 — Detect unsupported Rust toolchains and abandoned or yanked crates

Status: accepted

Evergreen will add a `rust` detector that reads `Cargo.toml`, `Cargo.lock`, and `rust-toolchain(.toml)` and reports three kinds of lifecycle risk that an authoritative source states. It follows the existing [detector SDK](../DETECTORS.md) and the [v2 registry](0004-registry-v2.md).

## What Rust says about its own lifecycle

- **Only the newest stable release is supported.** The Rust security policy says the project "only provides support and security updates for the most recent stable release". A release line is therefore unsupported from the day the next stable release ships. Release dates are machine-readable in the project's `RELEASES.md`.
- **Editions never end.** The Edition Guide requires crates of every edition to interoperate, and no edition has been retired. There is no edition rule, and `edition` is read but never judged.
- **`rust-version` is a minimum, not the toolchain in use.** It declares the oldest compiler a crate promises to support, which libraries keep deliberately low. It is read but never judged: reporting it would be wrong for most well-maintained libraries.

## What the detector reads and judges

| Declaration | Files | Judged? |
|---|---|---|
| `channel = "<version>"` in `[toolchain]`; the legacy one-line `rust-toolchain` file | `rust-toolchain.toml`, `rust-toolchain` | Yes, when it is an exact release (`1.70`, `1.70.0`): it names the compiler that builds the project |
| Direct dependencies | `Cargo.toml`: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[workspace.dependencies]`, and target-specific tables; a renamed dependency (`package = "name"`) is matched by its real crate name | Yes, against crate rules |
| Resolved crate versions | `Cargo.lock`, for the direct dependencies only | Yes: a yanked version |
| `edition`, `rust-version` | `Cargo.toml` | No |

Rules:

1. **Toolchain.** One rule, "Rust 1.N and older are no longer supported" (`pkg:generic/rust`, `vers:semver/<1.N.0`, event `end-of-support`, severity `medium`), where 1.N is the newest stable release. Its deadline is the release date of 1.N, the day the line below it lost support. It moves every six weeks, so the importer drafts it from `RELEASES.md` and the weekly workflow proposes the change; `registry/rust.json` carries a short freshness window so a missed update is reported, not silent.
2. **Abandoned crates.** A rule for a direct dependency on a crate that the [RustSec advisory database](https://github.com/rustsec/advisory-db) marks `informational = "unmaintained"` (including "deprecated" notices such as `tempdir`), at any version (`pkg:cargo/<crate>`, `vers:cargo/*`, event `deprecated`). This is a lifecycle fact, not a vulnerability report.
3. **Yanked versions.** A rule for a crate whose resolved version in `Cargo.lock` was yanked on crates.io (`pkg:cargo/<crate>`, `vers:cargo/<version>|<version>`, event `removed`). The importer reads the crates.io API for a reviewed candidate list.

## What is dynamic, and what happens to it

`channel = "stable"` is always the newest release and is not a problem; `beta`, `nightly`, dated nightlies (`nightly-2024-01-01`), and a toolchain written as a path are not a release number and are listed as unclassified, never judged. A dependency declared with `path`, `git`, or `workspace = true`, or with a version that is not a literal string, is skipped: there is no crates.io version to judge. Cargo features and conditional (`cfg`) tables other than the dependency tables are not read. Transitive dependencies are out of scope: only what the project itself declares is reported.

## Where facts come from

Allowed, and recorded in each rule's sources: the Rust security policy (the support statement), `RELEASES.md` (release dates), the RustSec advisory database (unmaintained and deprecated crates), and the crates.io API (yanked versions). Rejected: download counts or popularity, "a newer version exists", blog posts, and any status inferred from a crate's age or activity.

## Out of scope for the first version

Vulnerability advisories, license policy, `cargo-deny` and `cargo-audit` configuration, proc-macro and build-script behavior, Cargo workspace inheritance beyond reading `[workspace.dependencies]`, and `Cargo.lock` of a dependency's own dependencies.

## Examples for the fixture task

True positives: a pinned `channel = "1.70.0"` while a newer stable exists; `failure = "0.1"` and `tempdir = "0.3"` in `[dependencies]`; `atty` renamed to `console`; `ansi_term` in `[dev-dependencies]`; a yanked version resolved in `Cargo.lock`.

Must not produce findings: `rust-version = "1.70"`; `edition = "2015"`; `channel = "stable"`; a commented-out `failure`; `failure` only in a description or a feature name; `path`, `git`, and `workspace = true` dependencies; a dynamic version; a root package in `Cargo.lock`; malformed TOML.

## Consequences

- A project that pins an old stable toolchain gets a medium-severity note, which is what Rust's own policy implies; it is a one-line change and Rust's compatibility promise keeps it low risk, which is why the severity is not `high`.
- The toolchain rule needs regular refreshes. That is intended and is handled by the scheduled importer rather than by a clock in the scanner: scans stay deterministic for a given data bundle.
- The yanked-version and unmaintained-crate rules need a reviewed candidate list, like the npm and Go importers, so coverage grows by reviewed additions.
