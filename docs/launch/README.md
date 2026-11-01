---
title: Launch kit
---

# Launch kit

Ready-to-post drafts for the Evergreen launch. Every claim in these drafts is
backed by a file in this repository; the [fact check](#fact-check) maps each
claim to its source. Adjust the first-person opening, confirm the release tag,
and read the channel's rules before posting.

| Draft | Channel | What it is for |
| --- | --- | --- |
| [show-hn.md](show-hn.md) | Hacker News (Show HN) | Submission title, plain-text body, and a first comment for the author |
| [reddit-devops.md](reddit-devops.md) | r/devops | Text post aimed at platform and DevOps teams, with CI setup and limits |
| [newsletters.md](newsletters.md) | Newsletters | Subject lines and 50, 100, and 200-word blurbs for editors |
| [social.md](social.md) | X, Bluesky, Mastodon, LinkedIn | Short posts, a thread, and alt text |
| [screenshots.md](screenshots.md) | Any channel | The existing screenshots, what each shows, and where to use it |

## Before you post

- Post one channel at a time and stay to answer replies. Cross-posting the same
  text everywhere on the same day reads as a campaign.
- Personalize the first-person opening in Show HN, r/devops, and LinkedIn. The
  drafts are written in the maintainer's voice.
- Use the current release or install command from the repository. Confirm any
  tag printed in a draft, including `v0.7.1` in the r/devops snippet, before
  posting.
- Keep the claims as written. Do not add stars, download counts, user counts, or
  "fastest" or "best" claims. The project publishes adoption numbers only from
  reproducible public sources ([ADOPTION.md](../ADOPTION.md)).
- Do not imply hosted analysis, automatic code changes, complete ecosystem
  coverage, or guaranteed migration safety. Those are explicitly out of scope in
  the [distribution brand checklist](../DISTRIBUTION_BRAND.md).
- When a channel needs an image, upload the file listed in
  [screenshots.md](screenshots.md). Do not invent a screenshot or edit a finding
  count into one.
- Disclose that you maintain the project where the channel requires it, and
  follow the channel's self-promotion rules.
- These pages publish with the documentation site. Keep private contacts,
  embargo dates, and unreleased claims out of them.

## Fact check

| Claim used in the drafts | Source in this repository |
| --- | --- |
| Scans run locally, make no network requests, and need no account | [PRIVACY.md](../PRIVACY.md), [README.md](../../README.md) |
| Findings include severity, exact file and line, replacement, evidence, and migration context | [README.md](../../README.md), [QUICKSTART.md](../QUICKSTART.md), [MIGRATION_PACKETS.md](../MIGRATION_PACKETS.md) |
| Every lifecycle claim cites an authoritative, versioned source; rules are reviewed data | [AGENTS.md](../../AGENTS.md), [RULES.md](../RULES.md), [CONTRIBUTING.md](../../CONTRIBUTING.md) |
| Detectors parse repository files and never execute repository code | [AGENTS.md](../../AGENTS.md), [PRIVACY.md](../PRIVACY.md) |
| A baseline accepts known findings with an owner, reason, and expiry; CI gates on severity | [GITHUB_ACTION.md](../GITHUB_ACTION.md) |
| The GitHub Action writes annotations, a job summary, an optional PR comment, and optional SARIF | [GITHUB_ACTION.md](../GITHUB_ACTION.md) |
| The GitLab CI/CD component writes a JSON report and a Code Quality report | [GITLAB.md](../GITLAB.md) |
| The MCP tools cover scan, list, explain, context, verify, and check | [MCP.md](../MCP.md) |
| Ecosystem coverage and maturity levels | [COMPATIBILITY.md](../COMPATIBILITY.md) |
| A package with no rule reports `no-data`, which is not a claim of safety | [README.md](../../README.md), [QUICKSTART.md](../QUICKSTART.md) |
| Corpus results, including false positives and false negatives | [VALIDATION.md](../VALIDATION.md) |
| Scope limits and approved brand language | [DISTRIBUTION_BRAND.md](../DISTRIBUTION_BRAND.md), [PRODUCT.md](../PRODUCT.md) |

## Assets

All screenshots are existing files under
[`docs/assets/screenshots/`](../assets/screenshots/); none were generated for
this kit. [screenshots.md](screenshots.md) lists what each one shows, its alt
text, and which draft uses it.

## After the launch

Keep questions and corrections in the issue tracker or Discussions, and turn
repeated questions into documentation or detector work. Do not promise a date
for a detector or a rule that has no reviewed source.
