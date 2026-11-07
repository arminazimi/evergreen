# CI runner images

The `ci-images` detector reports Azure Pipelines hosted images (`pool.vmImage`) that Microsoft has retired or scheduled for removal. It is **stable**: it is scored on the [public corpus](../VALIDATION.md) and held to the precision and recall floors of decision 0013. The reasoning is in [Decision 0014](../decisions/0014-ci-images-detector.md).

## What it reads

| File | Declaration |
| --- | --- |
| `azure-pipelines.yml` | `pool.vmImage` (`ubuntu-`, `macos-`, or `windows-` plus a numeric version) |
| `.gitlab-ci.yml` | `image` and `services` (read, never judged) |
| `.circleci/config.yml` | `docker.image`, `machine.image`, and orbs (read, never judged) |

It walks the repository up to eight directories deep (at most 500 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, and `target`.

## What it judges

An Azure `pool.vmImage` such as `ubuntu-20.04`, `ubuntu-22.04`, `macos-13`, `macos-14`, or `windows-2019` is a finding when a reviewed rule in `registry/ci-images.json` covers it. The finding is the line of the value, with the rule's source (Microsoft's hosted-image deprecation schedule), replacement, deadline, and migration steps.

## What it intentionally does not judge

- GitLab CI images and services, and CircleCI images and orbs: there is no authoritative lifecycle source for them, so a literal image is reported only as an [unclassified reference](../DETECTORS.md#unclassified-references).
- Floating aliases (`ubuntu-latest`, `macos-latest`, `windows-latest`) and dynamic values (`$(vmImage)`, `${IMAGE}`, `<< parameters.image >>`).
- Hosted images Microsoft retired before the registry's rules begin, such as `ubuntu-16.04`, `ubuntu-18.04`, `vs2017-win2016`, and `macOS-10.14`. They have no rule yet, so they produce nothing; a missing finding is not evidence that a label is current.
- GitHub Actions `runs-on:` labels. The [GitHub Actions detector](../DETECTORS.md) owns workflow files.

## Known limits and false-positive boundaries

- A label is reported when a rule matches the text, including a pipeline the project no longer runs, and including a self-hosted agent that reuses a hosted label string.
- `strategy.matrix` `vmImage` entries, string-valued pools, and pools with only a `name` are not read.
- Malformed YAML produces no declarations from that file.

The full list is in [CI runner images detector](../compatibility/ci-runner-images.md).

## Validation

98 public repositories at pinned commits cover the detector, 67 of them selected blind (68%): 29 have expected CI image findings (63 in total) and 20 have no findings of any detector. Every finding in them, from every detector, is recorded with a `maintainer-review` note naming the file and line read at the pinned commit. The selection rules are in [Ecosystem corpora](../validation/ecosystems.md#ci-runner-images-corpus).
