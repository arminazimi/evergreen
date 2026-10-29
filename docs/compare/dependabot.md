---
title: Evergreen compared with Dependabot
---

# Evergreen compared with Dependabot

Dependabot keeps dependencies current and warns about known vulnerabilities on GitHub. Evergreen
reports lifecycle status: what is no longer supported, when support ends, and where the affected
declaration or usage lives.

## What Dependabot does better

- **Native pull requests.** Dependabot opens version updates and security updates directly in the
  repository; GitHub documents both
  [version updates](https://docs.github.com/en/code-security/dependabot/dependabot-updates/about-dependabot-version-updates)
  and [security updates](https://docs.github.com/en/code-security/dependabot/dependabot-security-updates/about-dependabot-security-updates).
- **Advisory integration.** [Dependabot alerts](https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts)
  draw on the GitHub Advisory Database and appear in the repository's security settings.
- **Managed coverage.** GitHub maintains the
  [list of supported ecosystems](https://docs.github.com/en/code-security/dependabot/ecosystems-supported)
  and the update schedule, with no runner to operate.

## What Evergreen adds

- **Support status, not only versions.** A package can be current and still be out of support, and a
  runtime can be unsupported before a newer release exists. Evergreen reports the lifecycle event
  and its dated evidence ([RULES.md](../RULES.md)).
- **Source-level usage.** Retired APIs inside source files are reported at their call sites, which a
  manifest update cannot see ([ARCHITECTURE.md](../ARCHITECTURE.md)).
- **A grouped update fragment.** `evergreen dependabot-config .` prints a `dependabot.yml` fragment
  that groups the deprecated packages Evergreen found; it writes no files
  ([ADOPTION.md](../ADOPTION.md#feeding-dependabot)).
- **Offline runs.** The check uses bundled data and never contacts GitHub
  ([DATA.md](../DATA.md)).

## Use them together

1. Let Dependabot handle routine and security updates.
2. Run `evergreen scan .` for the support status of what remains, including findings that are not
   version problems.
3. Merge the printed Dependabot fragment so the deprecated packages Evergreen found arrive in one
   grouped pull request per directory, after reviewing the YAML as described in
   [ADOPTION.md](../ADOPTION.md#feeding-dependabot).
