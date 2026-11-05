# 0030 — Select corpus repositories independently of results; target 200 per ecosystem

Status: proposed; accepted when the maintainer merges the pull request for #2116.

## Problem

The corpus-tooling epic (#1993) targets 200 repositories per ecosystem, but earlier batches used different
activity windows, size limits, and version-specific searches. Without a common rule, growth can favor familiar
stacks or repositories Evergreen already handles well. A small ecosystem may not have 200 eligible projects.

This record defines selection policy for future growth. It does not relabel historical batches described in
[Validation corpus](../validation/corpus.md), implement discovery or labeling, or change detector maturity
requirements in [decision 0013](0013-detector-maturity.md).

## Decision

### 1. Freeze eligibility before scanning

For each batch, commit the discovery date (UTC), queries, filters, ordered candidate list, selected repositories,
skip reasons, and default-branch commit SHAs before running Evergreen on the selections. Preserve the search
snapshot because live rankings change. Apply these rules equally to all ecosystems:

| Criterion | Rule for new blind selections |
| --- | --- |
| Public and independent | Public, not archived, not a fork or mirror. Count one upstream project once; renamed repositories and duplicate pins are not new projects. No minimum stars, downloads, or organization membership. |
| Activity | The default branch has a commit within the 24 calendar months ending on the recorded discovery date. Check the commit date, not issue activity or the repository's general update timestamp. Freeze this cutoff for the batch. |
| Size | GitHub's reported repository size is at most 50,000 KB, following earlier corpus batches. Record the value at discovery; sparse checkout does not exempt an oversized repository. |
| License | A license file at the selected commit grants use under an identified OSI-approved open-source license. Record its path and SPDX identifier; for multiple licenses, identify the one covering the inspected files. Missing, ambiguous, or incompatible coverage is a recorded skip pending human review, never assumed permission. |
| Ecosystem evidence | The pinned tree contains at least one input form the ecosystem's detector documents reading. Inspect files as text only. A matching language tag alone is insufficient; no particular dependency version or finding is required. |

Fetches belong to the separate corpus tooling. Scans remain offline; never install, build, execute repository
code, run its scripts or tools, or evaluate its configuration to decide eligibility or labels. Store metadata,
paths, line numbers, and minimal evidence quotations, not vendored repository contents; retain license notices
when quoting evidence.

Existing pins remain reproducible historical regression evidence even if the project later becomes inactive,
archived, or too large. Do not silently repin or retroactively call an old selection blind. Historical migration
examples that do not meet the new blind-selection rules may be retained as explicitly targeted evidence, with
their original selection rationale, and reported separately from eligible progress toward 200.

### 2. Cover all 23 ecosystem buckets

Use the existing corpus bucket names, including `node` for npm/Node.js and `node-actions` for GitHub Actions.
The following table is the scope, including the three buckets with no entries at the time of this decision.
The examples guide diversity; the detector documentation owns the exact supported input forms.

| Bucket | Stack or input variety to seek |
| --- | --- |
| `android` | Java and Kotlin; Groovy and Kotlin Gradle builds |
| `ci-images` | Azure Pipelines and GitHub Actions runner declarations |
| `container` | Dockerfiles and Compose; single-stage and multi-stage images |
| `cpp` | C and C++; CMake and supported dependency manifests |
| `dart` | Dart packages and Flutter applications |
| `database` | Compose and Terraform; different database engines and cloud providers |
| `deno` | Deno and Bun; runtime configuration and version files |
| `dotnet` | C#, F#, and Visual Basic projects; project and SDK declarations |
| `elixir` | Elixir and Erlang/OTP; Mix manifests, locks, and tool versions |
| `go` | Libraries and services; modules and toolchain declarations |
| `java` | Java and Kotlin; Maven, Gradle, and JDK version files |
| `kubernetes` | Plain manifests, Helm charts, and kustomizations |
| `node` | JavaScript and TypeScript; applications and libraries; different package managers |
| `node-actions` | Different host languages; reusable and ordinary workflows |
| `php` | Framework applications and Composer libraries; runtime and package declarations |
| `python` | Applications and libraries; requirements, project manifests, and runtime files |
| `ruby` | Applications and gems; runtime pins and dependency declarations |
| `rust` | Applications, libraries, and workspaces; Cargo and toolchain declarations |
| `scala` | Scala and sbt; build and version declarations |
| `serverless` | Serverless Framework, SAM, and supported Terraform cloud functions |
| `shell` | PowerShell scripts, modules, and CI containers |
| `swift` | Swift packages and Xcode applications; project and toolchain declarations |
| `terraform` | Modules and deployments; different supported providers |

For each bucket, declare strata before selection using supported input forms or stack families from the table,
plus small (at most 5,000 KB) and medium (5,001–50,000 KB) repositories. Walk nonempty strata round-robin in a
recorded order; within each, sort by lowercase `owner/name`. Deduplicate overlapping strata. Search for input
filenames or ecosystem structure, not deprecated versions or known findings. Record application/library and
maintainer diversity where applicable; publish empty strata and search limits rather than inventing coverage.

Never choose the next repository by its score or stop a batch because enough positive or zero-finding examples
have appeared. Version-specific searches and known migrations are targeted supplements, labeled `targeted` and
reported separately; they cannot replace the blind sample. Existing blind labels retain their historical
meaning under decision 0013, even when their older selection rules differ from this record.

### 3. Interpret 200 as reviewed projects per bucket

The growth target is **200 distinct eligible upstream repositories in each of the 23 buckets**: 4,600 bucket
memberships, not 200 overall, 200 findings, or 200 successful scans. A project belongs to one primary bucket
chosen from its input evidence before scanning; multiple commits, monorepo packages, or incidental findings
from other detectors do not increase the count. All detectors still scan the selected tree, and every judged
finding is labeled. Report cross-ecosystem detector evidence separately from bucket membership.

Count an entry toward 200 only after its pin, eligibility, selection provenance, and ground truth have been
reviewed, including a review supporting an empty expected list. Retained historical entries count only where
their recorded evidence establishes eligibility at their selection date; missing evidence is not grandfathered
into the new total. Publish blind and targeted counts alongside the total, and keep at least two thirds of the
counted repositories blind, matching the stable selection floor in decision 0013. Reaching 200 alone grants
neither stable maturity nor a claim of representative accuracy; the other maturity and independent-validation
requirements remain in force, and held-out repositories stay separate from this growth count.

**Poor precision, poor recall, unexpected findings, zero findings, parser failures, and slow scans are never
reasons to remove or replace a selected repository.** Keep failures visible and fix Evergreen or track the gap.
A pending review or failed scan is reported explicitly, not converted into a clean result. Correct wrong labels
only with independent evidence and a reviewed history of the correction. Removal requires an objective reason
such as a duplicate upstream, lost access, or a confirmed licensing problem, recorded in review with the old
pin and reason retained; its replacement follows the same precommitted selection order.

### 4. Publish an honest shortfall

If the recorded searches and strata cannot supply 200 eligible, reviewed repositories, publish the actual
count as `N/200`, the blind/targeted split, pending reviews and fetch failures, empty strata, discovery date,
queries and search limits, and skip reasons. A capped search is evidence of a limited search, not proof that
the ecosystem has no more repositories. State which limitation prevents further growth.

Do not pad the count with forks, duplicate commits, fixtures, generated toy projects, other ecosystems, or
unreviewed labels; do not relax activity, size, licensing, or blind-selection rules just to hit 200. A maintainer
may accept a documented shortfall for the release while the target remains unmet. Any different target or
eligibility exception needs a separate reviewed decision before new selection, with its effect on comparability
explained. Schedule a follow-up discovery batch when the candidate pool or tooling improves.

## Consequences

- Growth is reproducible from saved selection records and pins; new selection and labeling tooling follows this
  policy in the remaining tasks of #1993. This record adds no runtime behavior, network path, or dependency.
- Blind selection remains distinct from independent ground truth. A regression corpus labeled after seeing
  Evergreen's output cannot establish generalization; preserve the separate held-out process in
  [Validation corpus](../validation/corpus.md#the-held-out-set).
- Maintainer merge of the pull request for #2116 records acceptance of this policy. Automated checks establish
  repository health; they do not supply maintainer acceptance or prove that the corpus already meets it.
