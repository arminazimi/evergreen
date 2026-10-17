# Releasing Evergreen

Any maintainer can cut a release by following this page. A release publishes four things that must agree on one version: the npm package `evergreen-deprecation`, the GitHub Action (`arminazimi/evergreen@vX.Y.Z`), the generated Claude and Codex plugin packages, and the bundled lifecycle registries inside the package. Publishing needs maintainer accounts, so releases are `lane: maintainer` work.

## Before you start

- You are on an up-to-date `main` with a clean working tree, and CI on `main` is green.
- You can publish to the `evergreen-deprecation` package on npm and push tags to the repository.
- Choose the version. Patch for fixes and rule data, minor for new detectors, commands, or output fields, and a major version only for a breaking change to an output schema or the detector SDK.

## Gates

Every gate must pass on the commit you will tag. None of them is optional.

| Gate | Command | What it proves |
|---|---|---|
| Full check | `npm run check` | Build, Action bundle matches source, all tests including coverage floors in CI, plugin packages are in sync, plugin evals. This is what CI and `npm publish` (through `prepack`) run. |
| Coverage floors | `npm run test:coverage` | Lines, branches, and functions stay above the floors in `package.json`. |
| Public corpus | `npm run validate:public-repos` | Exact findings on every pinned public repository, and each detector's precision above its floor in `benchmarks/thresholds.json`. Needs network. |
| Source freshness | `npm run check:sources` | No rule is stale and no source has moved or disappeared. Needs network. Review anything it reports before releasing. |
| Package contents | `npm pack --dry-run` | Only `dist/src`, `examples`, `registry`, `schemas`, and `skills` ship; `registry/sources.lock.json` does not. |

The last weekly runs of the corpus and source-freshness workflows should also be green. If either is red, fix or explain it before tagging.

## One-time npm setup

Trusted publishing needs the package to name its publisher. On npmjs.com, open the `evergreen-deprecation` package, then Settings, then Trusted Publisher, choose GitHub Actions, and enter organization or user `arminazimi`, repository `evergreen`, and workflow filename `publish.yml` (leave the environment empty). Once a release has published this way, set the package's publishing access to "Require two-factor authentication and disallow tokens" so that only this workflow can publish. To rehearse the path before a real release, push a pre-release tag such as `vX.Y.Z-rc.1` from `main`.

## Steps

1. **Update the changelog.** Draft the entries from conventional commits with `npm run release:notes` (or run the *Release notes* workflow, which uploads the same text), then write them into `CHANGELOG.md`:

   ```bash
   node dist/tools/changelog.js --write X.Y.Z --date YYYY-MM-DD
   ```

   Only `feat`, `fix`, and breaking commits become entries; `docs`, `test`, `ci`, and `chore` commits are left out. The command moves the hand-written `Unreleased` bullets into a new `## X.Y.Z - YYYY-MM-DD` section, appends the generated bullets, and leaves an empty `## Unreleased` above. Read the section, remove duplicates, and make each bullet a clear imperative sentence.
2. **Bump the version.** Run `npm version X.Y.Z --no-git-tag-version`, then regenerate everything derived from it:

   ```bash
   npm run build:plugins
   npm run build:action
   ```

   This updates the plugin manifests and `.mcp.json` pins under `plugins/` and `.claude-plugin/marketplace.json`, and rebuilds `dist/action/index.js`. Never edit those generated files by hand.
3. **Update the version in the docs and examples.** The README and `docs/GITHUB_ACTION.md` show `arminazimi/evergreen@vX.Y.Z`; update them to the new tag. The host setups under `examples/agents/` pin `evergreen-deprecation@X.Y.Z` (and the Gemini extension its `version`); a test fails until they match `package.json`. `server.json` (the MCP Registry description) carries the version twice; bump it with `package.json`, and a test fails until they agree.
4. **Run the gates** above on the result, then commit as `chore: release X.Y.Z` through a pull request. Merge it once CI is green.
5. **Tag the merge commit.** On `main` after the merge:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. **Publish to npm.** Pushing the tag in step 5 runs [`publish.yml`](../.github/workflows/publish.yml), which publishes with npm trusted publishing: no stored token, and a provenance attestation that names this repository, workflow, and commit. It refuses a tag that does not match the version in `package.json` or a commit that is not on `main`, and `prepack` runs `npm run check` again, so a broken tree cannot be published. A pre-release tag such as `vX.Y.Z-rc.1` is published under the `next` tag, so `latest` does not move. Watch the run in the Actions tab, then confirm with `npm view evergreen-deprecation version` and run `npx evergreen-deprecation@X.Y.Z --help` in an empty directory. To publish by hand instead (for example if the workflow is unavailable), run `npm publish` from the tagged commit; it will have no provenance.
7. **Create the GitHub release** for the tag, with the changelog section as the body.
8. **Move the major tag** only if the project publishes one (for example `v1`), as a force-updated lightweight tag pointing at the new release. Do not move it for a pre-1.0 version.
9. **Package the plugins.** For Codex, `npm run package:codex-plugin` writes `artifacts/evergreen-codex-plugin-<version>.zip`; follow [Codex submission](CODEX_SUBMISSION.md) to submit it. The Claude plugin is served from the repository marketplace, so the merged change in step 4 is its release; see [Claude plugin](CLAUDE_PLUGIN.md).
10. **Announce** only after the npm package, tag, and release are live.

## Rule data

Lifecycle rules ship inside the npm package under `registry/`, so every package release carries the rules as of its commit. Between package releases, rules reach users through a signed data release.

## Publishing lifecycle data

Use this when rules change and you do not want to wait for a package release. The data in `registry/` on `main` is what gets published, so merge the rule changes first and let CI pass.

1. **Check the data.** `npm run check`, then `npm run validate:public-repos` and `npm run check:sources` as in the gates above.
2. **Dry run.** In GitHub, open Actions, *Data release*, *Run workflow* on `main` with *dry run* on (the default). It builds the bundle twice and requires identical bytes, signs it, verifies the signature, and keeps the files as a workflow artifact without publishing anything. Note that signing writes an entry to the public Sigstore transparency log, even in a dry run.
3. **Tag.** The tag must be `data-v` plus the date of the commit being released in UTC, with `.N` for a second bundle that day:

   ```bash
   git tag -a data-v2026.10.16 -m "Lifecycle data 2026.10.16" <commit>
   git push origin data-v2026.10.16
   ```

   If the tag and the bundle's version disagree the workflow stops and says which tag the commit needs.
4. **Confirm.** The release has `evergreen-data-<version>.json`, its `.sigstore.json` signature, and `SHA256SUMS`. On a clean machine, `evergreen data update` should report the new version, and `evergreen data status` should show `cache` and the signer identity.

A data release does not change the npm package or the Action. If the data format itself changes, that needs a new `schemaVersion`, a package release that understands it, and a `minimumEvergreenVersion` in the bundle. See the [decision record](decisions/0006-data-bundle.md) and [Lifecycle data](DATA.md).

## Rolling back

Decide by what has already been published, and prefer fixing forward.

- **Nothing published yet** (the pull request or tag only): close the pull request, or delete the tag with `git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`.
- **Bad npm release**: do not rely on `npm unpublish`, which is restricted for packages that have users. Publish a fixed patch release, then mark the bad one with `npm deprecate evergreen-deprecation@X.Y.Z "Use X.Y.Z+1: <reason>"`.
- **Bad Action tag**: users pin the tag, so ship a fixed patch tag and point the README at it. If you must move a tag that was published only minutes ago, say so in the release notes.
- **Bad plugin package**: revert the generated files through a pull request and release a patch version; withdraw a pending Codex submission through its portal.
- **Bad rule**: revert or correct the rule in `registry/` and release a patch. If the rule is actively harmful (it reports something that is not deprecated), release first and discuss afterwards.

After any rollback, add a line to `CHANGELOG.md` explaining what happened and which version replaces the bad one.
