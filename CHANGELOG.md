# Changelog

## Unreleased

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
