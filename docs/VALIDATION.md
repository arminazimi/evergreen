---
title: v0.1 validation
---

# v0.1 validation

Evergreen v0.1 was validated on 2026-10-14 against 20 public repositories pinned to immutable commits: ten Node.js repositories, nine Python repositories, and one Node.js/GitHub Actions repository. The complete corpus and expected finding locations live in `benchmarks/public-repositories/`; the executable harness is `benchmarks/public-repositories.ts`.

## Results

Moved to [Validation corpus: Results](validation/corpus.md#results).

## GitHub Actions corpus additions

Moved to [Validation corpus: GitHub Actions corpus additions](validation/corpus.md#github-actions-corpus-additions).

## Method

Moved to [Validation corpus: Method](validation/corpus.md#method).

## The 50-repository corpus

Moved to [Validation corpus: The 50-repository corpus](validation/corpus.md#the-50-repository-corpus).

## Kubernetes corpus

Moved to [Ecosystem corpora: Kubernetes corpus](validation/ecosystems.md#kubernetes-corpus).

## Kubernetes blind selection

Moved to [Ecosystem corpora: Kubernetes blind selection](validation/ecosystems.md#kubernetes-blind-selection).

## Java and Kotlin corpus

Moved to [Ecosystem corpora: Java and Kotlin corpus](validation/ecosystems.md#java-and-kotlin-corpus).

## Java and Kotlin blind selection

Moved to [Ecosystem corpora: Java and Kotlin blind selection](validation/ecosystems.md#java-and-kotlin-blind-selection).

## Ruby corpus

Moved to [Ecosystem corpora: Ruby corpus](validation/ecosystems.md#ruby-corpus).

## PHP corpus

Moved to [Ecosystem corpora: PHP corpus](validation/ecosystems.md#php-corpus).

## Swift corpus

Moved to [Ecosystem corpora: Swift corpus](validation/ecosystems.md#swift-corpus).

## Swift blind selection

Moved to [Ecosystem corpora: Swift blind selection](validation/ecosystems.md#swift-blind-selection).

## Serverless corpus

Moved to [Ecosystem corpora: Serverless corpus](validation/ecosystems.md#serverless-corpus).

## Serverless blind selection

Moved to [Ecosystem corpora: Serverless blind selection](validation/ecosystems.md#serverless-blind-selection).

## .NET blind selection

Moved to [Ecosystem corpora: .NET blind selection](validation/ecosystems.md#net-blind-selection).

## CI runner images corpus

Moved to [Ecosystem corpora: CI runner images corpus](validation/ecosystems.md#ci-runner-images-corpus).

## C and C++ corpus

Issue #1897 promotes the C/C++ detector to stable. The corpus already held twelve C/C++ ecosystem entries (four targeted migration pins and eight blind pins from the 300-repository pass). The gap for Supported was zero-finding controls: only `catchorg/Catch2` had an empty `expected` list.

The blind zero-finding rule, fixed on 2026-11-07 before Evergreen ran on these additions: for each of `cmake_minimum_required(VERSION 3.20`, `cmake_minimum_required(VERSION 3.22`, and `cmake_minimum_required(VERSION 3.25`, run `gh search code <query> --filename CMakeLists.txt --limit 50`, walk the results in order, and keep unique repositories that are not forks, not archived, not larger than 5,000 KB on GitHub, and not already in the corpus. Pin each at its default-branch commit that day. Scan in walk order and keep a repository only when every detector reports nothing; stop as soon as the C/C++ ecosystem has four empty `expected` lists. The three additions are, in order: `j2kun/mlir-tutorial`, `rogerorr/NtTrace`, and `jagheterfredrik/meb-preheat`. Later walk hits that produced findings (for example `innobi/pantab`) were not kept. The search returns different results on another day, so the pinned list, not a re-run, is the record.

Across the 15 C/C++ corpus entries, four have no findings at all, and 11 of the 15 were selected blind (73%). Corpus-wide the harness expects 242 `cpp` findings in 20 repositories. A narrowed offline run of the `cpp` and `shell` ecosystems on 2026-11-07 reported 11 true positives for `cpp` on those entries, no false positives, and no false negatives.

## Shell and PowerShell corpus

Issue #1897 promotes the Shell detector to stable. The corpus already held twelve shell ecosystem entries (four targeted and eight blind). Counts before this issue: five repositories with shell findings, twelve expected shell findings, and two zero-finding controls.

The blind finding rule, fixed on 2026-11-07 before Evergreen ran on these additions: for each query below, run `gh search code <query> --limit 50` with the listed path filter, walk the results in order, and keep unique repositories that are not forks, not archived, not larger than 5,000 KB on GitHub, and not already in the corpus, taking up to eight repositories per query until twenty-eight were kept. Pin each at its default-branch commit that day. Queries: `#Requires -Version 6.0` / `7.0` / `7.1` / `7.2` / `7.3` (`--extension ps1`), `#requires -Version 6` (`--extension psm1`), `PowerShellVersion = '7.0'` and `PowerShellVersion = '6.0'` (`--filename *.psd1`), and `mcr.microsoft.com/powershell:7.2` / `7.3` (`--extension yml`). After the first scan, repositories whose findings were almost entirely other detectors (for example `Contrast-Security-OSS/agent-operator`) were dropped so the shell sample stayed reviewable; every kept entry still came from that walk and was not chosen by its Evergreen score.

The blind zero-finding rule, fixed the same day: the same walk for `#Requires -Version 7.4`, `#Requires -Version 7.5`, and `PowerShellVersion = '7.4'`, then keep empty `expected` lists until the shell ecosystem has at least four zero-finding repositories. Kept zeros from that walk include `arnobpl/SymlinkCreator`, `ndabas/pico-setup-windows`, `microsoft/azure-redcap-paas`, `agadiffe/WindowsMize`, `kaitai-io/kaitai_struct_cpp_stl_runtime`, and `hcoona/cxx-for-java-developers`.

Ground truth: every finding in the kept repositories, from every detector, was read at its pinned line and recorded with a `maintainer-review` note quoting the path and line. PowerShell dates come from Microsoft's [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle); other detectors cite their own vendor sources. Nothing in these entries is taken from Evergreen's output alone.

Across the 43 shell corpus entries, 29 have expected shell findings, nine have none, and 39 of the 43 were selected blind (91%). The corpus expects 102 shell findings in total. A narrowed offline run of the `cpp` and `shell` ecosystems on 2026-11-07 reported 102 true positives for `shell`, no false positives, and no false negatives.

## Go corpus

Issue #1892 added 31 Go entries: 24 blind and seven targeted. The targeted entries exercise multi-module repositories: `minio/minio` (twelve `go.mod` files, including five toolchain pins), `etcd-io/etcd` (five modules requiring the deprecated `github.com/golang/protobuf`), `hashicorp/vault` (three modules with the same requirement), `moby/moby` (four modules), `cli/cli` (a test module), and `containerd/containerd` (one module). `prometheus/prometheus` is a targeted zero-finding companion: it declares Go modules but no release line or module rule applies at the pin.

The blind rule, fixed on 2026-11-01 before Evergreen ran on these additions: GitHub repository search for `language:go stars:>=500 archived:false pushed:2023-01-01..2024-12-31`, sorted by stars descending. Walk the results in order and keep each repository whose default branch contains at least one `go.mod`, skipping repositories with more than 20 `Dockerfile*` files so that image findings do not crowd out the Go coverage. Take the first 24, whatever Evergreen reports for them. They are, in order: `FiloSottile/mkcert`, `ehang-io/nps`, `go-kit/kit`, `mislav/hub`, `gorilla/mux`, `matryer/xbar`, `bcicen/ctop`, `jmoiron/sqlx`, `julienschmidt/httprouter`, `sqshq/sampler`, `gophish/gophish`, `robfig/cron`, `golang/groupcache`, `revel/revel`, `bxcodec/go-clean-arch`, `gcla/termshark`, `sjwhitworth/golearn`, `dinedal/textql`, `akavel/up`, `apex/up`, `XiaoMi/soar`, `kelseyhightower/confd`, `smartystreets/goconvey`, and `p4gefau1t/trojan-go`. The search skipped `peterq/pan-light` (44 Dockerfiles) and `therecipe/qt` (71). The query returns different results on another day, so the pinned list above, not a re-run, is the record.

Ground truth: every finding in these repositories, from every detector, was read at its pinned line and recorded with a `maintainer-review` note naming the path and line. The Go release dates come from the [Go release policy](https://go.dev/doc/devel/release), the module deprecation from the module's `pkg.go.dev` page, and the other detectors' facts from their own vendor sources. Nothing in these entries is taken from Evergreen's output.

Across the 43 Go corpus entries, 39 have expected Go findings, four have none, and 31 of the 43 were selected blind (72%). A narrowed run of both ecosystems on 2026-11-01 reported 71 expected Go findings, 71 true positives, no false positives, and no false negatives. The full run the same day reported all 111 Go findings the corpus expects across every ecosystem, with no false positives and no false negatives.

## Rust corpus

Issue #1892 added 66 Rust entries: 46 blind and 20 targeted. The targeted rule, fixed on 2026-11-01: GitHub code search for `atty`, `ansi_term`, `failure`, and `tempdir` in `Cargo.toml`, deduplicated by repository and restricted to 200–2000 stars, sorted by stars descending; take the first 20 repositories not already in the corpus. They are: `Macchina-CLI/macchina`, `PaddiM8/kalker`, `mike-engel/jwt-cli`, `NixOS/nix-index`, `rabite0/hunter`, `dduan/tre`, `starcoinorg/starcoin`, `koute/cargo-web`, `clog-tool/clog-cli`, `pop-os/popsicle`, `paritytech/parity-bitcoin`, `chmln/handlr`, `gsquire/topngx`, `dwisiswant0/ppfuzz`, `Isona/dirble`, `sitkevij/hex`, `sit-fyi/sit`, `elkowar/pipr`, `jez/as-tree`, and `rust-lang/team`. The star cap keeps the sample to projects similar in scale to the rest of the corpus; the code search returns different results on another day, so the pinned list is the record.

The blind rule, fixed on the same date: GitHub repository search for `language:rust stars:>=300 archived:false pushed:2020-01-01..2022-06-30`, sorted by stars descending. Walk the results in order and keep each repository whose default branch contains a `Cargo.toml`; take the first 46, whatever Evergreen reports for them. They are, in order: `mit-pdos/noria`, `PistonDevelopers/conrod`, `nickel-org/nickel.rs`, `Kintaro/wtftw`, `rajasekarv/vega`, `zhuowei/nft_ptr`, `amethyst/legion`, `dimforge/nphysics`, `mesalock-linux/mesalink`, `tensorbase/tensorbase`, `lpxxn/rust-design-pattern`, `PumpkinDB/PumpkinDB`, `willdoescode/nat`, `ihciah/clean-dns-bpf`, `archseer/enigma`, `wubx/rust-in-databend`, `bwasty/learn-opengl-rs`, `spacejam/rio`, `Esc4iCEscEsc/skanuvaty`, `tsgates/rust.ko`, `headcrab-rs/headcrab`, `nachoparker/dutree`, `rustodon/rustodon`, `d-unsed/ruru`, `sciter-sdk/rust-sciter`, `bheisler/RustaCUDA`, `DanielKeep/cargo-script`, `raphlinus/font-rs`, `murarth/ketos`, `skyward-finance/contracts`, `h3r2tic/cornell-mcray`, `imager-io/imager`, `TimUntersberger/nog`, `ringbahn/ringbahn`, `altdesktop/i3-style`, `KOBA789/relly`, `rom1v/autoadb`, `TaKO8Ki/frum`, `crazymykl/rust-koans`, `quadrupleslap/scrap`, `tokio-rs/tokio-core`, `maciejkula/rustlearn`, `howardwu/wagyu`, `withoutboats/fehler`, `mathall/rim`, and `zackradisic/aussieplusplus`.

Ground truth: every finding in these repositories, from every detector, was read at its pinned line and recorded with a `maintainer-review` note naming the path and line. Crate status comes from the [RustSec advisory database](https://rustsec.org/), the toolchain dates from the [Rust release policy](https://www.rust-lang.org/policies/security), and the other detectors' facts from their own vendor sources.

Across the 78 Rust corpus entries, 36 have expected Rust findings, 28 have no findings at all, and 53 of the 78 were selected blind (68%). A narrowed run of both ecosystems on 2026-11-01 reported 61 expected Rust findings, 61 true positives, no false positives, and no false negatives. The full run the same day reported all 63 Rust findings the corpus expects across every ecosystem, with no false positives and no false negatives.

## The 300-repository corpus

Moved to [Validation corpus: The 300-repository corpus](validation/corpus.md#the-300-repository-corpus).

## The 456-repository corpus

Moved to [Validation corpus: The 456-repository corpus](validation/corpus.md#the-456-repository-corpus).

## The held-out set

Moved to [Validation corpus: The held-out set](validation/corpus.md#the-held-out-set).

## Precision thresholds

[`benchmarks/thresholds.json`](../benchmarks/thresholds.json) sets a precision floor per detector (`github-actions`, `nodejs`, `npm`, `python`, `dotnet`, `java`, `kubernetes`, `serverless`, and `swift` enforce it; a detector is named by the first segment of its rule ids). The harness scores each detector, prints the figures under `detectors` in its JSON, and reports `thresholdViolations`. A stable detector below its `minPrecision` (0.95 today) fails the run with a line such as:

```text
THRESHOLD  npm: precision 0.9 is below the required 0.95
```

A detector at `beta` or `stable` also has a recall floor, 0.80 and 0.90 (decision 0013), computed as true positives over true positives plus false negatives; a full run below it prints `THRESHOLD  <detector>: recall … is below the required …`, fails, and cannot be recorded. Every corpus entry records `selection` (`blind` or `targeted`), and a test fails when one does not; entries added before the field existed were all picked from reviewed migration commits or known findings, so they record `targeted`.

The weekly corpus workflow therefore fails on a precision regression even if the exact-match comparison is later relaxed. Mark a new detector `"stable": false` until its corpus coverage is meaningful; it is still scored and reported but never fails the run. Never lower a floor to make a run pass.

## Fetching and the checkout cache

Moved to [Running the corpus: Fetching and the checkout cache](validation/running-the-corpus.md#fetching-and-the-checkout-cache).

## Running a subset

Moved to [Running the corpus: Running a subset](validation/running-the-corpus.md#running-a-subset).

### Re-running only what failed

Moved to [Running the corpus: Re-running only what failed](validation/running-the-corpus.md#re-running-only-what-failed).

### Comparing with an earlier run

Moved to [Running the corpus: Comparing with an earlier run](validation/running-the-corpus.md#comparing-with-an-earlier-run).

### Managing the cache

Moved to [Running the corpus: Managing the cache](validation/running-the-corpus.md#managing-the-cache).

### Warm ahead, run offline

Moved to [Running the corpus: Warm ahead, run offline](validation/running-the-corpus.md#warm-ahead-run-offline).

### Running only what a change affects

Moved to [Running the corpus: Running only what a change affects](validation/running-the-corpus.md#running-only-what-a-change-affects).

## Run cost and budget

Moved to [Running the corpus: Run cost and budget](validation/running-the-corpus.md#run-cost-and-budget).

## Stalled fetches

Moved to [Running the corpus: Stalled fetches](validation/running-the-corpus.md#stalled-fetches).

## Reading a run

Moved to [Running the corpus: Reading a run](validation/running-the-corpus.md#reading-a-run).

## Recording a full run

Moved to [Running the corpus: Recording a full run](validation/running-the-corpus.md#recording-a-full-run).

## Pull request check

Moved to [Running the corpus: Pull request check](validation/running-the-corpus.md#pull-request-check).

## Keeping `lastFullRun` current

Moved to [Running the corpus: Keeping `lastFullRun` current](validation/running-the-corpus.md#keeping-lastfullrun-current).

## Weekly run and refreshing pins

Moved to [Running the corpus: Weekly run and refreshing pins](validation/running-the-corpus.md#weekly-run-and-refreshing-pins).

## Differential testing against Renovate

Moved to [Differential testing: Differential testing against Renovate](validation/differential-testing.md#differential-testing-against-renovate).

## Differential testing against xeol

Moved to [Differential testing: Differential testing against xeol](validation/differential-testing.md#differential-testing-against-xeol).

## Differential testing against Pluto

Moved to [Differential testing: Differential testing against Pluto](validation/differential-testing.md#differential-testing-against-pluto).

## Accuracy by detector

Precision is true positives over true positives plus false positives; recall is true positives over true positives plus false negatives. Both come from the last full corpus run recorded in [`benchmarks/thresholds.json`](../benchmarks/thresholds.json), so a reader can regenerate every number: run `npm run record:corpus-run`, then `npm run build:coverage`. The table below is generated; a test fails when it drifts from the recorded run. `nodejs` is the Node.js runtime rules served by the npm detector. A dash means the last full run did not score that detector.

<!-- accuracy-tables:start -->
Measured on 557 pinned repositories at commit `dcc9f320` on 2026-11-06. Regenerate with `npm run build:coverage` after `npm run record:corpus-run`.

| Detector | Maturity | True positives | False positives | False negatives | Precision | Recall |
| --- | --- | --- | --- | --- | --- | --- |
| android | Experimental | 10 | 0 | 0 | 1.000 | 1.000 |
| ci-images | Supported | 13 | 0 | 0 | 1.000 | 1.000 |
| container | Supported | 368 | 0 | 0 | 1.000 | 1.000 |
| cpp | Supported | 19 | 0 | 0 | 1.000 | 1.000 |
| dart | Experimental | 8 | 0 | 0 | 1.000 | 1.000 |
| database | Experimental | 20 | 0 | 0 | 1.000 | 1.000 |
| deno | Experimental | 0 | 0 | 0 | n/a | n/a |
| dotnet | Supported | 304 | 0 | 0 | 1.000 | 1.000 |
| elixir | Experimental | 0 | 0 | 0 | n/a | n/a |
| github-actions | Supported | 1262 | 0 | 0 | 1.000 | 1.000 |
| go | Supported | 111 | 0 | 0 | 1.000 | 1.000 |
| java | Beta | 61 | 0 | 0 | 1.000 | 1.000 |
| kubernetes | Beta | 80 | 0 | 0 | 1.000 | 1.000 |
| nodejs | Supported | 349 | 0 | 0 | 1.000 | 1.000 |
| npm | Supported | 108 | 0 | 0 | 1.000 | 1.000 |
| php | Supported | 5 | 0 | 0 | 1.000 | 1.000 |
| python | Supported | 135 | 0 | 0 | 1.000 | 1.000 |
| ruby | Supported | 24 | 0 | 0 | 1.000 | 1.000 |
| rust | Supported | 63 | 0 | 0 | 1.000 | 1.000 |
| scala | Experimental | 2 | 0 | 0 | 1.000 | 1.000 |
| serverless | Beta | 168 | 0 | 0 | 1.000 | 1.000 |
| shell | Supported | 12 | 0 | 0 | 1.000 | 1.000 |
| swift | Supported | 20 | 0 | 0 | 1.000 | 1.000 |
| terraform | Experimental | 66 | 0 | 0 | 1.000 | 1.000 |
<!-- accuracy-tables:end -->

## Mutation testing baseline

Line coverage shows which lines run; mutation testing asks whether the tests would notice a bug in them. `npm run test:mutation` runs [Stryker](https://stryker-mutator.io/) with the command runner over `src/engine/`, `src/baseline.ts`, `src/diff.ts`, and `src/vers/`, rebuilding with `tsc` and executing the unit tests that target those modules. The nightly [Mutation](../.github/workflows/mutation.yml) workflow publishes the score and surviving mutants in the job summary. It does not fail the build on the score yet.

First measured score on 2026-10-30 (commit `470542f4`): **59.59%** (1,139 killed, 7 timed out, 777 survived; 1,923 mutants). Per-file: `src/vers/` 80.12%, `src/baseline.ts` 72.78%, `src/diff.ts` 57.94%, `src/engine.ts` 23.12%.

## Interpretation and limits

Precision and recall are measured only against Evergreen's documented v0.1 rule set and the pinned corpus. They do not mean Evergreen detects every possible deprecation in these ecosystems. The corpus is public and reproducible, but not a statistically representative sample of all software. Dynamic action references and unsupported ecosystems remain intentionally unclassified.

The controlled source-usage benchmark provides a separate exact-match test for imports, calls, and configuration keys; see [Benchmarks](BENCHMARKS.md).
