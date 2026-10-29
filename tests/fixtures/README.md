# Test fixtures

Each subdirectory is a small untrusted repository (or a set of them) that detectors and tests scan without executing. Prefer the layout in [Detector authoring](../../docs/DETECTORS.md#start-a-new-detector-in-this-repository): a README table, then `positive/`, `negative/`, `zero/`, and `malformed/` cases as needed.

## Edge-case fixture issues

False-positive boundaries that maintainers have already triaged become small `good first issue` tasks so newcomers can lock them into on-disk fixtures. Open ones from this batch (#1320):

| Issue | Edge case | Source of triage |
| --- | --- | --- |
| [#1686](https://github.com/arminazimi/evergreen/issues/1686) | npm `@types/*` stub deprecations | [#822](https://github.com/arminazimi/evergreen/issues/822) |
| [#1687](https://github.com/arminazimi/evergreen/issues/1687) | Swift library `Package.swift` platforms vs App Store rules | [#808](https://github.com/arminazimi/evergreen/issues/808) |
| [#1688](https://github.com/arminazimi/evergreen/issues/1688) | Node.js `engines.node` pins | [Held-out set](../../docs/VALIDATION.md#the-held-out-set) |
| [#1689](https://github.com/arminazimi/evergreen/issues/1689) | GitHub Actions `strategy.matrix` Node.js entries | [Held-out set](../../docs/VALIDATION.md#the-held-out-set) |
| [#1690](https://github.com/arminazimi/evergreen/issues/1690) | PHP dynamic `require` / `include` stay unclassified | [COMPATIBILITY.md](../../docs/COMPATIBILITY.md#known-limits-and-false-positive-boundaries) |

Browse every open fixture task: [type: fixture is:open](https://github.com/arminazimi/evergreen/issues?q=is%3Aopen+label%3A%22type%3A+fixture%22).
