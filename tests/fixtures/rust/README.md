# Rust fixtures

These fixtures define the parser boundary for Rust declarations (see [decision 0011](../../../docs/decisions/0011-rust-detector.md)). Parsers return exact one-based line numbers, return nothing for unsupported or dynamic forms, and never throw for malformed input.

| Fixture | Expected case |
| --- | --- |
| `positive/Cargo.toml` | Direct dependencies from `[dependencies]` (line 8 `failure`, line 9 `tempdir` as an inline table, line 10 `serde` with features, line 11 a renamed `package = "atty"`), `[dev-dependencies]` (line 14 `ansi_term`), `[build-dependencies]` (line 17 `cc`), and a target-specific table (line 20 `libc`). `edition` (line 4) and `rust-version` (line 5) are read but never judged: editions do not end, and `rust-version` is a minimum, not the toolchain in use. |
| `positive/Cargo.lock` | Resolved versions: `failure` 0.1.8 (line 7) and `serde` 1.0.197 (line 21). The root package `positive` (line 12) is the project itself, not a dependency. |
| `positive/rust-toolchain.toml` | A pinned toolchain `channel = "1.70.0"` (line 2). |
| `positive/legacy/rust-toolchain` | The legacy one-line form, `1.65.0` (line 1). |
| `positive/workspace/Cargo.toml` | `[workspace.dependencies]` entries (line 8 `failure`, line 9 `serde`) and the workspace `edition` (line 5). |
| `negative/Cargo.toml` | Comments, prose in `description`, a feature named like a crate, `path`, `git`, and `workspace = true` dependencies, a dynamic version, and a metadata table produce no dependency declarations. |
| `negative/rust-toolchain.toml` | A commented-out version and `channel = "stable"`: nothing is pinned to a release. |
| `negative/Cargo.lock` | A comment that mentions a crate and a package with no `source` (a path package) produce no judged dependency. |
| `zero/` | A valid project on a current edition with no pinned toolchain release: no findings. |
| `malformed/Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` | Truncated TOML is handled without throwing and without partial results. |
