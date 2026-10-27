# Changelog

## Unreleased

- Add a Claude Code PreToolUse hook that blocks npm, pnpm, yarn, pip, and uv installs of packages Evergreen marks as deprecated or end-of-life. (#1273)

## 0.7.1 - 2026-10-27

- Attach SLSA build provenance to the standalone release binaries. (#1351)
- Keep fixture manifests out of the npm tarball so scanners no longer report them as the package's own dependencies. (#1350)
- Shrink the install by vendoring a trimmed tree-sitter WASM. (#1352)

## 0.7.0 - 2026-10-27

- Cross-reference end-of-life findings with unfixed OSV advisories: import ids into `registry/osv.json` at build time and list them on matching findings as `advisoryIds`. Scans stay offline. (#1063)
- Judge committed `helm template` output as multi-document Kubernetes manifests, so APIs a Capabilities-guarded chart template hid become findings once rendered. Helm is never run. (#1060)
- Add an experimental Scala and sbt detector for Scala pins in `.scala-version` and `build.sbt`, and for `sbt.version` in `project/build.properties`. (#1054)
- Add an experimental Elixir and Mix detector for Elixir and Erlang/OTP pins in `.tool-versions` and `mix.exs`, and for Hex packages in `mix.exs` and `mix.lock`. (#1053)
- Judge Helm `Chart.yaml` dependencies that still point at the retired stable or incubator chart repositories. Templated dependency fields and repository aliases stay unclassified. (#1052)
- Judge managed Kubernetes control-plane versions in Terraform for Amazon EKS, Google Kubernetes Engine, and Azure Kubernetes Service, taking a module's vendor from its `source`. A variable or module reference is listed as unclassified. (#1050)
- Add `--format slack`, `--format teams`, and `--format webhook` to render a chat or generic webhook payload for a digest step. Evergreen renders the payload only and never sends it.
- Judge Debian, Ubuntu, and Alpine base image releases in Dockerfiles and Compose files, including codename tags such as `debian:buster` and `ubuntu:focal`. (#1051)
- Read maintainer CLE lifecycle from installed packages. (#1208)
- Generate Renovate presets from scan findings. (#1207)
- Scan SPDX 2.3 JSON SBOMs with dependency checks. (#1206)
- Scan CycloneDX SBOM components with dependency checks. (#1202)
- Enrich CycloneDX SBOMs with lifecycle milestones. (#1201)
- Export lifecycle snapshots as CLE 1.0. (#1199)
- Scan built image and rootfs for shipped OS and runtimes (#1057). (#1192)
- Judge Azure and Google Cloud database engine versions (#1056). (#1193)
- Add evergreen guard npm install (#1048). (#1190)
- Ship a language server for lifecycle diagnostics (#1046). (#1189)
- Add JUnit XML report format (#1045). (#1186)
- Scan kubectl get -o yaml dumps. (#1181)
- Add Deno and Bun runtime detection. (#1179)
- Judge runtime pins in Dockerfile RUN lines. (#1182)
- Scan terraform plan json. (#1180)
- Add Spring Boot lifecycle rules and migration fixtures. (#1161)
- Add Markdown scan report format. (#1162)

## 0.6.1 - 2026-10-25

- Add `evergreen fix --dry-run` to print `git apply` patches for deterministic fixes, starting with outdated GitHub Actions `uses:` versions. Nothing is written. (#1032)
- Add `--format codequality` to emit a GitLab Code Quality report, which the GitLab component keeps as a job artifact. (#1173)
- Add a scheduled workflow that opens an issue when an end-of-life date nears. (#1169)
- Post one summary comment on pull requests. (#1168)
- Group scan findings by CODEOWNERS owner with `--by-owner`. (#1167)
- Merge scan reports from many repositories by product and owner. (#1166)
- Add `evergreen diff <base>..<head>` for findings a change introduced or fixed. (#1165)
- Ship a pre-commit framework hook. (#1164)
- Add the GitLab CI/CD component, `templates/evergreen.yml`. (#1163)
- Re-scan after `fix --branch` and print the verification commands. (#1160)
- Add `evergreen fix --branch` to apply fixes on a local git branch. (#1159)
- Add rename codemods for five deprecated npm packages. (#1158)
- Move exact runtime pins to the lowest supported line. (#1157)
- Reject a path that does not exist or is not a directory. (#1153)

## 0.6.0 - 2026-10-25

### Forecast and planning

- Add `evergreen forecast` to list what reaches end of life in the next 6 and 12 months. (#1023)
- Add `--as-of <date>` to scan as the world will look on that date. (#1024)
- Add `--min-support-days` to warn about release lines that end soon. (#1029)
- Plan an upgrade path past unsupported release lines, with safe intermediate versions. (#1025)
- Warn when a suggested replacement needs a newer runtime than the repository pins. (#1028)
- Add a lifecycle risk score from time past end of life, usage, and advisories. (#1026)
- Show how long a finding has been end of life, using git history. (#1027)
- Report deprecated transitive dependencies with the path that pulls them in. (#1030)
- Track a lifecycle debt trend in the baseline history. (#1031)

### Command line

- Ship standalone binaries that need no Node.js (Linux, macOS, Windows), attached to each GitHub release with `SHA256SUMS` and build provenance. (#1016)
- Add `--format html` to scan: one self-contained HTML report with no external requests. (#1022)
- Add `--format compact` for agent context windows. (#1013)
- Add `scan --interactive` to browse findings and open them in your editor. (#1019)
- Add `scan --write-status` to write `EVERGREEN_STATUS.md` for agents. (#1008)
- Scan several paths, or a folder of repositories, in one run. (#1014)
- Add `evergreen watch` and a weekly digest for personal projects. (#1017)
- Print a friendly summary on a zero-config first run. (#1018)
- Add `evergreen init --hooks` and `evergreen init --personal` to install a git pre-push hook and a global config. (#999, #1020)
- Add `evergreen doctor --system` to check the tools installed on this machine. (#1015)
- Add `evergreen setup` to configure every detected agent host. (#1007)
- Add `evergreen completions <bash|zsh|fish>` and one example per command in `--help`. (#1021)
- Add stable error codes and exit codes, with JSON error output. (#1012)
- Add `evergreen report-issue` to build a redacted false-positive report. (#1004)
- Add a local-only usage log and `evergreen usage` summary. (#1010)
- Add a confidence level to every finding. (#1003)
- Add a branded SVG badge for the README. (#1142)

### Rules and detectors

- Add lifecycle rules for Rails, Laravel, and React Native. (#1099, #1097, #1098)
- Add Node.js v21 and v22 lifecycle rules, and scheduled end-of-life rules for Node.js, PostgreSQL, and container images. (#932, #738)
- Judge the `node-version` of `actions/setup-node`. (#1101)
- Add migration steps and verification commands to curated rules. (#482, #993)
- Parse literal PowerShell version declarations and workflow shell and image declarations with exact lines. (#477, #478)
- Keep reading PowerShell files that use backtick line continuation. (#994)
- Promote several detectors to beta on blind-selected corpora and grow the public corpus. (#727, #728, #740)

## 0.5.0 - 2026-10-22

- Add end-of-life rules for every unsupported Django release series from 1.3 through 5.1 (`python.package.django-<series>.eol`), with the dates from the Django supported-versions page. A bounded Python package rule now matches a lockfile entry or an exact `==` pin, not a declared range, so a `Django>=3.2` requirement alone produces no Django finding. Supported series (5.2 LTS, 6.0, 6.1) have no rule until the page gives their end dates to the day.
- Add the iOS 13 App Store upload rule (`swift.app-store.ios-below-13`). The Swift detector reads `IPHONEOS_DEPLOYMENT_TARGET` from application targets in `project.pbxproj` only, so libraries that declare an older `platforms:` minimum are not reported. (#808)
- Promote the .NET detector to beta (decision 0013). The corpus has twelve blind-selected .NET repositories on top
  of the six targeted ones (84 expected `dotnet` findings, precision 1 and recall 1 on the full run), and corpus
  entries gain an optional `selection` field that the maturity test counts.
- Add end-of-support rules for .NET Core 1.0, 1.1, 2.0, 2.1, 2.2, and 3.0, and deprecation rules for the NuGet
  packages `Microsoft.Azure.DocumentDB`, `Microsoft.Azure.ServiceBus`, and `Microsoft.Azure.Storage.Blob`.
  Repositories that target these lines now get findings where they had none.
- Add five pinned public repositories with independent ground truth (#493). (#985)
- Add migration steps and verification commands to curated rules (#492). (#984)
- Wire the database detector and pass conformance (#491). (#983)
- Import Redis and MongoDB vendor lifecycle signals (#490). (#982)
- Import PostgreSQL versioning policy lifecycle signals (#489). (#981)
- Add the registry file and first five lifecycle rules (#488). (#980)
- Parse engine_version on managed database resources (#487). (#979)
- Parse compose image tags with exact line locations (#486). (#978)
- Add five pinned public repositories with independent ground truth (#409). (#976)
- Add migration steps and verification commands to curated rules (#408). (#975)
- Wire the Terraform detector and pass conformance (#407). (#974)
- Import provider upgrade guide lifecycle signals (#406). (#973)
- Import Terraform CLI release support signals (#405). (#972)
- Add the registry file and first five CLI end-of-support rules (#404). (#971)
- Parse .terraform-version and .tool-versions with exact lines (#403). (#970)
- Parse .terraform.lock.hcl with exact line locations (#402). (#969)
- Parse required_version and required_providers with exact lines (#401). (#968)
- Add five pinned public repositories with independent ground truth (#429). (#967)
- Add migration steps and verification commands to curated rules (#428). (#965)
- Map affected imports and usages to files (#427). (#964)
- Wire the Dart and Flutter detector and pass conformance (#426). (#963)
- Add 94 symbol-level deprecation rules for Node.js and Python (#77). (#961)
- Evaluate symbol-level usage matchers with tree-sitter. (#960)
- Scan JavaScript, TypeScript, and Python with tree-sitter. (#959)
- Import discontinued pub packages. (#958)
- Add ten symbol-level deprecation rules for the Python standard library (#233). (#957)
- Add ten symbol-level deprecation rules for Node.js core APIs (#232). (#956)
- Add SDK lifecycle rules. (#955)
- Compare regex and tree-sitter usage engines (#230). (#953)
- Parse FVM Flutter pins. (#952)
- Python usage queries on tree-sitter (#228). (#949)
- Pin five public repositories with ground truth. (#943)
- Add migration steps and verification commands. (#944)
- Add the first five curated Azure hosted-image rules. (#940)
- Promote the detector to beta with a blind-selected corpus. (#936)
- Add Angular v21 and v22 lifecycle rules. (#932)
- Add @angular/core lifecycle rules and fixtures. (#928)
- Add Vue 2 end-of-life rule with fixtures and migration packet. (#927)
- Add lifecycle rules for Next.js 12 to 15. (#929)
- Promote the detector to beta with a blind-selected corpus. (#930)
- Parse pubspec.lock resolved packages and SDK constraints. (#925)
- Add migration steps to curated runtime rules. (#920)
- Parse pubspec.yaml environment and direct dependencies. (#922)
- Wire the experimental runtime lifecycle detector. (#918)
- Add reviewdog rdjson output to scan. (#919)
- Import Google Cloud Functions runtime drafts. (#917)
- Import AWS Lambda runtime lifecycle drafts. (#916)
- Seed five evidence-backed runtime lifecycle rules. (#915)
- Add Django end-of-life rules for unsupported series. (#913)
- Parse Terraform function runtime values. (#914)
- Parse serverless.yml runtime values. (#912)
- Parse SAM and CloudFormation Runtime values. (#911)
- Wire the detector and pass conformance. (#895)
- Add migration steps and verification to Play Billing rules. (#906)
- Wire the detector and pass conformance. (#876)
- Add reviewed end-of-life rules for Couchbase, ClickHouse, phpMyAdmin and CouchDB images. (#904)
- Adopt sparse corpus fetch and concurrency 16 after measuring options (#857). (#902)
- Add reviewed end-of-life rules for Drupal and Traefik images. (#901)
- Let a reviewer acknowledge a draft they chose not to take. (#900)
- Add reviewed removed-API rules from the migration guide. (#896)
- Add reviewed end-of-life rules for Caddy, Go, ZooKeeper, MariaDB and Redis images. (#897)
- Add reviewed archived-project and relocation rules. (#894)
- Add reviewed deprecated-module rules from the go-2 importer. (#893)
- Add reviewed end-of-life and abandoned-package rules. (#891)
- Add reviewed end-of-life rules for Ruby 1.9.3 through 2.6. (#889)
- Declare the files each detector reads and check the declaration (#856). (#890)
- Record a full corpus run with one command (#854). (#888)
- Run only the corpus ecosystems my change affects (#869). (#887)
- Pre-warm the corpus cache and run offline from it (#868). (#886)
- Show and prune the local corpus cache (#867). (#885)
- Compare a corpus run with the previous result (#872). (#884)
- Re-run only the repositories that failed last time (#871). (#883)
- Print a compact corpus summary and write the JSON to a file (#870). (#882)
- Fail fast on stalled corpus fetches and name slow repositories (#873). (#881)
- Report corpus run cost and set a budget (#853). (#880)
- Run a subset of the corpus by ecosystem or repository (#852). (#879)
- Cache corpus checkouts per repository and commit (#850). (#877)
- Fetch public corpus checkouts in parallel. (#875)
- Flag iOS app targets below iOS 13 for App Store uploads. (#844)
- Add swift build verification to curated migration rules. (#841)
- Map source usages to findings. (#839)
- Wire the Swift detector and pass conformance (#437). (#834)
- Add migration steps to curated lifecycle rules. (#836)
- Map package imports and calls to files. (#835)
- Register the experimental PHP detector. (#833)
- Import abandoned-package drafts from Packagist. (#832)
- Add opt-in README badge endpoint to Action. (#830)
- Promote the .NET detector to beta with a blind-selected corpus (#736). (#823)
- Record the Next.js 13 and 14 findings in excalidraw and umami. (#937)
- Report the matched declaration's line and ignore peer-only ranges. (#931)
- Accept quoted and JSON-array EVERGREEN_CHECK_COMMAND. (#921)
- Treat other-drive paths as outside the root on Windows. (#903)
- Mask verbatim strings and document source-usage limits. (#843)
- Retry flaky git fetches in the public-repository corpus run. (#840)

## 0.4.0 - 2026-10-19

- Honor per-version npm deprecation notices and resolved dependency versions; remove nine false alarms and independently review twelve additional public-corpus findings. (#825)

- Publish signed Evergreen container images to GHCR. (#820)
- Import end-of-life drafts from PHP release branches (#447). (#819)
- Seed registry with five evidence-backed lifecycle rules. (#817)
- Parse .php-version and .tool-versions with exact lines. (#814)
- Parse composer.lock with exact line locations. (#813)
- Map affected imports and usages to files. (#810)
- Import App Store Xcode upload requirements. (#811)
- Parse composer.json with exact line locations (#443). (#807)
- Import CMake policy compatibility removals. (#809)
- Seed registry/swift.json with five curated rules. (#805)
- Seed registry with five CMake lifecycle rules. (#806)
- Parse vcpkg.json baseline and direct dependencies. (#803)
- Parse .swift-version and .xcode-version pins. (#802)
- Parse Package.resolved pin versions with exact lines. (#800)
- Parse Package.swift with exact line locations. (#797)
- JavaScript and TypeScript usage queries on tree-sitter (#227). (#794)
- Define symbol-level API deprecation rules (#231). (#790)
- Parse conanfile.txt and conanfile.py with exact lines. (#789)
- Load tree-sitter grammars via WASM, offline (#226). (#788)
- Parse CMakeLists.txt with exact line locations. (#787)
- Wire the detector and pass conformance (#461). (#781)
- Add the deprecations the Renovate comparison found. (#782)
- Wire the detector and pass conformance. (#779)
- Import lifecycle signals from maintenance branches (#460). (#778)
- Add lifecycle registry and five curated rules (#459). (#774)
- Import Azure hosted image retirements from runner-images (#500). (#775)
- Seed registry with curated rules (#499). (#772)
- Parse required_ruby_version from gemspec with exact lines (#458). (#771)
- Parse Gemfile.lock with exact line locations (#457). (#770)
- Parse Gemfile with exact line locations (#456). (#769)
- Mark stale benchmark runs on the dashboard (#303). (#767)
- Parse azure-pipelines.yml with exact line locations (#498). (#768)
- Parse .ruby-version and .tool-versions with exact lines (#455). (#766)
- Parse .circleci/config.yml with exact line locations (#497). (#761)
- Build the public accuracy dashboard page (#302). (#762)
- Match Azure vmImage labels case-insensitively (#87). (#783)
- Use event-free rule ids (#776). (#777)

## 0.3.0 - 2026-10-18

- Add four detectors, all experimental (decision 0013): Java and Kotlin (out-of-support JDK pins and moved Maven
  dependencies), Kubernetes (removed API versions in manifests, Helm charts, and kustomize), Rust (unsupported
  toolchains and abandoned crates, with the files that use them), and .NET (unsupported SDKs and target frameworks,
  and deprecated NuGet packages, with the C# files that use them).
- Add optional `owner`, `reason`, `created`, and `expires` to baseline suppressions. A suppression that is about to
  expire is reported, and one that has expired stops hiding its finding, or fails the job with `--on-expired fail`.
- Add the `scheduled-end-of-life` event for an announced end of life that has not happened yet, at low severity, with
  the announced date. The first rules are .NET 8 and 9 (2026-11-10).
- Add `maturity` (experimental, beta, or stable) to each ecosystem in the capability manifest, now version 1.1.0, and
  define the three levels and the evidence each needs.
- The GitHub Action explains which policy gate failed, how many findings caused it, and where the report is; its inputs
  and outputs are documented and kept in step with `action.yml` by a test. The major Action tag will move
  automatically from the first stable v1.0.0.
- Lifecycle data published after this release requires Evergreen 0.3.0 or newer, because it can contain scheduled
  end-of-life rules.
- Known limits: the Cursor, Gemini CLI, GitHub Copilot, and Kilo Code setups under `examples/agents/` have not been run
  inside the hosts themselves (the server command was checked against the published package).
- Explain policy gate failures. (#752)
- Maturity per ecosystem (#155). (#747)
- Record announced end-of-life dates as scheduled rules; add .NET 8 and 9 (ADR 0010). (#737)
- Map imports and calls of deprecated packages to C# files (#374). (#732)
- Detect unsupported .NET targets and SDKs and deprecated NuGet packages (#373). (#731)
- Import NuGet deprecations of candidate packages (#372). (#730)
- Import end-of-support lines from the releases index (#371). (#729)
- Seed the .NET registry with five sourced rules (#370). (#722)
- Adopt mineral green identity. (#723)
- Parse global.json, project files, Directory props, and packages.lock.json (#366, #367, #368, #369). (#719)
- Map imports and calls of abandoned crates to files (#348). (#711)
- Add migration steps and verification commands to the rules (#349). (#710)
- Detect unsupported toolchains, abandoned crates, and yanked versions (#347). (#709)
- Add the toolchain and yanked-versions importers (#345, #346). (#708)
- Seed the Rust registry with five sourced rules (#344). (#707)
- Parse Cargo.lock and rust-toolchain with exact lines (#342, #343). (#706)
- Parse Cargo.toml dependencies, edition, and rust-version with exact lines (#341). (#705)
- Add migration steps and verification commands to the rules. (#702)
- Map imports of moved dependencies to files. (#701)
- Show suppression state in JSON, text, the Action summary, and MCP (#222). (#700)
- Add the detector for out-of-support JDKs and moved dependencies. (#698)
- Bring back expired suppressions, with a resurface or fail policy (#221). (#699)
- Warn before a suppression expires (#220). (#697)
- Import Maven relocations for direct dependencies. (#696)
- Import JDK support dates from the Oracle roadmap and Temurin. (#694)
- Add optional owner, reason, created, and expires to baseline entries (#218). (#693)
- Add the registry with five end-of-support JDK rules. (#692)
- Show severity counts and top findings in the job summary (#214). (#691)
- Parse .java-version, .sdkmanrc, and .tool-versions with exact line locations. (#690)
- Parse gradle-wrapper.properties with exact line locations. (#689)
- Add a Scanned by Evergreen line to the job summary (#294). (#688)
- Parse build.gradle and build.gradle.kts with exact line locations. (#687)
- Parse pom.xml with exact line locations. (#685)
- Add babel-eslint, tslint, and uglify-es deprecation rules. (#684)
- Add migration steps and verification commands to the rules. (#681)
- Add the Python 3.10 end-of-life rule (#667). (#680)
- Add the detector for removed API versions. (#679)
- Import end-of-life release lines from the release history. (#678)
- Import removed API versions from the migration guide. (#677)
- Add the registry with five removed-API rules. (#676)
- Parse resources and patches from kustomization.yaml. (#675)
- Parse kubeVersion and literal apiVersion from Helm charts. (#674)
- Parse apiVersion and kind from manifests with exact lines. (#673)
- Add an end-of-support rule for Go 1.20 and older (#653). (#665)
- Start the release notes at the latest release tag, not a data tag. (#759)

## 0.2.0 - 2026-10-17

- Add the versioned Evergreen brand strategy, logo system, accessible design
  tokens, usage guide, distribution templates, and proprietary brand terms.
- Apply the approved Evergreen identity and product descriptor across repository,
  documentation, npm, Agent Skill, and GitHub Action source surfaces.
- Add the read-only `evergreen doctor` command with deterministic text and JSON
  output, local/GitHub/GitLab environment checks, remediation guidance, and a
  versioned public compatibility matrix.
- Add the deterministic `evergreen capabilities --json` auto-discovery contract,
  shared capability identifiers, public JSON Schema, committed example, and
  forward-compatibility rules.
- Add Node.js 19, 21, 23, and 25 to the end-of-life rules (#659). (#660)
- Scan every workspace package in npm, pnpm, Yarn, Lerna, and uv monorepos (#172). (#655)
- Map Go imports and calls of affected modules to files (#326). (#652)
- Register the Go importers and run them weekly. (#650)
- Add migration guidance to the Go rules (#327). (#648)
- Detect end-of-support Go releases in go.mod and go.work (#325). (#647)
- Generate a lifecycle calendar with an .ics export (#287). (#637)
- Compare Evergreen findings with Renovate by rule family (#136). (#636)
- Add the endoflife-date importer with mandatory vendor sources (#130). (#635)
- Import module deprecation notices. (#634)
- Draft lifecycle rules weekly and open one pull request per importer (#122). (#633)
- Add release policy importer. (#632)
- Add lifecycle rules. (#629)
- Add the container-official-images importer (#335). (#628)
- Add migration guidance to the container rules (#337). (#627)
- Detect end-of-life base images in Dockerfiles and Compose files. (#626)
- Seed the container registry with five vendor-sourced rules (#334). (#625)
- Parse service images from Compose files (#333). (#624)
- Parse FROM instructions from Dockerfiles (#332). (#623)
- Describe the MCP server for the official registry, and make npx evergreen-deprecation work. (#619)
- Add evergreen init --agents. (#617)
- Parse go.work declarations. (#615)
- Parse go.mod declarations. (#613)
- Refuse detector ids and registry namespaces that are already in use. (#612)
- Add the parser template and check the scaffold templates against conventions. (#611)
- Add evergreen new-detector. (#609)
- Add third Python lifecycle rule batch. (#608)
- Add fourth npm lifecycle rule batch. (#607)
- Show lifecycle data age and stale warnings in every output. (#605)
- Pin the lifecycle data version. (#603)
- Add evergreen data update. (#602)
- Add evergreen data status. (#601)
- Verify the lifecycle data bundle before loading it. (#600)
- Add third npm lifecycle rule batch. (#599)
- Build the lifecycle data bundle reproducibly. (#597)
- Add second Python lifecycle rule batch. (#595)
- Add outputSchema to every MCP tool. (#593)
- Add the migrate-finding MCP prompt. (#592)
- Expose findings observed in the session as MCP resources. (#591)
- Expose lifecycle rules as MCP resources. (#590)
- Add first Python lifecycle rule batch. (#589)
- Evaluate dependency-guard triggering across agents. (#587)
- Warn when a Codex patch adds a deprecated dependency. (#586)
- Add second npm lifecycle rule batch. (#584)
- Warn when a Claude Code edit adds a deprecated dependency. (#585)
- Add the check_dependency MCP tool. (#583)
- Add the evergreen check command. (#582)
- Add the checkDependency core API. (#581)
- Measure adoption weekly from public data without telemetry. (#580)
- Add ten curated GitHub Actions lifecycle rules (batch 2). (#579)
- Add ten curated GitHub Actions lifecycle rules (batch 1). (#578)
- Upload findings to code scanning from the GitHub Action. (#576)
- Add rule help and evidence to SARIF output. (#574)
- Add a deterministic SARIF 2.1.0 reporter. (#573)
- Add first npm lifecycle rule batch. (#572)
- Draft the changelog and release notes from conventional commits. (#567)
- Report unclassified action pins. (#566)
- Regenerate action SHA map. (#564)
- Enforce per-detector precision floors in the corpus run. (#563)
- Classify known action SHA pins. (#562)
- Classify SHA-pinned actions from trailing version comments. (#560)
- Grow the validation corpus to 50 repositories and review npm, Python and runtime migrations. (#559)
- Report checkout time separately from scan time in the corpus harness. (#558)
- Add ten reviewed GitHub Actions repositories to the validation corpus. (#555)
- Record reviewed and rejected corpus candidates. (#554)
- Add the GitHub-hosted runner image importer. (#552)
- Add the GitHub Actions runtime importer. (#551)
- Add the PyPI project status importer. (#550)
- Add the npm deprecation importer. (#549)
- Add the Python release cycle importer. (#548)
- Mine migration commit candidates. (#547)
- Add the Node.js release schedule importer. (#546)
- Generate a reviewable pull-request body for importer drafts. (#545)
- Diff importer drafts against the registry. (#544)
- Add offline recording and replay for importer tests. (#543)
- Define the lifecycle importer interface. (#542)
- Schedule a weekly source-freshness check. (#538)
- Migrate the GitHub Actions registry to rule format v2. (#537)
- Migrate the Python registry to rule format v2. (#536)
- Migrate the npm registry to rule format v2. (#535)
- Migrate the Node.js registry to rule format v2. (#534)
- Add a v1 to v2 registry conversion tool. (#533)
- Load v1 and v2 registries side by side. (#532)
- Validate registry v2 provenance, sources, and freshness. (#531)
- Export detector conformance harness. (#530)
- Add NuGet and RubyGems comparators for VERS. (#529)
- Add the Maven comparator for VERS. (#527)
- Add the PEP 440 comparator for VERS. (#525)
- Add the semver comparator for VERS. (#523)
- Implement VERS range parsing and containment. (#521)
- Add PURL identity helpers. (#517)
- Define the registry v2 JSON Schema. (#516)
- Package and validate Codex plugin. (#66)
- Prepare Codex plugin submission. (#65)
- Publish Claude plugin marketplace. (#64)
- Add cross-host plugin release gates. (#63)
- Define shared plugin packaging architecture.
- Add reproducible skill trigger evaluations.
- Publish capability manifest.
- Add environment doctor.
- Add Evergreen logo system.
- Use the Release schedule end dates for Node.js 18 and 20 (#654, #644). (#658)
- Read pnpm lockfiles that contain several YAML documents. (#656)
- Record the SHA-pinned findings that comment classification now reports in the corpus. (#561)

## 0.1.0 - 2026-10-14

- Add the versioned detector SDK at `evergreen-deprecation/sdk`.
- Validate detector compatibility and registry envelopes before scanning.
- Add an external detector example, authoring guide, and compatibility suite.
- Add Python runtime and direct-package lifecycle detection for pyproject, requirements, version files, and common lockfiles.
- Add language-aware source usage analysis with exact imports, calls, configuration keys, and migration-impact estimates.
- Add a reusable GitHub Action with pull-request annotations, baseline regression filtering, severity gates, and JSON report artifacts.
- Add validated, rule-specific `evergreen context` migration packets for humans and coding agents.
- Add a local stdio MCP server with versioned scan, list, explain, context, and migration-verification tools.
- Add a portable Agent Skill for the scan, explain, migrate, and verify workflow with trigger evaluation cases.
- Validate 27 expected lifecycle findings across 20 pinned public repositories with no observed false positives or false negatives.
- Add public documentation, a reproducible 90-second demo, contribution templates, and the post-launch roadmap.

## 0.1.0-alpha.0

- Add evidence-backed detection for five first-party GitHub Actions families.
- Add Node.js end-of-life detection from package metadata and version files.
- Add npm, pnpm, and Yarn lockfile discovery for deprecated direct dependencies.
- Add text and versioned JSON reports.
- Add finding explanations and portable baselines.
- Keep all repository analysis local and deterministic.
