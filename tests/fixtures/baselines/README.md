# Baseline fixtures

Baselines written by released versions of Evergreen, used to prove that a baseline never stops working after an upgrade.

| File | Written by | How |
| --- | --- | --- |
| `v0.1.0.json` | the published `evergreen-deprecation@0.1.0` | `npx -p evergreen-deprecation@0.1.0 evergreen baseline <dir> --output v0.1.0.json`, run on a copy of `tests/fixtures/smoke/package.json` |

Add a file here for each release that changes how baselines are written. Never edit an existing file: it is the record of what that release produced.
