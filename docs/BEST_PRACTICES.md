---
title: OpenSSF Best Practices Silver gaps
---

# OpenSSF Best Practices Silver gaps

This page compares every criterion for the OpenSSF Best Practices **Silver** badge with this repository, and names either the evidence that already satisfies it or what is still missing. It is the repository-side answer sheet: the badge form itself still needs the Silver-only answers, justifications, and URLs entered at [the project page](https://www.bestpractices.dev/projects/16161).

Checked on 2026-11-01 against `origin/main` at commit `435a5c15`.

## Sources

- Criteria: [all levels](https://www.bestpractices.dev/en/criteria) and [Silver only](https://www.bestpractices.dev/en/criteria/1). The Silver page lists **55 active criteria**: 44 MUST, 10 SHOULD, and 1 SUGGESTED, which matches [criteria statistics](https://www.bestpractices.dev/en/criteria_stats) and the categories in [`criteria.yml`](https://github.com/coreinfrastructure/best-practices-badge/blob/main/criteria/criteria.yml).
- Badge state: the project JSON at [bestpractices.dev/projects/16161.json](https://www.bestpractices.dev/projects/16161.json) reports `badge_level: "passing"` and `achieve_silver_status: "Unmet"`.
- Scoring: the badge awards a level only at 100% of that level's active criteria. A Met or N/A answer with the required justification counts; a partial answer does not. Silver therefore needs all 55, not a subset.

## How to read the states

| State | Meaning |
| --- | --- |
| **Met** | The repository has the required artefact, workflow, or documented process. |
| **Partial** | Something real exists, but it does not yet satisfy the whole criterion. |
| **Gap** | Nothing in the repository satisfies the criterion. |
| **N/A** | The criterion does not apply to this project; the badge form needs the N/A answer with this justification. |

The project holds the **Passing** badge: its 67 active criteria are answered, with 60 Met and 7 N/A, and none Unmet. Seven of the 55 Silver criteria are also Passing criteria, so their answers carry over: `contribution_requirements`, `report_tracker`, `tests_documented_added`, `warnings_strict`, `crypto_weaknesses`, `static_analysis_common_vulnerabilities` (all Met), and `dynamic_analysis_unsafe` (N/A). `achieve_passing` is also already Met. The remaining 47 Silver-only criteria have no answer yet.

## Where the project stands

| | Count |
| --- | ---: |
| Silver criteria | 55 |
| Met | 34 |
| N/A | 8 |
| Partial | 8 |
| Gap | 5 |
| Criteria short of Met or N/A | **13** |
| Ready-to-file issues for those gaps | **11** (some one fix closes more than one criterion) |

## Basics

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`achieve_passing`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The badge JSON reports `badge_level: "passing"` and `achieve_passing_status: "Met"`; [README.md](../README.md) links project 16161 in the badge row. | — |
| [`contribution_requirements`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [CONTRIBUTING.md](../CONTRIBUTING.md#quality-standards) states the coding standard, test requirement, static analysis, build, and security rules; [Pull requests](../CONTRIBUTING.md#pull-requests) states the review and evidence expectations. Also answered at Passing. | — |
| [`dco`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Gap** | No DCO or CLA: nothing in [CONTRIBUTING.md](../CONTRIBUTING.md) asks for `Signed-off-by`, there is no DCO file or workflow, and the last 200 commits contain no sign-off. The Apache-2.0 sentence is a licence grant, not a per-contribution legal assertion. | Add a DCO, require the sign-off in CONTRIBUTING and CI, and link the DCO. |
| [`governance`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [GOVERNANCE.md](../GOVERNANCE.md#roles) defines the roles, decision process, decision records, escalation path, ownership transfer, and how the document changes. | — |
| [`code_of_conduct`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) is at the repository root and linked for enforcement from [GOVERNANCE.md](../GOVERNANCE.md#escalation). | — |
| [`roles_responsibilities`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [GOVERNANCE.md](../GOVERNANCE.md#roles) has the role table; [MAINTAINERS.md](../MAINTAINERS.md#project-maintainers) names the maintainer and every detector owner; [CODEOWNERS](../.github/CODEOWNERS) routes review for owned paths. | — |
| [`access_continuity`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Gap** | One maintainer is named in [MAINTAINERS.md](../MAINTAINERS.md#project-maintainers). No continuity plan, backup account access, or second person is documented who could create issues, merge, and release within a week. [When an owner steps away](../GOVERNANCE.md#when-an-owner-steps-away) covers detector ownership only. | Document a continuity plan for accounts, keys, and releases, and test it with a release cut by a second person. |
| [`bus_factor`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Gap** | The maintainer table has one person, and [review expectations](../CONTRIBUTING.md#review-expectations) escalate to the same person. | Add a second maintainer with merge and release rights, recorded in GOVERNANCE, MAINTAINERS, and CODEOWNERS. |
| [`documentation_roadmap`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | [docs/ROADMAP.md](ROADMAP.md) is dated 2026-10-15 → 2027-04-15, about six months, plus “After v1 — Future” and “Not in this roadmap”. | Extend the dated roadmap to at least 2027-11 and keep the explicit not-doing list. |
| [`documentation_architecture`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [docs/ARCHITECTURE.md](ARCHITECTURE.md) has the layer diagram, owned boundaries, trust boundaries, and hosting model. | — |
| [`documentation_security`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [SECURITY.md](../SECURITY.md#trust-model), [docs/THREAT_MODEL.md](THREAT_MODEL.md), and [docs/PRIVACY.md](PRIVACY.md#command-and-surface-access) state what users can and cannot expect, including residual risk. | — |
| [`documentation_quick_start`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [docs/QUICKSTART.md](QUICKSTART.md) goes from the first scan to CI in five steps; [README.md](../README.md) links the 90-second demo. | — |
| [`documentation_current`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | CI checks generated reference, Open Graph, answer, and `llms-full` pages in [ci.yml](../.github/workflows/ci.yml); [docs/generated-files.md](generated-files.md) inventories every generated output and its readers. The docs doctor job and the Seaworthy job in [pages.yml](../.github/workflows/pages.yml) run report-only (`level: none`, `--fail-on none`), so a known documentation defect does not fail review. | Make a documentation defect check blocking, or track known defects to closure in one list. |
| [`documentation_achievements`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The [README.md](../README.md) badge row links the Best Practices project, Scorecard, npm, CI, CodeQL, and the other recognitions; [SECURITY.md](../SECURITY.md#openssf-scorecard) links the badge again. | — (keep the badge within 48 hours of a new recognition) |
| [`accessibility_best_practices`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Partial** | The Lighthouse job in [pages.yml](../.github/workflows/pages.yml) asserts accessibility ≥ 0.9 on the home page and one rule page of the Pages build artifact ([config](../.github/lighthouse/lighthouserc.json)); [BRAND_GUIDE.md](../brand/BRAND_GUIDE.md#accessible-color-pairs) records WCAG AA colour pairs. There is no accessibility statement, WCAG target, full-site audit, or CLI output audit. | Publish an accessibility statement with a target, and audit every site template and the CLI output. |
| [`internationalization`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Partial** | [docs/i18n/fa/README.md](i18n/fa/README.md) and [docs/i18n/fa/QUICKSTART.md](i18n/fa/QUICKSTART.md) are Persian translations, linked from the English README. CLI and documentation strings are English-only and have no message catalog. | Decide the i18n scope, document it, and either add a message catalog or record why English-only is the deliberate choice. |
| [`sites_password_security`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | The project site is a static GitHub Pages build of `docs/` deployed from a workflow artifact ([pages.yml](../.github/workflows/pages.yml), [_config.yml](_config.yml)); it has no accounts, authentication, or stored passwords. GitHub handles authentication for the repository. | Enter N/A with this justification. |

## Change Control

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`maintenance_or_update`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | Releases use SemVer and release notes ([RELEASING.md](RELEASING.md)), and [COMPATIBILITY.md](COMPATIBILITY.md#deprecation-policy) documents deprecation windows and notice periods. [SECURITY.md](../SECURITY.md#supported-versions) supports security fixes for the latest release only, and there is no supported-version window or step-by-step upgrade guide for an older release. | State a support window and publish an upgrade path for versions users are likely to still run. |

## Reporting

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`report_tracker`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | Public GitHub Issues with issue forms in [.github/ISSUE_TEMPLATE/](../.github/ISSUE_TEMPLATE/); README and CONTRIBUTING link it. Also answered at Passing. | — |
| [`vulnerability_report_credit`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [SECURITY.md](../SECURITY.md#reporting-a-vulnerability) says a published advisory credits the reporter unless they ask to stay anonymous. | — |
| [`vulnerability_response_process`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [SECURITY.md](../SECURITY.md#reporting-a-vulnerability) documents private reporting, a seven-day acknowledgement, a 30-day assessment or fix plan, and an advisory with affected and fixed versions. | — |

## Quality

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`coding_standards`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | [CONTRIBUTING.md](../CONTRIBUTING.md#quality-standards) names the TypeScript compiler flags (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and says to match the surrounding code. It does not name a style guide for formatting, naming, or imports. | Name the style guide contributions must follow and document it in CONTRIBUTING. |
| [`coding_standards_enforced`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Gap** | `npm run check` is the TypeScript build, the Action bundle, the test suite, plugin drift, and the plugin evals ([package.json](../package.json), [check-pipeline.ts](../tools/check-pipeline.ts)). There is no ESLint, Prettier, Biome, or other formatter/linter configuration or CI step, so type checking is the only automated enforcement. | Add a FLOSS formatter and linter to `npm run check` and CI. |
| [`build_standard_variables`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | The project produces no native binaries; it compiles TypeScript with `tsc` and bundles the Action with `ncc`. No C/C++ compiler or linker step exists to pass `CC`, `CFLAGS`, or `LDFLAGS` to. | Enter N/A with this justification. |
| [`build_preserve_debug`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **N/A** | There is no end-user build or install system with debug flags: npm ships the compiled package, and the `files` list excludes source maps. | Enter N/A with this justification. |
| [`build_non_recursive`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | The build is one `tsc -b` project plus an `ncc` bundle; there is no recursive native build over cross-dependent subdirectories. | Enter N/A with this justification. |
| [`build_repeatable`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | `npm run check:reproducible` builds twice and compares npm tarballs byte for byte; it is a release gate in [RELEASING.md](RELEASING.md#gates) and the release workflow. The data bundle is likewise built twice and must be identical. | — |
| [`installation_common`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | `npm install` and `npm uninstall` through the published package, with `bin` entries in [package.json](../package.json); [docs/INSTALL.md](INSTALL.md#npm) documents it. | — |
| [`installation_standard_variables`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | npm owns the install location and prefix; the project ships no installer that writes artifacts into POSIX paths or should honour `DESTDIR`. | Enter N/A with this justification. |
| [`installation_development_quick`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [CONTRIBUTING.md](../CONTRIBUTING.md#set-up) and [AGENTS.md](../AGENTS.md#setup-and-commands) both give `git clone`, `npm ci`, `npm run check`; the repository also has a Codespaces/dev-container path. | — |
| [`external_dependencies`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [package.json](../package.json) declares dependencies and [package-lock.json](../package-lock.json) pins them; GitHub Actions are pinned to full SHAs; signed data bundles list every file with a digest. | — |
| [`dependency_monitoring`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [dependabot.yml](../.github/dependabot.yml) updates npm and Actions weekly; the self-scan job in [ci.yml](../.github/workflows/ci.yml) scans this repository on every push to `main` and in the merge queue and fails on findings outside the baseline; [scorecard.yml](../.github/workflows/scorecard.yml) runs weekly. | — |
| [`updateable_reused_components`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The lockfile, Dependabot update groups with a cooldown, SHA-pinned Actions, and `npm ci` make a reused component a one-line update. | — |
| [`interfaces_current`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Met** | The self-scan job fails on findings outside the baseline on every push to `main` and every merge-queue run; [AGENTS.md](../AGENTS.md#dependencies) requires `evergreen check` before adding a dependency or Action, and the opt-in pre-push hook runs the same gate locally; [COMPATIBILITY.md](COMPATIBILITY.md#deprecation-policy) states when an interface is deprecated. | — |
| [`automated_integration_testing`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [ci.yml](../.github/workflows/ci.yml) runs the suite on every push to `main`, every merge-queue run, and every pull request except a docs-only change; `npm run check` runs the 420 test files under [tests/](../tests/), and the jobs report pass/fail. | — |
| [`regression_tests_added50`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | [CONTRIBUTING.md](../CONTRIBUTING.md#development-rules) and the [pull request template](../.github/pull_request_template.md) require a test with a bug fix, and the coverage floors keep tests growing. Nothing measures the share of the last six months' bug fixes that actually shipped a regression test. | Measure and report the ratio, or automate a check that every `fix:` change adds a test. |
| [`test_statement_coverage80`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | `test:coverage` in [package.json](../package.json) enforces 93% lines, 87% branches, and 93% functions; [ci.yml](../.github/workflows/ci.yml) runs it on `main` and uploads LCOV. | — |
| [`test_policy_mandated`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [CONTRIBUTING.md](../CONTRIBUTING.md#development-rules) and [Quality standards](../CONTRIBUTING.md#quality-standards) require a test for new functionality and bug fixes; [AGENTS.md](../AGENTS.md#working-on-an-issue) step 4 repeats it. | — |
| [`tests_documented_added`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [CONTRIBUTING.md](../CONTRIBUTING.md#pull-requests) and the pull request template's “Tests added or updated” checkbox document the requirement for change proposals. | — |
| [`warnings_strict`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | Already answered Met at Passing. [tsconfig.json](../tsconfig.json) enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`, and the build fails on every compiler error, so type-level warnings are strict. There is no linter, so a linter with strict warning rules would strengthen the answer but is not needed to keep this criterion Met. | — (optional: add the strict linter from the style-enforcement gap) |

## Security

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`implement_secure_design`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [docs/THREAT_MODEL.md](THREAT_MODEL.md) applies STRIDE to each surface with mitigations and residual risk; [docs/ARCHITECTURE.md](ARCHITECTURE.md#trust-boundaries) records the boundaries; repository and registry content are treated as data and never executed. | — |
| [`crypto_weaknesses`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The only hash the product computes is SHA-256 (`createHash("sha256")` in `scan-cache.ts`, `data-bundle.ts`, `baseline.ts`, `reporters.ts`, and `treemap.ts`); no MD5 or SHA-1 appears in `src/`. Signature checks use Sigstore. | — |
| [`crypto_algorithm_agility`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **N/A** | The project implements no cryptographic algorithms and exposes no algorithm choice; signing and verification are delegated to Sigstore, and transport security to Node TLS. | Enter N/A with this justification. |
| [`crypto_credential_agility`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | Evergreen stores no authentication credentials or private keys. The GitHub token is read per run from the action input or environment, and the Sigstore trusted root is public data shipped in the package. | Enter N/A with this justification. |
| [`crypto_used_network`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Met** | Every network path is HTTPS: signed data releases, the optional GitHub API comment, and the user's own package install ([PRIVACY.md](PRIVACY.md#command-and-surface-access)). There is no FTP, plain HTTP, or other insecure transport. | — |
| [`crypto_tls12`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Met** | All TLS goes through Node's `fetch`/undici, which requires TLS 1.2 or newer by default; no custom TLS version or cipher configuration exists in `src/`. | — |
| [`crypto_certificate_verification`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | No `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`, or plain-HTTP fallback appears in `src/`; certificate verification stays at the Node default. | — |
| [`crypto_verification_private`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The only private value sent over the network is the GitHub token in a request header, and it goes through `fetch` only after the TLS handshake, with no plain-HTTP path ([pr-comment.ts](../src/pr-comment.ts), [action-fix-pr.ts](../src/action-fix-pr.ts)). | — |
| [`signed_releases`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | The release publish stages ([release-publish-binaries.yml](../.github/workflows/release-publish-binaries.yml), [release-publish-container.yml](../.github/workflows/release-publish-container.yml)) sign binaries and checksums with keyless Sigstore, add a build-provenance attestation and SLSA provenance, and sign the image digest too; [release.yml](../.github/workflows/release.yml) publishes npm with `--provenance`. [RELEASING.md](RELEASING.md#verifying-a-published-release) documents the public verification commands. Keys are short-lived OIDC identities, never stored on the distribution site. | — |
| [`version_tags_signed`](https://www.bestpractices.dev/en/criteria/1) | SUGGESTED | **Gap** | Tags are annotated but unsigned: [RELEASING.md](RELEASING.md#steps) tells maintainers to run `git tag -a`, and [release.yml](../.github/workflows/release.yml) moves the major tag with `git tag --force`. No `-s`/`-u` and no published key or verification instructions exist. | Sign release and major tags with a published key and document verification. |
| [`input_validation`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | Zod schemas validate MCP tool input and capabilities ([mcp.ts](../src/mcp.ts), [capabilities.ts](../src/capabilities.ts)); `validateRegistryV2` validates every registry before rules are used ([registry.ts](../src/registry.ts)); published JSON Schemas live in [schemas/](../schemas/); [THREAT_MODEL.md](THREAT_MODEL.md#untrusted-repositories) records the file-size, nesting, and symlink limits. | — |
| [`hardening`](https://www.bestpractices.dev/en/criteria/1) | SHOULD | **Met** | The product is memory-safe TypeScript with strict null and index checks, parsers have byte and time budgets, JSON depth is capped, and untrusted text is never evaluated as code. [THREAT_MODEL.md](THREAT_MODEL.md#untrusted-repositories) lists these controls. The vendored tree-sitter runtime evaluates its own generated WebAssembly glue, not repository text ([tree-sitter.cjs](../src/usage/vendor/tree-sitter/tree-sitter.cjs)). | — |
| [`assurance_case`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Partial** | [docs/THREAT_MODEL.md](THREAT_MODEL.md) has the threat model, trust boundaries, per-surface threats, mitigations, and residual risk. It is not framed as an assurance case and does not argue secure design principles or common implementation weakness classes against stated security requirements. | Add `docs/ASSURANCE_CASE.md` that ties the requirements in SECURITY.md to threats, controls, and evidence. |

## Analysis

| Criterion | Level | State | Evidence in this repository | What closes a gap |
| --- | --- | --- | --- | --- |
| [`static_analysis_common_vulnerabilities`](https://www.bestpractices.dev/en/criteria/1) | MUST | **Met** | [codeql.yml](../.github/workflows/codeql.yml) runs CodeQL for JavaScript and TypeScript weekly and on demand and uploads SARIF; [scorecard.yml](../.github/workflows/scorecard.yml) and the dogfood Evergreen Action in [ci.yml](../.github/workflows/ci.yml) upload their SARIF to the same code-scanning dashboard. Already answered Met at Passing. | — |
| [`dynamic_analysis_unsafe`](https://www.bestpractices.dev/en/criteria/1) | MUST | **N/A** | No memory-unsafe language is produced: the package is TypeScript/JavaScript, no C or C++ is built, and the tree-sitter runtime is a prebuilt WebAssembly dependency. Already answered N/A at Passing. | Enter N/A with this justification. |

## Gaps to file

The issue that requested this page says to open one issue per real gap. This session was limited to pull requests, so **no issues were opened**; the titles below are ready to file as they are. One row can close more than one criterion when the underlying fix is the same.

| # | Criteria | Ready-to-file issue title |
| ---: | --- | --- |
| 1 | `dco` | Add a DCO sign-off requirement for contributions |
| 2 | `access_continuity`, `bus_factor` | Document a continuity plan and add a second maintainer with release access |
| 3 | `documentation_roadmap` | Extend the roadmap to cover at least the next twelve months |
| 4 | `documentation_current` | Make documentation defect checks blocking and track known defects |
| 5 | `accessibility_best_practices` | Publish an accessibility statement and audit the site and CLI |
| 6 | `internationalization` | Decide and document the internationalization scope for docs and CLI output |
| 7 | `maintenance_or_update` | Publish a supported-version and upgrade policy for older releases |
| 8 | `coding_standards`, `coding_standards_enforced` | Name a coding style guide and enforce it with a linter and formatter |
| 9 | `regression_tests_added50` | Measure and report regression tests added for fixed bugs |
| 10 | `assurance_case` | Add an assurance case for the security requirements |
| 11 | `version_tags_signed` | Sign release tags and document how to verify them |

## What the badge form still needs

The 47 unanswered Silver-only criteria need a status plus the justification or URL the form requires; the N/A criteria also need the justification shown above. Reviewing the seven shared answers and `achieve_passing` before submitting is cheap, and the evidence column in this page names the file or workflow to cite for every criterion.
