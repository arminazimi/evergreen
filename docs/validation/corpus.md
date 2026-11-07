---
title: Validation corpus
---

# Validation corpus

The public corpus behind the validation record: how it grew, how repositories were chosen blind, and the held-out set. The summary and the accuracy table are on [Validation](../VALIDATION.md).

## Results

| Measure | Result |
| --- | ---: |
| Repositories | 20 |
| Expected findings | 27 |
| True positives | 27 |
| False positives | 0 |
| False negatives | 0 |
| Precision | 1.0000 |
| Recall | 1.0000 |
| Median scan time | 8.19 ms |
| p95 scan time | 48.88 ms |
| Slowest scan | 49.73 ms |

Scan time measures only local Evergreen analysis after checkout. It excludes network and Git operations, which the harness reports separately as `checkoutMs` per repository and `medianCheckoutMs`, `p95CheckoutMs`, and `slowestCheckoutMs` in the summary, so Evergreen's own cost is never mixed with the time spent downloading a repository. The run used the development machine, so duration is a reference rather than a cross-machine guarantee.

## GitHub Actions corpus additions

The corpus has since grown to 30 repositories. The ten added entries are GitHub Actions repositories taken from reviewed migration commits (see [Mining migrations](../../benchmarks/mining/queries.md)). Eight are pinned to the commit *before* a migration, where Evergreen must report exactly the workflow locations the migration changed, and two are pinned to the migration commit itself, where it must report nothing. Together they include reusable workflows (`Akenon-Studio/.github`) and SHA-pinned actions (`smartcrabai/paperhanger`, `openmcp-project/crossplane-headlamp-plugin`).

Every expected finding in these entries has `groundTruthSource.kind` set to `migration-commit` and links to the commit that fixed it; a test checks each link against `benchmarks/mining/review-log.json`. A SHA-pinned entry is only accepted as zero-finding after checking that no pinned reference carries a version comment below the rule's supported major, because Evergreen does not classify SHA pins yet and would otherwise hide a deprecated version. Across all 30 repositories the harness reports 48 expected findings, 48 true positives, and no false positives or false negatives (observed 2026-10-16). The table above is the original 20-repository v0.1 run.

## Method

Every expected result is identified by rule ID, repository-relative path, and line at a pinned commit. The harness downloads each commit to a temporary directory, runs all built-in detectors, compares sets in both directions, reports per-repository timing, and removes the checkout. It exits unsuccessfully for any unexpected or missing finding.

```bash
npm run validate:public-repos
```

The audit covers both positive and zero-finding repositories across npm/Node.js, Python, and GitHub Actions. Findings were checked against their repository declarations and the authoritative sources bundled with the matching lifecycle rule.

## The 50-repository corpus

The corpus now has 50 repositories: the 20 from v0.1, the ten GitHub Actions entries above, and twenty more across the shipped detectors.

- Sixteen are pinned to the parent of a reviewed migration commit: six clean ones where the migration explains every finding (node-sass removals, Python runtime floors raised to a supported release), and ten where other deprecated declarations were still present. Findings that the migration fixed cite it with `groundTruthSource.kind` `migration-commit`; the rest are `maintainer-review` and quote the exact line that was read at that commit.
- Four are zero-finding repositories, including monorepos (`withastro/astro`, `vitest-dev/vitest`, `lerna/lerna`, `changesets/changesets`). They were also searched by hand for deprecated actions, runtimes and packages, independently of Evergreen's own rules.

The review tool (`benchmarks/mining/review.ts`) now accepts npm package, Python package, and Node.js and Python runtime rules as well as GitHub Actions rules, and `mine.ts` can mine one group at a time and append without replacing reviewed candidates (`--queries npm,python --limit 10 --append`). Across all 50 repositories the harness reports 81 expected findings, 81 true positives, no false positives and no false negatives (observed 2026-10-16).

## The 300-repository corpus

The corpus now has 300 repositories: the 189 earlier entries and 111 added in one pass, every one with `selection: "blind"`. They fill the ecosystems that had the fewest repositories: container, Go, Rust, Ruby, PHP, Android, C/C++, CI runner images, Dart, Terraform, database runtimes, and shell got seven each, and serverless, GitHub Actions, and Swift got nine each.

The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: for each query below, run `gh search code <query> --limit 60`, walk the results in the order returned that day, and keep the first N unique repositories that are not forks, not archived, not larger than 50,000 KB on GitHub, and not already in the corpus (or chosen by an earlier query); where the entry says root only, the matching path must be at the repository root. Pin each at its default-branch commit on that date. Licensing: only repository metadata, pinned commit IDs, paths, line numbers, and one short quoted line per finding are stored; no repository content is vendored, and each repository is fetched from GitHub at its pinned commit at run time. The query returns different results on another day, so the pinned list, not a re-run, is the record.

- `go` (7): `gh search code go 1.22 --filename go.mod`; `gh search code go 1.26 --filename go.mod`: `lwolf/kube-cleanup-operator`, `ICKelin/gtun`, `keycard-tech/keycard-go`, `Johonsoy/SmartStashDB`, `replicate/cog`, `charmbracelet/wish`, `slackhq/go-audit`.
- `rust` (7): `gh search code atty --filename Cargo.toml`; `gh search code ansi_term --filename Cargo.toml`; `gh search code tempdir --filename Cargo.toml`: `nikivdev/code`, `rathole-org/rathole`, `ogham/dog`, `suptejas/fleet`, `dflemstr/rq`, `databricks/click`, `gchp/iota`.
- `ruby` (7): `gh search code 3.1.4 --filename .ruby-version`; `gh search code 2.7.8 --filename .ruby-version`; `gh search code 3.4.1 --filename .ruby-version`: `67272-App-Design-Dev/PATS_v1_r7`, `HomeBusProjects/HomeBus`, `Kgomotso196/Blog`, `nmacawile/rails-chat-api`, `maedadev/bizside-ruby`, `nsidc/vagrant-vsphere`, `nov/web_authn_sample`.
- `android` (7): `gh search code com.android.billingclient:billing --filename build.gradle`; `gh search code com.android.billingclient:billing --filename build.gradle.kts`: `Aefyr/SAI`, `anjlab/android-inapp-billing-v3`, `Eajy/MaterialDesignDemo`, `serso/android-checkout`, `facebook/facebook-android-sdk`, `BranchMetrics/android-branch-deep-linking-attribution`, `d4rken-org/octi`.
- `cpp` (7): `gh search code cmake_minimum_required(VERSION 2.8 --filename CMakeLists.txt`; `gh search code cmake_minimum_required(VERSION 3.28 --filename CMakeLists.txt`: `BYVoid/uchardet`, `Xtra-Computing/thundergbm`, `wavebitscientific/functional-fortran`, `karimnaaji/vectiler`, `Off-World-Live/obs-spout2-plugin`, `QBDI/QBDI`, `Hapaxia/SelbaWard`.
- `ci-images` (7): `gh search code ubuntu-20.04 --filename azure-pipelines.yml`; `gh search code ubuntu-24.04 --filename azure-pipelines.yml`: `revery-ui/revery`, `microsoft/FASTER`, `hasura/graphqurl`, `inikep/lizard`, `Jackett/Jackett`, `dotnet/vscode-csharp`, `isomorphic-git/isomorphic-git`.
- `database` (7): `gh search code postgres:13 --extension yml`; `gh search code engine_version = "5.7" --extension tf`: `gitcoinco/grants-stack`, `jayfk/launchr`, `Kuper-Tech/sbmt-outbox`, `replicase/pgcapture`, `tmknom/example-pragmatic-terraform`, `PacktPublishing/Effective-DevOps-with-AWS-Second-Edition`, `RajitPaul11/terraform_aws`.
- `container` (7): `gh search code FROM node:24 --filename Dockerfile`; `gh search code FROM node:16 --filename Dockerfile`: `daimon3332/address`, `SpectrAI-Initiative/InnoClaw`, `navikt/security-playbook`, `rsmbl/Resemble.js`, `fanchangyong/deershare`, `firemakergk/aquar-home`, `sibbl/hass-lovelace-kindle-screensaver`.
- `terraform` (7): `gh search code required_version 1.12 --extension tf`; `gh search code required_version ~> 1.12 --extension tf`; `gh search code required_version --extension tf --filename versions.tf`: `skax-ca/iac-module-library`, `ql4b/cloudless-infra`, `terraform-google-modules/terraform-google-container-vm`, `cloudposse/terraform-aws-cicd`, `cloudposse/terraform-aws-ec2-instance`, `terraform-google-modules/terraform-google-log-export`, `GoogleCloudPlatform/notebooks-blueprint-security`.
- `node-actions` (9): `gh search code actions/checkout@v2 --extension yml`; `gh search code actions/checkout@v6 --extension yml`: `jugglerchris/rust-html2text`, `CausalAIBook/MetricsMLNotebooks`, `realabbas/Github-Actions-React-Native`, `ktye/i`, `lamdow8/lamdow8.github.io`, `bjdash/apic`, `lpereira/lwan`, `shivammathur/setup-php`, `hellofresh/action-changed-files`.
- `shell` (7): `gh search code #Requires -Version 7 --extension ps1`; `gh search code PowerShellVersion --filename psd1`: `domaindrivendev/Swashbuckle.AspNetCore`, `PowerShell/PSReadLine`, `SteeltoeOSS/Steeltoe`, `Kevin-Robertson/Inveigh`, `psake/psake`, `cyberark/ACLight`, `pester/Pester`.
- `php` (7): `gh search code ^7.4 --filename composer.json`; `gh search code ^8.3 --filename composer.json`: `dreamfactorysoftware/dreamfactory`, `doctrine/annotations`, `symfony/routing`, `driesvints/blade-icons`, `spatie/laravel-backup`, `mckenziearts/laravel-notify`, `spatie/db-dumper`.
- `dart` (7): `gh search code ^3.8.0 --filename pubspec.yaml`; `gh search code ^3.10.0 --filename pubspec.yaml`: `bensonarafat/super_tooltip`, `Mr-Pepe/syncable`, `rithik-dev/firebase_phone_auth_handler`, `dickermoshe/convex-dart`, `OpenFlutter/fluwx`, `Yubico/yubioath-flutter`, `dartgfx/gpux`.
- `serverless` (9): `gh search code nodejs14.x --filename serverless.yml`; `gh search code python3.8 --filename template.yaml`; `gh search code nodejs22.x --filename serverless.yml`: `SmartThingsCommunity/weather-color-light-smartapp-nodejs`, `ZeroSharp/serverless-php`, `Toola-bakery/Toola`, `ashokatechmin/Messcat`, `serverlesspub/imagemagick-aws-lambda-2`, `awslabs/aws-config-rdklib`, `aws-samples/aws-lambda-extensions`, `slackapi/bolt-js`, `webpro-nl/knip`.
- `swift` (9): `gh search code xcode --filename .xcode-version`; `gh search code IPHONEOS_DEPLOYMENT_TARGET = 12.0 --filename project.pbxproj`: `sarthak-behl/Signal-iOS`, `palak-ios-play/SecureChat-iOS`, `NorthWolfLabs/CodexGauge`, `Shopify/mobile-buy-sdk-ios`, `ReSwift/ReSwift`, `Swinject/Swinject`, `aslanyanhaik/youtube-iOS`, `square/Valet`, `swiftlang/swift-corelibs-xctest`.

Ground truth: for each repository the harness report was read line by line at the pinned commit, and every expected finding has a `maintainer-review` note quoting the path, line, and the matching text. The Go, Rust, Ruby, Android, C/C++, CI image, serverless, and GitHub Actions findings were also cross-checked against an independent `grep` over the pinned files (not Evergreen's output); the only differences are the scope boundaries below. Because the corpus scans every detector, every finding in these repositories is recorded, not only the ones for the ecosystem it was selected for. Findings of the npm, Node.js, Python, and .NET detectors were checked by reading the line, not by a second search. Several repositories that matched a version query have no finding in that ecosystem, which is expected: a range such as PHP `^7.4 || ^8.0` or Dart `sdk: ^3.8.0` still allows a supported release and is not an end-of-life declaration.

Scope boundaries seen while checking, none of which is a finding in this corpus: the GitHub Actions detector reads only the root `.github/workflows` directory, so nested workflows (`pkg/cli/init-templates/base/.github/workflows` in `replicate/cog`, a `fixtures` directory in `webpro-nl/knip`) and composite `action.yml` files (`realabbas/Github-Actions-React-Native`, `awslabs/aws-config-rdklib`, `sarthak-behl/Signal-iOS`) are not scanned; the CI image detector reads files named `azure-pipelines.yml`, not `azure-pipelines-full.yml` (`microsoft/FASTER`); and the Android detector does not report a Play Billing pin written as `"gplayImplementation"("...")` (`d4rken-org/octi`) or inside an `androidTestImplementation` call (`BranchMetrics/android-branch-deep-linking-attribution`). These are candidates for follow-up issues, not corpus entries.

## The 456-repository corpus

Issue #740 added 156 repositories to the 300 above to close the evidence gaps in [decision 0013](../decisions/0013-detector-maturity.md) for the four detectors that held `Supported` before the rules existed. Every one records `selection: "blind"`.

The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: GitHub repository search for a language, 100 to 500 stars, last pushed from 2021-01-01 to 2024-12-31, not a fork, not archived, sorted by stars descending (`gh search repos --language <language> --stars 100..500 --updated 2021-01-01..2024-12-31 --archived=false --include-forks=false --sort stars --order desc --limit 100`). Walk the results in order and keep a repository unless it is already in the corpus, is larger than 50,000 KB, or lacks the file the ecosystem needs. Pin each at its default-branch commit on that date. Each expected finding is the scan result with the line read at the pinned commit, recorded as a `maintainer-review` note.

- `node` (52, language JavaScript, a root `package.json`): `lucasbento/graphql-pokemon`, `adobe-photoshop/generator-assets`, `gruntjs/grunt-contrib-requirejs`, `mathiasbynens/CSS.escape`, `bitpay/bitauth`, `cloudinary/cloudinary-react`, `discordjs/RPC`, `pilwon/node-yahoo-finance`, `rpl/flow-coverage-report`, `sourcecred/sourcecred`, `Brainfock/Brainfock`, `manifoldfinance/defi-threat`, `remarkjs/remark-toc`, `fstirlitz/luaparse`, `mobxjs/mobx-react-todomvc`, `dxxzst/OfflineMap`, `ElementUI/element-theme`, `algorithm-visualizer/algorithms`, `d3/d3-interpolate`, `twilio-labs/call-gpt`, `jiayisheji/blog`, `svrxjs/svrx`, `wix-incubator/react-native-keyboard-aware-scrollview`, `malte-wessel/react-textfit`, `bartve/disconnect`, `insodoc/insomnia-documenter`, `whoisandy/react-blocks`, `o2team/elf`, `standard/ts-standard`, `briancavalier/slides`, `YataoZhang/my-single-spa`, `parmsang/gatsby-starter-ecommerce`, `acode/copenhagen`, `snorpey/triangulation`, `bchiang7/octoprofile`, `mahnunchik/gulp-responsive`, `cferdinandi/build-tool-boilerplate`, `mixtur/webpack-spritesmith`, `wzpan/hexo-generator-search`, `dai-shi/react-hooks-async`, `lazd/gulp-replace`, `mapmeld/profanity-pgp`, `lbovet/docson`, `lexich/redux-api`, `smartcontractkit/defi-minimal`, `allegro/node-worker-nodes`, `drawcall/AgileJS`, `tani/cheeriogs`, `Semantic-Org/Semantic-UI-CSS`, `uncleLian/vue2-news`, `abramenal/cypress-file-upload`, `CoreyGinnivan/whocanuse`.
- `python` (34, language Python, a root `pyproject.toml`, `setup.py`, `setup.cfg`, `Pipfile`, or `requirements.txt`): `NTMC-Community/MatchZoo-py`, `layer8secure/SilentHound`, `LAION-AI/natural_voice_assistant`, `caserec/CaseRecommender`, `SqueezeAILab/TinyAgent`, `jarus/flask-testing`, `Deadpool2000/Paybag`, `alxschwrz/codex_py2cpp`, `harperreed/photo-similarity-search`, `FranxYao/Long-Context-Data-Engineering`, `DougDougGithub/Babagaboosh`, `aryanvikash/Youtube-Downloader-Bot`, `tappi287/openvr_fsr_app`, `microsoft/powerbi-jupyter`, `JPCERTCC/MalConfScan`, `msight-tech/research-ms-loss`, `HazyResearch/evaporate`, `achembarpu/pockyt`, `blacknbunny/CVE-2018-10933`, `peract/peract`, `sweetcocoa/pop2piano`, `shichao-an/leetcode-python`, `simonw/db-to-sqlite`, `alexdelorenzo/cast_control`, `prateekiiest/Code-Sleep-Python`, `SourceCode-AI/aura`, `szc19990412/TransMIL`, `PrithivirajDamodaran/Styleformer`, `elbayadm/attn2d`, `CryptoGnome/Limit-Sniper`, `kturung/langgraph_streamlit_codeassistant`, `busimus/cutelog`, `flopp/GpxTrackPoster`, `corenel/pytorch-adda`.
- `node-actions` (13, language TypeScript, at least one workflow file in `.github/workflows`): `iamraphson/react-paystack`, `dai-shi/reactive-react-redux`, `mgmeyers/obsidian-list-callouts`, `rubenspgcavalcante/webpack-extension-reloader`, `innocenzi/tailwindcss-theming`, `lbdremy/solr-node-client`, `galnir/Master-Bot`, `ericnorris/striptags`, `xmindltd/xmind-sdk-js`, `rametta/pratica`, `wessberg/rollup-plugin-ts`, `Ff00ff/mammoth`, `bryanmylee/svelte-headless-table`.

A second Python pass followed, because the 34 repositories above held only 4 Python findings and `stable` needs 60. The blind rule, fixed on 2026-10-23 before Evergreen ran on these additions: for each query below, run `gh search code <query> --filename <file> --limit 60`, walk the results in the order returned that day, and keep the first five or six unique repositories whose matching path is exactly that file at the root, skipping forks, archives, repositories larger than 50,000 KB, and repositories already in the corpus. Pin each at its default-branch commit on that date. The queries look for old Python declarations, so they are expected to produce findings, but the repository is chosen by the query result and not by any Evergreen output.

- `python` (56 more):
  - `gh search code requires-python = ">=3.8" --filename pyproject.toml`: `cobrateam/splinter`, `pallets-eco/flask-debugtoolbar`, `Aiven-Open/pghoard`, `epfl-lts2/pygsp`, `isaiahbjork/Auto-GPT-Crypto-Plugin`, `widgetti/ipyvuetify`.
  - `gh search code python_requires=">=3.7" --filename setup.py`: `shenweichen/GraphEmbedding`, `Overv/outrun`, `BasicProtein/AugmentCode-Free`, `machow/siuba`, `LAMDA-NJU/Deep-Forest`, `drunkdream/weread-exporter`.
  - `gh search code 3.8 --filename .python-version`: `bndr/pipreqs`, `login-securite/lsassy`, `Lawouach/WebSocket-for-Python`, `n8henrie/pycookiecheat`, `DarrenOfficial/dpaste`, `psevensas/DjangoChannelsGraphqlWs`.
  - `gh search code python-3.8 --filename runtime.txt`: `AnimeKaizoku/EnterpriseALRobot`, `weareasterisk/gavel2`, `AbirHasan2005/TG-String-Session`, `IceKirby/NaTrave`, `urschrei/hexagrams`, `zolabar/trendPy`.
  - `gh search code python_version = "3.7" --filename Pipfile`: `hustlei/QssStylesheetEditor`, `DanMcInerney/pymetasploit3`, `donsheehy/datastructures`, `CodeForPhilly/chime`, `mozilla/crlite`, `prideout/svg3d`.
  - `gh search code requires-python = ">=3.7" --filename pyproject.toml`: `LAION-AI/CLAP`, `ncclient/ncclient`, `nschloe/tiptop`, `nschloe/perfplot`, `huggingface/hf_transfer`, `zu1k/Good-MITM`.
  - `gh search code python_requires=">=3.6" --filename setup.py`: `alibaba/tidevice`, `rachpt/lanzou-gui`, `Hsury/BiliDrive`, `malinkang/weread2notion-pro`, `maxhumber/gazpacho`.
  - `gh search code python = "^3.7" --filename pyproject.toml`: `bee-san/pyWhat`, `Gerapy/Gerapy`, `jayfk/statuspage`, `python-gino/gino`, `wustho/epr`.
  - `gh search code requires-python = ">=3.6" --filename pyproject.toml`: `doableware/djongo`, `python273/vk_api`, `miguelgrinberg/Flask-Migrate`, `vinifmor/bauh`, `cvg/glue-factory`.
  - `gh search code python 3.8 --filename .tool-versions`: `leosussan/fastapi-gino-arq-uvicorn`, `muxinc/mux-python`, `ozzs/monobox`, `crflynn/skranger`, `verypossible/very_plot`.

One more \`node-actions\` repository followed #1101: the new \`node-version\` rule gave findings to two repositories that had none, leaving three zero-finding GitHub Actions repositories where \`stable\` needs four. The rule, fixed before scanning: \`gh search code actions/checkout@v6 --extension yml --limit 60\`, walk the results in order, keep unique repositories that are not forks, archives, larger than 50,000 KB, or already pinned, and stop as soon as the zero-finding count reaches four. The first one walked, \`asciimoo/hister\`, had no findings, so it is the only addition.

The search returns different results on another day, so the pinned list above, not a re-run, is the record.

Effect on the levels: `github-actions`, `nodejs`, `npm`, and `python` now meet `stable` on the corpus evidence, so none of them is grandfathered any more.

## Python corpus at 200 repositories

Selection for the 93 repositories added on 2026-11-07 (`benchmarks/public-repositories/python/0701` to `0793`) was fixed before Evergreen ran on them, following [decision 0030](../decisions/0030-corpus-selection-and-200-target.md).

- **Discovery:** `gh search code` on 2026-11-07 for the root files `pyproject.toml`, `requirements.txt`, `setup.cfg`, and `.python-version`, with version-neutral terms (`python`, `version`, `pytest`, `django`, `flask`, `numpy`, `pandas`, `torch`, `setuptools`, `click`), 100 results per query. 992 distinct non-fork repositories had the file at the root.
- **Eligibility:** public, not archived or a mirror, GitHub size at most 50,000 KB, a default-branch commit on or after 2024-11-07, a complete tree, an OSI-approved SPDX license with a license file in the tree, and the input file at the root. 420 passed. The rest failed on activity (341), size (136), missing or non-OSI license (92), or were already in the corpus (2).
- **Order:** strata are the first matching input form in profile order (`pyproject.toml`, `requirements.txt`, `setup.cfg`, `.python-version`) by size band (at most 5,000 KB, then larger), sorted by lowercase `owner/name`, walked round-robin; the first 93 were kept. Each is pinned to its default-branch commit on that date, and none was chosen or dropped because of its score.
- **Provenance limits:** license files were identified by name and GitHub's SPDX guess, not read for coverage of the input files. The search returns at most 100 hits per query, so the pool is limited by the queries, not by what exists.
- **Ground truth:** every one of the 494 findings Evergreen reported on the 93 repositories had its cited line read in the pinned checkout and checked against the registry rule it was filed under. An independent `grep` for old GitHub Action majors, `python_requires` / `requires-python` floors, `FROM python:` tags, and `.python-version` files found the false negative below.
- **Result on the 93 additions:** 494 findings reviewed. The review found three detector bugs (each its own issue: #2539, #2540, #2541); they were fixed in the same pull request, so the 93 additions end with 495 confirmed findings (the Poetry `python` floor is now at its real line 54, and the Django finding at line 57), precision 1.0 and recall 1.0 on this sample. The harness reports no false positives or negatives for the Python corpus.
- **Problems found and fixed, repositories kept:** a Poetry `python = "^3.8"` floor was reported at the first line mentioning "python" (a classifier) instead of its own line (`2ik/django-editorjs-fields`); the Django package finding was anchored to `name = "django-editorjs-fields"` instead of `Django = "^4.2"`; and `uses: actions/checkout@v3 ` with a trailing space was not detected (`boxed/django-fastdev`, `.github/workflows/check_tests.yml:14`).

## Corpus targets

Decision 0030 sets 200 reviewed projects per bucket as the growth goal. Most buckets are below it, so the goal is
not the CI floor: failing every pull request below 200 would block all work until the corpus grows.

`benchmarks/corpus-targets.json` records the minimum each bucket must keep. It started at the counts when the
check landed and rises as the corpus grows. `node dist/benchmarks/corpus-targets.js` fails when a bucket is below
its minimum, before any network step in the corpus workflow; `--write` records the current counts as a reviewable
change. The [dashboard](../dashboard/) shows every bucket's count next to its minimum and the 200 goal.

## The held-out set

The main corpus is circular: its expected findings were written by reviewing the same commits Evergreen is scored on, so 1.0 shows that nothing regressed and not that Evergreen generalizes (issue #740, decision 0013). The held-out set (`benchmarks/held-out-repositories.json`) is separate: it is never used to write or tune a rule, and its ground truth was committed before Evergreen scanned it.

- **Rule, fixed on 2026-10-23.** The two repository searches behind the node and GitHub Actions entries above (JavaScript and TypeScript, 100 to 500 stars, last pushed 2021-01-01 to 2024-12-31, not a fork, not archived, sorted by stars) were walked past the last repository they had already supplied. The first repositories after that point that are not in the corpus, are at most 50,000 KB, and have a workflow file are held out: 15 (five from the JavaScript list at ranks 76 to 97, ten from the TypeScript list at ranks 65 to 81; the lists ended at 100 results).
- **Ground truth first.** `benchmarks/held-out/label.ts` labels the set from the text alone (it imports no detector and reads no registry): `uses: actions/checkout`, `actions/setup-node`, and `actions/cache` at major version 4 or lower, and workflow `node-version:` lines or `.nvmrc` naming Node.js 20 or lower. The labels were committed (`test(validation): write the held-out ground truth before any scan`) before the first scan.
- **Scope.** The comparison covers only the families `github-actions.checkout`, `github-actions.setup-node`, `github-actions.cache`, and `nodejs.runtime`, by family, path, and line. A rule that is outside the labeller is not judged here.
- **Run.** `npm run validate:held-out` (add `-- --output benchmarks/held-out-result.json` to record). It reports and never fails the build.

First result (before #1101): 15 repositories, 55 true positives, 2 false positives, 18 false negatives, precision 0.9649, recall 0.7534. The 18 misses were all `nodejs.runtime` lines in workflows that pin Node.js 14 or 16 (for example `node-version: 16`): the GitHub Actions detector did not read the `node-version` of `actions/setup-node` at all. The main corpus never exercised that case, which is what a held-out set is for. Issue #1101 added it (see [DETECTORS.md](../DETECTORS.md)); the 130 `nodejs.runtime` findings it adds to the main corpus were each checked by reading the line.

After #1101: 15 repositories, 73 true positives, 3 false positives, 0 false negatives, precision 0.9605, recall 1. The 3 "false positives" are not errors: two are `engines.node` declarations in `package.json` and one is a `strategy.matrix` Node.js list (`node: [8, 10, 12]` in `reid/node-jslint`), none of which the labeller reads. Because the rule was written after the first held-out run, this repository set no longer measures generalization for `node-version`; a fresh held-out set is needed for the next rule.

## Replaying data releases

`npm run replay:data` proves that a data update does not cause surprises. It scans the pinned repositories in `benchmarks/data-replay/repositories.json` (each also pinned in the public corpus at the same commit) once per data release (the last three `data-v*` tags) and once with the working tree's `registry/`, all with the same Evergreen code and the same scan time. The only input that differs between two scans is the data.

Every finding that appears or disappears between two consecutive releases must be explained by a rule that was added, removed, or edited between them (an edit means any field a scan reads; sources and provenance do not count), or, for `github-actions.*` findings, by a change to the SHA map. The run prints each change with its explanation and exits with status 1 when any change is unexplained. `--releases <n>` sets how many releases to replay and `--output <file>` writes the JSON report.

Notes:

- Releases from before the `accessedAt` requirement are brought up to the current schema for the replay (a missing `accessedAt` takes the rule's `observedAt`, and a registry the release lacked is empty, so its rules count as added). Nothing a scan reads is changed.
- The data bundle does not yet carry the deno, elixir, php, and scala registries; the replay installs them itself so every detector has its data.
- The `data-replay` workflow runs this on `main` when `src/` or `registry/` change, weekly, and on demand. It needs the network only to fetch the pinned checkouts and would exceed the pull-request runner-minute budget, so it does not run on pull requests: run `npm run replay:data` before changing `registry/`.

## Unreviewed expected findings

Growing the corpus to 200 repositories per ecosystem means about 4,600 pins, far beyond hand labeling every finding before the first scan. The candidate finder freezes the pins ([decision 0030](../decisions/0030-corpus-selection-and-200-target.md)); a second tool scans a local checkout of each eligible pin and records what the current detectors report as **unreviewed** expected findings.

- **Where they live.** `benchmarks/unreviewed-repositories/<ecosystem>.json`, separate from `benchmarks/public-repositories/`. Each entry has `reviewState: "unreviewed"`, `source: "scan-output"`, and `unreviewedExpected` instead of the reviewed corpus's `expected`. The different field name is deliberate: no scoring, threshold, or maturity function reads it, so an unreviewed entry cannot be mistaken for ground truth.
- **How they are made.** The tool reads the frozen candidate report, takes only candidates with an eligible immutable pin, and scans `<checkouts-dir>/<owner>--<name>` with the bundled lifecycle data. It never fetches, installs, builds, or runs repository code, and it uses no network. Transitive findings are omitted for the same reason the harness omits them. A missing checkout or scan failure stops the batch rather than writing a partial result.
- **What they count for.** Nothing. Unreviewed entries are not reviewed repositories, expected findings, precision or recall evidence, detector maturity evidence, or progress toward 200. Reports print the reviewed and unreviewed numbers in separate rows and mark only the reviewed row as precision evidence.
- **How they become reviewed.** A reviewer reads the pinned file, adds a `groundTruthSource` note quoting the path and line, replaces `unreviewedExpected` with `expected`, and moves the entry to `benchmarks/public-repositories/<ecosystem>/`. The hand-review sample in #2119 is the first consumer.

```bash
node dist/benchmarks/candidates/expected-cli.js generate candidates.json <checkouts-dir> benchmarks/unreviewed-repositories
node dist/benchmarks/candidates/expected-cli.js report
```

The first command prints a table such as:

```text
scope      repositories  findings  precision evidence
reviewed            557      3174  yes
unreviewed          300      1234  no
```

The unreviewed row says nothing about accuracy: its labels are the current output, so a run against them only shows that the output did not change. Precision still rests on the reviewed corpus and the held-out set.

