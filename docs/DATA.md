# Lifecycle data: updates, signing, and trust

Evergreen's findings come from lifecycle rules (`registry/`). The rules that ship inside each release are always available. Between releases you can fetch newer rules, which are signed so that Evergreen can tell they came from the project's release workflow. This page explains how that works, what is checked, and what Evergreen promises.

## What you can rely on

- **Scans never use the network.** A scan, `check`, `explain`, `context`, `baseline`, `doctor`, and `data status` read local files only. The only command that connects to anything is `evergreen data update`, and it runs only when you run it. A test fails if any other code path opens a socket, resolves a name, or calls `fetch`.
- **Downloaded data is verified before it is used, every time it is loaded.** If it cannot be verified, Evergreen uses the data shipped with the installed release and says so in the result. It never loads data it could not verify.
- **You can see how fresh the evidence is.** Every scan and check says which data it used and how old it is, and warns when that is more than 30 days.
- **You can fix the data version** for reproducible CI.
- **No account, no telemetry.** Updating asks a public release list and downloads public files. Nothing about you or your repository is sent.

## Commands

```bash
evergreen data status                       # which data is in use, where it came from, how old it is (--json for tools)
evergreen data update                       # fetch and verify the newest signed bundle
evergreen data update --data-version 2026.10.01   # fetch exactly that bundle, without making it active
evergreen scan . --data-version 2026.10.01  # use exactly that bundle (every command takes this)
EVERGREEN_DATA_VERSION=bundled evergreen scan .   # use only the data shipped with this release
```

`data status` reports one of three sources: **bundled** (shipped with the release), **cache** (the newest verified download), or **pinned** (the version you asked for). Its age is counted from when a downloaded bundle was built, or from the newest review date among the rules for bundled data.

### Updating

`evergreen data update` lists the project's `data-v…` releases, picks the newest one that has a bundle and a signature, downloads both (https only, with size limits and timeouts), verifies them completely, and only then stores them in your cache and makes them active. If anything is wrong the previous data stays active and nothing is written. Running it again when nothing changed says so.

It refuses a bundle that is older than the active one (a replayed old bundle would roll your rules back), a bundle the installed release already beats, and anything that fails verification. Three bundles are kept.

Downloads honor `HTTP_PROXY`, `HTTPS_PROXY`, and `NO_PROXY` (Node.js 22.21 or newer). To use a mirror, point `EVERGREEN_DATA_URL` at its release list.

### Pinning

`--data-version X` or `EVERGREEN_DATA_VERSION=X` (the flag wins) makes Evergreen use exactly bundle `X` from your cache, or `bundled` for the data shipped with the release. Unlike the automatic choice, a pin that cannot be met **stops the run** with exit code 2 instead of quietly using something else, so a CI job that pins its data either uses it or fails. The message tells you how to fetch it: `evergreen data update --data-version X`. A pinned bundle is verified just like any other, and is used whatever its age (the stale warning still appears).

### Where the data is stored

`EVERGREEN_DATA_DIR` if set, otherwise `~/Library/Caches/evergreen` (macOS), `$XDG_CACHE_HOME/evergreen` or `~/.cache/evergreen` (Linux), or `%LOCALAPPDATA%\evergreen\Cache` (Windows). Inside, `data/<version>/` holds `bundle.json` and its signature `bundle.json.sigstore.json`, and `data/active.json` names the active version. Deleting the directory returns Evergreen to the bundled data.

## What is in a bundle

One JSON file (`evergreen.data-bundle.v1`, [schema](../schemas/data-bundle.v1.schema.json), [decision record](decisions/0006-data-bundle.md)) with a manifest and the files the detectors read: the five registries (container images, GitHub Actions, Node.js, npm, Python) and the GitHub Actions SHA map. The manifest lists each file's SHA-256, size, and rule count, a content address for the whole set, the build time, and the oldest Evergreen version that can read it. Versions look like `2026.10.16`, with `.N` for a second bundle on the same day. Building the bundle is deterministic: the same registry files and build time give the same bytes.

## Trust model

A bundle is signed with **Sigstore keyless signing**. There is no long-lived signing key to steal or lose: the release workflow proves who it is to Sigstore with a short-lived GitHub identity token, receives a certificate that lasts minutes, signs the bundle, and the signature is recorded in a public transparency log.

Evergreen accepts a bundle only if **all** of these hold, checked offline:

1. The signature verifies against the exact bytes downloaded (certificate chain, validity period, transparency-log inclusion).
2. The signer is the project's release workflow: issuer `https://token.actions.githubusercontent.com` and an identity matching

   ```text
   ^https://github\.com/arminazimi/evergreen/\.github/workflows/data-release\.yml@refs/(?:tags/data-v\d{4}\.\d{2}\.\d{2}(?:\.\d+)?|heads/main)$
   ```

   A valid signature from any other workflow, repository, or branch is refused.
3. The format is one Evergreen understands and its `minimumEvergreenVersion` is not newer than the installed release.
4. The bundle is complete, and every file matches its digest and size, with nothing missing or extra.

The certificates and log keys come from the Sigstore public-good trusted root, which ships in the npm package (`data/sigstore-trusted-root.json`) so that verification needs no network. That is also why you should keep Evergreen reasonably current: if Sigstore rotates its keys and the root in your installed release is too old, signatures made after the rotation stop verifying. Evergreen then falls back to its bundled data and tells you; it does not skip the check.

To check a release by hand with [cosign](https://docs.sigstore.dev/):

```bash
cosign verify-blob \
  --bundle evergreen-data-2026.10.16.json.sigstore.json \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  --certificate-identity-regexp '^https://github\.com/arminazimi/evergreen/\.github/workflows/data-release\.yml@refs/(?:tags/data-v\d{4}\.\d{2}\.\d{2}(?:\.\d+)?|heads/main)$' \
  evergreen-data-2026.10.16.json
```

### What this does not protect against

- A compromise of the repository's release workflow or of a maintainer with permission to push a `data-v…` tag: the workflow would sign whatever it was given. Rule changes are reviewed before they reach `main`, and the signature proves where a bundle came from, not that its contents are correct.
- A compromised Evergreen package: the trusted root and the signer identity are part of the release you installed.
- Wrong evidence. Signing says who published a rule, not that the claim is true; each rule cites its sources and review date for that reason.

## When something is wrong

Evergreen reports every refusal in the result, in the scan's `diagnostics` and in `data status`, for example:

```text
Ignoring downloaded lifecycle data 2026.10.16: registry/npm.json does not match its digest. Using the data bundled with Evergreen 0.2.0.
```

Common causes are a damaged download (run `evergreen data update` again), a bundle that needs a newer Evergreen (upgrade), and an expired trust root (upgrade). Data that is merely old is not an error; it is flagged stale after 30 days, and `evergreen data update` is the remedy.

## Publishing a bundle

Maintainers push a `data-vYYYY.MM.DD` tag; see [Releasing](RELEASING.md#publishing-lifecycle-data). The workflow builds the bundle twice and requires identical bytes, signs it, verifies the signature, and attaches the bundle, the signature, and checksums to a GitHub release.
