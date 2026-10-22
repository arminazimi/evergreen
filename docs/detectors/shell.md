# Shell and PowerShell

The `shell` detector reports PowerShell releases that are past end of support, as declared by the minimum version a script, module manifest, or CI container asks for. It is **experimental**: it is not yet held to the precision floor that stable detectors are (see [Decision 0013](../decisions/0013-detector-maturity.md)). Its lifecycle rules are in `registry/shell.json` and ship in the [data bundle](../DATA.md).

## What it reads

| File | Declaration |
| --- | --- |
| `*.ps1`, `*.psm1` | A standalone `#Requires -Version <version>` directive |
| `*.psd1` | `PowerShellVersion` as a top-level key of the root hashtable, with a literal string value |
| `.github/workflows/*.yml`, `.github/workflows/*.yaml` | The tag of a `mcr.microsoft.com/powershell` image at `jobs.<id>.container` (a string or its `image` key) or `jobs.<id>.services.<name>.image` |

The version is read as a leading `major.minor`, `major.minor.patch`, or `major.minor.patch.revision`, optionally followed by a `-suffix` such as `-ubuntu-22.04`. The directive may be written in any letter case, with indentation, a byte order mark, or CRLF line endings, and may sit after other comments or `#Requires` lines such as `#Requires -PSEdition Core`. A backtick at the end of a line continues the command and does not stop the file from being read.

It walks the repository up to eight directories deep (at most 2,000 matching files) and does not follow symbolic links. It skips `.git`, `node_modules`, `vendor`, `dist`, `build`, `target`, `.venv`, `venv`, `fixtures`, `__fixtures__`, and `testdata`. PowerShell, `pwsh`, Docker, and the CI service are never run, and nothing is fetched.

## What it reports

- A declared PowerShell version that falls in a release line the rules mark as end of support. The bundled rules cover **PowerShell 6.x** and **PowerShell 7.0, 7.1, 7.2, and 7.3**, all at **high** severity, with dates from Microsoft's [PowerShell support lifecycle](https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle). The replacement is the oldest release that still has more than a year of support.
- PowerShell 7.4 and 7.5 are supported until 2026-11-10 and have no rule yet. The `shell-1` importer drafts a rule for a release once its date has passed, for review.

Each finding carries its rule's sources, replacement, migration steps, and verification commands: find where the script runs, install the target PowerShell, raise the declared version, and run the scripts and tests; then `pwsh -NoProfile -Command "$PSVersionTable"` and a module listing. The detector reports no source usages.

## How versions are matched

- A full version (`7.2.1`, `7.0.3.0`) uses the first rule whose `vers` range contains it.
- A partial version (`7.0`, `7.4-ubuntu-22.04`) could mean any release that starts with it, so it matches a rule only when the rule's range contains both ends of that span. `7.0` matches the PowerShell 7.0 rule.
- Only rules for `pkg:generic/powershell` are used. A rule whose `vers` is malformed is skipped, so it does not hide a later rule.

## What it intentionally does not judge

- Windows PowerShell, including `#Requires -Version 5.1` and `shell: powershell`. It is a component of Windows and follows the Windows support lifecycle, not the PowerShell lifecycle, so no rule covers it.
- Shell names such as `shell: pwsh`, `shell: bash`, and `defaults.run.shell`. They name a program, not a version, and are read but never produce a finding. Bash, `sh`, and Bash images have no rules.
- Dynamic values: `$version`, `[version]'7.0'`, expressions in a manifest, `${{ ... }}` in a workflow, interpolated image names, `latest` and `lts-...` tags, and tags without a version.
- Directives with more on the line: `#Requires -Version 7.0 -Modules Pester`, a trailing comment (`#Requires -Version 5.1 # or later`), or a version with wildcards or letters. Other `#Requires` forms such as `-Modules` and `-RunAsAdministrator`.
- A `#Requires` or `PowerShellVersion` text inside a comment, a string, a here-string, a nested hashtable (`PrivateData`), or any hashtable that is not the whole file. A comment that begins a backtick-continued line is not a directive.
- Workflow files that use YAML aliases, GitLab, Azure, CircleCI, and other CI files, images from other registries or mirrors, Dockerfiles, and `shell:` values chosen by a matrix.
- Vulnerability advisories, module lifecycles, and whether a newer release exists.
- Files over 1 MiB, or with a line over 4,096 characters where the declaration sits, produce nothing.

## Known limits and false-positive boundaries

- A declared version is a minimum, not what runs. A script that says `#Requires -Version 7.0` runs on a current PowerShell; Evergreen reports that the declared floor is a release the vendor no longer supports, which is a prompt to review the floor, not proof of a running host.
- A malformed file produces nothing, not partial results. One unclosed string or bracket hides every declaration in that file, including valid ones earlier in it.
- The parser is a bounded lexical reader, not a PowerShell syntax validator. A file it cannot classify is skipped.
- Every file is read on its own: findings in `examples/` or test directories are reported like any other.
- A repository with more than 2,000 matching files is read only up to that limit, in sorted path order.

## Evidence

Five public repositories are pinned in `benchmarks/public-repositories.json` under the `shell` ecosystem: four targeted repositories with `#Requires -Version` declarations on retired releases and one blind, zero-finding repository. Each expected finding is a reviewed line at the pinned commit, checked against Microsoft's lifecycle table and not against Evergreen output. Precision on this corpus does not establish coverage of the unsupported forms above.
