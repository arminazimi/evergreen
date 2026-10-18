# 0014 — Detect retired CI runner images

Status: accepted

Evergreen will add a `ci-images` detector for CI configuration in GitLab CI, CircleCI, and Azure Pipelines. It reports only image lifecycle risks that the platform's authoritative documentation explicitly states, at the file and line of the declaration, and provides migration context from reviewed registry rules. It follows the existing [detector SDK](../DETECTORS.md) and [v2 registry](0004-registry-v2.md); it adds no engine behavior or scan-time network access.

## What the platforms say about image lifecycle

- **Azure Pipelines hosted images have explicit retirement schedules.** Microsoft's [hosted image deprecation schedule](https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule) names affected hosted images, deprecation and removal dates, and recommended replacement labels. These dated notices are evidence for rules; the general list of available images is not evidence that another image has retired.
- **CircleCI images have explicit deprecation notices.** CircleCI's [machine and convenience image lifecycle guide](https://circleci.com/docs/guides/execute/machine-convenience-image-lifecycle/) says machine-image announcements name affected images, brownout dates, and end-of-life dates. The image-family support policies describe lifecycle processes, not a retirement date for every image. A rule therefore needs an official, dated CircleCI deprecation announcement identifying the affected image and its deadline; a general support policy or image age is not sufficient.
- **GitLab image lifecycle is not judged in this version.** The epic identifies no authoritative GitLab lifecycle source. A GitLab CI image string is not evidence that GitLab has retired or deprecated that image. A future GitLab rule needs an official GitLab source explicitly stating the status and date.
- **A newer or current image does not make an older image retired.** Evergreen never infers lifecycle status from popularity, a newer label, naming, or a migration recommendation without an authoritative lifecycle statement.

## What the detector reads and judges

| Declaration | Files | Judged? |
|---|---|---|
| Root/default and job-level `image:` values, and image values in `services:` entries | `.gitlab-ci.yml` | No. Literal image references are parsed with their exact line and returned as unclassified because this version has no approved GitLab lifecycle source. They are not matched against container-detector rules. |
| `machine.image` and `docker.image` in local executor, job, and executor declarations | `.circleci/config.yml` | Yes, for a literal image reference covered by a reviewed CircleCI rule. |
| Orb references in `orbs:` | `.circleci/config.yml` | No. The reference is parsed and returned as unclassified; its version is not an image lifecycle claim. |
| `pool.vmImage` in pipeline-, stage-, and job-level pools | `azure-pipelines.yml` | Yes, for a literal image label covered by a reviewed Azure hosted-image rule. |
| `resource_class`, non-image pool names, and image-looking values in unrelated keys | All listed files | No. |

A CircleCI job that delegates to an orb executor does not expose the executor's image in the repository file and is not followed. Local CircleCI declarations elsewhere in the same configuration remain in scope.

A finding is located at the 1-based line of the image value. Parsers return literal declarations as `{ value, line }`; the detector matches only declarations whose value and lifecycle scope are covered by a reviewed rule. An image reference that has no matching, evidence-backed rule is not described as retired.

## Rules and evidence

1. **Azure hosted-image retirement.** A rule may be added only when Microsoft's official hosted-image retirement notice names the affected image and states a deadline. Record the notice URL, `observedAt`, `reviewedAt`, severity, deadline, and the replacement label recommended by that notice. Do not turn an image/software removal or a newer hosted image's availability into a retired-runner-image rule.
2. **CircleCI image deprecation.** A rule may be added only when an official CircleCI deprecation notice identifies the exact image and gives its end-of-life date and replacement guidance. Record that notice URL, `observedAt`, `reviewedAt`, severity, deadline, and replacement. A policy page that only describes a general process does not establish an individual image rule.
3. **GitLab CI images.** No GitLab lifecycle rule is included in this version. Literal references remain unclassified, not findings.

If an official source does not state a readable date or replacement, do not add the rule; state the evidence gap in that issue's pull request. A rule's event and severity must match the date's actual status. An announced deadline in the future is **not** an end-of-life finding: following [decision 0010](0010-scheduled-end-of-life.md), represent it as `scheduled-end-of-life` at low severity, with the announced deadline. When the deadline has passed, a reviewed registry change may promote that same rule identity to the appropriate elapsed lifecycle event and severity. Scans do not compare deadlines with the current clock.

## Registry mapping

Each rule names one image family with a version-less `pkg:generic/azure-pipelines/<family>-image` PURL and an `intdot` VERS range built from the numeric part of the image label. Examples: `ubuntu-22.04` maps to `pkg:generic/azure-pipelines/ubuntu-image` and `vers:intdot/22.04`; `macos-14` maps to `pkg:generic/azure-pipelines/macos-image` and `vers:intdot/14`; `windows-2019` maps to `pkg:generic/azure-pipelines/windows-image` and `vers:intdot/2019`. A range (`vers:intdot/<X` or `>=X|<Y`) is used only when the notice retires a whole series. CircleCI labels whose numeric part is ambiguous under intdot (for example `ubuntu-2004:202201-01`, read as `2004`) get a rule only when the notice retires the whole series; a notice naming one dated tag is recorded as an evidence gap, not a rule. The detector (#501) applies the same label-to-PURL/VERS normalization.

## What is dynamic, and what happens to it

A value is dynamic or cannot be classified safely when interpreting it would require evaluating CI configuration or resolving an external reference. Examples include GitLab variables such as `$IMAGE` and `${IMAGE}`, CircleCI parameters such as `<< parameters.image >>`, `<< pipeline.parameters.image >>`, or `<< .Environment.IMAGE >>`, Azure variables such as `$(vmImage)`, template expressions such as `${{ ... }}`, and values selected by runtime conditions or templates. These values produce no lifecycle finding and are listed as unclassified with their file and line when the parser can locate them.

`latest`, `*-latest`, and other floating aliases do not identify a lifecycle-specific image label and are returned as unclassified, never judged. Unresolved YAML aliases/anchors, merge-key expansion, non-string values, unsupported YAML shapes, and malformed YAML produce no finding; a reference is unclassified when it can be represented accurately without resolving it. Comments and image-like text in unrelated keys are ignored. Evergreen never evaluates YAML, expands variables, follows templates, resolves orbs, executes CI tools, or makes network requests during parsing or scans.

Each parser is pure and bounded: it receives file contents, accepts at most 1 MiB, uses the existing `yaml` dependency, and returns declarations with 1-based lines or no declarations for malformed/unsupported input. It performs no file or network I/O. The detector reads repository files and bundled, reviewed registry data only.

## Where facts come from

Allowed rule evidence is an official Azure Pipelines hosted-image retirement/deprecation notice, or an official CircleCI image-specific deprecation announcement. The source must state the affected image and deadline; the replacement must be stated by that source. The general Azure hosted-agent image list and general CircleCI support policies can clarify terms and scope, but do not alone establish an individual rule. No GitLab lifecycle rules are allowed in this version.

Rejected evidence includes popularity, an image's age, a newer image's existence, inferred support from naming, general recommendations without an affected image and date, third-party lists, and CI failures that do not independently establish an official lifecycle statement.

## Examples for the fixture task

Positive parser cases and intended classification:

- A GitLab job-level `image:` string and a `services:` string (or service object's literal image/name) are parsed at their value lines, then returned unclassified; they must not produce a lifecycle finding.
- A CircleCI local `machine.image` or `docker.image` matching a rule backed by an official image-specific notice is reported at that value's line.
- A CircleCI orb reference such as `circleci/node@5.1.0` is unclassified only. It is not judged as an image and its remote contents are not inspected.
- An Azure `pool.vmImage` matching a reviewed, dated hosted-image rule is reported at that value's line.

Must not produce findings:

- Image-looking text in comments or unrelated keys.
- Dynamic variables, parameters, templates, or runtime-selected values.
- `latest`, `ubuntu-latest`, or equivalent floating aliases.
- A CircleCI job that refers only to an orb executor; no image declaration is visible locally.
- An unresolved YAML anchor/alias, malformed file, unsupported shape, or a literal image with no matching reviewed rule.
- Any GitLab image or service reference, including one that looks old or has a newer-looking alternative.

Fixtures include positive declaration examples for each file family, these lookalike and dynamic negatives, at least one zero-finding configuration, and malformed YAML. They document expected values, exact 1-based lines, and why each case is judged, unclassified, or ignored.

## Out of scope for the first version

GitLab-specific lifecycle rules; applying the container detector's rules to GitLab CI image references (the image may otherwise be reported by both detectors); resolving CircleCI orb contents or orb lifecycle; Azure classic pipeline UI settings and non-YAML pipelines; container images declared outside the listed CI configuration fields; CI variables, template evaluation, configuration imports, runtime pool selection, vulnerability scanning, and executing validators or build tools.

GitLab lifecycle coverage may be proposed separately only with an official GitLab source that names a retirement status and date. Whether container lifecycle rules should also cover GitLab CI image declarations requires a separate decision to define ownership and avoid duplicate findings. Any future orb support must remain offline at scan time and use separately reviewed data rather than fetching orb contents.

## Consequences

- The detector is intentionally conservative. GitLab image references and CircleCI orb references are visible as unclassified references, but never become lifecycle findings in this version.
- A CircleCI policy or Azure image catalogue is not enough to guess which versions are retired; only explicit, dated lifecycle evidence creates a rule.
- Future-dated retirements are low-severity scheduled findings until the date passes and a reviewed data update promotes the rule; scan output remains deterministic for a fixed bundle.
- The detector starts at `experimental` with `stable: false`, as required by [decision 0013](0013-detector-maturity.md). It is not Beta or Supported. Promotion requires the independent corpus evidence defined there.
- Fixtures and each parser are separate issues, followed by curated rules, importer, detector wiring, migration guidance, and docs. The detector skeleton must be generated with the repository's `new-detector` command, not copied by hand.
