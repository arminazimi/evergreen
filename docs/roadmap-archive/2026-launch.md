# Three-month launch roadmap (completed)

This is the working roadmap. Scope changes require an explicit decision recorded in `docs/decisions/`.

## Month 1 — Prove the core

### Week 1: contracts and CLI foundation

- [x] Define product principles and non-goals
- [x] Define rule and finding contracts
- [x] Create the CLI entry point
- [x] Add deterministic output and tests
- [x] Validate the contracts with five real deprecation examples

Exit criterion: `evergreen scan` runs locally and produces valid text and JSON reports.

### Week 2: GitHub Actions detector

- [x] Discover workflow files
- [x] Parse action references with file and line locations
- [x] Match references against the bundled registry
- [x] Add fixtures for true and false positives

Exit criterion: detect at least five real, sourced GitHub Actions lifecycle findings.

### Week 3: npm and Node.js detector

- [x] Read `package.json` and supported lockfiles
- [x] Resolve declared and installed versions
- [x] Detect package and runtime lifecycle findings
- [x] Implement `evergreen explain <finding-id>`

Exit criterion: scan ten public repositories with an explainable false-positive rate below 10%.

### Week 4: first usable release

- [x] Implement baselines
- [x] Stabilize text and JSON output
- [x] Publish an alpha npm package
- [x] Write end-to-end documentation

Exit criterion: a new user can install and obtain a useful finding in under five minutes.

## Month 2 — Become extensible

### Week 5: detector SDK

- [x] Publish detector interfaces
- [x] Isolate built-in detectors from the core
- [x] Create a detector authoring example

### Week 6: Python detector

- [x] Support `pyproject.toml`, `requirements.txt`, and common lockfiles
- [x] Add Python runtime and package lifecycle rules

### Week 7: source usage analysis

- [x] Locate imports, calls, and configuration keys
- [x] Estimate migration impact from affected usages
- [x] Keep analysis narrow and language-aware

### Week 8: GitHub Action

- [x] Add pull-request annotations
- [x] Report only new findings against a baseline
- [x] Support severity gates

Exit criterion for Month 2: external contributors can add a detector without editing the core.

## Month 3 — Become agent-native

### Week 9: migration packets

- [x] Implement `evergreen context <finding-id>`
- [x] Include affected files, constraints, steps, sources, and verification commands

### Week 10: local MCP server

- [x] Expose scan, explain, context, and verify tools
- [x] Keep all analysis local

### Week 11: agent skills

- [x] Provide thin, vendor-neutral usage instructions
- [x] Test the workflow with multiple coding agents

### Week 12: public launch

- [x] Publish v0.1
- [x] Test 20 representative repositories
- [x] Publish accuracy and performance results
- [x] Prepare contributor issues and a short demo
- [x] Launch public documentation
- [x] Record post-launch findings and the next roadmap

Exit criterion for Month 3: a human or agent can discover, understand, migrate, and verify one supported deprecation without a hosted Evergreen service.

## Committed long-range expansion

### Phase 18 — Language and platform expansion

- [ ] Add evidence-backed Go lifecycle detection ([#43](https://github.com/arminazimi/evergreen/issues/43))
  - Parse Go versions and toolchain directives from supported `go.mod` and `go.work` files.
  - Detect lifecycle risks for the Go runtime and evidence-backed direct modules.
  - Map supported imports and usages into migration context and verification steps.
  - Gate release on conformance fixtures and a pinned public-repository corpus.

Go support will use the existing detector SDK and remain local-first and deterministic. It will not require the Go toolchain, network access, or a hosted Evergreen service for ordinary repository scans. The scope decision is recorded in [Decision 0002](../decisions/0002-go-ecosystem-support.md).
