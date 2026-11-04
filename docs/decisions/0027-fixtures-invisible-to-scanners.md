# 0027 — Keep fixtures out of scanners' sight with neutral names, not dismissals

Status: accepted

## Problem

Evergreen's tests need repositories that deliberately contain old lockfiles, manifests, and Dockerfiles. Those
files are what the detectors read, so they must stay realistic. Dependency scanners read them too and report
them as the project's own risk. Epic #1981 needs one written way to stop that before any later task moves a
file.

On 2026-11-04, `main` commits **1,521** files under `tests/fixtures/`, and **179** of them carry a name that
package tooling recognizes (57 `Dockerfile`, 24 `package-lock.json`, 17 `composer.lock`, 13 `pubspec.lock`,
13 `go.mod`, 12 `pom.xml`, 10 `Gemfile.lock`, and a tail of other lockfiles). The gap is real; this record picks
the method only.

## Options compared

| Option | What it is | Where it lives |
| --- | --- | --- |
| Neutral names | Commit `Gemfile.lock` as `Gemfile.lock.fixture`; tests copy the tree into a temporary directory and restore the real name there. | Repository files plus a test helper. |
| Real names in a temporary directory | Tests write the whole fixture from a description at run time; nothing manifest-shaped is committed. | Test code. |
| Archives | Commit `fixtures.tar.gz` or `.zip` and unpack it in a test. | One binary per group. |
| Scanner configuration | Keep real names and tell each scanner to skip them (`osv-scanner.toml`, ignore lists). | Config files. |
| Dismissal | Close each alert as "used in tests" in the scanner's UI. | Outside the repository. |

## Measurements

Tools: OSV-Scanner **v2** (`scan source -r`) and OpenSSF Scorecard **v5** (`--local`), both built from their
latest release on 2026-11-04; Node.js v26.12.0; network on for the advisory lookup only. Variants used the
fixtures `ruby/positive/Gemfile.lock`, `php/positive/composer.lock`, `rust/positive/Cargo.lock`,
`java/positive/spring-boot/pom.xml`, and `upgrade/poetry-lock/ready/poetry.lock`, copied into scratch
directories under each storage method.

### Today

| Check | Result on `main` |
| --- | --- |
| OSV-Scanner over the checkout | 24 sources with known vulnerabilities; **16 are under `tests/fixtures/`**, the rest are `examples/`, the root lockfile, and `extensions/vscode`. |
| Scorecard Vulnerabilities | Score **0**, 85 existing vulnerabilities. |
| Scorecard Pinned-Dependencies | Score **3**; **133 of 136** warnings are in `tests/fixtures/` or `examples/`. |

### Storage methods against OSV-Scanner

The same five files, scanned per variant:

| Variant | Vulnerabilities reported |
| --- | --- |
| Real names (control) | **50**, across all five files |
| `<name>.txt` | 0 (no packages found) |
| `<name>.fixture` | 0 (no packages found) |
| `fixture-<name>` | 0 (no packages found) |
| `.tar.gz` and `.zip` of the real tree | 0 (no packages found) |
| Real names, directory in `.gitignore` | 0, but `--no-ignore` brings back **50**; and ignored files are not committed |
| Real names, `osv-scanner.toml` `PackageOverrides` with `ignore = true` | 0 |

OSV-Scanner matches lockfiles by exact file name, so any rename hides them.

### Storage methods against Scorecard

| Variant | Vulnerabilities | Pinned-Dependencies |
| --- | --- | --- |
| Real names (control) | score 0, 44 vulnerabilities | Dockerfile found, 3 warnings |
| Lockfiles renamed to `<name>.txt` | score **10**, none | not applicable |
| Lockfiles with real names plus `osv-scanner.toml` | score **10**, none (Scorecard reads the file) | not applicable |
| `Dockerfile.txt`, `Dockerfile.fixture`, `fixture.dockerfile`, `dockerfile.in` | not applicable | **still found** |
| `image.fixture`, `base.txt`, `fixture.df`, `Containerfile` | not applicable | not found |

Scorecard recognizes a Dockerfile by the case-insensitive word `dockerfile` anywhere in the name, so a suffix is
not enough for that family. Scorecard's Pinned-Dependencies check has no configuration that skips a file.

### Not measured

GitHub's dependency graph and Dependabot alerts were not run; the pull request that adds this record cannot
trigger them on new files. GitHub documents the graph as reading supported manifests by file name, which
matches what OSV-Scanner and Scorecard did above. The implementation task must confirm this on a real
pull request, using the Security tab.

## Decision

1. **Commit fixtures under neutral names.** Any fixture file whose real name a scanner recognizes is stored with
   a `.fixture` suffix (`Gemfile.lock.fixture`). Tests build the scanned repository in a temporary directory,
   copy each tree there, and drop the suffix. The detectors still read real names, so detector behavior is
   unchanged and the committed tree holds nothing scanner-shaped.
2. **The Dockerfile family gets a different rule.** Names that contain `dockerfile` stay visible to Scorecard
   with a suffix, so the stored name must not contain that word; the helper maps it back. The exact stored
   spelling is chosen by the implementation task and verified with the guard in point 4.
3. **Fixtures that the tests build from a description stay allowed.** A test that already writes its files into
   a temporary directory needs nothing committed and keeps doing so. Use it when a fixture is only a few lines.
4. **Guard the rule in `npm run check`.** A test fails when a committed path under `tests/fixtures/` has a
   name from the recognized-manifest list, so a new fixture cannot reintroduce the problem. The same list
   drives the helper.
5. **Reject archives.** They hide the content from review and diffs and change as a whole for a one-line edit.
   They add nothing the rename does not: both hid the files equally in the measurements.
6. **Reject dismissal as the main method.** A dismissal is a per-alert decision made outside the repository, is
   not reviewed in a pull request, must be repeated for each new fixture and each new advisory, and does nothing
   for the Scorecard score, which counts vulnerabilities from OSV whatever the repository's alert state.
7. **Scanner configuration is a narrow fallback, not the method.** `osv-scanner.toml` works for OSV-Scanner and
   Scorecard Vulnerabilities (measured above), but it suppresses by ecosystem and directory, grows with every
   fixture, cannot reach Pinned-Dependencies or GitHub alerts, and is a suppression list in all but name. Use it
   only for a file whose real name a test cannot avoid, with a written reason next to the entry.

## Why

- **The only method that works for every scanner.** Renaming removes the file from OSV-Scanner, Scorecard
  Vulnerabilities, and (by their documented file-name matching) GitHub's graph. Configuration reaches two of the
  four surfaces measured or documented.
- **Honest about the exception.** Dockerfiles are matched by a substring, and the measurements show a plain suffix
  fails there, so the decision names the exception instead of promising one rule.
- **Reviewable and local.** The files are in the repository, diff as text, and are checked by a test. Nothing
  depends on a UI action that a contributor could skip.

## Consequences

- A follow-up task adds the copy helper, renames the 179 recognized files, updates the tests that point at
  `tests/fixtures/` directly, and adds the guard from point 4. This record changes no file under `tests/`.
- `examples/` holds 8 of the 24 OSV sources today. It is outside this decision; whether it takes the same rule
  or another is a separate question for the epic.
- The project's own manifests (root `package-lock.json` and `extensions/vscode/package-lock.json`) stay
  visible and keep being fixed by upgrades, not hidden.
- No runtime dependency and no network use in scans. The scanners were run only to produce the evidence above.
