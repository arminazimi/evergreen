---
title: CI runner images detector
---

# CI runner images detector

The detector's supported declarations, what it reports, what it intentionally does not judge, and the false-positive boundaries. The matrix and policy it belongs to are on [Compatibility](../COMPATIBILITY.md).

## CI runner images detector

The `ci-images` detector is **experimental**: its level is recorded as `experimental` in `benchmarks/thresholds.json`. Five targeted public repositories are pinned for it (see [the corpus](../validation/ecosystems.md#ci-runner-images-corpus)); precision is not enforced, and its blind share is zero. Its lifecycle rules are in `registry/ci-images.json` and ship in the [data bundle](../DATA.md). Bundled rules include the scheduled removals of the macOS 14 Sonoma and Ubuntu 22.04 hosted images, citing the [Microsoft-hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule). A label is a finding only when a reviewed rule covers it. Scans read that bundled registry only.

### Supported files and declarations

| File | Declaration read | Notes |
| --- | --- | --- |
| `azure-pipelines.yml` | Literal `pool.vmImage` on the pipeline, a stage, or a job | The label is matched when it is `ubuntu-<version>`, `macos-<version>`, or `windows-<version>`, compared case-insensitively. |
| `.gitlab-ci.yml` | Root and job `image` values, including an image object's `name`, and image values in `services` | Every located value is unclassified. None become findings. |
| `.circleci/config.yml` | `docker.image` and `machine.image` under `jobs` and `executors`, and string values under `orbs` | Orbs, dynamic values, and floating aliases are unclassified. A literal image is parsed and not judged. |

Only a file named `.gitlab-ci.yml`, `azure-pipelines.yml`, or `config.yml` directly inside a `.circleci` directory is read. Files are found by walking the repository up to eight directories deep, to at most 500 files. Symbolic links are not followed, and `.git`, `node_modules`, `vendor`, `dist`, `build`, `bin`, `obj`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata` are skipped. GitLab CI, CircleCI, and Azure Pipelines are never run, and nothing is fetched.

### What it reports

- An Azure `pool.vmImage` whose family and numeric version a rule's Package URL and `vers` range contain. The finding is the value's line. It carries the rule's source, replacement, deadline, and migration guidance when the rule has it. Every matching rule is reported.
- Nothing for a GitLab image or service, a CircleCI image or orb, or an Azure label no rule covers. An unclassified reference is not a finding.

### What it intentionally does not judge

- GitLab CI images and services. Decision 0014 records no authoritative GitLab lifecycle source, so a literal image is not evidence that GitLab retired it.
- CircleCI `docker.image` and `machine.image` values, including ones that look old. This version has no CircleCI Package URL mapping, so a literal image is not matched against a rule. Orb references are not image lifecycle claims, and their remote contents are not read.
- `latest`, `ubuntu-latest`, `macos-latest`, `windows-latest`, and other `*-latest` or `:latest` aliases. `cimg/<name>:current` is floating too.
- Dynamic values: `$IMAGE`, `${IMAGE}`, `$(vmImage)`, `<< parameters.image >>`, `<< pipeline.parameters.image >>`, and any value that contains `$` or `<<`.
- Azure labels outside `ubuntu-`, `macos-`, and `windows-` plus a numeric version, including `ubuntu-22.04-arm64` and `windows-2025-vs2026`.
- A pool written as a string, a pool `name` without `vmImage`, containers, resources, and `strategy.matrix` `vmImage` entries.
- CircleCI workflow executor references, `resource_class`, descriptions, and a job that only names an orb executor.
- Comments, unrelated keys, unresolved YAML aliases, merge keys, non-string values, and malformed YAML.
- Vulnerability advisories. A newer image existing is not a lifecycle finding.

### Known limits and false-positive boundaries

- An Azure label is reported when a rule matches the text, including a pipeline the project no longer runs, and including a self-hosted agent that reuses a hosted label string. Evergreen does not ask Azure DevOps which pipeline is active.
- GitLab and CircleCI references that are unclassified name the file and line. A literal CircleCI image is omitted from both findings and unclassified references.
- Malformed YAML produces no declarations from that file, never a partial result, and no error is raised. A file over 1 MiB yields nothing, and a single value over 4,096 characters is skipped.
- The eight-level and 500-file limits are silent. Files beyond them, and any under a skipped directory, are not scanned.
