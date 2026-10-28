# Quickstart smoke test

The release workflow's `quickstart` job runs the commands documented in the README
[Quickstart](../README.md#quickstart) section with `npx --yes evergreen-deprecation@<version>` — the package users
get from npm, never a local build — on Linux, macOS, and Windows runners. The job fails the release when any
command's exit code or output differs from the expectations listed here. A broken quickstart fails the release.

Everything runs offline once the package is downloaded: Evergreen scans never touch the network.

## Setup per runner

Each runner copies `tests/fixtures/smoke/package.json` into a clean working directory, then runs every command
there with the published package in the quickstart form (`npx --yes evergreen-deprecation@<version>`). The fixture
declares exactly one deprecated package and one end-of-life Node.js range:

```json
{
  "name": "evergreen-smoke-fixture",
  "private": true,
  "engines": { "node": ">=18.0.0" },
  "dependencies": { "request": "^2.88.0" }
}
```

The release commit is verified first: `git tag --points-at HEAD` must name the `v` tag of the checked-out
`package.json` version, so the expectations below always describe the published release.

## Expected output

Values that change between releases are never pinned (the data version, review dates, deadlines, and the Node.js
rules an end-of-life calendar keeps adding). What is pinned is the shape and the stable identifiers.

### The package smoke script

`.github/scripts/smoke.mjs` runs first (the same script the publish workflow uses), so `--help`,
`capabilities --json`, and `scan` of the fixture must pass on every platform.

### `scan . --json`

Exits `0` and prints a scan result where:

- `schemaVersion` is `evergreen.scan.v1`.
- The findings include `npm.package.request.deprecated` at `package.json:5` and at least one `nodejs.runtime.*` rule.
- `unclassified.count` is `0`.
- Wall-clock duration is under the two-minute adoption goal (< 120 s), and the measured time is recorded in the job summary.

### `scan . --format compact`

Exits `0` and prints:

- A first line matching `Evergreen: N findings` (with at least one finding).
- One line per finding, `npm.package.request.deprecated:package.json:5 package.json:5 high` among them, each in the
  documented form `id path:line severity replacement`.
- The documented small cap: at most 25 finding lines, with the rest counted (shown as `N more findings omitted`), and
  never more than 8 KiB.

### `doctor .` and `doctor . --json`

Both exit `0`. The text output includes `Status: ready-with-warnings` and the final
`Privacy: no repository data was uploaded and no configuration was changed.` line. The JSON output has
`schemaVersion` `evergreen.doctor.v1`, `summary.failed` `0`, and `summary.status` `ready-with-warnings`.

The one warning is the plugin check: no stable host plugin is bundled with the package yet. When a release purposefully
changes doctor's checks — for example by graduating the plugins — this file and the workflow expectations are updated in
the same release.

### `capabilities --json`

Exits `0`, prints `schemaVersion` `evergreen.capabilities.v1`, and lists a non-empty `ecosystems` array that includes
`npm` — the rules that detection needs ship inside the package, none is fetched at scan time.

### `check pkg:npm/request@2.88.2` and `check pkg:npm/request@2.88.2 --json`

Both exit `1`, so the documented `--fail-on` behavior (default `high`) is visible in the quickstart:

- The text output includes `Status: affected (high)`, the `HIGH request is deprecated` finding, and the evidence source
  (`https://www.npmjs.com/package/request`).
- The JSON output has `schemaVersion` `evergreen.check.v1`, `status` `affected`, and a `high`-severity finding.

### `data status`

Exits `0` and includes `Evergreen lifecycle data` and `Source: bundled` (the quickstart works without refreshing data;
`data update` reads the network and stays out of this smoke test).

### `explain 'npm.package.request.deprecated:package.json:5' .`

Exits `0` and includes the rule (`Rule: npm.package.request.deprecated`), the location
(`Location: package.json:5`), and a `Sources:` section.

### `context 'npm.package.request.deprecated:package.json:5' . --json`

Exits `0` and prints `schemaVersion` `evergreen.context.v1`.

### `baseline .` then `scan . --baseline .evergreen-baseline.json --json`

`baseline .` exits `0`, reports what it wrote, and leaves `.evergreen-baseline.json` in the working directory. The scan
that follows exits `0` with `schemaVersion` `evergreen.scan.v1` and no findings: every fixture finding is accepted, so
the baseline path of the quickstart works on all three platforms.

## Failing intentionally

The job fails on the first expectation that does not hold, printing the command and the difference. Because the
expectations live in this file, a release that intentionally changes one of them must update this file in the same
pull request.
