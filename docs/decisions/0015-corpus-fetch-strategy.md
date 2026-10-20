# 0015 — Corpus fetch strategy: sparse checkout, concurrency 16

Status: accepted

## Problem

A cold corpus run fetched 112 repositories with `git fetch --depth 1` and a full checkout, six at a time: about 179 s of wall time and 761 MB of git data (2.2 GB checked out). The epic wants a cold run of at most 2 minutes. Network volume and request latency are the cost; scanning is not.

## Options measured

Same machine, same network, cold, all 112 entries at the pinned commits, one run each (`node dist/benchmarks/fetch-strategies.js --strategy <name> --concurrency <n> --baseline shallow.json`). "Fetched" is the size of the fetched git data (`.git`), since git does not report network bytes; for the tarball it would be the download size.

| Strategy | Concurrency | Wall time | Fetched | On disk | Findings |
|---|---|---|---|---|---|
| `shallow` (before) | 6 | 178.7 s | 760.7 MB | 2226.7 MB | baseline |
| `shallow` | 16 | 83.3 s | 760.7 MB | 2226.7 MB | identical |
| `shallow` | 32 | 86.9 s | 760.7 MB | 2226.7 MB | identical |
| `sparse` | 6 | 169.3 s | 186.9 MB | 679.8 MB | identical |
| `sparse` | 16 | **49.8 s** | **186.9 MB** | **679.8 MB** | identical |
| `tarball` | 6 | did not finish | | | |

- **`shallow`** is the current fetch. Concurrency is the larger lever: 16 halves the time, and 32 gains nothing more, so the limit is per-repository latency and GitHub, not our parallelism.
- **`sparse`** is a blobless shallow fetch (`--filter=blob:none`) followed by a sparse checkout of exactly the files the detectors declare they read (decision from issue #856: `inputs` on every detector). It is 4.07 times smaller to fetch and 3.28 times smaller on disk. At concurrency 6 it is no faster, because it adds a second request for the blobs; at 16 the smaller transfers pay off and it is 3.6 times faster than the original.
- **`tarball`** (`codeload.github.com/<owner>/<repo>/tar.gz/<commit>`) did not complete: five large repositories (astro, excalidraw, mealie, docusaurus, pydantic-ai) failed every attempt within a 120 s limit, and the run then crashed while cleaning up a half-extracted tree. It also omits files marked `export-ignore` and handles symbolic links and submodules differently from a checkout, which could change what a scan sees. Not adopted.

Results were identical to the baseline in every completed run: the same findings for every repository, so the same true positives, false positives, and false negatives. The measurements are single runs on one network; the ratios, not the exact seconds, are the finding.

## Decision

1. Adopt `sparse` as the default fetch (`EVERGREEN_CORPUS_FETCH=shallow` restores the full checkout), because it is at least 2 times smaller and, with concurrency 16, at least 2 times faster, and the results are identical.
2. Raise the default concurrency from 6 to 16.
3. A cached sparse checkout records what it was built from in `.evergreen-fetch` (a hash of the patterns derived from the detectors' `inputs`). A cached entry is used only if it is a complete checkout (no marker) or its hash matches today's declarations; otherwise it is removed and fetched again. This keeps a detector that starts reading a new file from scanning a stale, incomplete cache. Offline and warm runs apply the same test.
4. Tighten the budget in `benchmarks/thresholds.json` to 120 s of wall time and 250 MB fetched.

Detectors still read exactly what they read; the declarations were checked against every corpus checkout (9,454 reads, none outside them) in #856, and a test keeps the sparse patterns equal to what the declarations allow.

## Result

With a fresh cache and the defaults, the full corpus run took 56 s cold (186.9 MB fetched, 569 MB cached) and 5.6 s warm, with findings identical to the earlier full-checkout run. The epic's targets (cold at most 2 minutes, warm at most 30 s) are met.

## Consequences

- A sparse cache entry holds only declared files. Do not read other files from it; use `EVERGREEN_CORPUS_FETCH=shallow` for a full checkout.
- Requires git 2.25 or newer for `--filter` and sparse checkout. GitHub-hosted runners have it.
- The first run after upgrading refetches nothing for existing full entries (they have no marker); new entries are sparse.
